import { _decorator, CCString, Component, SkeletalAnimation } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('PlayerAnimationController')
export class PlayerAnimationController extends Component {
    @property(SkeletalAnimation)
    public animation: SkeletalAnimation | null = null;

    @property({ type: CCString })
    public idleClipName: string = 'Idle';

    @property({ type: CCString })
    public walkClipName: string = 'Walk';

    @property({ type: CCString })
    public vacuumIdleClipName: string = 'VacuumIdle';

    @property({ type: CCString })
    public vacuumWalkClipName: string = 'VacuumWalk';

    private currentClip: string = '';
    private vacuumEnabled: boolean = false;

    public SetVacuumEnabled(value: boolean): void {
        this.vacuumEnabled = value;
        this.SetMoving(false, true);
    }

    public SetMoving(isMoving: boolean, force: boolean = false): void {
        const clip = this.ResolveClip(isMoving);
        if (!force && this.currentClip === clip) {
            return;
        }

        this.currentClip = clip;
        if (!this.animation || !clip) {
            return;
        }

        const state = this.animation.getState(clip);
        if (!state) {
            return;
        }

        this.animation.play(clip);
    }

    private ResolveClip(isMoving: boolean): string {
        if (this.vacuumEnabled) {
            return isMoving ? this.vacuumWalkClipName : this.vacuumIdleClipName;
        }

        return isMoving ? this.walkClipName : this.idleClipName;
    }
}
