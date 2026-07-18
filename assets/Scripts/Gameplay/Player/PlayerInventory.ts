import { _decorator, Component } from 'cc';
import { EItemType } from '../Items/ItemType';
import { ItemStackView } from '../Items/ItemStackView';

const { ccclass, property } = _decorator;

@ccclass('PlayerInventory')
export class PlayerInventory extends Component {
    @property(ItemStackView)
    public goldOreStack: ItemStackView | null = null;

    @property(ItemStackView)
    public moneyStack: ItemStackView | null = null;

    private readonly counts: number[] = [0, 0, 0];

    public GetCount(itemType: EItemType): number {
        return this.counts[itemType] ?? 0;
    }

    public Has(itemType: EItemType, amount: number): boolean {
        return this.GetCount(itemType) >= amount;
    }

    public Add(itemType: EItemType, amount: number = 1): void {
        this.counts[itemType] = this.GetCount(itemType) + Math.max(0, amount);
        this.GetStackView(itemType)?.SetCount(this.counts[itemType]);
    }

    public TryRemove(itemType: EItemType, amount: number = 1): boolean {
        if (this.GetCount(itemType) < amount) {
            return false;
        }

        this.counts[itemType] -= Math.max(0, amount);
        this.GetStackView(itemType)?.SetCount(this.counts[itemType]);
        return true;
    }

    public Clear(itemType: EItemType): void {
        this.counts[itemType] = 0;
        this.GetStackView(itemType)?.SetCount(0);
    }

    protected start(): void {
        this.goldOreStack?.SetCount(this.GetCount(EItemType.GoldOre), false);
        this.moneyStack?.SetCount(this.GetCount(EItemType.Money), false);
    }

    private GetStackView(itemType: EItemType): ItemStackView | null {
        switch (itemType) {
            case EItemType.GoldOre:
                return this.goldOreStack;
            case EItemType.Money:
                return this.moneyStack;
            default:
                return null;
        }
    }
}
