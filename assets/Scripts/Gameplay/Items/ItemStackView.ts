import { _decorator, CCFloat, CCInteger, Component, instantiate, Node, Prefab, tween, Vec3 } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

@ccclass('ItemStackView')
export class ItemStackView extends Component {
    @property(Prefab)
    public itemPrefab: Prefab | null = null;

    @property(Node)
    public root: Node | null = null;

    @property({ type: CCInteger })
    public maxVisibleItems: number = 12;

    @property({ type: CCFloat })
    public verticalStep: number = 0.12;

    @property({ type: CCFloat })
    public inventoryVerticalStep: number = 0.16;

    @property({ type: CCFloat })
    public horizontalStep: number = 0.18;

    @property({ type: CCInteger })
    public columns: number = 3;

    private items: Node[] = [];
    private count: number = 0;
    private unifiedStackEnabled: boolean = false;
    private unifiedStackStartHeight: number = 0;

    public get Count(): number {
        return this.count;
    }

    public get VisibleCount(): number {
        return Math.min(this.count, this.maxVisibleItems);
    }

    public get VisibleInventoryStackHeight(): number {
        return this.VisibleCount * Math.max(0.001, this.inventoryVerticalStep);
    }

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.root, 'root');
        RequiredReference.Check(this, this.itemPrefab, 'itemPrefab');
        this.SetCount(this.count, false);
    }

    public SetCount(value: number, animate: boolean = true): void {
        this.count = Math.max(0, value);
        this.EnsureItems(this.VisibleCount);
        this.RefreshItems(animate);
    }

    public ConfigureUnifiedStack(root: Node, startHeight: number): void {
        this.root = root;
        this.unifiedStackEnabled = true;
        this.unifiedStackStartHeight = Math.max(0, startHeight);

        for (const item of this.items) {
            if (item.parent !== root) {
                item.setParent(root);
            }
        }

        this.RefreshItems(false);
    }

    public CreateItemTarget(index: number): Node | null {
        if (!this.root) {
            return null;
        }

        const target = new Node(`ItemTarget_${index}`);
        this.root.addChild(target);
        target.setPosition(this.GetItemPosition(Math.max(0, Math.floor(index))));
        target.setScale(Vec3.ONE);
        return target;
    }

    public GetItemWorldPosition(index: number, out: Vec3 = new Vec3()): Vec3 {
        const safeIndex = Math.max(0, Math.floor(index));
        const item = this.items[safeIndex];
        if (item?.activeInHierarchy) {
            return item.getWorldPosition(out);
        }

        if (this.root) {
            return Vec3.transformMat4(out, this.GetItemPosition(safeIndex), this.root.worldMatrix);
        }

        return this.node.getWorldPosition(out);
    }

    private RefreshItems(animate: boolean): void {
        const visibleCount = this.VisibleCount;

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const active = i < visibleCount;
            item.active = active;

            if (!active) {
                continue;
            }

            const target = this.GetItemPosition(i);
            item.setPosition(target);

            if (animate) {
                item.setScale(0.01, 0.01, 0.01);
                tween(item)
                    .to(0.16, { scale: new Vec3(1.12, 1.12, 1.12) }, { easing: 'backOut' })
                    .to(0.08, { scale: Vec3.ONE })
                    .start();
            } else {
                item.setScale(Vec3.ONE);
            }
        }
    }

    private GetItemPosition(index: number): Vec3 {
        if (this.unifiedStackEnabled) {
            const step = Math.max(0.001, this.inventoryVerticalStep);
            return new Vec3(0, this.unifiedStackStartHeight + index * step, 0);
        }

        const column = this.columns <= 0 ? 0 : index % this.columns;
        const row = this.columns <= 0 ? index : Math.floor(index / this.columns);
        const centeredColumn = column - (Math.max(1, this.columns) - 1) * 0.5;
        return new Vec3(centeredColumn * this.horizontalStep, row * this.verticalStep, 0);
    }

    public Add(amount: number = 1): void {
        this.SetCount(this.count + Math.max(0, amount));
    }

    public Remove(amount: number = 1): void {
        this.SetCount(this.count - Math.max(0, amount));
    }

    public Clear(): void {
        this.SetCount(0);
    }

    private EnsureItems(visibleCount: number): void {
        if (!this.root || !this.itemPrefab) {
            return;
        }

        while (this.items.length < visibleCount) {
            const item = instantiate(this.itemPrefab);
            this.root.addChild(item);
            this.items.push(item);
        }
    }
}
