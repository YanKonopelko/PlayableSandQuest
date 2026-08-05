import {
    _decorator,
    Camera,
    CCFloat,
    CCInteger,
    Component,
    director,
    Layers,
    Node,
    Rect,
    RenderRoot2D,
    Size,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UITransform,
    Vec3,
} from 'cc';
import { CustomActionWithParam } from '../../Utills/CustomActions';
import { ItemStackView } from '../Items/ItemStackView';
import { PlayerAnimationController } from '../Player/PlayerAnimationController';

const { ccclass, property } = _decorator;

@ccclass('CartUnit')
export class CartUnit extends Component {
    private static readonly RAGE_COLUMNS: number = 6;
    private static readonly RAGE_ROWS: number = 5;
    private static readonly RAGE_FRAME_SIZE: number = 66;

    @property(Node)
    public cartVisual: Node | null = null;

    @property(Node)
    public orcVisual: Node | null = null;

    @property(Node)
    public receivePivot: Node | null = null;

    @property(ItemStackView)
    public fillStack: ItemStackView | null = null;

    @property({ type: CCInteger })
    public requiredGold: number = 4;

    @property({ type: CCFloat, min: 0.01 })
    public moveSpeed: number = 5.7;

    @property(SpriteFrame)
    public rageAtlas: SpriteFrame | null = null;

    @property({ type: CCFloat, min: 0.01 })
    public cartPulseScale: number = 1.04;

    @property({ type: CCFloat, min: 0.01 })
    public cartPulseHalfDuration: number = 0.3;

    @property({ type: CCFloat, min: 1 })
    public rageFramesPerSecond: number = 12;

    @property({ type: CCFloat, min: 0.01 })
    public rageIconSize: number = 0.9;

    @property({ type: CCFloat })
    public rageIconHeight: number = 1.7;

    public readonly onFilled: CustomActionWithParam<CartUnit> = new CustomActionWithParam<CartUnit>();
    public readonly onRouteFinished: CustomActionWithParam<CartUnit> = new CustomActionWithParam<CartUnit>();

    private gold: number = 0;
    private moving: boolean = false;
    private waiting: boolean = false;
    private rageElapsed: number = 0;
    private rageFrameIndex: number = 0;
    private rageRoot: Node | null = null;
    private rageSprite: Sprite | null = null;
    private rageFrames: SpriteFrame[] = [];
    private sceneCamera: Camera | null = null;
    private readonly cartBaseScale: Vec3 = new Vec3(1, 1, 1);
    private orcAnimation: PlayerAnimationController | null = null;
    private movementSpeedMultiplier: number = 1;

    public get Gold(): number {
        return this.gold;
    }

    public get IsFilled(): boolean {
        return this.gold >= this.requiredGold;
    }

    protected onLoad(): void {
        if (!this.cartVisual) {
            this.cartVisual = this.node.getChildByName('Cart');
        }
        if (!this.orcVisual) {
            this.orcVisual = this.node.getChildByName('Orc');
        }
        this.orcAnimation = this.orcVisual?.getComponent(PlayerAnimationController) ?? null;

        this.cartVisual?.getScale(this.cartBaseScale);
        this.CreateRageIndicator();
        this.FindSceneCamera();
    }

    protected update(dt: number): void {
        if (!this.waiting || !this.rageSprite || this.rageFrames.length === 0) {
            return;
        }

        this.rageElapsed += dt;
        const frameDuration = 1 / Math.max(1, this.rageFramesPerSecond);
        if (this.rageElapsed < frameDuration) {
            return;
        }

        const elapsedFrames = Math.floor(this.rageElapsed / frameDuration);
        this.rageElapsed -= elapsedFrames * frameDuration;
        this.rageFrameIndex = (this.rageFrameIndex + elapsedFrames) % this.rageFrames.length;
        this.rageSprite.spriteFrame = this.rageFrames[this.rageFrameIndex];
    }

    protected lateUpdate(): void {
        if (!this.waiting || !this.rageRoot) {
            return;
        }

        if (!this.sceneCamera || !this.sceneCamera.isValid) {
            this.FindSceneCamera();
        }
        if (this.sceneCamera) {
            this.rageRoot.setWorldRotation(this.sceneCamera.node.worldRotation);
        }
    }

    protected onDestroy(): void {
        if (this.cartVisual?.isValid) {
            Tween.stopAllByTarget(this.cartVisual);
        }
        for (const frame of this.rageFrames) {
            frame.destroy();
        }
        this.rageFrames.length = 0;
    }

    public ResetCart(): void {
        this.SetWaiting(false);
        this.gold = 0;
        this.moving = false;
        this.orcAnimation?.SetMoving(false);
        this.fillStack?.SetCount(0, false);
    }

    public SetWaiting(value: boolean): void {
        if (this.waiting === value) {
            return;
        }

        this.waiting = value;
        this.SetCartPulse(value);

        if (this.rageRoot) {
            this.rageRoot.active = value;
        }
        if (value) {
            this.rageElapsed = 0;
            this.rageFrameIndex = 0;
            if (this.rageSprite && this.rageFrames.length > 0) {
                this.rageSprite.spriteFrame = this.rageFrames[0];
            }
        }
    }

    public CreateGoldDeliveryTarget(slotOffset: number = 0): Node | null {
        return this.fillStack?.CreateItemTarget(this.gold + Math.max(0, Math.floor(slotOffset))) ?? null;
    }

