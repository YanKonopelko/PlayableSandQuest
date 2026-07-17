import { _decorator, CCFloat, Component, EventTouch, input, Input, Node, UITransform, Vec2, Vec3 } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

@ccclass('FloatingJoystick')
export class FloatingJoystick extends Component {
    @property(Node)
    public baseNode: Node | null = null;

    @property(Node)
    public handleNode: Node | null = null;

    @property(UITransform)
    public inputSpace: UITransform | null = null;

    @property({ type: CCFloat })
    public radius: number = 90;

    private pointerId: number = -1;
    private origin: Vec2 = new Vec2();
    private direction: Vec2 = new Vec2();
    private isPressed: boolean = false;

    public get Direction(): Vec2 {
        return this.direction;
    }

    public get IsPressed(): boolean {
        return this.isPressed;
    }

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.baseNode, 'baseNode');
        RequiredReference.CheckNode(this, this.handleNode, 'handleNode');
        RequiredReference.Check(this, this.inputSpace, 'inputSpace');
        this.SetVisible(false);
    }

    protected onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this.OnTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.OnTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.OnTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.OnTouchEnd, this);
    }

    protected onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this.OnTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.OnTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.OnTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.OnTouchEnd, this);
    }

    private OnTouchStart(event: EventTouch): void {
        if (this.isPressed || !this.inputSpace || !this.baseNode || !this.handleNode) {
            return;
        }

        this.pointerId = event.getID();
        this.isPressed = true;

        const ui = event.getUILocation();
        const local3 = this.inputSpace.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
        this.origin.set(local3.x, local3.y);

        this.baseNode.setPosition(local3);
        this.handleNode.setPosition(local3);
        this.direction.set(0, 0);
        this.SetVisible(true);
    }

    private OnTouchMove(event: EventTouch): void {
        if (!this.isPressed || event.getID() !== this.pointerId || !this.inputSpace || !this.handleNode) {
            return;
        }

        const ui = event.getUILocation();
        const local3 = this.inputSpace.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
        const current = new Vec2(local3.x, local3.y);
        const delta = new Vec2();
        Vec2.subtract(delta, current, this.origin);

        const length = delta.length();
        const clamped = length > this.radius && length > 0
            ? delta.multiplyScalar(this.radius / length)
            : delta;

        this.handleNode.setPosition(this.origin.x + clamped.x, this.origin.y + clamped.y, 0);
        this.direction.set(clamped.x / this.radius, clamped.y / this.radius);
    }

    private OnTouchEnd(event: EventTouch): void {
        if (!this.isPressed || event.getID() !== this.pointerId) {
            return;
        }

        this.pointerId = -1;
        this.isPressed = false;
        this.direction.set(0, 0);
        this.SetVisible(false);
    }

    private SetVisible(value: boolean): void {
        if (this.baseNode) {
            this.baseNode.active = value;
        }
        if (this.handleNode) {
            this.handleNode.active = value;
        }
    }
}
