import { _decorator, CCFloat, Component, input, Input, Node, tween, Tween, UIOpacity, Vec3 } from 'cc';
import { GameplayScene } from '../../GameplayScene';

const { ccclass, property } = _decorator;

@ccclass('PackshotController')
export class PackshotController extends Component {
    @property(Node)
    public root: Node | null = null;

    @property(GameplayScene)
    public gameplayScene: GameplayScene | null = null;

    @property(Node)
    public playNowButton: Node | null = null;

    @property([Node])
    public hideOnShowNodes: Node[] = [];

    @property({ type: CCFloat, min: 0.01 })
    public fadeDuration: number = 0.35;

    @property({ type: CCFloat, min: 0.05 })
    public pulseHalfDuration: number = 0.55;

    @property({ type: CCFloat, min: 1 })
    public pulseScaleMultiplier: number = 1.08;

    private shown: boolean = false;
    private rootOpacity: UIOpacity | null = null;
    private readonly playNowBaseScale: Vec3 = new Vec3();

    protected onLoad(): void {
        if (this.root) {
            this.rootOpacity = this.root.getComponent(UIOpacity) ?? this.root.addComponent(UIOpacity);
            this.playNowButton = this.playNowButton ?? this.root.getChildByName('PlayNow');
            this.playNowButton?.getScale(this.playNowBaseScale);
            this.root.active = false;
        }
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.ToStore, this);
        if (this.rootOpacity) {
            Tween.stopAllByTarget(this.rootOpacity);
        }
        if (this.playNowButton) {
            Tween.stopAllByTarget(this.playNowButton);
        }
    }

    public Show(): void {
        if (this.shown || !this.root) {
            return;
        }

        this.shown = true;
        for (const node of this.hideOnShowNodes) {
            if (node?.isValid) {
                node.active = false;
            }
        }
        this.root.active = true;
        this.PlayFadeIn();
        this.StartPlayNowPulse();

        // Arm on the next frame so the tap that opens the packshot does not
        // immediately send the player to the store as part of the same input event.
        this.scheduleOnce(() => {
            input.on(Input.EventType.TOUCH_START, this.ToStore, this);
        });
    }

    private PlayFadeIn(): void {
        const opacity = this.rootOpacity;
        if (!opacity) {
            return;
        }

        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity)
            .to(Math.max(0.01, this.fadeDuration), { opacity: 255 }, { easing: 'sineOut' })
            .start();
    }

    private StartPlayNowPulse(): void {
        const button = this.playNowButton;
        if (!button) {
            return;
        }

        Tween.stopAllByTarget(button);
        button.setScale(this.playNowBaseScale);
        const multiplier = Math.max(1, this.pulseScaleMultiplier);
        const pulseScale = new Vec3(
            this.playNowBaseScale.x * multiplier,
            this.playNowBaseScale.y * multiplier,
            this.playNowBaseScale.z * multiplier,
        );
        const halfDuration = Math.max(0.05, this.pulseHalfDuration);
        tween(button)
            .to(halfDuration, { scale: pulseScale }, { easing: 'sineInOut' })
            .to(halfDuration, { scale: this.playNowBaseScale.clone() }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    public ToStore(): void {
        this.gameplayScene?.ToStore();
    }
}
