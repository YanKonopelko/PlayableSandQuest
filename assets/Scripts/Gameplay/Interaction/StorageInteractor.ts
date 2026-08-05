import { _decorator, CCInteger, Enum, Node } from 'cc';
import { CustomActionWithParam } from '../../Utills/CustomActions';
import { EItemType } from '../Items/ItemType';
import { ItemStackView } from '../Items/ItemStackView';
import { Interactor } from './Interactor';

const { ccclass, property } = _decorator;

@ccclass('StorageInteractor')
export class StorageInteractor extends Interactor {
    @property({ type: Enum(EItemType) })
    public acceptedItem: EItemType = EItemType.Money;

    @property({ type: CCInteger })
    public capacity: number = 999;

    @property(ItemStackView)
    public stackView: ItemStackView | null = null;

    @property(Node)
    public receivePivot: Node | null = null;

    public readonly onAmountChanged: CustomActionWithParam<number> = new CustomActionWithParam<number>();

    private amount: number = 0;

    public get Amount(): number {
        return this.amount;
    }

    public CanReceive(itemType: EItemType, amount: number = 1): boolean {
        return itemType === this.acceptedItem && this.amount + amount <= this.capacity;
    }

    public Receive(itemType: EItemType, amount: number = 1, animate: boolean = true): boolean {
        if (!this.CanReceive(itemType, amount)) {
            return false;
        }

        this.amount += Math.max(0, amount);
        this.stackView?.SetCount(this.amount, animate);
        this.onAmountChanged.Invoke(this.amount);
        return true;
    }

    public TryTake(amount: number = 1): boolean {
        if (this.amount < amount) {
            return false;
        }

        this.amount -= Math.max(0, amount);
        this.stackView?.SetCount(this.amount);
        this.onAmountChanged.Invoke(this.amount);
        return true;
    }
}
