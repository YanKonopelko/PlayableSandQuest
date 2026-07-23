import { _decorator, CCFloat, Component, Enum, Node, Prefab, Vec3 } from 'cc';
import { EItemType } from '../Items/ItemType';
import { ItemFlyService } from '../Items/ItemFlyService';
import { PlayerInventory } from '../Player/PlayerInventory';

const { ccclass, property } = _decorator;

@ccclass('SandCollectableOre')
export class SandCollectableOre extends Component {
    @property({ type: Enum(EItemType) })
    public resultItem: EItemType = EItemType.GoldOre;

    @property({ type: CCFloat })
    public collectRadius: number = 1.65;

    @property({ type: CCFloat })
    public collectFlyDuration: number = 0.65;

    @property({ type: CCFloat })
    public collectFlyArcHeight: number = 7.0;

    @property(Prefab)
    public flyVisualPrefab: Prefab | null = null;

    @property(Node)
    public flyTarget: Node | null = null;

    @property(PlayerInventory)
    public playerInventory: PlayerInventory | null = null;

    @property(ItemFlyService)
    public flyService: ItemFlyService | null = null;

    private collected: boolean = false;

    public get IsCollected(): boolean {
        return this.collected;
    }

    public TryCollectFrom(probe: Node): boolean {
        if (!probe) {
            return false;
        }

        return this.TryCollectAt(probe.worldPosition);
    }

    public TryCollectAt(worldPosition: Vec3): boolean {
        if (this.collected) {
            return false;
        }

        const orePosition = this.node.worldPosition;
        const dx = orePosition.x - worldPosition.x;
        const dy = orePosition.y - worldPosition.y;
        const dz = orePosition.z - worldPosition.z;
        if (dx * dx + dy * dy + dz * dz > this.collectRadius * this.collectRadius) {
            return false;
        }

        return this.Collect();
    }

    public Collect(): boolean {
        const inventory = this.playerInventory;
        if (this.collected || !inventory?.TryReserve(this.resultItem, 1)) {
            return false;
        }

        this.collected = true;
        const start = this.node.worldPosition.clone();
        this.node.active = false;

        const complete = () => inventory.CommitReserved(this.resultItem, 1);

        if (this.flyService && this.flyVisualPrefab && this.flyTarget) {
            const flyingItem = this.flyService.FlyPrefabToNode(
                this.flyVisualPrefab,
                start,
                this.flyTarget,
                complete,
                this.collectFlyDuration,
                this.collectFlyArcHeight,
            );
            if (!flyingItem) {
                complete();
            }
        } else {
            complete();
        }

        return true;
    }

    public ResetOre(): void {
        this.collected = false;
        this.node.active = true;
    }
}
