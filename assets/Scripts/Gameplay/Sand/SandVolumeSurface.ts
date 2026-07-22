import { _decorator, BoxCollider, CCFloat, Component, Material, Mesh, MeshRenderer, utils, Vec3 } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

interface SandGrid {
    segmentsX: number;
    segmentsZ: number;
    stepX: number;
    stepZ: number;
    surfaceVertexCount: number;
    totalVertexCount: number;
    indexCount: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

@ccclass('SandVolumeSurface')
export class SandVolumeSurface extends Component {
    @property(BoxCollider)
    public boundsCollider: BoxCollider | null = null;

    @property(MeshRenderer)
    public meshRenderer: MeshRenderer | null = null;

    @property(Material)
    public sandMaterial: Material | null = null;

    @property({ type: CCFloat, min: 0.08 })
    public vertexSpacing: number = 0.2;

    @property({ type: CCFloat, min: 0 })
    public reliefAmplitude: number = 0.09;

    @property({ type: CCFloat, min: 0.1 })
    public reliefFrequency: number = 1.75;

    @property({ type: CCFloat, min: 0 })
    public detailAmplitude: number = 0.025;

    @property({ type: CCFloat, min: 0.1 })
    public detailFrequency: number = 8.5;

    @property({ type: CCFloat, min: 0.01 })
    public textureTiling: number = 0.55;

    @property({
        type: CCFloat,
        min: 0,
        tooltip: 'Width of the smooth slope that lowers the sand to the collider bottom near its XZ border.',
    })
    public edgeFadeWidth: number = 1.1;

    private grid: SandGrid | null = null;
    private carvedHeights: Float64Array = new Float64Array(0);
    private reliefValues: Float64Array = new Float64Array(0);
    private edgeFactors: Float64Array = new Float64Array(0);
    private surfaceHeights: Float64Array = new Float64Array(0);
    private positions: Float32Array = new Float32Array(0);
    private normals: Float32Array = new Float32Array(0);
    private uvs: Float32Array = new Float32Array(0);
    private indices16: Uint16Array | null = null;
    private indices32: Uint32Array | null = null;
    private sideTopPositionOffsets: Uint32Array = new Uint32Array(0);
    private sideTopSurfaceIndices: Uint32Array = new Uint32Array(0);
    private generatedMesh: Mesh | null = null;
    private erasedCellCount: number = 0;
    private readonly localProbe: Vec3 = new Vec3();

    public get ErasedCellCount(): number {
        return this.erasedCellCount;
    }

    protected onLoad(): void {
        RequiredReference.Check(this, this.boundsCollider, 'boundsCollider');
        RequiredReference.Check(this, this.meshRenderer, 'meshRenderer');
        RequiredReference.Check(this, this.sandMaterial, 'sandMaterial');
    }

    protected start(): void {
        this.ResetSurface();
    }

    protected onDestroy(): void {
        this.generatedMesh?.destroy();
        this.generatedMesh = null;
    }

