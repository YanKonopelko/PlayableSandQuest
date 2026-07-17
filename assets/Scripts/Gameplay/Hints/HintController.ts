import { _decorator, CCFloat, Component, Node, tween, Vec3 } from 'cc';
import { HintTarget } from './HintTarget';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

@ccclass('HintController')
export class HintController extends Component {
    @property(Node)
    public player: Node | null = null;

    @property(Node)
    public groundArrow2d: Node | null = null;

    @property(Node)
    public floatingArrow3d: Node | null = null;

    @property({ type: CCFloat })
    public groundArrowDistanceFromPlayer: number = 1.7;

    @property({ type: CCFloat })
    public floatingArrowPulseScale: number = 1.18;

    @property({ type: CCFloat })
    public floatingArrowHeight: number = 1.4;

    private currentTarget: HintTarget | null = null;
    private readonly targetPosition: Vec3 = new Vec3();
    private readonly playerPosition: Vec3 = new Vec3();
    private pulseStarted: boolean = false;

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.player, 'player');
        RequiredReference.CheckNode(this, this.groundArrow2d, 'groundArrow2d');
        RequiredReference.CheckNode(this, this.floatingArrow3d, 'floatingArrow3d');
        this.Hide();
    }

    protected update(): void {
        if (!this.currentTarget || !this.player) {
            return;
        }

        this.currentTarget.GetWorldPosition(this.targetPosition);
        this.player.getWorldPosition(this.playerPosition);

        this.UpdateGroundArrow();
        this.UpdateFloatingArrow();
    }

    public Show(target: HintTarget | null): void {
        this.currentTarget = target;
        const visible = !!target;

        if (this.groundArrow2d) {
            this.groundArrow2d.active = visible;
        }
        if (this.floatingArrow3d) {
            this.floatingArrow3d.active = visible;
        }

        if (visible && !this.pulseStarted) {
            this.StartPulse();
        }
    }

    public Hide(): void {
        this.currentTarget = null;
        if (this.groundArrow2d) {
            this.groundArrow2d.active = false;
        }
        if (this.floatingArrow3d) {
            this.floatingArrow3d.active = false;
        }
    }

    private UpdateGroundArrow(): void {
        if (!this.groundArrow2d) {
            return;
        }

        const dx = this.targetPosition.x - this.playerPosition.x;
        const dz = this.targetPosition.z - this.playerPosition.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length <= 0.001) {
            return;
        }

        const nx = dx / length;
        const nz = dz / length;
        this.groundArrow2d.setWorldPosition(
            this.playerPosition.x + nx * this.groundArrowDistanceFromPlayer,
            this.playerPosition.y + 0.05,
            this.playerPosition.z + nz * this.groundArrowDistanceFromPlayer,
        );

        const yaw = Math.atan2(nx, nz) * 180 / Math.PI;
        this.groundArrow2d.setRotationFromEuler(90, yaw, 0);
    }

    private UpdateFloatingArrow(): void {
        if (!this.floatingArrow3d) {
            return;
        }

        this.floatingArrow3d.setWorldPosition(
            this.targetPosition.x,
            this.targetPosition.y + this.floatingArrowHeight,
            this.targetPosition.z,
        );
    }

    private StartPulse(): void {
        if (!this.floatingArrow3d) {
            return;
        }

        this.pulseStarted = true;
        tween(this.floatingArrow3d)
            .repeatForever(
                tween()
                    .to(0.45, { scale: new Vec3(this.floatingArrowPulseScale, this.floatingArrowPulseScale, this.floatingArrowPulseScale) }, { easing: 'sineInOut' })
                    .to(0.45, { scale: Vec3.ONE }, { easing: 'sineInOut' }),
            )
            .start();
    }
}
