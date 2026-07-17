import { _decorator, CCInteger, Component, Enum, EventTouch, input, Input, Node, Prefab, Vec3 } from 'cc';
import { CartQueueController } from '../CartQueue/CartQueueController';
import { HintController } from '../Hints/HintController';
import { HintTarget } from '../Hints/HintTarget';
import { Interactor } from '../Interaction/Interactor';
import { ShopInteractor } from '../Interaction/ShopInteractor';
import { StorageInteractor } from '../Interaction/StorageInteractor';
import { EItemType } from '../Items/ItemType';
import { ItemFlyService } from '../Items/ItemFlyService';
import { PlayerController } from '../Player/PlayerController';
import { PlayerInventory } from '../Player/PlayerInventory';
import { VacuumSystem } from '../Vacuum/VacuumSystem';
import { PackshotController } from '../Packshot/PackshotController';
import { SandField } from '../Sand/SandField';

const { ccclass, property } = _decorator;

export enum EGameFlowState {
    GoToSand = 0,
    CollectGold = 1,
    GoToExchange = 2,
    ExchangeGold = 3,
    GoToStorage = 4,
    GoToUpgradeShop = 5,
    UpgradeVacuum = 6,
    ConveyorUnlocked = 7,
    AwaitFinalTap = 8,
    Packshot = 9,
}

Enum(EGameFlowState);

@ccclass('GameFlowController')
export class GameFlowController extends Component {
    @property(PlayerController)
    public player: PlayerController | null = null;

    @property(PlayerInventory)
    public inventory: PlayerInventory | null = null;

    @property(VacuumSystem)
    public vacuum: VacuumSystem | null = null;

    @property(ItemFlyService)
    public flyService: ItemFlyService | null = null;

    @property(Interactor)
    public sandInteractor: Interactor | null = null;

    @property(SandField)
    public sandField: SandField | null = null;

    @property(Node)
    public sandRunTarget: Node | null = null;

    @property(Interactor)
    public exchangeInteractor: Interactor | null = null;

    @property(StorageInteractor)
    public moneyStorage: StorageInteractor | null = null;

    @property(ShopInteractor)
    public upgradeShop: ShopInteractor | null = null;

    @property(CartQueueController)
    public cartQueue: CartQueueController | null = null;

    @property(HintController)
    public hints: HintController | null = null;

    @property(PackshotController)
    public packshot: PackshotController | null = null;

    @property(HintTarget)
    public sandHint: HintTarget | null = null;

    @property(HintTarget)
    public exchangeHint: HintTarget | null = null;

    @property(HintTarget)
    public storageHint: HintTarget | null = null;

    @property(HintTarget)
    public upgradeShopHint: HintTarget | null = null;

    @property(Prefab)
    public goldFlyPrefab: Prefab | null = null;

    @property(Prefab)
    public moneyFlyPrefab: Prefab | null = null;

    @property(Node)
    public playerItemFlyStart: Node | null = null;

    @property(Node)
    public moneyFlyStart: Node | null = null;

    @property(Node)
    public conveyorRoot: Node | null = null;

    @property(Node)
    public finalVisualShop1: Node | null = null;

    @property(Node)
    public finalVisualShop2: Node | null = null;

    @property(Node)
    public finalVisualShop3: Node | null = null;

    @property({ type: CCInteger })
    public goldPerExchange: number = 4;

    @property({ type: CCInteger })
    public vacuumUpgradePurchasesBeforeConveyor: number = 2;

    @property({ type: Enum(EGameFlowState) })
    public debugState: EGameFlowState = EGameFlowState.GoToSand;

    private upgradePurchases: number = 0;
    private state: EGameFlowState = EGameFlowState.GoToSand;
    private finalTapArmed: boolean = false;