    public Erase(worldPosition: Vec3, worldRadius: number): number {
        const collider = this.boundsCollider;
        if (!collider || worldRadius <= 0) {
            return 0;
        }

        if (!this.grid || !this.generatedMesh) {
            this.InitializeGeometry();
        }
        const grid = this.grid;
        if (!grid) {
            return 0;
        }

        this.node.inverseTransformPoint(this.localProbe, worldPosition);
        const radiusSqr = worldRadius * worldRadius;
        const minGridX = Math.max(0, Math.floor((this.localProbe.x - worldRadius - grid.minX) / grid.stepX));
        const maxGridX = Math.min(grid.segmentsX, Math.ceil((this.localProbe.x + worldRadius - grid.minX) / grid.stepX));
        const minGridZ = Math.max(0, Math.floor((this.localProbe.z - worldRadius - grid.minZ) / grid.stepZ));
        const maxGridZ = Math.min(grid.segmentsZ, Math.ceil((this.localProbe.z + worldRadius - grid.minZ) / grid.stepZ));
        const rowStride = grid.segmentsX + 1;
        let changedSamples = 0;
        let changedMinX = grid.segmentsX;
        let changedMaxX = 0;
        let changedMinZ = grid.segmentsZ;
        let changedMaxZ = 0;

        for (let z = minGridZ; z <= maxGridZ; z++) {
            const sampleZ = grid.minZ + z * grid.stepZ;
            for (let x = minGridX; x <= maxGridX; x++) {
                const sampleX = grid.minX + x * grid.stepX;
                const dx = sampleX - this.localProbe.x;
                const dz = sampleZ - this.localProbe.z;
                const radialSqr = dx * dx + dz * dz;
                if (radialSqr >= radiusSqr) {
                    continue;
                }

                const index = z * rowStride + x;
                const sphericalHeight = Math.max(grid.minY, grid.maxY - Math.sqrt(radiusSqr - radialSqr));
                if (sphericalHeight >= this.carvedHeights[index] - 0.001) {
                    continue;
                }

                if (!Number.isFinite(this.carvedHeights[index])) {
                    this.erasedCellCount++;
                }
                this.carvedHeights[index] = sphericalHeight;
                this.UpdateHeight(index);
                changedSamples++;
                changedMinX = Math.min(changedMinX, x);
                changedMaxX = Math.max(changedMaxX, x);
                changedMinZ = Math.min(changedMinZ, z);
                changedMaxZ = Math.max(changedMaxZ, z);
            }
        }

        if (changedSamples > 0) {
            this.UpdateChangedRegion(changedMinX, changedMaxX, changedMinZ, changedMaxZ);
            this.UploadDynamicGeometry();
        }
        return changedSamples;
    }

    public ResetSurface(): void {
        if (!this.grid || !this.generatedMesh) {
            this.InitializeGeometry();
            return;
        }

        this.carvedHeights.fill(Number.POSITIVE_INFINITY);
        this.erasedCellCount = 0;
        for (let index = 0; index < this.grid.surfaceVertexCount; index++) {
            this.UpdateHeight(index);
        }
        this.UpdateChangedRegion(0, this.grid.segmentsX, 0, this.grid.segmentsZ);
        this.UploadDynamicGeometry();
    }

