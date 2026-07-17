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
    public horizontalStep: number = 0.18;

    @property({ type: CCInteger })
    public columns: number = 3;

    private items: Node[] = [];
    private count: number = 0;

    public get Count(): number {
        return this.count;
    }

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.root, 'root');
        RequiredReference.Check(this, this.itemPrefab, 'itemPrefab');
        this.SetCount(this.count, false);
    }

    public SetCount(value: number, animate: boolean = true): void {
        this.count = Math.max(0, value);
        const visibleCount = Math.min(this.count, this.maxVisibleItems);
        this.EnsureItems(visibleCount);

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const active = i < visibleCount;
            item.active = active;

            if (!active) {
                continue;
            }

            const column = this.columns <= 0 ? 0 : i % this.columns;
            const row = this.columns <= 0 ? i : Math.floor(i / this.columns);
            const centeredColumn = column - (Math.max(1, this.columns) - 1) * 0.5;
            const target = new Vec3(centeredColumn * this.horizontalStep, row * this.verticalStep, 0);
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
