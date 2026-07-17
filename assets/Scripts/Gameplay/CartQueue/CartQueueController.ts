import { _decorator, CCInteger, Component, instantiate, Node, Prefab, tween } from 'cc';
import { CartUnit } from './CartUnit';

const { ccclass, property } = _decorator;

@ccclass('CartQueueController')
export class CartQueueController extends Component {
    @property(Prefab)
    public cartUnitPrefab: Prefab | null = null;

    @property(Node)
    public queuePoint1: Node | null = null;

    @property(Node)
    public queuePoint2: Node | null = null;

    @property(Node)
    public queuePoint3: Node | null = null;

    @property(Node)
    public queuePoint4: Node | null = null;

    @property(Node)
    public exitPoint1: Node | null = null;

    @property(Node)
    public exitPoint2: Node | null = null;

    @property(Node)
    public exitPoint3: Node | null = null;

    @property(Node)
    public unitsRoot: Node | null = null;

    @property({ type: CCInteger })
    public initialUnits: number = 4;

    @property({ type: CCInteger })
    public goldPerCart: number = 4;

    private units: CartUnit[] = [];

    public get ActiveCart(): CartUnit | null {
        return this.units.length > 0 ? this.units[0] : null;
    }

    protected start(): void {
        this.BuildInitialQueue();
    }

    public TryGiveGold(amount: number = 1): boolean {
        const cart = this.ActiveCart;
        if (!cart) {
            return false;
        }

        cart.ReceiveGold(amount);
        return true;
    }

    private BuildInitialQueue(): void {
        const queuePoints = this.GetQueuePoints();
        if (!this.cartUnitPrefab || !this.unitsRoot || queuePoints.length === 0) {
            console.error('[CartQueueController] Missing cartUnitPrefab, unitsRoot or queuePoints.');
            return;
        }

        const count = Math.min(this.initialUnits, queuePoints.length);
        for (let i = 0; i < count; i++) {
            const unit = this.CreateUnitAt(i);
            if (unit) {
                this.units.push(unit);
            }
        }
    }

    private CreateUnitAt(queueIndex: number): CartUnit | null {
        const point = this.GetQueuePoints()[queueIndex];
        if (!this.cartUnitPrefab || !this.unitsRoot || !point) {
            return null;
        }

        const node = instantiate(this.cartUnitPrefab);
        this.unitsRoot.addChild(node);
        node.setWorldPosition(point.worldPosition);

        const unit = node.getComponent(CartUnit);
        if (!unit) {
            console.error('[CartQueueController] cartUnitPrefab must have CartUnit component.');
            node.destroy();
            return null;
        }

        unit.requiredGold = this.goldPerCart;
        unit.ResetCart();
        unit.onFilled.Subscribe(this.OnCartFilled, this);
        unit.onRouteFinished.Subscribe(this.OnCartRouteFinished, this);
        return unit;
    }

    private OnCartFilled(unit: CartUnit): void {
        if (unit !== this.ActiveCart) {
            return;
        }

        this.units.shift();
        unit.MoveAlong(this.GetExitPoints());
        this.ShiftQueueForward();
        this.SpawnBackUnit();
    }

    private ShiftQueueForward(): void {
        const queuePoints = this.GetQueuePoints();
        for (let i = 0; i < this.units.length; i++) {
            const point = queuePoints[i];
            if (!point) {
                continue;
            }

            tween(this.units[i].node)
                .to(0.35, { worldPosition: point.worldPosition.clone() }, { easing: 'sineInOut' })
                .start();
        }
    }

    private SpawnBackUnit(): void {
        const backIndex = Math.min(this.GetQueuePoints().length - 1, this.units.length);
        const unit = this.CreateUnitAt(backIndex);
        if (unit) {
            this.units.push(unit);
        }
    }

    private OnCartRouteFinished(unit: CartUnit): void {
        unit.node.destroy();
    }

    private GetQueuePoints(): Node[] {
        return [this.queuePoint1, this.queuePoint2, this.queuePoint3, this.queuePoint4]
            .filter((point): point is Node => point !== null);
    }

    private GetExitPoints(): Node[] {
        return [this.exitPoint1, this.exitPoint2, this.exitPoint3]
            .filter((point): point is Node => point !== null);
    }
}