    private InitializeGeometry(): void {
        const collider = this.boundsCollider;
        const renderer = this.meshRenderer;
        if (!collider || !renderer) {
            return;
        }

        const width = Math.max(0.01, collider.size.x);
        const depth = Math.max(0.01, collider.size.z);
        const spacing = Math.max(0.08, this.vertexSpacing);
        const segmentsX = Math.max(2, Math.ceil(width / spacing));
        const segmentsZ = Math.max(2, Math.ceil(depth / spacing));
        const surfaceVertexCount = (segmentsX + 1) * (segmentsZ + 1);
        const sideQuadCount = segmentsX * 2 + segmentsZ * 2 + 1;
        const totalVertexCount = surfaceVertexCount + sideQuadCount * 4;
        const indexCount = segmentsX * segmentsZ * 6 + sideQuadCount * 6;
        const grid: SandGrid = {
            segmentsX,
            segmentsZ,
            stepX: width / segmentsX,
            stepZ: depth / segmentsZ,
            surfaceVertexCount,
            totalVertexCount,
            indexCount,
            minX: collider.center.x - width * 0.5,
            maxX: collider.center.x + width * 0.5,
            minY: collider.center.y - collider.size.y * 0.5,
            maxY: collider.center.y + collider.size.y * 0.5,
            minZ: collider.center.z - depth * 0.5,
            maxZ: collider.center.z + depth * 0.5,
        };
        this.grid = grid;
        this.carvedHeights = new Float64Array(surfaceVertexCount);
        this.carvedHeights.fill(Number.POSITIVE_INFINITY);
        this.reliefValues = new Float64Array(surfaceVertexCount);
        this.edgeFactors = new Float64Array(surfaceVertexCount);
        this.surfaceHeights = new Float64Array(surfaceVertexCount);
        this.positions = new Float32Array(totalVertexCount * 3);
        this.normals = new Float32Array(totalVertexCount * 3);
        this.uvs = new Float32Array(totalVertexCount * 2);
        this.indices16 = totalVertexCount <= 65535 ? new Uint16Array(indexCount) : null;
        this.indices32 = totalVertexCount > 65535 ? new Uint32Array(indexCount) : null;
        this.erasedCellCount = 0;

        const rowStride = segmentsX + 1;
        for (let z = 0; z <= segmentsZ; z++) {
            const sampleZ = grid.minZ + z * grid.stepZ;
            for (let x = 0; x <= segmentsX; x++) {
                const sampleX = grid.minX + x * grid.stepX;
                const index = z * rowStride + x;
                this.reliefValues[index] = this.SampleRelief(sampleX, sampleZ);
                const distanceToEdge = Math.min(
                    sampleX - grid.minX,
                    grid.maxX - sampleX,
                    sampleZ - grid.minZ,
                    grid.maxZ - sampleZ,
                );
                this.edgeFactors[index] = this.GetEdgeFadeFactor(distanceToEdge);
                this.UpdateHeight(index);
                const positionOffset = index * 3;
                this.positions[positionOffset] = sampleX;
                this.positions[positionOffset + 1] = this.surfaceHeights[index];
                this.positions[positionOffset + 2] = sampleZ;
                const uvOffset = index * 2;
                this.uvs[uvOffset] = (sampleX - grid.minX) * this.textureTiling;
                this.uvs[uvOffset + 1] = (sampleZ - grid.minZ) * this.textureTiling;
            }
        }
        this.UpdateSurfaceNormals(0, segmentsX, 0, segmentsZ);

        let indexCursor = 0;
        for (let z = 0; z < segmentsZ; z++) {
            for (let x = 0; x < segmentsX; x++) {
                const a = z * rowStride + x;
                const b = (z + 1) * rowStride + x;
                const c = b + 1;
                const d = a + 1;
                indexCursor = this.WriteQuadIndices(indexCursor, a, b, c, d);
            }
        }

        let vertexCursor = surfaceVertexCount;
        const linkedPositionOffsets: number[] = [];
        const linkedSurfaceIndices: number[] = [];
        const addSideQuad = (
            ax: number, ay: number, az: number,
            bx: number, by: number, bz: number,
            cx: number, cy: number, cz: number,
            dx: number, dy: number, dz: number,
            normalX: number, normalY: number, normalZ: number,
            uvLength: number,
            cSurfaceIndex: number = -1,
            dSurfaceIndex: number = -1,
        ): void => {
            const first = vertexCursor;
            const values = [ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz];
            this.positions.set(values, first * 3);
            for (let vertex = 0; vertex < 4; vertex++) {
                const normalOffset = (first + vertex) * 3;
                this.normals[normalOffset] = normalX;
                this.normals[normalOffset + 1] = normalY;
                this.normals[normalOffset + 2] = normalZ;
            }
            this.uvs.set([0, 0, uvLength, 0, uvLength, 1, 0, 1], first * 2);
            indexCursor = this.WriteQuadIndices(indexCursor, first, first + 1, first + 2, first + 3);
            if (cSurfaceIndex >= 0) {
                linkedPositionOffsets.push((first + 2) * 3 + 1);
                linkedSurfaceIndices.push(cSurfaceIndex);
            }
            if (dSurfaceIndex >= 0) {
                linkedPositionOffsets.push((first + 3) * 3 + 1);
                linkedSurfaceIndices.push(dSurfaceIndex);
            }
            vertexCursor += 4;
        };

        for (let x = 0; x < segmentsX; x++) {
            const x0 = grid.minX + x * grid.stepX;
            const x1 = x0 + grid.stepX;
            const front0 = x;
            const front1 = x + 1;
            addSideQuad(
                x1, grid.minY, grid.minZ, x0, grid.minY, grid.minZ,
                x0, this.surfaceHeights[front0], grid.minZ, x1, this.surfaceHeights[front1], grid.minZ,
                0, 0, -1, grid.stepX * this.textureTiling, front0, front1,
            );
            const back0 = segmentsZ * rowStride + x;
            const back1 = back0 + 1;
            addSideQuad(
                x0, grid.minY, grid.maxZ, x1, grid.minY, grid.maxZ,
                x1, this.surfaceHeights[back1], grid.maxZ, x0, this.surfaceHeights[back0], grid.maxZ,
                0, 0, 1, grid.stepX * this.textureTiling, back1, back0,
            );
        }

        for (let z = 0; z < segmentsZ; z++) {
            const z0 = grid.minZ + z * grid.stepZ;
            const z1 = z0 + grid.stepZ;
            const left0 = z * rowStride;
            const left1 = (z + 1) * rowStride;
            addSideQuad(
                grid.minX, grid.minY, z0, grid.minX, grid.minY, z1,
                grid.minX, this.surfaceHeights[left1], z1, grid.minX, this.surfaceHeights[left0], z0,
                -1, 0, 0, grid.stepZ * this.textureTiling, left1, left0,
            );
            const right0 = z * rowStride + segmentsX;
            const right1 = (z + 1) * rowStride + segmentsX;
            addSideQuad(
                grid.maxX, grid.minY, z1, grid.maxX, grid.minY, z0,
                grid.maxX, this.surfaceHeights[right0], z0, grid.maxX, this.surfaceHeights[right1], z1,
                1, 0, 0, grid.stepZ * this.textureTiling, right0, right1,
            );
        }

        addSideQuad(
            grid.minX, grid.minY, grid.maxZ, grid.minX, grid.minY, grid.minZ,
            grid.maxX, grid.minY, grid.minZ, grid.maxX, grid.minY, grid.maxZ,
            0, -1, 0, width * this.textureTiling,
        );
        this.sideTopPositionOffsets = Uint32Array.from(linkedPositionOffsets);
        this.sideTopSurfaceIndices = Uint32Array.from(linkedSurfaceIndices);

        const geometry = this.CreateDynamicGeometry(true);
        const nextMesh = utils.MeshUtils.createDynamicMesh(0, geometry, undefined, {
            maxSubMeshes: 1,
            maxSubMeshVertices: totalVertexCount,
            maxSubMeshIndices: indexCount,
        });
        const previousMesh = this.generatedMesh;
        this.generatedMesh = nextMesh;
        renderer.mesh = nextMesh;
        if (this.sandMaterial) {
            renderer.setMaterial(this.sandMaterial, 0);
        }
        previousMesh?.destroy();
    }

