import { _decorator, BoxCollider, Component, instantiate, Node, Prefab, Vec2 } from 'cc';

const { ccclass, executeInEditMode, property } = _decorator;

/** Fills the local XZ area of a BoxCollider with an irregular forest. */
@ccclass('ForestAreaBuilder')
@executeInEditMode(true)
export class ForestAreaBuilder extends Component {
    @property({ type: BoxCollider, tooltip: 'BoxCollider defining the forest area in local XZ coordinates.' })
    public boxCollider: BoxCollider | null = null;

    @property({ type: [Prefab], tooltip: 'Tree prefabs selected randomly for every generated tree.' })
    public treePrefabs: Prefab[] = [];

    @property({ min: 0, step: 1, tooltip: 'Desired number of trees.' })
    public treeCount = 30;

    @property({ min: 0, tooltip: 'Minimum distance between tree positions.' })
    public minimumDistance = 1.5;

    @property({ min: 0, tooltip: 'Empty margin along the BoxCollider border.' })
    public edgePadding = 0.5;

    @property({ min: 0.001, tooltip: 'Smallest uniform tree scale.' })
    public minTreeScale = 0.85;

    @property({ min: 0.001, tooltip: 'Largest uniform tree scale.' })
    public maxTreeScale = 1.15;

    @property({ tooltip: 'Local Y offset relative to the BoxCollider centre.' })
    public yOffset = 0;

    @property({ step: 1, tooltip: 'Change this value to generate another stable random layout.' })
    public seed = 12345;

    @property({ min: 1, step: 1, tooltip: 'Random placement attempts per requested tree.' })
    public attemptsPerTree = 30;

    @property({ tooltip: 'Rebuild the forest. Turned off automatically after rebuilding.' })
    public rebuild = false;

    private static readonly ROOT_NAME = '__GeneratedForest__';
    private _generatedRoot: Node | null = null;
    private _lastSignature = '';

    protected onEnable(): void {
        this.tryRebuild();
    }

    protected update(): void {
        this.tryRebuild();
    }

    private tryRebuild(): void {
        const signature = this.getSignature();
        if (!this.rebuild && signature === this._lastSignature) {
            return;
        }

        this.rebuild = false;
        this._lastSignature = signature;
        this.buildForest();
    }

    private getSignature(): string {
        const collider = this.boxCollider;
        const size = collider?.size;
        const center = collider?.center;
        return [
            collider?.uuid ?? '',
            ...this.treePrefabs.map(prefab => prefab?.uuid ?? ''),
            size?.x ?? 0, size?.y ?? 0, size?.z ?? 0,
            center?.x ?? 0, center?.y ?? 0, center?.z ?? 0,
            this.treeCount, this.minimumDistance, this.edgePadding,
            this.minTreeScale, this.maxTreeScale, this.yOffset,
            this.seed, this.attemptsPerTree,
        ].join('|');
    }

    private buildForest(): void {
        this.removeGeneratedRoot();

        const prefabs = this.treePrefabs.filter(prefab => prefab?.isValid);
        if (!this.boxCollider || prefabs.length === 0 || this.treeCount <= 0) {
            return;
        }

        const size = this.boxCollider.size;
        const padding = Math.max(0, this.edgePadding);
        const availableWidth = size.x - padding * 2;
        const availableDepth = size.z - padding * 2;
        if (availableWidth <= 0 || availableDepth <= 0) {
            return;
        }

        const root = new Node(ForestAreaBuilder.ROOT_NAME);
        root.setParent(this.boxCollider.node);
        this._generatedRoot = root;

        const random = this.createRandom(this.seed);
        const positions: Vec2[] = [];
        const center = this.boxCollider.center;
        const minimumDistanceSquared = Math.max(0, this.minimumDistance) ** 2;
        const targetCount = Math.max(0, Math.floor(this.treeCount));
        const maximumAttempts = targetCount * Math.max(1, Math.floor(this.attemptsPerTree));
        const minScale = Math.max(0.001, Math.min(this.minTreeScale, this.maxTreeScale));
        const maxScale = Math.max(minScale, Math.max(this.minTreeScale, this.maxTreeScale));

        for (let attempt = 0; attempt < maximumAttempts && positions.length < targetCount; attempt++) {
            const position = new Vec2(
                center.x + (random() - 0.5) * availableWidth,
                center.z + (random() - 0.5) * availableDepth,
            );

            if (!this.isFarEnough(position, positions, minimumDistanceSquared)) {
                continue;
            }

            positions.push(position);
            const prefab = prefabs[Math.floor(random() * prefabs.length)];
            const tree = instantiate(prefab);
            const scale = minScale + (maxScale - minScale) * random();

            tree.name = `Tree_${positions.length}`;
            tree.setParent(root);
            tree.setPosition(position.x, center.y + this.yOffset, position.y);
            tree.setRotationFromEuler(0, random() * 360, 0);
            tree.setScale(scale, scale, scale);
        }
    }

    private isFarEnough(candidate: Vec2, positions: Vec2[], minimumDistanceSquared: number): boolean {
        for (const position of positions) {
            const dx = candidate.x - position.x;
            const dz = candidate.y - position.y;
            if (dx * dx + dz * dz < minimumDistanceSquared) {
                return false;
            }
        }
        return true;
    }

    private createRandom(seed: number): () => number {
        let state = Math.floor(seed) >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    private removeGeneratedRoot(): void {
        const oldRoot = this._generatedRoot ?? this.boxCollider?.node.getChildByName(ForestAreaBuilder.ROOT_NAME);
        if (oldRoot?.isValid) {
            oldRoot.destroy();
        }
        this._generatedRoot = null;
    }
}
