import { _decorator, BoxCollider, Component, instantiate, Node, Prefab, Vec3 } from 'cc';

const { ccclass, executeInEditMode, property } = _decorator;

/**
 * Builds a rectangular fence around a BoxCollider in its local XZ plane.
 * A fence prefab is expected to extend along its local X axis.
 */
@ccclass('FencePerimeterBuilder')
@executeInEditMode(true)
export class FencePerimeterBuilder extends Component {
    @property({ type: BoxCollider, tooltip: 'Collider whose XZ perimeter is fenced.' })
    public boxCollider: BoxCollider | null = null;

    @property({ type: Prefab, tooltip: 'One fence section. Its length must lie along local X.' })
    public fencePrefab: Prefab | null = null;

    @property({ min: 0.001, tooltip: 'Fence section length along X when its scale equals 1.' })
    public fenceLength = 1;

    @property({ min: 0.001, tooltip: 'Smallest allowed uniform scale of every section.' })
    public minFenceScale = 0.5;

    @property({ min: 0.001, tooltip: 'Largest allowed uniform scale of every section.' })
    public maxFenceScale = 2;

    @property({ tooltip: 'Local Y offset relative to the BoxCollider centre.' })
    public yOffset = 0;

    @property({ tooltip: 'Rebuild the fence. Turned off automatically after rebuilding.' })
    public rebuild = false;

    private static readonly ROOT_NAME = '__GeneratedFencePerimeter__';
    private _lastSignature = '';
    private _generatedRoot: Node | null = null;

    protected onEnable(): void {
        this.tryRebuild();
    }

    protected update(): void {
        // update also runs in the editor because of executeInEditMode.
        this.tryRebuild();
    }

    private tryRebuild(): void {
        const signature = this.getSignature();
        if (!this.rebuild && signature === this._lastSignature) {
            return;
        }

        this.rebuild = false;
        this._lastSignature = signature;
        this.buildFence();
    }

    private getSignature(): string {
        const collider = this.boxCollider;
        const size = collider?.size;
        const center = collider?.center;
        return [
            collider?.uuid ?? '',
            this.fencePrefab?.uuid ?? '',
            size?.x ?? 0, size?.y ?? 0, size?.z ?? 0,
            center?.x ?? 0, center?.y ?? 0, center?.z ?? 0,
            this.fenceLength, this.minFenceScale, this.maxFenceScale, this.yOffset,
        ].join('|');
    }

    private buildFence(): void {
        this.removeGeneratedRoot();

        if (!this.boxCollider || !this.fencePrefab || this.fenceLength <= 0) {
            return;
        }

        const size = this.boxCollider.size;
        if (size.x <= 0 || size.z <= 0) {
            return;
        }

        const minScale = Math.max(0.001, Math.min(this.minFenceScale, this.maxFenceScale));
        const maxScale = Math.max(minScale, Math.max(this.minFenceScale, this.maxFenceScale));
        const layout = this.findBestLayout(size.x, size.z, minScale, maxScale);
        const root = new Node(FencePerimeterBuilder.ROOT_NAME);
        root.setParent(this.boxCollider.node);
        this._generatedRoot = root;

        const center = this.boxCollider.center;
        const halfX = size.x * 0.5;
        const halfZ = size.z * 0.5;
        const y = center.y + this.yOffset;

        this.buildSide(root, layout.countX, size.x, new Vec3(center.x, y, center.z + halfZ), 0, layout.scale);
        this.buildSide(root, layout.countX, size.x, new Vec3(center.x, y, center.z - halfZ), 180, layout.scale);
        this.buildSide(root, layout.countZ, size.z, new Vec3(center.x + halfX, y, center.z), 90, layout.scale);
        this.buildSide(root, layout.countZ, size.z, new Vec3(center.x - halfX, y, center.z), -90, layout.scale);
    }

    private findBestLayout(width: number, depth: number, minScale: number, maxScale: number): {
        countX: number;
        countZ: number;
        scale: number;
    } {
        const candidateCountsX = this.getCandidateCounts(width, minScale, maxScale);
        const candidateCountsZ = this.getCandidateCounts(depth, minScale, maxScale);
        let best = { countX: 1, countZ: 1, scale: minScale };
        let bestError = Number.POSITIVE_INFINITY;

        for (const countX of candidateCountsX) {
            for (const countZ of candidateCountsZ) {
                const idealScaleX = width / (countX * this.fenceLength);
                const idealScaleZ = depth / (countZ * this.fenceLength);
                const scale = Math.min(maxScale, Math.max(minScale, (idealScaleX + idealScaleZ) * 0.5));
                const sectionLength = this.fenceLength * scale;
                const error = Math.abs(width - countX * sectionLength) + Math.abs(depth - countZ * sectionLength);

                if (error < bestError) {
                    bestError = error;
                    best = { countX, countZ, scale };
                }
            }
        }

        return best;
    }

    private getCandidateCounts(sideLength: number, minScale: number, maxScale: number): number[] {
        const counts = new Set<number>();
        const scales = [minScale, (minScale + maxScale) * 0.5, maxScale];

        for (const scale of scales) {
            const idealCount = sideLength / (this.fenceLength * scale);
            const roundedCount = Math.max(1, Math.round(idealCount));
            for (let offset = -2; offset <= 2; offset++) {
                counts.add(Math.max(1, roundedCount + offset));
            }
        }

        return Array.from(counts);
    }

    private buildSide(root: Node, count: number, sideLength: number, center: Vec3, yaw: number, scale: number): void {
        const step = sideLength / count;
        for (let index = 0; index < count; index++) {
            const fence = instantiate(this.fencePrefab!);
            fence.name = `Fence_${root.children.length + 1}`;
            fence.setParent(root);

            const offset = -sideLength * 0.5 + step * (index + 0.5);
            if (Math.abs(yaw) === 90) {
                fence.setPosition(center.x, center.y, center.z + offset);
            } else {
                fence.setPosition(center.x + offset, center.y, center.z);
            }

            fence.setRotationFromEuler(0, yaw, 0);
            fence.setScale(scale, scale, scale);
        }
    }

    private removeGeneratedRoot(): void {
        const oldRoot = this._generatedRoot ?? this.boxCollider?.node.getChildByName(FencePerimeterBuilder.ROOT_NAME);
        if (oldRoot?.isValid) {
            oldRoot.destroy();
        }
        this._generatedRoot = null;
    }
}
