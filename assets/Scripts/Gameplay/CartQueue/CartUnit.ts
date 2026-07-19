import { _decorator, CCFloat, CCInteger, Component, Node, tween, Vec3 } from 'cc';
import { CustomActionWithParam } from '../../Utills/CustomActions';
import { ItemStackView } from '../Items/ItemStackView';

const { ccclass, property } = _decorator;

@ccclass('CartUnit')
export class CartUnit extends Component {
    @property(Node)
    public receivePivot: Node | null = null;

    @property(ItemStackView)
    public fillStack: ItemStackView | null = null;

    @property({ type: CCInteger })
    public requiredGold: number = 4;

    @property({ type: CCFloat, min: 0.01 })
    public moveSpeed: number = 5.7;

    public readonly onFilled: CustomActionWithParam<CartUnit> = new CustomActionWithParam<CartUnit>();
    public readonly onRouteFinished: CustomActionWithParam<CartUnit> = new CustomActionWithParam<CartUnit>();

    private gold: number = 0;
    private moving: boolean = false;

    public get Gold(): number {
        return this.gold;
    }

    public get IsFilled(): boolean {
        return this.gold >= this.requiredGold;
    }

    public ResetCart(): void {
        this.gold = 0;
        this.moving = false;
        this.fillStack?.SetCount(0, false);
    }

    public ReceiveGold(amount: number = 1): void {
        if (this.IsFilled) {
            return;
        }

        this.gold = Math.min(this.requiredGold, this.gold + Math.max(0, amount));
        this.fillStack?.SetCount(this.gold);

        if (this.IsFilled) {
            this.onFilled.Invoke(this);
        }
    }

    public MoveAlong(points: Node[]): void {
        if (this.moving) {
            return;
        }

        this.moving = true;
        this.MoveToPoint(points, 0);
    }

    public MoveTo(target: Node, onComplete?: () => void): boolean {
        if (this.moving) {
            return false;
        }

        this.moving = true;
        this.TweenTo(target.worldPosition.clone(), () => {
            this.moving = false;
            onComplete?.();
        });
        return true;
    }

    private MoveToPoint(points: Node[], index: number): void {
        if (index >= points.length) {
            this.moving = false;
            this.onRouteFinished.Invoke(this);
            return;
        }

        const target = points[index];
        if (!target) {
            this.MoveToPoint(points, index + 1);
            return;
        }

        this.TweenTo(target.worldPosition.clone(), () => this.MoveToPoint(points, index + 1));
    }

    private TweenTo(targetPosition: Vec3, onComplete: () => void): void {
        const distance = Vec3.distance(this.node.worldPosition, targetPosition);
        const duration = distance / Math.max(this.moveSpeed, 0.01);

        tween(this.node)
            .to(duration, { worldPosition: targetPosition }, { easing: 'linear' })
            .call(onComplete)
            .start();
    }
}
