import { _decorator, Component, input, Input, Node, tween, Vec3 } from 'cc';
import { GameplayScene } from '../../GameplayScene';

const { ccclass, property } = _decorator;

@ccclass('PackshotController')
export class PackshotController extends Component {
    @property(Node)
    public root: Node | null = null;

    @property(GameplayScene)
    public gameplayScene: GameplayScene | null = null;

    private shown: boolean = false;

    protected onLoad(): void {
        if (this.root) {
            this.root.active = false;
        }
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.ToStore, this);
    }

    public Show(): void {
        if (this.shown || !this.root) {
            return;
        }

        this.shown = true;
        this.root.active = true;
        this.root.setScale(0.01, 0.01, 0.01);
        tween(this.root)
            .to(0.28, { scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'backOut' })
            .to(0.08, { scale: Vec3.ONE })
            .start();

        // Arm on the next frame so the tap that opens the packshot does not
        // immediately send the player to the store as part of the same input event.
        this.scheduleOnce(() => {
            input.on(Input.EventType.TOUCH_START, this.ToStore, this);
        });
    }

    public ToStore(): void {
        this.gameplayScene?.ToStore();
    }
}
