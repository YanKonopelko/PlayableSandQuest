import { _decorator, Animation, Camera, CCFloat, Component, EventTouch, input, Input, Node, Vec2, Vec3 } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;
const JOYSTICK_TUTORIAL_CLIP = 'JoystickTutorial';
const HORIZONTAL_JOYSTICK_TUTORIAL_CLIP = 'HorizontalJoystickTutorial';

@ccclass('FloatingJoystick')
export class FloatingJoystick extends Component {
    @property(Node)
    public baseNode: Node | null = null;

    @property(Node)
    public handleNode: Node | null = null;

    @property(Node)
    public tutorialRoot: Node | null = null;

    @property(Camera)
    public camera: Camera | null = null;

    @property({ type: CCFloat })
    public radius: number = 90;

    @property({ type: CCFloat, min: 0 })
    public idleTutorialDelay: number = 5;

    private pointerId: number = -1;
    private readonly origin: Vec3 = new Vec3();
    private readonly direction: Vec2 = new Vec2();
    private readonly screenPosition: Vec3 = new Vec3();
    private readonly worldPosition: Vec3 = new Vec3();
    private isPressed: boolean = false;
    private inputEnabled: boolean = true;
    private finalTutorialShown: boolean = false;
    private tutorialAnimation: Animation | null = null;
    private tutorialText: Node | null = null;

    public get Direction(): Vec2 {
        return this.direction;
    }

    public get IsPressed(): boolean {
        return this.isPressed;
    }

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.baseNode, 'baseNode');
        RequiredReference.CheckNode(this, this.handleNode, 'handleNode');
        this.tutorialRoot ??= this.node.parent?.getChildByName('TutorialJoystick') ?? null;
        RequiredReference.CheckNode(this, this.tutorialRoot, 'tutorialRoot');
        RequiredReference.Check(this, this.camera, 'camera');
        this.tutorialAnimation = this.tutorialRoot?.getComponent(Animation) ?? null;
        this.tutorialText = this.tutorialRoot
            ?.getChildByName('Back')
            ?.getChildByName('TutorialText') ?? null;
        this.SetVisible(false);
        this.SetTutorialVisible(false);
    }

    protected start(): void {
        this.ShowTutorial(JOYSTICK_TUTORIAL_CLIP);
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
        this.unschedule(this.ShowIdleTutorial);
    }

    private OnTouchStart(event: EventTouch): void {
        if (!this.inputEnabled || this.isPressed || !this.camera || !this.baseNode || !this.handleNode) {
            return;
        }

        this.unschedule(this.ShowIdleTutorial);
        this.HideTutorial();
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
        this.ScheduleIdleTutorial();
    }

    public ShowFinalTutorial(): void {
        if (this.finalTutorialShown) {
            return;
        }

        this.finalTutorialShown = true;
        this.inputEnabled = false;
        this.pointerId = -1;
        this.isPressed = false;
        this.direction.set(0, 0);
        this.unschedule(this.ShowIdleTutorial);
        this.SetVisible(false);
        this.ShowTutorial(HORIZONTAL_JOYSTICK_TUTORIAL_CLIP);
    }

    private ScheduleIdleTutorial(): void {
        if (!this.inputEnabled || this.finalTutorialShown) {
            return;
        }

        this.unschedule(this.ShowIdleTutorial);
        this.scheduleOnce(this.ShowIdleTutorial, Math.max(0, this.idleTutorialDelay));
    }

    private ShowIdleTutorial(): void {
        if (!this.inputEnabled || this.finalTutorialShown || this.isPressed) {
            return;
        }

        this.ShowTutorial(JOYSTICK_TUTORIAL_CLIP);
    }

    private ShowTutorial(clipName: string): void {
        this.SetTutorialVisible(true);
        if (this.tutorialText) {
            this.tutorialText.active = true;
        }

        const animation = this.tutorialAnimation;
        if (animation?.clips.some(clip => clip.name === clipName)) {
            animation.play(clipName);
        }
    }

    private HideTutorial(): void {
        this.tutorialAnimation?.stop();
        if (this.tutorialText) {
            this.tutorialText.active = false;
        }
        this.SetTutorialVisible(false);
    }

    private SetTutorialVisible(value: boolean): void {
        if (this.tutorialRoot) {
            this.tutorialRoot.active = value;
        }
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
