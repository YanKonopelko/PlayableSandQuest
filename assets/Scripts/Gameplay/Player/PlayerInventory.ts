import { _decorator, Camera, Component, director, Node } from 'cc';
import { CustomActionWithParam } from '../../Utills/CustomActions';
import { EItemType } from '../Items/ItemType';
import { ItemStackView } from '../Items/ItemStackView';

const { ccclass, property } = _decorator;

@ccclass('PlayerInventory')
export class PlayerInventory extends Component {
    private static readonly GOLD_ORE_CAPACITIES: readonly number[] = [10, 20, 40];

    @property(ItemStackView)
    public goldOreStack: ItemStackView | null = null;

    @property(ItemStackView)
    public moneyStack: ItemStackView | null = null;

    @property([ItemStackView])
    public itemStacks: ItemStackView[] = [];

    @property(Node)
    public maxGoldIndicator: Node | null = null;

    public readonly onAmountChanged: CustomActionWithParam<EItemType> = new CustomActionWithParam<EItemType>();

    private readonly counts: number[] = [0, 0, 0];
    private readonly reservedCounts: number[] = [0, 0, 0];
    private goldOreCapacity: number = PlayerInventory.GOLD_ORE_CAPACITIES[0];
    private unlimitedGoldOreCapacity: boolean = false;
    private sceneCamera: Camera | null = null;

    public GetCount(itemType: EItemType): number {
        return this.counts[itemType] ?? 0;
    }

    public Has(itemType: EItemType, amount: number): boolean {
        return this.GetCount(itemType) >= amount;
    }

    public Add(itemType: EItemType, amount: number = 1): number {
        const requestedAmount = this.NormalizeAmount(amount);
        const acceptedAmount = Math.min(requestedAmount, this.GetAvailableCapacity(itemType));
        if (acceptedAmount <= 0) {
            return 0;
        }

        this.counts[itemType] = this.GetCount(itemType) + acceptedAmount;
        this.RefreshStackViews(itemType);
        this.onAmountChanged.Invoke(itemType);
        return acceptedAmount;
    }

    public SetGoldOreCapacityForUpgradeLevel(upgradeLevel: number): void {
        const safeLevel = Number.isFinite(upgradeLevel) ? Math.floor(upgradeLevel) : 0;
        const capacityIndex = Math.max(0, Math.min(PlayerInventory.GOLD_ORE_CAPACITIES.length - 1, safeLevel));
        this.goldOreCapacity = PlayerInventory.GOLD_ORE_CAPACITIES[capacityIndex];
        this.RefreshMaxGoldIndicator();
    }

    public SetGoldOreCapacityUnlimited(value: boolean = true): void {
        this.unlimitedGoldOreCapacity = value;
        this.RefreshMaxGoldIndicator();
    }

    public TryReserve(itemType: EItemType, amount: number = 1): boolean {
        const requestedAmount = this.NormalizeAmount(amount);
        if (requestedAmount <= 0 || this.GetAvailableCapacity(itemType) < requestedAmount) {
            return false;
        }

        this.reservedCounts[itemType] = this.GetReservedCount(itemType) + requestedAmount;
        return true;
    }

    public CommitReserved(itemType: EItemType, amount: number = 1): number {
        const committedAmount = Math.min(this.NormalizeAmount(amount), this.GetReservedCount(itemType));
        if (committedAmount <= 0) {
            return 0;
        }

        this.reservedCounts[itemType] = this.GetReservedCount(itemType) - committedAmount;
        return this.Add(itemType, committedAmount);
    }

    public TryRemove(itemType: EItemType, amount: number = 1): boolean {
        if (this.GetCount(itemType) < amount) {
            return false;
        }

        this.counts[itemType] -= Math.max(0, amount);
        this.RefreshStackViews(itemType);
        this.onAmountChanged.Invoke(itemType);
        return true;
    }

    public Clear(itemType: EItemType): void {
        this.counts[itemType] = 0;
        this.reservedCounts[itemType] = 0;
        this.RefreshStackViews(itemType);
        this.onAmountChanged.Invoke(itemType);
    }

    protected start(): void {
        this.RefreshStackViews(null, false);
    }

    protected lateUpdate(): void {
        if (!this.maxGoldIndicator?.activeInHierarchy) {
            return;
        }

        if (!this.sceneCamera || !this.sceneCamera.isValid) {
            this.sceneCamera = director.getScene()
                ?.getComponentsInChildren(Camera)
                .find((camera) => camera.enabled && camera.node.activeInHierarchy) ?? null;
        }
        if (this.sceneCamera) {
            this.maxGoldIndicator.setWorldRotation(this.sceneCamera.node.worldRotation);
        }
    }

    public GetStackView(itemType: EItemType): ItemStackView | null {
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

    private GetReservedCount(itemType: EItemType): number {
        return this.reservedCounts[itemType] ?? 0;
    }

    private GetAvailableCapacity(itemType: EItemType): number {
        if (itemType !== EItemType.GoldOre) {
            return Number.MAX_SAFE_INTEGER;
        }
        if (this.unlimitedGoldOreCapacity) {
            return Number.MAX_SAFE_INTEGER;
        }

        return Math.max(0, this.goldOreCapacity - this.GetCount(itemType) - this.GetReservedCount(itemType));
    }

    private NormalizeAmount(amount: number): number {
        return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
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
            this.RefreshMaxGoldIndicator();
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

        this.RefreshMaxGoldIndicator();
    }

    private RefreshMaxGoldIndicator(): void {
        if (this.maxGoldIndicator) {
            this.maxGoldIndicator.active = !this.unlimitedGoldOreCapacity
                && this.GetCount(EItemType.GoldOre) >= this.goldOreCapacity;
        }
    }
}
