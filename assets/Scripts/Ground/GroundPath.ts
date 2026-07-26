import { _decorator, Component, Material, Mesh, MeshRenderer, utils, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { sampleCatmullRom } from './GroundPathMath';

const { ccclass, executeInEditMode, property } = _decorator;

/**
 * An editor-authored ground path. Every direct child node is a control point.
 * By default the generated ribbon is an editor preview, but selected paths can
 * keep the generated mesh in a player build (for example the main road).
 */
@ccclass('GroundPath')
@executeInEditMode(true)
export class GroundPath extends Component {
    @property({ min: 0.05, tooltip: 'Path width in world units.' })
    public width = 1.35;

    @property({ min: 0, tooltip: 'Soft transition outside the path edge, in world units.' })
    public edgeFeather = 0.28;

    @property({ min: 0, tooltip: 'Irregularity of the baked edge, in world units.' })
    public edgeNoise = 0.12;

    @property({ min: 1, max: 32, step: 1, tooltip: 'Spline samples per pair of control points.' })
    public samplesPerSegment = 8;

    @property({ tooltip: 'Connect the last point back to the first point.' })
    public closed = false;

    @property({ type: Material, tooltip: 'Editor-only ribbon material.' })
    public previewMaterial: Material | null = null;

    @property({ tooltip: 'Keep the generated ribbon visible in player builds.' })
    public visibleInBuild = false;

    @property({ min: 0, tooltip: 'Height above the control points, used to prevent z-fighting.' })
    public heightOffset = 0.035;

    private generatedMesh: Mesh | null = null;
    private signature = '';

    protected onEnable(): void {
        const renderer = this.getOrCreateRenderer();
        if (!EDITOR && !this.visibleInBuild) {
            if (renderer) {
                renderer.enabled = false;
            }
            this.enabled = false;
            return;
        }
        this.rebuildPreview();
    }

    protected update(): void {
        if (!EDITOR) {
            return;
        }

        const nextSignature = this.getSignature();
        if (nextSignature !== this.signature) {
            this.signature = nextSignature;
            this.rebuildPreview();
        }
    }

    protected onDestroy(): void {
        this.generatedMesh?.destroy();
        this.generatedMesh = null;
    }

    public getLocalControlPoints(): Vec3[] {
        return this.node.children.map(child => child.position.clone());
    }

    public getSampledWorldPoints(): Vec3[] {
        return sampleCatmullRom(this.getLocalControlPoints(), this.samplesPerSegment, this.closed)
            .map(point => Vec3.transformMat4(new Vec3(), point, this.node.worldMatrix));
    }

    public forcePreviewRebuild(): void {
        this.signature = '';
        if (EDITOR) {
            this.rebuildPreview();
        }
    }

    private getOrCreateRenderer(): MeshRenderer | null {
        let renderer = this.getComponent(MeshRenderer);
        if (!renderer && EDITOR) {
            renderer = this.addComponent(MeshRenderer);
        }
        return renderer;
    }

    private rebuildPreview(): void {
        const renderer = this.getOrCreateRenderer();
        if (!renderer) {
            return;
        }

        const points = sampleCatmullRom(this.getLocalControlPoints(), this.samplesPerSegment, this.closed);
        if (points.length < 2) {
            renderer.enabled = false;
            return;
        }

        const halfWidth = Math.max(0.025, this.width * 0.5);
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let travelled = 0;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let minZ = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let maxZ = Number.NEGATIVE_INFINITY;

        for (let index = 0; index < points.length; index++) {
            const previous = points[Math.max(0, index - 1)];
            const next = points[Math.min(points.length - 1, index + 1)];
            const tangentX = next.x - previous.x;
            const tangentZ = next.z - previous.z;
            const tangentLength = Math.max(0.0001, Math.sqrt(tangentX * tangentX + tangentZ * tangentZ));
            const sideX = -tangentZ / tangentLength * halfWidth;
            const sideZ = tangentX / tangentLength * halfWidth;
            const point = points[index];

            if (index > 0) {
                travelled += Vec3.distance(points[index - 1], point);
            }

            for (const side of [-1, 1]) {
                const x = point.x + sideX * side;
                const y = point.y + this.heightOffset;
                const z = point.z + sideZ * side;
                positions.push(x, y, z);
                normals.push(0, 1, 0);
                uvs.push(side < 0 ? 0 : 1, travelled);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                minZ = Math.min(minZ, z);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                maxZ = Math.max(maxZ, z);
            }

            if (index < points.length - 1) {
                const first = index * 2;
                indices.push(first, first + 2, first + 3, first, first + 3, first + 1);
            }
        }

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
        renderer.enabled = true;
        if (this.previewMaterial) {
            renderer.setMaterial(this.previewMaterial, 0);
        }
        previousMesh?.destroy();
    }

    private getSignature(): string {
        const values: Array<string | number> = [
            this.width,
            this.edgeFeather,
            this.edgeNoise,
            this.samplesPerSegment,
            this.closed ? 1 : 0,
            this.visibleInBuild ? 1 : 0,
            this.heightOffset,
            this.previewMaterial?.uuid ?? '',
        ];
        for (const child of this.node.children) {
            values.push(child.uuid, child.position.x, child.position.y, child.position.z);
        }
        return values.join('|');
    }
}