    private UpdateHeight(index: number): void {
        const grid = this.grid;
        if (!grid) {
            return;
        }

        const relief = this.reliefValues[index];
        const naturalHeight = grid.maxY - relief;
        const carvedHeight = this.carvedHeights[index] - relief * 0.3;
        const surfaceHeight = Math.max(grid.minY, Math.min(naturalHeight, carvedHeight));
        this.surfaceHeights[index] = grid.minY + (surfaceHeight - grid.minY) * this.edgeFactors[index];
    }

    private UpdateChangedRegion(minX: number, maxX: number, minZ: number, maxZ: number): void {
        const grid = this.grid;
        if (!grid) {
            return;
        }

        const rowStride = grid.segmentsX + 1;
        for (let z = minZ; z <= maxZ; z++) {
            for (let x = minX; x <= maxX; x++) {
                const index = z * rowStride + x;
                this.positions[index * 3 + 1] = this.surfaceHeights[index];
            }
        }
        this.UpdateSurfaceNormals(
            Math.max(0, minX - 1),
            Math.min(grid.segmentsX, maxX + 1),
            Math.max(0, minZ - 1),
            Math.min(grid.segmentsZ, maxZ + 1),
        );
        for (let i = 0; i < this.sideTopPositionOffsets.length; i++) {
            this.positions[this.sideTopPositionOffsets[i]] = this.surfaceHeights[this.sideTopSurfaceIndices[i]];
        }
    }

