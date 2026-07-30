import { _decorator, Camera, CCFloat, Component, Node, Vec3, view } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

@ccclass('AdaptiveCameraFollower')
export class AdaptiveCameraFollower extends Component {
    @property(Node)
    public target: Node | null = null;

    @property(Camera)
    public camera: Camera | null = null;

    @property({ type: CCFloat })
    public baseHeight: number = 11.5;

    @property({ type: CCFloat })
    public baseDistance: number = 11.5;

    @property({ type: CCFloat })
    public wideDistanceBonus: number = 4;

    @property({ type: CCFloat })
    public minAspect: number = 0.55;

    @property({ type: CCFloat })
    public maxAspect: number = 1.8;

    @property({ type: CCFloat })
    public followLerp: number = 8;

    @property({ type: CCFloat })
    public yaw: number = -45;

    private readonly targetPosition: Vec3 = new Vec3();
    private readonly desiredPosition: Vec3 = new Vec3();
    private readonly nextPosition: Vec3 = new Vec3();
    private readonly offset: Vec3 = new Vec3();
    private readonly primaryTargetPosition: Vec3 = new Vec3();
    private readonly cinematicTargetPosition: Vec3 = new Vec3();
    private cinematicTarget: Node | null = null;
    private cinematicPhase: 'idle' | 'movingTo' | 'holding' | 'returning' = 'idle';
    private cinematicElapsed: number = 0;
    private cinematicMoveDuration: number = 0;
    private cinematicHoldDuration: number = 0;
    private cinematicReturnDuration: number = 0;
    private cinematicBlend: number = 0;
    private cinematicCompletionPending: boolean = false;
    private onCinematicFocusReached: (() => void) | null = null;
    private onCinematicComplete: (() => void) | null = null;

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.target, 'target');
        if (!this.camera) {
            this.camera = this.getComponent(Camera);
        }
    }

    protected lateUpdate(dt: number): void {
        if (!this.target) {
            return;
        }

        this.UpdateCinematic(dt);

        const aspect = this.GetAspect();
        const normalizedWide = Math.max(0, Math.min(1, (aspect - this.minAspect) / Math.max(0.001, this.maxAspect - this.minAspect)));
        const distance = this.baseDistance + this.wideDistanceBonus * normalizedWide;
        const yawRadians = this.yaw * Math.PI / 180;

        this.offset.set(Math.sin(yawRadians) * distance, this.baseHeight, Math.cos(yawRadians) * distance);
        this.target.getWorldPosition(this.primaryTargetPosition);
        this.targetPosition.set(this.primaryTargetPosition);
        if (this.cinematicTarget?.isValid && this.cinematicBlend > 0) {
            this.cinematicTarget.getWorldPosition(this.cinematicTargetPosition);
            Vec3.lerp(
                this.targetPosition,
                this.primaryTargetPosition,
                this.cinematicTargetPosition,
                this.cinematicBlend,
            );
        }
        Vec3.add(this.desiredPosition, this.targetPosition, this.offset);

        const current = this.node.worldPosition;
        const lerp = this.cinematicPhase === 'idle'
            ? Math.min(1, this.followLerp * dt)
            : 1;
        Vec3.lerp(this.nextPosition, current, this.desiredPosition, lerp);
        this.node.setWorldPosition(this.nextPosition);
        this.node.lookAt(this.targetPosition, Vec3.UP);

        if (this.cinematicCompletionPending) {
            this.CancelFocusSequence(true);
        }
    }

    public PlayFocusSequence(
        target: Node,
        moveDuration: number,
        holdDuration: number,
        returnDuration: number,
        onFocusReached?: () => void,
        onComplete?: () => void,
    ): void {
        this.CancelFocusSequence(false);
        this.cinematicTarget = target;
        this.cinematicPhase = 'movingTo';
        this.cinematicElapsed = 0;
        this.cinematicMoveDuration = Math.max(0.01, moveDuration);
        this.cinematicHoldDuration = Math.max(0, holdDuration);
        this.cinematicReturnDuration = Math.max(0.01, returnDuration);
        this.cinematicBlend = 0;
        this.cinematicCompletionPending = false;
        this.onCinematicFocusReached = onFocusReached ?? null;
        this.onCinematicComplete = onComplete ?? null;
    }

    public CancelFocusSequence(invokeComplete: boolean = true): void {
        const complete = invokeComplete ? this.onCinematicComplete : null;
        this.cinematicTarget = null;
        this.cinematicPhase = 'idle';
        this.cinematicElapsed = 0;
        this.cinematicBlend = 0;
        this.cinematicCompletionPending = false;
        this.onCinematicFocusReached = null;
        this.onCinematicComplete = null;
        complete?.();
    }

    private UpdateCinematic(dt: number): void {
        if (this.cinematicPhase === 'idle') {
            return;
        }
        if (!this.cinematicTarget?.isValid) {
            this.CancelFocusSequence(true);
            return;
        }

        this.cinematicElapsed += Math.max(0, dt);
        switch (this.cinematicPhase) {
            case 'movingTo': {
                const progress = Math.min(1, this.cinematicElapsed / this.cinematicMoveDuration);
                this.cinematicBlend = this.SmoothStep(progress);
                if (progress >= 1) {
                    this.cinematicPhase = 'holding';
                    this.cinematicElapsed = 0;
                    const focusReached = this.onCinematicFocusReached;
                    this.onCinematicFocusReached = null;
                    focusReached?.();
                }
                break;
            }
            case 'holding':
                this.cinematicBlend = 1;
                if (this.cinematicElapsed >= this.cinematicHoldDuration) {
                    this.cinematicPhase = 'returning';
                    this.cinematicElapsed = 0;
                }
                break;
            case 'returning': {
                const progress = Math.min(1, this.cinematicElapsed / this.cinematicReturnDuration);
                this.cinematicBlend = 1 - this.SmoothStep(progress);
                if (progress >= 1) {
                    this.cinematicCompletionPending = true;
                }
                break;
            }
        }
    }

    private SmoothStep(value: number): number {
        return value * value * (3 - 2 * value);
    }

    private GetAspect(): number {
        const size = view.getVisibleSize();
        return size.height <= 0 ? 1 : size.width / size.height;
    }
}
