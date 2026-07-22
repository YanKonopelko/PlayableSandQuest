import { _decorator, CCFloat, CCInteger, Component, Enum, EventTouch, input, Input, instantiate, Material, MeshRenderer, Node, Prefab, Vec3, Vec4 } from 'cc';
import { CartQueueController } from '../CartQueue/CartQueueController';
import { CartUnit } from '../CartQueue/CartUnit';
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

    @property({ type: CCFloat, min: 0 })
    public shopItemTransferDelay: number = 0.12;

    @property({ type: CCFloat, min: 0.1, tooltip: 'Seconds between automatic gold bars on the unlocked conveyor.' })
    public conveyorSpawnInterval: number = 1.25;

    @property({ type: CCFloat, min: 0.1, tooltip: 'World-space movement speed of gold bars on the conveyor.' })
    public conveyorItemSpeed: number = 4;

    @property({ type: CCFloat, tooltip: 'Vertical offset from ConveyorRoot/Start to the top of the belt.' })
    public conveyorItemHeight: number = 1.25;

    @property({ type: CCInteger, min: 1, tooltip: 'Safety limit for simultaneous gold bars on the conveyor.' })
    public conveyorMaxItems: number = 8;

    @property({ type: CCFloat, min: 0, tooltip: 'Negative horizontal UV offset speed for the LentaAnim material.' })
    public conveyorBeltScrollSpeed: number = 0.25;

    @property({ type: Enum(EGameFlowState) })
    public debugState: EGameFlowState = EGameFlowState.GoToSand;

    private upgradePurchases: number = 0;
    private state: EGameFlowState = EGameFlowState.GoToSand;
    private finalTapArmed: boolean = false;
    private exchangeInProgress: boolean = false;
    private shopItemInFlight: boolean = false;
    private conveyorRunning: boolean = false;
    private conveyorSpawnTimer: number = 0;
    private conveyorSpawnPoint: Node | null = null;
    private readonly conveyorItems: Node[] = [];
    private readonly conveyorDeliveryPosition: Vec3 = new Vec3();
    private readonly conveyorMoveDelta: Vec3 = new Vec3();
    private conveyorBeltMaterial: Material | null = null;
    private readonly conveyorBeltTilingOffset: Vec4 = new Vec4();

    protected start(): void {
        this.BindEvents();
        this.SetConveyorVisible(false);
        this.SetFinalVisualShopsVisible(false);
        this.SetState(EGameFlowState.GoToSand);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.OnAnyFinalTap, this);
        this.StopAutoConveyor();
    }

    protected update(dt: number): void {
        this.UpdateConveyorBeltMaterial(dt);

        if (!this.conveyorRunning) {
            return;
        }

        const safeDt = Math.max(0, dt);
        const spawnInterval = Number.isFinite(this.conveyorSpawnInterval) && this.conveyorSpawnInterval > 0
            ? this.conveyorSpawnInterval
            : 1.25;
        this.conveyorSpawnTimer += safeDt;
        if (this.conveyorSpawnTimer >= spawnInterval) {
            this.conveyorSpawnTimer -= spawnInterval;
            this.SpawnConveyorGold();
        }

        if (this.conveyorItems.length === 0) {
            return;
        }

        this.UpdateConveyorDeliveryPosition();
        const itemSpeed = Number.isFinite(this.conveyorItemSpeed) && this.conveyorItemSpeed > 0
            ? this.conveyorItemSpeed
            : 4;
        const step = itemSpeed * safeDt;

        for (let i = this.conveyorItems.length - 1; i >= 0; i--) {
            const item = this.conveyorItems[i];
            if (!item?.isValid) {
                this.conveyorItems.splice(i, 1);
                continue;
            }

            const currentPosition = item.worldPosition.clone();
            Vec3.subtract(this.conveyorMoveDelta, this.conveyorDeliveryPosition, currentPosition);
            const distance = this.conveyorMoveDelta.length();

            if (distance <= step || distance <= 0.05) {
                item.setWorldPosition(this.conveyorDeliveryPosition);
                if (this.cartQueue?.TryGiveGold(1)) {
                    this.conveyorItems.splice(i, 1);
                    item.destroy();
                }
                continue;
            }

            this.conveyorMoveDelta.multiplyScalar(step / distance);
            currentPosition.add(this.conveyorMoveDelta);
            item.setWorldPosition(currentPosition);
        }
    }

    private BindEvents(): void {
        this.sandInteractor?.onPlayerEnter.Subscribe(this.OnSandEnter, this);
        this.sandField?.onPlayerExit.Subscribe(this.OnSandExit, this);
        this.exchangeInteractor?.onPlayerEnter.Subscribe(this.OnExchangeEnter, this);
        this.exchangeInteractor?.onPlayerExit.Subscribe(this.OnExchangeExit, this);
        this.cartQueue?.onActiveCartReady.Subscribe(this.OnActiveCartReady, this);
        this.moneyStorage?.onPlayerEnter.Subscribe(this.OnStorageEnter, this);
        this.upgradeShop?.onPlayerEnter.Subscribe(this.OnUpgradeShopEnter, this);
        this.upgradeShop?.onPlayerExit.Subscribe(this.OnUpgradeShopExit, this);
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
                this.player?.SetMovementEnabled(false);
                this.player?.joystick?.ShowFinalTutorial();
                this.ArmFinalTap();
                break;
            case EGameFlowState.Packshot:
                this.hints?.Hide();
                this.StopAutoConveyor();
                this.packshot?.Show();
                break;
        }
    }

    private OnSandEnter(): void {
        this.vacuum?.Activate();
        this.player?.SetVacuumVisualEnabled(true);

        if (this.state === EGameFlowState.GoToSand) {
            this.SetState(EGameFlowState.CollectGold);
            if (this.player && this.sandRunTarget) {
                this.player.RunAutomaticallyTo(this.sandRunTarget);
            }
        }
    }

    private OnSandExit(): void {
        if (this.state === EGameFlowState.CollectGold) {
            if ((this.inventory?.GetCount(EItemType.GoldOre) ?? 0) > 0) {
                this.SetState(EGameFlowState.GoToExchange);
            } else {
                this.SetState(EGameFlowState.GoToSand);
            }
        }
    }

    private OnExchangeEnter(): void {
        if (!this.inventory || !this.cartQueue) {
            return;
        }

        const available = this.inventory.GetCount(EItemType.GoldOre);
        if (available <= 0) {
            if (this.state === EGameFlowState.GoToExchange) {
                this.SetState(EGameFlowState.GoToSand);
            }
            return;
        }

        this.TryStartExchange();
    }

    private TryStartExchange(): boolean {
        if (!this.inventory || !this.cartQueue || this.exchangeInProgress || !this.exchangeInteractor?.IsPlayerInside) {
            return false;
        }

        const activeCart = this.cartQueue.ActiveCart;
        const available = this.inventory.GetCount(EItemType.GoldOre);
        if (!activeCart || available <= 0) {
            return false;
        }

        if (!this.cartQueue.IsActiveCartReady) {
            this.SetState(EGameFlowState.ExchangeGold);
            return false;
        }

        const cartCapacity = Math.max(0, activeCart.requiredGold - activeCart.Gold);
        const amount = Math.min(this.goldPerExchange, available, cartCapacity);
        if (amount <= 0) {
            return false;
        }

        this.exchangeInProgress = true;
        this.SetState(EGameFlowState.ExchangeGold);
        this.TransferGoldToCart(amount);
        return true;
    }

    private TransferGoldToCart(amount: number): void {
        const activeCart = this.cartQueue?.ActiveCart;
        const target = activeCart?.receivePivot ?? activeCart?.node;
        const start = this.playerItemFlyStart?.worldPosition ?? this.player?.node.worldPosition ?? new Vec3();
        let transferred = 0;

        for (let i = 0; i < amount; i++) {
            if (!this.cartQueue?.TryGiveGold(1)) {
                break;
            }

            this.inventory?.TryRemove(EItemType.GoldOre, 1);
            transferred++;

            if (this.flyService && this.goldFlyPrefab && target) {
                this.flyService.FlyPrefabToNode(this.goldFlyPrefab, start.clone(), target, undefined, 0.25 + i * 0.03);
            }
        }

        if (transferred > 0) {
            this.GiveMoneyAfterExchange(transferred);
            return;
        }

        this.exchangeInProgress = false;
    }

    private GiveMoneyAfterExchange(amount: number): void {
        const storageTarget = this.moneyStorage?.receivePivot ?? this.moneyStorage?.node;
        const start = this.moneyFlyStart?.worldPosition ?? storageTarget?.worldPosition ?? new Vec3();
        let completed = 0;
        const onOneMoneyArrived = () => {
            this.moneyStorage?.Receive(EItemType.Money, 1);
            completed++;
            if (completed >= amount) {
                this.exchangeInProgress = false;
                this.ContinueExchangeOrLeave();
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

    private ContinueExchangeOrLeave(): void {
        const hasGold = (this.inventory?.GetCount(EItemType.GoldOre) ?? 0) > 0;
        if (this.exchangeInteractor?.IsPlayerInside && hasGold) {
            this.SetState(EGameFlowState.ExchangeGold);
            this.TryStartExchange();
            return;
        }

        this.SetState(EGameFlowState.GoToStorage);
    }

    private OnActiveCartReady(_cart: CartUnit): void {
        if (this.exchangeInteractor?.IsPlayerInside) {
            this.TryStartExchange();
        }
    }

    private OnExchangeExit(): void {
        if (this.state === EGameFlowState.ExchangeGold && !this.exchangeInProgress) {
            this.SetState(EGameFlowState.GoToStorage);
        }
    }

    private OnStorageEnter(): void {
        if (!this.moneyStorage || !this.inventory) {
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
        if (!this.upgradeShop || !this.inventory) {
            return;
        }

        this.TryTransferNextShopItem();
    }

    private OnUpgradeShopExit(): void {
        this.StopShopTransfer();
    }

    private TryTransferNextShopItem(): void {
        const shop = this.upgradeShop;
        const inventory = this.inventory;
        if (
            this.shopItemInFlight ||
            !shop?.IsPlayerInside ||
            !inventory ||
            !shop.CanInteract(inventory) ||
            !inventory.TryRemove(shop.priceItem, 1)
        ) {
            return;
        }

        this.shopItemInFlight = true;
        const target = shop.receivePivot ?? shop.node;
        const start = this.playerItemFlyStart?.worldPosition ?? this.player?.node.worldPosition ?? new Vec3();

        const onItemArrived = () => {
            const completesPurchase = shop.Remaining <= 1;
            const paymentAccepted = shop.ReceivePayment(1);
            this.shopItemInFlight = false;

            if (!paymentAccepted || completesPurchase || shop.IsPurchased || !shop.IsPlayerInside) {
                return;
            }

            this.scheduleOnce(this.TryTransferNextShopItem, Math.max(0, this.shopItemTransferDelay));
        };

        const flyingItem = this.flyService && this.moneyFlyPrefab
            ? this.flyService.FlyPrefabToNode(this.moneyFlyPrefab, start.clone(), target, onItemArrived)
            : null;

        if (!flyingItem) {
            this.scheduleOnce(onItemArrived, Math.max(0, this.shopItemTransferDelay));
        }
    }

    private StopShopTransfer(): void {
        this.unschedule(this.TryTransferNextShopItem);
    }

    private OnUpgradePurchased(): void {
        this.StopShopTransfer();
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
        this.StartConveyorBeltAnimation();
        this.StartAutoConveyor();
        this.SetFinalVisualShopsVisible(true);
        this.SetState(EGameFlowState.AwaitFinalTap);
    }

    private StartConveyorBeltAnimation(): void {
        if (this.conveyorBeltMaterial || !this.conveyorRoot) {
            return;
        }

        const renderers = this.conveyorRoot.getComponentsInChildren(MeshRenderer);
        let slotFallback: Material | null = null;

        for (const renderer of renderers) {
            for (let i = 0; i < renderer.sharedMaterials.length; i++) {
                const material = renderer.getSharedMaterial(i);
                if (!material) {
                    continue;
                }

                if (!slotFallback && i === 1 && material.getProperty('tilingOffset') instanceof Vec4) {
                    slotFallback = material;
                }

                if (material.name.toLowerCase() === 'lentaanim') {
                    this.conveyorBeltMaterial = material;
                    break;
                }
            }

            if (this.conveyorBeltMaterial) {
                break;
            }
        }

        this.conveyorBeltMaterial ??= slotFallback;
        const tilingOffset = this.conveyorBeltMaterial?.getProperty('tilingOffset');
        if (!(tilingOffset instanceof Vec4)) {
            this.conveyorBeltMaterial = null;
            console.error('[GameFlowController] LentaAnim material with tilingOffset was not found under ConveyorRoot.');
            return;
        }

        Vec4.copy(this.conveyorBeltTilingOffset, tilingOffset);
    }

    private UpdateConveyorBeltMaterial(dt: number): void {
        if (!this.conveyorBeltMaterial || this.conveyorBeltScrollSpeed <= 0) {
            return;
        }

        this.conveyorBeltTilingOffset.z -= this.conveyorBeltScrollSpeed * Math.max(0, dt);
        this.conveyorBeltTilingOffset.z %= 1;
        this.conveyorBeltMaterial.setProperty('tilingOffset', this.conveyorBeltTilingOffset);
    }

    private StartAutoConveyor(): void {
        if (this.conveyorRunning || !this.conveyorRoot || !this.goldFlyPrefab || !this.cartQueue) {
            return;
        }

        this.conveyorSpawnPoint = this.conveyorRoot.getChildByName('Start');
        if (!this.conveyorSpawnPoint) {
            console.error('[GameFlowController] ConveyorRoot/Start is missing; automatic gold delivery is disabled.');
            return;
        }

        const target = this.cartQueue.ActiveCart?.receivePivot ?? this.cartQueue.ActiveCart?.node;
        if (!target) {
            console.error('[GameFlowController] Active cart receive target is missing; automatic gold delivery is disabled.');
            return;
        }

        target.getWorldPosition(this.conveyorDeliveryPosition);
        this.conveyorRunning = true;
        this.conveyorSpawnTimer = 0;
        this.SpawnConveyorGold();
    }

    private StopAutoConveyor(): void {
        this.conveyorRunning = false;
        this.conveyorSpawnTimer = 0;

        for (const item of this.conveyorItems) {
            if (item?.isValid) {
                item.destroy();
            }
        }
        this.conveyorItems.length = 0;
    }

    private SpawnConveyorGold(): void {
        if (
            !this.conveyorRunning ||
            !this.conveyorSpawnPoint?.isValid ||
            !this.goldFlyPrefab ||
            this.conveyorItems.length >= (
                Number.isFinite(this.conveyorMaxItems) && this.conveyorMaxItems > 0
                    ? Math.floor(this.conveyorMaxItems)
                    : 8
            )
        ) {
            return;
        }

        const root = this.flyService?.flyRoot ?? this.conveyorRoot;
        if (!root) {
            return;
        }

        const item = instantiate(this.goldFlyPrefab);
        root.addChild(item);

        const startPosition = this.conveyorSpawnPoint.worldPosition.clone();
        startPosition.y += Number.isFinite(this.conveyorItemHeight) ? this.conveyorItemHeight : 1.25;
        item.setWorldPosition(startPosition);
        this.conveyorItems.push(item);
    }

    private UpdateConveyorDeliveryPosition(): void {
        if (!this.cartQueue?.IsActiveCartReady) {
            return;
        }

        const target = this.cartQueue.ActiveCart?.receivePivot ?? this.cartQueue.ActiveCart?.node;
        target?.getWorldPosition(this.conveyorDeliveryPosition);
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