    public ReceiveGold(amount: number = 1, animate: boolean = true): void {
        if (this.IsFilled) {
            return;
        }

        this.gold = Math.min(this.requiredGold, this.gold + Math.max(0, amount));
        this.fillStack?.SetCount(this.gold, animate);

        if (this.IsFilled) {
            this.onFilled.Invoke(this);
        }
    }

    public SetMovementSpeedMultiplier(multiplier: number): void {
        this.movementSpeedMultiplier = Number.isFinite(multiplier)
            ? Math.max(1, multiplier)
            : 1;
    }

    public MoveAlong(points: Node[]): void {
        if (this.moving) {
            return;
        }

        this.moving = true;
        this.orcAnimation?.SetMoving(true);
        this.MoveToPoint(points, 0);
    }

    public MoveTo(target: Node, onComplete?: () => void): boolean {
        if (this.moving) {
            return false;
        }

        this.moving = true;
        this.orcAnimation?.SetMoving(true);
        this.TweenTo(target.worldPosition.clone(), () => {
            this.moving = false;
            this.orcAnimation?.SetMoving(false);
            onComplete?.();
        });
        return true;
    }

    private MoveToPoint(points: Node[], index: number): void {
        if (index >= points.length) {
            this.moving = false;
            this.orcAnimation?.SetMoving(false);
            this.onRouteFinished.Invoke(this);
            return;
        }

        const target = points[index];
        if (!target) {
            this.MoveToPoint(points, index + 1);
            return;
        }

        this.TweenTo(target.worldPosition.clone(), () => this.MoveToPoint(points, index + 1));
    }

    private TweenTo(targetPosition: Vec3, onComplete: () => void): void {
        const distance = Vec3.distance(this.node.worldPosition, targetPosition);
        const duration = distance / Math.max(
            this.moveSpeed * this.movementSpeedMultiplier,
            0.01,
        );

        tween(this.node)
            .to(duration, { worldPosition: targetPosition }, { easing: 'linear' })
            .call(onComplete)
            .start();
    }

    private SetCartPulse(enabled: boolean): void {
        if (!this.cartVisual) {
            return;
        }

        Tween.stopAllByTarget(this.cartVisual);
        this.cartVisual.setScale(this.cartBaseScale);
        if (!enabled) {
            return;
        }

        const pulseScale = new Vec3(
            this.cartBaseScale.x * this.cartPulseScale,
            this.cartBaseScale.y * this.cartPulseScale,
            this.cartBaseScale.z * this.cartPulseScale,
        );

        tween(this.cartVisual)
            .to(this.cartPulseHalfDuration, { scale: pulseScale }, { easing: 'sineInOut' })
            .to(this.cartPulseHalfDuration, { scale: this.cartBaseScale.clone() }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    private CreateRageIndicator(): void {
        if (!this.rageAtlas?.texture) {
            console.warn('[CartUnit] rageAtlas is not assigned; rage indicator is disabled.');
            return;
        }

        const root = new Node('RageIndicator');
        root.layer = Layers.Enum.UI_2D;
        root.addComponent(UITransform).setContentSize(new Size(
            CartUnit.RAGE_FRAME_SIZE,
            CartUnit.RAGE_FRAME_SIZE,
        ));
        root.addComponent(RenderRoot2D);
        this.node.addChild(root);

        const orcPosition = this.orcVisual?.position ?? Vec3.ZERO;
        root.setPosition(orcPosition.x, orcPosition.y + this.rageIconHeight, orcPosition.z);
        const iconScale = this.rageIconSize / CartUnit.RAGE_FRAME_SIZE;
        root.setScale(iconScale, iconScale, iconScale);

        const spriteNode = new Node('RageSprite');
        spriteNode.layer = Layers.Enum.UI_2D;
        root.addChild(spriteNode);
        spriteNode.addComponent(UITransform).setContentSize(new Size(
            CartUnit.RAGE_FRAME_SIZE,
            CartUnit.RAGE_FRAME_SIZE,
        ));
        const sprite = spriteNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        this.rageFrames = this.CreateRageFrames(this.rageAtlas);
        sprite.spriteFrame = this.rageFrames[0] ?? null;
        root.active = false;

        this.rageRoot = root;
        this.rageSprite = sprite;
    }

    private CreateRageFrames(atlas: SpriteFrame): SpriteFrame[] {
        const frames: SpriteFrame[] = [];
        for (let row = 0; row < CartUnit.RAGE_ROWS; row++) {
            for (let column = 0; column < CartUnit.RAGE_COLUMNS; column++) {
                const frame = new SpriteFrame();
                frame.texture = atlas.texture;
                frame.rect = new Rect(
                    column * CartUnit.RAGE_FRAME_SIZE,
                    row * CartUnit.RAGE_FRAME_SIZE,
                    CartUnit.RAGE_FRAME_SIZE,
                    CartUnit.RAGE_FRAME_SIZE,
                );
                frame.originalSize = new Size(CartUnit.RAGE_FRAME_SIZE, CartUnit.RAGE_FRAME_SIZE);
                frames.push(frame);
            }
        }
        return frames;
    }

    private FindSceneCamera(): void {
        this.sceneCamera = director.getScene()
            ?.getComponentsInChildren(Camera)
            .find((camera) => camera.enabled && camera.node.activeInHierarchy) ?? null;
    }
}
