import { _decorator, BoxCollider, Component, Enum, instantiate, Node, Prefab, Vec2 } from 'cc';
import { ItemFlyService } from '../Items/ItemFlyService';
import { EItemType } from '../Items/ItemType';
import { PlayerInventory } from '../Player/PlayerInventory';
import { SandCollectableOre } from './SandCollectableOre';

const { ccclass, executeInEditMode, property } = _decorator;

@ccclass('SandOreAreaBuilder')
@executeInEditMode(true)
export class SandOreAreaBuilder extends Component {
    @property({ type: BoxCollider, tooltip: 'BoxCollider defining the ore spawn area in local XZ coordinates.' })
    public boxCollider: BoxCollider | null = null;

    @property({ type: Prefab, tooltip: 'Ore visual prefab instantiated for every generated piece.' })
    public orePrefab: Prefab | null = null;

    @property({ type: Prefab})
    public flyPrefab: Prefab | null = null;

    @property(Node)
    public flyTarget: Node | null = null;

    @property(PlayerInventory)
    public playerInventory: PlayerInventory | null = null;

    @property(ItemFlyService)
    public flyService: ItemFlyService | null = null;

    @property({ type: Enum(EItemType) })
    public resultItem: EItemType = EItemType.GoldOre;

    @property({ min: 1, step: 1 })
    public oreCount: number = 10;

    @property({ min: 0 })
    public minimumDistance: number = 1.6;

    @property({ min: 0 })
    public edgePadding: number = 1.1;

    @property({ min: 0.001 })
    public minOreScale: number = 0.08;

    @property({ min: 0.001 })
    public maxOreScale: number = 0.13;

    @property
    public yOffset: number = 0.12;

    @property({ min: 0.01 })
    public collectRadius: number = 0.65;

    @property({ step: 1, tooltip: 'Change the seed to generate another stable random ore layout.' })
    public seed: number = 24680;

    @property({ min: 1, step: 1 })
    public attemptsPerOre: number = 30;

    @property({ tooltip: 'Rebuild generated ore and turn this flag off automatically.' })
    public rebuild: boolean = false;

    private static readonly ROOT_NAME = '__GeneratedSandOre__';
    private generatedRoot: Node | null = null;
    private generatedOres: SandCollectableOre[] = [];
    private lastSignature: string = '';

    public GetOres(): readonly SandCollectableOre[] {
        return this.generatedOres;
    }

    public RebuildNow(): void {
        this.rebuild = false;
        this.lastSignature = this.GetSignature();
        this.BuildOre();
    }

    public RebuildWithNextSeed(): void {
        const currentSeed = Number.isFinite(this.seed) ? Math.floor(this.seed) : 0;
        this.seed = currentSeed + 1;
        this.RebuildNow();
    }

    protected onEnable(): void {
        this.TryRebuild();
    }

    protected update(): void {
        this.TryRebuild();
    }

    private TryRebuild(): void {
        const signature = this.GetSignature();
        if (!this.rebuild && signature === this.lastSignature) {
            return;
        }

        this.rebuild = false;
        this.lastSignature = signature;
        this.BuildOre();
    }

    private GetSignature(): string {
        const collider = this.boxCollider;
        const size = collider?.size;
        const center = collider?.center;
        return [
            collider?.uuid ?? '', this.orePrefab?.uuid ?? '',
            this.flyTarget?.uuid ?? '', this.playerInventory?.uuid ?? '', this.flyService?.uuid ?? '',
            size?.x ?? 0, size?.y ?? 0, size?.z ?? 0,
            center?.x ?? 0, center?.y ?? 0, center?.z ?? 0,
            this.resultItem, this.oreCount, this.minimumDistance, this.edgePadding,
            this.minOreScale, this.maxOreScale, this.yOffset, this.collectRadius,
            this.seed, this.attemptsPerOre,
        ].join('|');
    }

    private BuildOre(): void {
        this.RemoveGeneratedRoot();
        const collider = this.boxCollider;
        const prefab = this.orePrefab;
        if (!collider || !prefab?.isValid || this.oreCount <= 0) {
            return;
        }

        const padding = Math.max(0, this.edgePadding);
        const availableWidth = collider.size.x - padding * 2;
        const availableDepth = collider.size.z - padding * 2;
        if (availableWidth <= 0 || availableDepth <= 0) {
            return;
        }

        const root = new Node(SandOreAreaBuilder.ROOT_NAME);
        root.setParent(collider.node);
        this.generatedRoot = root;
        const random = this.CreateRandom(this.seed);
        const positions: Vec2[] = [];
        const center = collider.center;
        const targetCount = Math.max(0, Math.floor(this.oreCount));
        const maximumAttempts = targetCount * Math.max(1, Math.floor(this.attemptsPerOre));
        const minimumDistanceSquared = Math.max(0, this.minimumDistance) ** 2;
        const minScale = Math.max(0.001, Math.min(this.minOreScale, this.maxOreScale));
        const maxScale = Math.max(minScale, Math.max(this.minOreScale, this.maxOreScale));

        for (let attempt = 0; attempt < maximumAttempts && positions.length < targetCount; attempt++) {
            const position = new Vec2(
                center.x + (random() - 0.5) * availableWidth,
                center.z + (random() - 0.5) * availableDepth,
            );
            if (!this.IsFarEnough(position, positions, minimumDistanceSquared)) {
                continue;
            }

            positions.push(position);
            const oreNode = instantiate(prefab);
            const scale = minScale + (maxScale - minScale) * random();
            oreNode.name = `GoldOre_${positions.length}`;
            oreNode.setParent(root);
            oreNode.setPosition(position.x, center.y + this.yOffset, position.y);
            oreNode.setRotationFromEuler(0, random() * 360, 0);
            oreNode.setScale(scale, scale, scale);

            const ore = oreNode.getComponent(SandCollectableOre) ?? oreNode.addComponent(SandCollectableOre);
            ore.resultItem = this.resultItem;
            ore.collectRadius = this.collectRadius;
            ore.flyVisualPrefab = this.flyPrefab;
            ore.flyTarget = this.flyTarget;
            ore.playerInventory = this.playerInventory;
            ore.flyService = this.flyService;
            this.generatedOres.push(ore);
        }
    }

    private IsFarEnough(candidate: Vec2, positions: Vec2[], minimumDistanceSquared: number): boolean {
        for (const position of positions) {
            const dx = candidate.x - position.x;
            const dz = candidate.y - position.y;
            if (dx * dx + dz * dz < minimumDistanceSquared) {
                return false;
            }
        }
        return true;
    }

    private CreateRandom(seed: number): () => number {
        let state = Math.floor(seed) >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    private RemoveGeneratedRoot(): void {
        const oldRoot = this.generatedRoot ?? this.boxCollider?.node.getChildByName(SandOreAreaBuilder.ROOT_NAME);
        if (oldRoot?.isValid) {
            oldRoot.destroy();
        }
        this.generatedRoot = null;
        this.generatedOres = [];
    }
}