    protected start(): void {
        this.BindEvents();
        this.SetConveyorVisible(false);
        this.SetFinalVisualShopsVisible(false);
        this.SetState(EGameFlowState.GoToSand);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.OnAnyFinalTap, this);
    }

    private BindEvents(): void {
        this.sandInteractor?.onPlayerEnter.Subscribe(this.OnSandEnter, this);
        this.sandField?.onPlayerExit.Subscribe(this.OnSandExit, this);
        this.exchangeInteractor?.onPlayerEnter.Subscribe(this.OnExchangeEnter, this);
        this.moneyStorage?.onPlayerEnter.Subscribe(this.OnStorageEnter, this);
        this.upgradeShop?.onPlayerEnter.Subscribe(this.OnUpgradeShopEnter, this);
        this.upgradeShop?.onPurchased.Subscribe(this.OnUpgradePurchased, this);
    }

    private SetState(state: EGameFlowState): void {
        this.state = state;
        this.debugState = state;

        switch (state) {
            case EGameFlowState.GoToSand:
                this.hints?.Show(this.sandHint);
                break;
            case EGameFlowState.CollectGold:
                this.hints?.Hide();
                break;
            case EGameFlowState.GoToExchange:
                this.hints?.Show(this.exchangeHint);
                break;
            case EGameFlowState.GoToStorage:
                this.hints?.Show(this.storageHint);
                break;
            case EGameFlowState.GoToUpgradeShop:
                if (this.inventory?.Has(EItemType.Money, 1)) {
                    this.hints?.Show(this.upgradeShopHint);
                } else {
                    this.hints?.Show(this.storageHint);
                }
                break;
            case EGameFlowState.AwaitFinalTap:
                this.hints?.Hide();
                this.ArmFinalTap();
                break;
            case EGameFlowState.Packshot:
                this.hints?.Hide();
                this.packshot?.Show();
                break;
        }
    }

    private OnSandEnter(): void {
        if (this.state !== EGameFlowState.GoToSand) {
            return;
        }

        this.vacuum?.Activate();
        this.player?.SetVacuumVisualEnabled(true);
        this.SetState(EGameFlowState.CollectGold);
        if (this.player && this.sandRunTarget) {
            this.player.RunAutomaticallyTo(this.sandRunTarget);
        }
    }

    private OnSandExit(): void {
        if (this.state !== EGameFlowState.CollectGold) {
            return;
        }

        if ((this.inventory?.GetCount(EItemType.GoldOre) ?? 0) > 0) {
            this.SetState(EGameFlowState.GoToExchange);
        } else {
            this.SetState(EGameFlowState.GoToSand);
        }
    }

    private OnExchangeEnter(): void {
        if (this.state !== EGameFlowState.GoToExchange || !this.inventory || !this.cartQueue) {
            return;
        }

        const available = this.inventory.GetCount(EItemType.GoldOre);
        const amount = Math.min(this.goldPerExchange, available);
        if (amount <= 0) {
            this.SetState(EGameFlowState.GoToSand);
            return;
        }

        this.SetState(EGameFlowState.ExchangeGold);
        this.TransferGoldToCart(amount);
    }

    private TransferGoldToCart(amount: number): void {
        const activeCart = this.cartQueue?.ActiveCart;
        const target = activeCart?.receivePivot ?? activeCart?.node;
        const start = this.playerItemFlyStart?.worldPosition ?? this.player?.node.worldPosition ?? new Vec3();

        for (let i = 0; i < amount; i++) {
            this.inventory?.TryRemove(EItemType.GoldOre, 1);
            this.cartQueue?.TryGiveGold(1);

            if (this.flyService && this.goldFlyPrefab && target) {
                this.flyService.FlyPrefabToNode(this.goldFlyPrefab, start.clone(), target, undefined, 0.25 + i * 0.03);
            }
        }

        this.GiveMoneyAfterExchange(amount);
    }

    private GiveMoneyAfterExchange(amount: number): void {
        const storageTarget = this.moneyStorage?.receivePivot ?? this.moneyStorage?.node;
        const start = this.moneyFlyStart?.worldPosition ?? storageTarget?.worldPosition ?? new Vec3();
        let completed = 0;
        const onOneMoneyArrived = () => {
            this.moneyStorage?.Receive(EItemType.Money, 1);
            completed++;
            if (completed >= amount) {
                this.SetState(EGameFlowState.GoToStorage);
            }
        };

        for (let i = 0; i < amount; i++) {
            if (this.flyService && this.moneyFlyPrefab && storageTarget) {
                this.flyService.FlyPrefabToNode(this.moneyFlyPrefab, start.clone(), storageTarget, onOneMoneyArrived, 0.28 + i * 0.03);
            } else {
                onOneMoneyArrived();
            }
        }
    }

    private OnStorageEnter(): void {
        if (this.state !== EGameFlowState.GoToStorage || !this.moneyStorage || !this.inventory) {
            return;
        }

        const amount = this.moneyStorage.Amount;
        if (amount <= 0) {
            return;
        }

        this.moneyStorage.TryTake(amount);
        this.inventory.Add(EItemType.Money, amount);
        this.SetState(EGameFlowState.GoToUpgradeShop);
    }

    private OnUpgradeShopEnter(): void {
        if (this.state !== EGameFlowState.GoToUpgradeShop || !this.upgradeShop || !this.inventory) {
            return;
        }

        while (!this.upgradeShop.IsPurchased && this.upgradeShop.CanInteract(this.inventory)) {
            this.upgradeShop.TryPayFrom(this.inventory, 1);
        }
    }

    private OnUpgradePurchased(): void {
        this.upgradePurchases++;

        if (this.upgradePurchases <= this.vacuumUpgradePurchasesBeforeConveyor) {
            this.vacuum?.UpgradeLength();
            this.upgradeShop?.ResetShop();
            this.SetState(EGameFlowState.GoToSand);
            return;
        }

        this.SetState(EGameFlowState.ConveyorUnlocked);
        this.UnlockConveyorAndFinalShops();
    }

    private UnlockConveyorAndFinalShops(): void {
        this.SetConveyorVisible(true);
        this.SetFinalVisualShopsVisible(true);
        this.SetState(EGameFlowState.AwaitFinalTap);
    }

    private SetConveyorVisible(value: boolean): void {
        if (this.conveyorRoot) {
            this.conveyorRoot.active = value;
        }
    }

    private SetFinalVisualShopsVisible(value: boolean): void {
        for (const shop of [this.finalVisualShop1, this.finalVisualShop2, this.finalVisualShop3]) {
            if (shop) {
                shop.active = value;
            }
        }
    }

    private ArmFinalTap(): void {
        if (this.finalTapArmed) {
            return;
        }

        this.finalTapArmed = true;
        input.on(Input.EventType.TOUCH_START, this.OnAnyFinalTap, this);
    }

    private OnAnyFinalTap(_event: EventTouch): void {
        if (!this.finalTapArmed) {
            return;
        }

        this.finalTapArmed = false;
        input.off(Input.EventType.TOUCH_START, this.OnAnyFinalTap, this);
        this.SetState(EGameFlowState.Packshot);
    }
}