    private UpdateSurfaceNormals(minX: number, maxX: number, minZ: number, maxZ: number): void {
        const grid = this.grid;
        if (!grid) {
            return;
        }

        const rowStride = grid.segmentsX + 1;
        const denominatorX = Math.max(0.001, grid.stepX * 2);
        const denominatorZ = Math.max(0.001, grid.stepZ * 2);
        for (let z = minZ; z <= maxZ; z++) {
            const previousZ = Math.max(0, z - 1);
            const nextZ = Math.min(grid.segmentsZ, z + 1);
            for (let x = minX; x <= maxX; x++) {
                const previousX = Math.max(0, x - 1);
                const nextX = Math.min(grid.segmentsX, x + 1);
                const normalX = (
                    this.surfaceHeights[z * rowStride + previousX]
                    - this.surfaceHeights[z * rowStride + nextX]
                ) / denominatorX;
                const normalZ = (
                    this.surfaceHeights[previousZ * rowStride + x]
                    - this.surfaceHeights[nextZ * rowStride + x]
                ) / denominatorZ;
                const inverseLength = 1 / Math.sqrt(normalX * normalX + 1 + normalZ * normalZ);
                const normalOffset = (z * rowStride + x) * 3;
                this.normals[normalOffset] = normalX * inverseLength;
                this.normals[normalOffset + 1] = inverseLength;
                this.normals[normalOffset + 2] = normalZ * inverseLength;
            }
        }
    }

    private WriteQuadIndices(offset: number, a: number, b: number, c: number, d: number): number {
        const target = this.indices16 ?? this.indices32;
        if (!target) {
            return offset;
        }
        target[offset] = a;
        target[offset + 1] = b;
        target[offset + 2] = c;
        target[offset + 3] = a;
        target[offset + 4] = c;
        target[offset + 5] = d;
        return offset + 6;
    }

    private CreateDynamicGeometry(includeStaticAttributes: boolean): {
        positions: Float32Array;
        normals: Float32Array;
        uvs?: Float32Array;
        indices16?: Uint16Array;
        indices32?: Uint32Array;
        minPos?: Vec3;
        maxPos?: Vec3;
    } {
        const grid = this.grid;
        const geometry: {
            positions: Float32Array;
            normals: Float32Array;
            uvs?: Float32Array;
            indices16?: Uint16Array;
            indices32?: Uint32Array;
            minPos?: Vec3;
            maxPos?: Vec3;
        } = {
            positions: this.positions,
            normals: this.normals,
        };
        if (includeStaticAttributes) {
            geometry.uvs = this.uvs;
            if (grid) {
                geometry.minPos = new Vec3(grid.minX, grid.minY, grid.minZ);
                geometry.maxPos = new Vec3(grid.maxX, grid.maxY, grid.maxZ);
            }
        }
        if (this.indices16) {
            geometry.indices16 = this.indices16;
        } else if (this.indices32) {
            geometry.indices32 = this.indices32;
        }
        return geometry;
    }

    private UploadDynamicGeometry(): void {
        this.generatedMesh?.updateSubMesh(0, this.CreateDynamicGeometry(false));
    }

    private SampleRelief(x: number, z: number): number {
        const coarseA = Math.sin(x * this.reliefFrequency + 0.7) * Math.cos(z * this.reliefFrequency * 0.81 - 1.1);
        const coarseB = Math.sin((x + z) * this.reliefFrequency * 0.47 + 2.3);
        const detailA = Math.sin(x * this.detailFrequency + z * 1.37);
        const detailB = Math.cos(z * this.detailFrequency * 0.92 - x * 1.91);
        const coarse = 0.5 + 0.25 * coarseA + 0.25 * coarseB;
        const detail = 0.5 + 0.25 * detailA + 0.25 * detailB;
        return Math.max(0, coarse) * this.reliefAmplitude + Math.max(0, detail) * this.detailAmplitude;
    }

    private GetEdgeFadeFactor(distanceToEdge: number): number {
        const fadeWidth = Math.max(0, this.edgeFadeWidth);
        if (fadeWidth <= 0.0001) {
            return 1;
        }

        const normalizedDistance = Math.max(0, Math.min(1, distanceToEdge / fadeWidth));
        return normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);
    }
}
