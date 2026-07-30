import { _decorator, CCFloat, Component, director, Enum, Label, Node, tween, Tween, Vec3 } from 'cc';
import { EItemType } from '../Items/ItemType';
import { PlayerInventory } from '../Player/PlayerInventory';

const { ccclass, property } = _decorator;

@ccclass('UiCurrencyCounter')
export class UiCurrencyCounter extends Component {
    @property(PlayerInventory)
    public inventory: PlayerInventory | null = null;

    @property({ type: Enum(EItemType) })
    public currencyType: EItemType = EItemType.GoldOre;

    @property(Label)
    public amountLabel: Label | null = null;

    @property({ type: Node, tooltip: 'This node stays inactive until the currency is received for the first time.' })
    public visualRoot: Node | null = null;

    @property({ type: CCFloat, min: 0.01, tooltip: 'Delay between visual +/-1 counter steps.' })
    public countStepInterval: number = 0.06;

    @property({ type: CCFloat, min: 1 })
    public changePulseScale: number = 1.12;

    @property({ type: CCFloat, min: 0.01 })
    public changePulseDuration: number = 0.08;

    @property({ type: CCFloat, min: 0.01 })
    public revealDuration: number = 0.22;

    private displayedAmount: number = 0;
    private targetAmount: number = 0;
    private stepTimer: number = 0;
    private revealed: boolean = false;
    private readonly visualBaseScale: Vec3 = new Vec3(1, 1, 1);
    private readonly labelBaseScale: Vec3 = new Vec3(1, 1, 1);

    protected start(): void {
        this.inventory ??= director.getScene()?.getComponentInChildren(PlayerInventory) ?? null;

        this.visualRoot?.getScale(this.visualBaseScale);
        this.amountLabel?.node.getScale(this.labelBaseScale);
        this.SetDisplayedAmount(0);

        this.targetAmount = this.inventory?.GetCount(this.currencyType) ?? 0;
        if (this.visualRoot) {
            this.visualRoot.active = false;
        }
        this.inventory?.onAmountChanged.Subscribe(this.OnInventoryAmountChanged, this);

        if (this.targetAmount > 0) {
            this.Reveal();
            this.stepTimer = this.countStepInterval;
        }
    }

    protected onDestroy(): void {
        this.inventory?.onAmountChanged.UnSubscribe(this.OnInventoryAmountChanged, this);
        if (this.visualRoot?.isValid) {
            Tween.stopAllByTarget(this.visualRoot);
        }
        if (this.amountLabel?.node.isValid) {
            Tween.stopAllByTarget(this.amountLabel.node);
        }
    }

    protected update(dt: number): void {
        if (this.displayedAmount === this.targetAmount) {
            return;
        }

        const interval = Math.max(0.01, this.countStepInterval);
        this.stepTimer += Math.max(0, dt);
        let stepsThisFrame = 0;

        while (
            this.stepTimer >= interval
            && this.displayedAmount !== this.targetAmount
            && stepsThisFrame < 20
        ) {
            this.stepTimer -= interval;
            this.SetDisplayedAmount(this.displayedAmount + Math.sign(this.targetAmount - this.displayedAmount));
            this.PlayNumberPulse();
            stepsThisFrame++;
        }
    }

    private OnInventoryAmountChanged(itemType: EItemType): void {
        if (itemType !== this.currencyType || !this.inventory) {
            return;
        }

        const nextAmount = Math.max(0, Math.floor(this.inventory.GetCount(this.currencyType)));
        if (nextAmount === this.targetAmount) {
            return;
        }

        this.targetAmount = nextAmount;
        this.stepTimer = Math.max(this.stepTimer, this.countStepInterval);

        if (!this.revealed && nextAmount > 0) {
            this.Reveal();
        }
    }

    private SetDisplayedAmount(value: number): void {
        this.displayedAmount = Math.max(0, Math.floor(value));
        if (this.amountLabel) {
            this.amountLabel.string = this.displayedAmount.toString();
        }
    }

    private Reveal(): void {
        const root = this.visualRoot;
        if (!root || this.revealed) {
            return;
        }

        this.revealed = true;
        Tween.stopAllByTarget(root);
        root.active = true;
        root.setScale(Vec3.ZERO);
        tween(root)
            .to(
                Math.max(0.01, this.revealDuration),
                { scale: this.visualBaseScale.clone() },
                { easing: 'backOut' },
            )
            .start();
    }

    private PlayNumberPulse(): void {
        const labelNode = this.amountLabel?.node;
        if (!labelNode?.activeInHierarchy) {
            return;
        }

        const pulseScale = new Vec3(
            this.labelBaseScale.x * Math.max(1, this.changePulseScale),
            this.labelBaseScale.y * Math.max(1, this.changePulseScale),
            this.labelBaseScale.z * Math.max(1, this.changePulseScale),
        );
        const halfDuration = Math.max(0.01, this.changePulseDuration) * 0.5;
        Tween.stopAllByTarget(labelNode);
        labelNode.setScale(this.labelBaseScale);
        tween(labelNode)
            .to(halfDuration, { scale: pulseScale }, { easing: 'sineOut' })
            .to(halfDuration, { scale: this.labelBaseScale.clone() }, { easing: 'sineIn' })
            .start();
    }
}
