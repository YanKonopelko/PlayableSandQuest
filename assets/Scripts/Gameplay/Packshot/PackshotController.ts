import { _decorator, Component, Node, tween, Vec3 } from 'cc';
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
    }

    public ToStore(): void {
        this.gameplayScene?.ToStore();
    }
}
