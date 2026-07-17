import { _decorator, BoxCollider, CCFloat, Component, Material, Mesh, MeshRenderer, utils, Vec3 } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

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

    private carvedHeights: number[] = [];
    private generatedMesh: Mesh | null = null;
    private readonly localProbe: Vec3 = new Vec3();

    public get ErasedCellCount(): number {
        let count = 0;
        for (const height of this.carvedHeights) {
            if (Number.isFinite(height)) {
                count++;
            }
        }
        return count;
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

        this.node.inverseTransformPoint(this.localProbe, worldPosition);
        const grid = this.GetGrid();
        this.EnsureCarvedField(grid.vertexCount);

        const minX = collider.center.x - collider.size.x * 0.5;
        const minZ = collider.center.z - collider.size.z * 0.5;
        const maxY = collider.center.y + collider.size.y * 0.5;
        const minY = collider.center.y - collider.size.y * 0.5;
        const radiusSqr = worldRadius * worldRadius;
        const minGridX = Math.max(0, Math.floor((this.localProbe.x - worldRadius - minX) / grid.stepX));
        const maxGridX = Math.min(grid.segmentsX, Math.ceil((this.localProbe.x + worldRadius - minX) / grid.stepX));
        const minGridZ = Math.max(0, Math.floor((this.localProbe.z - worldRadius - minZ) / grid.stepZ));
        const maxGridZ = Math.min(grid.segmentsZ, Math.ceil((this.localProbe.z + worldRadius - minZ) / grid.stepZ));
        let changedSamples = 0;

        for (let z = minGridZ; z <= maxGridZ; z++) {
            const sampleZ = minZ + z * grid.stepZ;
            for (let x = minGridX; x <= maxGridX; x++) {
                const sampleX = minX + x * grid.stepX;
                const dx = sampleX - this.localProbe.x;
                const dz = sampleZ - this.localProbe.z;
                const radialSqr = dx * dx + dz * dz;
                if (radialSqr >= radiusSqr) {
                    continue;
                }

                const index = z * (grid.segmentsX + 1) + x;
                const sphericalHeight = Math.max(minY, maxY - Math.sqrt(radiusSqr - radialSqr));
                if (sphericalHeight < this.carvedHeights[index] - 0.001) {
                    this.carvedHeights[index] = sphericalHeight;
                    changedSamples++;
                }
            }
        }

        if (changedSamples > 0) {
            this.RebuildMesh();
        }
        return changedSamples;
    }

    public ResetSurface(): void {
        const grid = this.GetGrid();
        this.carvedHeights = new Array(grid.vertexCount).fill(Number.POSITIVE_INFINITY);
        this.RebuildMesh();
    }

    private GetGrid(): {
        segmentsX: number;
        segmentsZ: number;
        stepX: number;
        stepZ: number;
        vertexCount: number;
    } {
        const collider = this.boundsCollider;
        const width = Math.max(0.01, collider?.size.x ?? 1);
        const depth = Math.max(0.01, collider?.size.z ?? 1);
        const spacing = Math.max(0.08, this.vertexSpacing);
        const segmentsX = Math.max(2, Math.ceil(width / spacing));
        const segmentsZ = Math.max(2, Math.ceil(depth / spacing));
        return {
            segmentsX,
            segmentsZ,
            stepX: width / segmentsX,
            stepZ: depth / segmentsZ,
            vertexCount: (segmentsX + 1) * (segmentsZ + 1),
        };
    }

    private EnsureCarvedField(vertexCount: number): void {
        if (this.carvedHeights.length !== vertexCount) {
            this.carvedHeights = new Array(vertexCount).fill(Number.POSITIVE_INFINITY);
        }
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

    private RebuildMesh(): void {
        const collider = this.boundsCollider;
        const renderer = this.meshRenderer;
        if (!collider || !renderer) {
            return;
        }

        const grid = this.GetGrid();
        this.EnsureCarvedField(grid.vertexCount);
        const minX = collider.center.x - collider.size.x * 0.5;
        const maxX = collider.center.x + collider.size.x * 0.5;
        const minY = collider.center.y - collider.size.y * 0.5;
        const maxY = collider.center.y + collider.size.y * 0.5;
        const minZ = collider.center.z - collider.size.z * 0.5;
        const maxZ = collider.center.z + collider.size.z * 0.5;
        const heights = new Array<number>(grid.vertexCount);
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        for (let z = 0; z <= grid.segmentsZ; z++) {
            const sampleZ = minZ + z * grid.stepZ;
            for (let x = 0; x <= grid.segmentsX; x++) {
                const sampleX = minX + x * grid.stepX;
                const index = z * (grid.segmentsX + 1) + x;
                const relief = this.SampleRelief(sampleX, sampleZ);
                const naturalHeight = maxY - relief;
                const carvedHeight = this.carvedHeights[index] - relief * 0.3;
                const surfaceHeight = Math.max(minY, Math.min(naturalHeight, carvedHeight));
                const distanceToEdge = Math.min(
                    sampleX - minX,
                    maxX - sampleX,
                    sampleZ - minZ,
                    maxZ - sampleZ,
                );
                const edgeFactor = this.GetEdgeFadeFactor(distanceToEdge);
                heights[index] = minY + (surfaceHeight - minY) * edgeFactor;
            }
        }

        const heightAt = (x: number, z: number): number => {
            const safeX = Math.max(0, Math.min(grid.segmentsX, x));
            const safeZ = Math.max(0, Math.min(grid.segmentsZ, z));
            return heights[safeZ * (grid.segmentsX + 1) + safeX];
        };

        for (let z = 0; z <= grid.segmentsZ; z++) {
            const sampleZ = minZ + z * grid.stepZ;
            for (let x = 0; x <= grid.segmentsX; x++) {
                const sampleX = minX + x * grid.stepX;
                const index = z * (grid.segmentsX + 1) + x;
                const normal = new Vec3(
                    (heightAt(x - 1, z) - heightAt(x + 1, z)) / Math.max(0.001, grid.stepX * 2),
                    1,
                    (heightAt(x, z - 1) - heightAt(x, z + 1)) / Math.max(0.001, grid.stepZ * 2),
                );
                normal.normalize();
                positions.push(sampleX, heights[index], sampleZ);
                normals.push(normal.x, normal.y, normal.z);
                uvs.push((sampleX - minX) * this.textureTiling, (sampleZ - minZ) * this.textureTiling);
            }
        }

        for (let z = 0; z < grid.segmentsZ; z++) {
            for (let x = 0; x < grid.segmentsX; x++) {
                const a = z * (grid.segmentsX + 1) + x;
                const b = (z + 1) * (grid.segmentsX + 1) + x;
                const c = b + 1;
                const d = a + 1;
                indices.push(a, b, c, a, c, d);
            }
        }

        const addSideQuad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3, uvLength: number): void => {
            const first = positions.length / 3;
            for (const vertex of [a, b, c, d]) {
                positions.push(vertex.x, vertex.y, vertex.z);
                normals.push(normal.x, normal.y, normal.z);
            }
            uvs.push(0, 0, uvLength, 0, uvLength, 1, 0, 1);
            indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
        };

        for (let x = 0; x < grid.segmentsX; x++) {
            const x0 = minX + x * grid.stepX;
            const x1 = x0 + grid.stepX;
            addSideQuad(
                new Vec3(x1, minY, minZ), new Vec3(x0, minY, minZ),
                new Vec3(x0, heightAt(x, 0), minZ), new Vec3(x1, heightAt(x + 1, 0), minZ),
                new Vec3(0, 0, -1), grid.stepX * this.textureTiling,
            );
            addSideQuad(
                new Vec3(x0, minY, maxZ), new Vec3(x1, minY, maxZ),
                new Vec3(x1, heightAt(x + 1, grid.segmentsZ), maxZ), new Vec3(x0, heightAt(x, grid.segmentsZ), maxZ),
                new Vec3(0, 0, 1), grid.stepX * this.textureTiling,
            );
        }

        for (let z = 0; z < grid.segmentsZ; z++) {
            const z0 = minZ + z * grid.stepZ;
            const z1 = z0 + grid.stepZ;
            addSideQuad(
                new Vec3(minX, minY, z0), new Vec3(minX, minY, z1),
                new Vec3(minX, heightAt(0, z + 1), z1), new Vec3(minX, heightAt(0, z), z0),
                new Vec3(-1, 0, 0), grid.stepZ * this.textureTiling,
            );
            addSideQuad(
                new Vec3(maxX, minY, z1), new Vec3(maxX, minY, z0),
                new Vec3(maxX, heightAt(grid.segmentsX, z), z0), new Vec3(maxX, heightAt(grid.segmentsX, z + 1), z1),
                new Vec3(1, 0, 0), grid.stepZ * this.textureTiling,
            );
        }

        addSideQuad(
            new Vec3(minX, minY, maxZ), new Vec3(minX, minY, minZ),
            new Vec3(maxX, minY, minZ), new Vec3(maxX, minY, maxZ),
            new Vec3(0, -1, 0), collider.size.x * this.textureTiling,
        );

        const nextMesh = utils.createMesh({
            positions,
            normals,
            uvs,
            indices,
            minPos: new Vec3(minX, minY, minZ),
            maxPos: new Vec3(maxX, maxY, maxZ),
        });
        const previousMesh = this.generatedMesh;
        this.generatedMesh = nextMesh;
        renderer.mesh = nextMesh;
        if (this.sandMaterial) {
            renderer.setMaterial(this.sandMaterial, 0);
        }
        previousMesh?.destroy();
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
