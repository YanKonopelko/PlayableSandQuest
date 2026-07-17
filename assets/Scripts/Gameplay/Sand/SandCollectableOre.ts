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
    public collectRadius: number = 0.65;

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
        if (this.collected || !probe) {
            return false;
        }

        const distance = Vec3.distance(this.node.worldPosition, probe.worldPosition);
        if (distance > this.collectRadius) {
            return false;
        }

        this.Collect();
        return true;
    }

    public Collect(): void {
        if (this.collected) {
            return;
        }

        this.collected = true;
        const start = this.node.worldPosition.clone();
        this.node.active = false;

        const complete = () => this.playerInventory?.Add(this.resultItem, 1);

        if (this.flyService && this.flyVisualPrefab && this.flyTarget) {
            this.flyService.FlyPrefabToNode(this.flyVisualPrefab, start, this.flyTarget, complete);
        } else {
            complete();
        }
    }
}
