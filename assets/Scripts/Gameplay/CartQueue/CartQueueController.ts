import { _decorator, CCInteger, Component, instantiate, Node, Prefab } from 'cc';
import { CustomActionWithParam } from '../../Utills/CustomActions';
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

    public readonly onActiveCartReady: CustomActionWithParam<CartUnit> = new CustomActionWithParam<CartUnit>();

    private units: CartUnit[] = [];
    private activeCartReady: boolean = false;

    public get ActiveCart(): CartUnit | null {
        return this.units.length > 0 ? this.units[0] : null;
    }

    public get IsActiveCartReady(): boolean {
        return this.activeCartReady;
    }

    protected start(): void {
        this.BuildInitialQueue();
    }

    public TryGiveGold(amount: number = 1): boolean {
        const cart = this.ActiveCart;
        if (!cart || !this.activeCartReady || cart.IsFilled || amount <= 0) {
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

        this.SetActiveCartReady(this.ActiveCart);
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

        this.activeCartReady = false;
        this.units.shift();
        unit.MoveAlong(this.GetExitPoints());
        this.ShiftQueueForward();
    }

    private ShiftQueueForward(): void {
        const queuePoints = this.GetQueuePoints();
        let movesRemaining = this.units.length;

        if (movesRemaining === 0) {
            this.CompleteQueueShift();
            return;
        }

        for (let i = 0; i < this.units.length; i++) {
            const point = queuePoints[i];
            if (!point) {
                movesRemaining--;
                if (movesRemaining === 0) {
                    this.CompleteQueueShift();
                }
                continue;
            }

            const started = this.units[i].MoveTo(point, () => {
                movesRemaining--;
                if (movesRemaining === 0) {
                    this.CompleteQueueShift();
                }
            });

            if (!started) {
                movesRemaining--;
                if (movesRemaining === 0) {
                    this.CompleteQueueShift();
                }
            }
        }
    }

    private CompleteQueueShift(): void {
        this.SpawnBackUnit();
        this.SetActiveCartReady(this.ActiveCart);
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

    private SetActiveCartReady(cart: CartUnit | null): void {
        this.activeCartReady = cart !== null;
        if (cart) {
            this.onActiveCartReady.Invoke(cart);
        }
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
