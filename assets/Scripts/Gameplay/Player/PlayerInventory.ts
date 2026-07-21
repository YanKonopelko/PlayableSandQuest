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

    @property([ItemStackView])
    public itemStacks: ItemStackView[] = [];

    private readonly counts: number[] = [0, 0, 0];

    public GetCount(itemType: EItemType): number {
        return this.counts[itemType] ?? 0;
    }

    public Has(itemType: EItemType, amount: number): boolean {
        return this.GetCount(itemType) >= amount;
    }

    public Add(itemType: EItemType, amount: number = 1): void {
        this.counts[itemType] = this.GetCount(itemType) + Math.max(0, amount);
        this.RefreshStackViews(itemType);
    }

    public TryRemove(itemType: EItemType, amount: number = 1): boolean {
        if (this.GetCount(itemType) < amount) {
            return false;
        }

        this.counts[itemType] -= Math.max(0, amount);
        this.RefreshStackViews(itemType);
        return true;
    }

    public Clear(itemType: EItemType): void {
        this.counts[itemType] = 0;
        this.RefreshStackViews(itemType);
    }

    protected start(): void {
        this.RefreshStackViews(null, false);
    }

    private GetStackView(itemType: EItemType): ItemStackView | null {
        const configuredStack = this.itemStacks[itemType];
        if (configuredStack) {
            return configuredStack;
        }

        switch (itemType) {
            case EItemType.GoldOre:
                return this.goldOreStack;
            case EItemType.Money:
                return this.moneyStack;
            default:
                return null;
        }
    }

    private RefreshStackViews(animatedItemType: EItemType | null, animate: boolean = true): void {
        const stackViews: Array<{ itemType: EItemType; view: ItemStackView }> = [];
        const itemTypeCount = Math.max(this.counts.length, this.itemStacks.length);

        for (let index = 0; index < itemTypeCount; index++) {
            const itemType = index as EItemType;
            const view = this.GetStackView(itemType);
            if (view && !stackViews.some((entry) => entry.view === view)) {
                stackViews.push({ itemType, view });
            }
        }

        const sharedRoot = stackViews.find((entry) => entry.view.root)?.view.root;
        if (!sharedRoot) {
            return;
        }

        let startHeight = 0;
        for (const entry of stackViews) {
            entry.view.ConfigureUnifiedStack(sharedRoot, startHeight);
            entry.view.SetCount(
                this.GetCount(entry.itemType),
                animate && entry.itemType === animatedItemType,
            );
            startHeight += entry.view.VisibleInventoryStackHeight;
        }
    }
}
