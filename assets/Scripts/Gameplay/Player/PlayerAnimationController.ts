import { _decorator, animation, CCString, Component } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('PlayerAnimationController')
export class PlayerAnimationController extends Component {
    @property(animation.AnimationController)
    public animation: animation.AnimationController | null = null;

    @property({ type: CCString })
    public movingVariable: string = 'moving';

    @property({ type: CCString })
    public vacuumVariable: string = 'vacuum';

    private moving: boolean = false;
    private vacuumEnabled: boolean = false;

    protected onLoad(): void {
        this.animation ??= this.node.getComponentInChildren(animation.AnimationController);
        this.ApplyVariables();

        this.scheduleOnce(() => {
            if (!this.animation) {
                console.log('[OrcAnimDebug] controller=null');
                return;
            }

            const state = this.animation.getCurrentStateStatus(0);
            const clips = Array.from(this.animation.getCurrentClipStatuses(0)).map((clip) => ({
                clip: clip.clip.name,
                weight: clip.weight,
            }));
            console.log('[OrcAnimDebug]', JSON.stringify({
                layers: this.animation.layerCount,
                state,
                clips,
                moving: this.animation.getValue(this.movingVariable),
                vacuum: this.animation.getValue(this.vacuumVariable),
            }));
        }, 1);
    }

    public SetVacuumEnabled(value: boolean): void {
        if (this.vacuumEnabled === value) {
            return;
        }

        this.vacuumEnabled = value;
        this.SetVariable(this.vacuumVariable, value);
    }

    public SetMoving(isMoving: boolean): void {
        if (this.moving === isMoving) {
            return;
        }

        this.moving = isMoving;
        this.SetVariable(this.movingVariable, isMoving);
    }

    private ApplyVariables(): void {
        this.SetVariable(this.movingVariable, this.moving);
        this.SetVariable(this.vacuumVariable, this.vacuumEnabled);
    }

    private SetVariable(name: string, value: boolean): void {
        if (!this.animation || !name) {
            return;
        }

        this.animation.setValue(name, value);
    }
}
