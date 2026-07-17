import { _decorator, CCInteger, Component, Enum, Node, tween, Vec3 } from 'cc';
import { CustomActionWithParam } from '../../Utills/CustomActions';
import { EItemType } from '../Items/ItemType';
import { ItemStackView } from '../Items/ItemStackView';
import { PlayerInventory } from '../Player/PlayerInventory';
import { Interactor } from './Interactor';

const { ccclass, property } = _decorator;

@ccclass('ShopInteractor')
export class ShopInteractor extends Interactor {
    @property({ type: Enum(EItemType) })
    public priceItem: EItemType = EItemType.Money;

    @property({ type: CCInteger })
    public price: number = 4;

    @property(ItemStackView)
    public progressStack: ItemStackView | null = null;

    @property(Node)
    public receivePivot: Node | null = null;

    @property(Node)
    public progressRoot: Node | null = null;

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

    public CanInteract(inventory: PlayerInventory | null): boolean {
        return !this.purchased && !!inventory && inventory.Has(this.priceItem, 1);
    }

    public TryPayFrom(inventory: PlayerInventory, amount: number = 1): boolean {
        if (this.purchased || !inventory.TryRemove(this.priceItem, amount)) {
            return false;
        }

        this.paid = Math.min(this.price, this.paid + amount);
        this.RefreshProgress();

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

    private RefreshProgress(): void {
        this.progressStack?.SetCount(this.paid);
        this.onProgressChanged.Invoke(this.paid);

        if (this.progressRoot) {
            const progress = this.price <= 0 ? 1 : this.paid / this.price;
            this.progressRoot.setScale(Math.max(0.001, progress), 1, 1);
            tween(this.node)
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
