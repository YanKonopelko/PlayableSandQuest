import { _decorator, Camera, CCFloat, Component, EventTouch, input, Input, Node, Vec2, Vec3 } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

@ccclass('FloatingJoystick')
export class FloatingJoystick extends Component {
    @property(Node)
    public baseNode: Node | null = null;

    @property(Node)
    public handleNode: Node | null = null;

    @property(Camera)
    public camera: Camera | null = null;

    @property({ type: CCFloat })
    public radius: number = 90;

    private pointerId: number = -1;
    private readonly origin: Vec3 = new Vec3();
    private readonly direction: Vec2 = new Vec2();
    private readonly screenPosition: Vec3 = new Vec3();
    private readonly worldPosition: Vec3 = new Vec3();
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
        RequiredReference.Check(this, this.camera, 'camera');
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
        if (this.isPressed || !this.camera || !this.baseNode || !this.handleNode) {
            return;
        }

        this.pointerId = event.getID();
        this.isPressed = true;

        this.baseNode.getWorldPosition(this.origin);
        this.ConvertTouchToWorld(event, this.origin, this.worldPosition);
        this.origin.set(this.worldPosition);

        this.baseNode.setWorldPosition(this.origin);
        this.handleNode.setWorldPosition(this.origin);
        this.direction.set(0, 0);
        this.SetVisible(true);
    }

    private OnTouchMove(event: EventTouch): void {
        if (!this.isPressed || event.getID() !== this.pointerId || !this.camera || !this.handleNode) {
            return;
        }

        this.ConvertTouchToWorld(event, this.origin, this.worldPosition);
        const delta = new Vec2(
            this.worldPosition.x - this.origin.x,
            this.worldPosition.y - this.origin.y,
        );

        const length = delta.length();
        const clamped = length > this.radius && length > 0
            ? delta.multiplyScalar(this.radius / length)
            : delta;

        this.worldPosition.set(
            this.origin.x + clamped.x,
            this.origin.y + clamped.y,
            this.origin.z,
        );
        this.handleNode.setWorldPosition(this.worldPosition);
        this.direction.set(clamped.x / this.radius, clamped.y / this.radius);
    }

    private ConvertTouchToWorld(event: EventTouch, referenceWorldPosition: Vec3, out: Vec3): void {
        const location = event.getLocation();
        this.camera!.worldToScreen(referenceWorldPosition, this.screenPosition);
        this.screenPosition.set(location.x, location.y, this.screenPosition.z);
        this.camera!.screenToWorld(this.screenPosition, out);
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
