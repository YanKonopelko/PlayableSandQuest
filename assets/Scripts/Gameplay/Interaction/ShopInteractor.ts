import { _decorator, CCInteger, Enum, Label, Node, Sprite, tween, Vec3 } from 'cc';
import { CustomActionWithParam } from '../../Utills/CustomActions';
import { RequiredReference } from '../Core/RequiredReference';
import { EItemType } from '../Items/ItemType';
import { PlayerInventory } from '../Player/PlayerInventory';
import { Interactor } from './Interactor';

const { ccclass, property } = _decorator;

@ccclass('ShopInteractor')
export class ShopInteractor extends Interactor {
    @property({ type: Enum(EItemType) })
    public priceItem: EItemType = EItemType.Money;

    @property({ type: CCInteger })
    public price: number = 4;

    @property(Label)
    public countRemain: Label | null = null;

    @property(Sprite)
    public fill: Sprite | null = null;

    @property(Node)
    public receivePivot: Node | null = null;

    public readonly onPurchased: CustomActionWithParam<ShopInteractor> = new CustomActionWithParam<ShopInteractor>();
    public readonly onProgressChanged: CustomActionWithParam<number> = new CustomActionWithParam<number>();

    private paid: number = 0;
    private purchased: boolean = false;

    public get Paid(): number {
        return this.paid;
    }

    public get IsPurchased(): boolean {
        return this.purchased;
    }

    public get Remaining(): number {
        return Math.max(0, this.price - this.paid);
    }

    protected onLoad(): void {
        super.onLoad();
        RequiredReference.Check(this, this.countRemain, 'countRemain');
        RequiredReference.Check(this, this.fill, 'fill');
        RequiredReference.CheckNode(this, this.receivePivot, 'receivePivot');
    }

    protected start(): void {
        this.RefreshProgress(false);
    }

    public CanInteract(inventory: PlayerInventory | null): boolean {
        return !this.purchased && this.Remaining > 0 && !!inventory && inventory.Has(this.priceItem, 1);
    }

    public ConfigurePrice(itemType: EItemType, price: number): void {
        this.priceItem = itemType;
        this.price = Math.max(1, Math.floor(price));
        this.paid = Math.min(this.paid, this.price);
        this.RefreshProgress(false);
    }

    public TryPayFrom(inventory: PlayerInventory, amount: number = 1): boolean {
        const acceptedAmount = Math.min(this.Remaining, Math.max(0, amount));
        if (acceptedAmount <= 0 || !inventory.TryRemove(this.priceItem, acceptedAmount)) {
            return false;
        }

        return this.ReceivePayment(acceptedAmount);
    }

    public ReceivePayment(amount: number = 1): boolean {
        const acceptedAmount = Math.min(this.Remaining, Math.max(0, amount));
        if (this.purchased || acceptedAmount <= 0) {
            return false;
        }

        this.paid += acceptedAmount;
        this.RefreshProgress(true);

        if (this.paid >= this.price) {
            this.CompletePurchase();
        }

        return true;
    }

    public ResetShop(): void {
        this.paid = 0;
        this.purchased = false;
        this.RefreshProgress();
    }

    private RefreshProgress(animate: boolean = true): void {
        if (this.countRemain) {
            this.countRemain.string = this.Remaining.toString();
        }

        if (this.fill) {
            this.fill.fillRange = this.price <= 0 ? 1 : Math.min(1, Math.max(0, this.paid / this.price));
        }

        this.onProgressChanged.Invoke(this.paid);

        if (animate && this.fill) {
            tween(this.fill.node)
                .to(0.08, { scale: new Vec3(1.08, 1.08, 1.08) })
                .to(0.12, { scale: Vec3.ONE })
                .start();
        }
    }

    private CompletePurchase(): void {
        this.purchased = true;
        this.onPurchased.Invoke(this);
    }
}
