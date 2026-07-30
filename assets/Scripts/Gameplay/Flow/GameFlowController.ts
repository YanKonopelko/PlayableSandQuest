import { _decorator, CCFloat, CCInteger, Component, Enum, instantiate, Label, Material, MeshRenderer, Node, Prefab, tween, Tween, Vec3, Vec4 } from 'cc';
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
import { PlayerAnimationController } from '../Player/PlayerAnimationController';
import { PlayerInventory } from '../Player/PlayerInventory';
import { VacuumSystem } from '../Vacuum/VacuumSystem';
import { PackshotController } from '../Packshot/PackshotController';
import { SandField } from '../Sand/SandField';
import { SoundManager } from '../../Sounds/SoundManager';
import { ESoundType } from '../../Sounds/SoundPreset';
import { EParticleType, ParticleManager } from '../../Particles/ParticleManager';

const { ccclass, property } = _decorator;

interface IConveyorGoldItem {
    node: Node;
    pathIndex: number;
}

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

    @property({ type: Node, tooltip: 'World-space origin for the vacuum upgrade celebration.' })
    public sandMachine: Node | null = null;

    @property(ItemFlyService)
    public flyService: ItemFlyService | null = null;

    @property(Interactor)
    public sandInteractor: Interactor | null = null;

    @property(SandField)
    public sandField: SandField | null = null;

    @property(Node)
    public sandRunTarget: Node | null = null;

    @property(Node)
    public sandExitTarget: Node | null = null;

    @property(Interactor)
    public exchangeInteractor: Interactor | null = null;

    @property({ type: StorageInteractor, tooltip: 'Gold storage in front of the orcs. The player deposits on one visit and sends gold on the next visit.' })
    public orcGoldStorage: StorageInteractor | null = null;

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

    @property({ type: StorageInteractor, tooltip: 'Player collection storage at the end of the short conveyor.' })
    public conveyorGoldStorage: StorageInteractor | null = null;

    @property({ type: Node, tooltip: 'Long conveyor visual that appears after its shop is purchased.' })
    public longConveyorRoot: Node | null = null;

    @property([Node])
    public shortConveyorPath: Node[] = [];

    @property([Node])
    public longConveyorPath: Node[] = [];

    @property(ShopInteractor)
    public longConveyorShop: ShopInteractor | null = null;

    @property(ShopInteractor)
    public sellerShop: ShopInteractor | null = null;

    @property(ShopInteractor)
    public finalZoneShop: ShopInteractor | null = null;

    @property({ type: Node, tooltip: 'Orc seller visual. It spawns at SellerShop and walks to SellerMoveTarget.' })
    public sellerRoot: Node | null = null;

    @property(Node)
    public sellerMoveTarget: Node | null = null;

    @property([Node])
    public finalFenceElements: Node[] = [];

    @property({ type: Node, tooltip: 'Optional common root for all gate visuals and its central blocking collider.' })
    public finalFenceRoot: Node | null = null;

    @property(Node)
    public finalFenceLock: Node | null = null;

    @property({ type: Node, tooltip: 'Player destination behind the fence. Packshot opens after arrival.' })
    public finalZoneRunTarget: Node | null = null;

    @property(Node)
    public finalVisualShop1: Node | null = null;

    @property(Node)
    public finalVisualShop2: Node | null = null;

    @property(Node)
    public finalVisualShop3: Node | null = null;

    @property({ type: CCInteger })
    public goldPerExchange: number = 4;

    @property({ type: [CCInteger], tooltip: 'Prices of consecutive vacuum upgrade shop purchases.' })
    public vacuumUpgradePrices: number[] = [10, 20, 40];

    @property({ type: CCInteger, min: 1 })
    public longConveyorPrice: number = 15;

    @property({ type: CCInteger, min: 1 })
    public sellerPrice: number = 10;

    @property({ type: CCInteger, min: 1 })
    public finalZonePrice: number = 30;

    @property({ type: CCFloat, min: 0.1 })
    public sellerMoveSpeed: number = 3.5;

    @property({ type: CCFloat, min: 0.05 })
    public finalFenceHideDuration: number = 0.35;

    @property({ type: CCInteger })
    public vacuumUpgradePurchasesBeforeConveyor: number = 2;

    @property({ type: CCFloat, min: 0 })
    public shopItemTransferDelay: number = 0.12;

    @property({ type: CCFloat, min: 0, tooltip: 'Delay between consecutive gold and storage-money flight starts.' })
    public transferItemStaggerDelay: number = 0.09;

    @property({ type: CCFloat, min: 0.1, tooltip: 'Seconds for the first-money camera move to the upgrade shop.' })
    public upgradeShopCameraMoveDuration: number = 0.8;

    @property({ type: CCFloat, min: 0, tooltip: 'Seconds to hold on the newly appeared upgrade shop.' })
    public upgradeShopCameraHoldDuration: number = 0.8;

    @property({ type: CCFloat, min: 0.1, tooltip: 'Seconds for the camera return from the upgrade shop to the player.' })
    public upgradeShopCameraReturnDuration: number = 0.8;

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
    private exchangeInProgress: boolean = false;
    private storageTransferInProgress: boolean = false;
    private conveyorStorageTransferInProgress: boolean = false;
    private shopTransfer: ShopInteractor | null = null;
    private exitingSandAutomatically: boolean = false;
    private conveyorRunning: boolean = false;
    private longConveyorUnlocked: boolean = false;
    private sellerUnlocked: boolean = false;
    private conveyorSpawnTimer: number = 0;
    private conveyorSpawnPoint: Node | null = null;
    private readonly conveyorItems: IConveyorGoldItem[] = [];
    private readonly conveyorDeliveriesInFlight: Map<StorageInteractor, number> = new Map();
    private readonly conveyorDeliveryPosition: Vec3 = new Vec3();
    private readonly conveyorMoveDelta: Vec3 = new Vec3();
    private conveyorBeltMaterial: Material | null = null;
    private readonly conveyorBeltTilingOffset: Vec4 = new Vec4();
    private upgradeShopRevealSequenceStarted: boolean = false;
    private upgradeShopRevealSequenceInProgress: boolean = false;
    private movementEnabledBeforeShopReveal: boolean = true;
    private joystickEnabledBeforeShopReveal: boolean = true;

    protected start(): void {
        if (this.orcGoldStorage) {
            this.orcGoldStorage.acceptedItem = EItemType.GoldOre;
        }
        if (this.conveyorGoldStorage) {
            this.conveyorGoldStorage.acceptedItem = EItemType.GoldOre;
        }
        this.SetMoneyStorageVisible(false);
        this.SetUpgradeShopVisible(false);
        this.ConfigureUpgradeShopPrice();
        this.ConfigureFinalShops();
        this.BindEvents();
        this.SyncUpgradeProgression();
        this.SetConveyorVisible(false);
        this.SetLongConveyorVisible(false);
        this.SetConveyorStorageVisible(false);
        this.SetSellerVisible(false);
        this.SetFinalVisualShopsVisible(false);
        this.SetState(EGameFlowState.GoToSand);
    }

    protected onDestroy(): void {
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

        const path = this.GetActiveConveyorPath();
        const destinationStorage = this.longConveyorUnlocked
            ? this.orcGoldStorage
            : this.conveyorGoldStorage;
        const itemSpeed = Number.isFinite(this.conveyorItemSpeed) && this.conveyorItemSpeed > 0
            ? this.conveyorItemSpeed
            : 4;
        const step = itemSpeed * safeDt;

        for (let i = this.conveyorItems.length - 1; i >= 0; i--) {
            const itemState = this.conveyorItems[i];
            const item = itemState.node;
            if (!item?.isValid) {
                this.conveyorItems.splice(i, 1);
                continue;
            }

            const target = path[itemState.pathIndex];
            if (!target?.isValid) {
                this.TryDeliverConveyorGold(i, itemState, destinationStorage);
                continue;
            }

            const currentPosition = item.worldPosition.clone();
            target.getWorldPosition(this.conveyorDeliveryPosition);
            Vec3.subtract(this.conveyorMoveDelta, this.conveyorDeliveryPosition, currentPosition);
            const distance = this.conveyorMoveDelta.length();

            if (distance <= step || distance <= 0.05) {
                item.setWorldPosition(this.conveyorDeliveryPosition);
                itemState.pathIndex++;
                if (itemState.pathIndex >= path.length) {
                    this.TryDeliverConveyorGold(i, itemState, destinationStorage);
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
        this.orcGoldStorage?.onAmountChanged.Subscribe(this.OnOrcGoldStorageAmountChanged, this);
        this.cartQueue?.onActiveCartReady.Subscribe(this.OnActiveCartReady, this);
        this.inventory?.onAmountChanged.Subscribe(this.OnInventoryAmountChanged, this);
        this.moneyStorage?.onPlayerEnter.Subscribe(this.OnStorageEnter, this);
        this.moneyStorage?.onAmountChanged.Subscribe(this.OnStorageAmountChanged, this);
        this.conveyorGoldStorage?.onPlayerEnter.Subscribe(this.OnConveyorStorageEnter, this);
        this.conveyorGoldStorage?.onAmountChanged.Subscribe(this.OnConveyorStorageAmountChanged, this);

        for (const shop of this.GetAllShops()) {
            shop.onPlayerEnter.Subscribe(this.OnShopEnter, this);
            shop.onPlayerExit.Subscribe(this.OnShopExit, this);
            shop.onPurchased.Subscribe(this.OnShopPurchased, this);
        }
    }

    private SetState(state: EGameFlowState): void {
        this.state = state;
        this.debugState = state;

        switch (state) {
            case EGameFlowState.AwaitFinalTap:
                this.hints?.Hide();
                this.player?.SetMovementEnabled(false);
                break;
            case EGameFlowState.Packshot:
                this.hints?.Hide();
                this.packshot?.Show();
                break;
            default:
                this.RefreshPriorityHint();
                break;
        }
    }

    private RefreshPriorityHint(): void {
        if (!this.hints) {
            return;
        }

        if (
            this.upgradeShopRevealSequenceInProgress
            || this.state === EGameFlowState.AwaitFinalTap
            || this.state === EGameFlowState.Packshot
        ) {
            this.hints.Hide();
            return;
        }

        const candidates: Array<{ target: HintTarget | null; available: boolean }> = [
            {
                target: this.sandHint,
                available: !this.sandField?.IsPlayerInside && !this.vacuum?.IsActive,
            },
            {
                target: this.exchangeHint,
                available: this.CanDepositOrExchangeGold(),
            },
            {
                target: this.storageHint,
                available: (this.moneyStorage?.Amount ?? 0) > 0,
            },
            {
                target: this.upgradeShopHint,
                available: (this.inventory?.GetCount(EItemType.Money) ?? 0) > 0,
            },
        ];

        let highestPriorityTarget: HintTarget | null = null;
        for (const candidate of candidates) {
            if (
                candidate.available &&
                candidate.target &&
                (!highestPriorityTarget || candidate.target.priority > highestPriorityTarget.priority)
            ) {
                highestPriorityTarget = candidate.target;
            }
        }

        this.hints.Show(highestPriorityTarget);
    }

    private CanDepositOrExchangeGold(): boolean {
        const activeCart = this.cartQueue?.ActiveCart;
        const inventoryGold = this.inventory?.GetCount(EItemType.GoldOre) ?? 0;
        if (inventoryGold > 0) {
            return true;
        }
        if (!activeCart || !this.orcGoldStorage) {
            return false;
        }

        const remainingGold = Math.max(0, activeCart.requiredGold - activeCart.Gold);
        return remainingGold > 0 && this.orcGoldStorage.Amount > 0;
    }

    private OnSandEnter(): void {
        if (this.exitingSandAutomatically) {
            return;
        }

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
        if (this.player && this.sandExitTarget) {
            this.exitingSandAutomatically = true;
            this.player.RunAutomaticallyTo(
                this.sandExitTarget,
                () => this.exitingSandAutomatically = false,
            );
        }

        if (this.state === EGameFlowState.CollectGold) {
            if ((this.inventory?.GetCount(EItemType.GoldOre) ?? 0) > 0) {
                this.SetState(EGameFlowState.GoToExchange);
            } else {
                this.SetState(EGameFlowState.GoToSand);
            }
        }
    }

    private OnExchangeEnter(): void {
        if (!this.inventory || !this.cartQueue || !this.orcGoldStorage) {
            return;
        }

        const available = this.inventory.GetCount(EItemType.GoldOre);
        if (available > 0) {
            this.DepositInventoryGoldToOrcStorage();
            return;
        }

        this.TryStartExchange();
    }

    private DepositInventoryGoldToOrcStorage(): void {
        const storage = this.orcGoldStorage;
        const inventory = this.inventory;
        if (!storage || !inventory || this.exchangeInProgress) {
            return;
        }

        const available = inventory.GetCount(EItemType.GoldOre);
        const amount = Math.min(available, this.GetStorageAvailableCapacity(storage));
        if (amount <= 0) {
            return;
        }

        const stack = inventory.goldOreStack;
        const visibleCount = stack?.VisibleCount ?? available;
        const fallbackStart = this.playerItemFlyStart?.worldPosition
            ?? this.player?.node.worldPosition
            ?? new Vec3();
        const target = storage.receivePivot ?? storage.node;
        const starts: Vec3[] = [];

        for (let i = 0; i < amount; i++) {
            starts.push(stack?.GetItemWorldPosition(Math.max(0, visibleCount - 1 - i)) ?? fallbackStart.clone());
            if (!inventory.TryRemove(EItemType.GoldOre, 1)) {
                starts.pop();
                break;
            }
        }

        if (starts.length === 0) {
            return;
        }

        this.exchangeInProgress = true;
        this.SetState(EGameFlowState.ExchangeGold);
        let arrived = 0;
        for (let i = 0; i < starts.length; i++) {
            const launch = () => {
                const onArrived = () => {
                    storage.Receive(EItemType.GoldOre, 1);
                    arrived++;
                    if (arrived >= starts.length) {
                        this.exchangeInProgress = false;
                        this.SetState(EGameFlowState.GoToExchange);
                        if (this.sellerUnlocked || this.exchangeInteractor?.IsPlayerInside) {
                            this.TryStartExchange();
                        }
                    }
                };
                const flyingItem = this.flyService && this.goldFlyPrefab
                    ? this.flyService.FlyPrefabToNode(
                        this.goldFlyPrefab,
                        starts[i],
                        target,
                        onArrived,
                        0.35 + i * 0.02,
                    )
                    : null;
                SoundManager.Instance?.Play(ESoundType.SpendGold);
                if (!flyingItem) {
                    onArrived();
                }
            };
            const delay = i * Math.max(0, this.transferItemStaggerDelay);
            delay > 0 ? this.scheduleOnce(launch, delay) : launch();
        }
    }

    private TryStartExchange(): boolean {
        const canOperate = this.sellerUnlocked
            || !!this.exchangeInteractor?.IsPlayerInside;
        if (!this.cartQueue || !this.orcGoldStorage || this.exchangeInProgress || !canOperate) {
            return false;
        }

        const activeCart = this.cartQueue.ActiveCart;
        const available = this.orcGoldStorage.Amount;
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
        this.TransferStoredGoldToCart(amount);
        return true;
    }

    private TransferStoredGoldToCart(amount: number): void {
        const activeCart = this.cartQueue?.ActiveCart;
        const target = activeCart?.receivePivot ?? activeCart?.node;
        const storage = this.orcGoldStorage;
        const storageStack = storage?.stackView;
        const fallbackStart = storage?.receivePivot?.worldPosition
            ?? storageStack?.root?.worldPosition
            ?? storage?.node.worldPosition
            ?? new Vec3();
        const visibleGoldCount = storageStack?.VisibleCount ?? storage?.Amount ?? 0;
        const startPositions: Vec3[] = [];

        for (let i = 0; i < amount; i++) {
            startPositions.push(
                storageStack?.GetItemWorldPosition(Math.max(0, visibleGoldCount - 1 - i))
                    ?? fallbackStart.clone(),
            );
        }

        if (!storage?.TryTake(amount)) {
            this.exchangeInProgress = false;
            return;
        }

        let arrived = 0;
        const onOneGoldArrived = () => {
            activeCart?.ReceiveGold(1, false);
            arrived++;

            if (arrived >= amount) {
                if (activeCart?.IsFilled) {
                    this.GiveMoneyForFilledCart(activeCart.requiredGold);
                } else {
                    this.exchangeInProgress = false;
                    this.ContinueExchangeOrLeave();
                }
            }
        };

        const deliveryTargets = Array.from(
            { length: amount },
            (_, index) => activeCart?.CreateGoldDeliveryTarget(index) ?? null,
        );
        const staggerDelay = Math.max(0, this.transferItemStaggerDelay);
        for (let i = 0; i < amount; i++) {
            const launchGold = () => {
                const slotTarget = deliveryTargets[i];
                const flightTarget = slotTarget ?? target;
                const onGoldArrived = () => {
                    if (slotTarget?.isValid) {
                        slotTarget.destroy();
                    }
                    onOneGoldArrived();
                };

                if (this.flyService && this.goldFlyPrefab && flightTarget) {
                    const flyingItem = this.flyService.FlyPrefabToNode(
                        this.goldFlyPrefab,
                        startPositions[i] ?? fallbackStart,
                        flightTarget,
                        onGoldArrived,
                        0.75 + i * 0.03,
                        1.7,
                        !!slotTarget,
                    );
                    if (flyingItem) {
                        SoundManager.Instance?.Play(ESoundType.SpendGold);
                        return;
                    }
                }

                SoundManager.Instance?.Play(ESoundType.SpendGold);
                onGoldArrived();
            };

            const launchDelay = i * staggerDelay;
            if (launchDelay > 0) {
                this.scheduleOnce(launchGold, launchDelay);
            } else {
                launchGold();
            }
        }
    }

    private GiveMoneyForFilledCart(amount: number): void {
        this.RevealMoneyStorage();
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

        const staggerDelay = Math.max(0, this.transferItemStaggerDelay);
        for (let i = 0; i < amount; i++) {
            const launchMoneyToStorage = () => {
                const flyingItem = this.flyService && this.moneyFlyPrefab && storageTarget
                    ? this.flyService.FlyPrefabToNode(
                        this.moneyFlyPrefab,
                        start.clone(),
                        storageTarget,
                        onOneMoneyArrived,
                        0.28 + i * 0.03,
                    )
                    : null;

                SoundManager.Instance?.Play(ESoundType.MoneySpend);
                if (!flyingItem) {
                    onOneMoneyArrived();
                }
            };

            const launchDelay = i * staggerDelay;
            if (launchDelay > 0) {
                this.scheduleOnce(launchMoneyToStorage, launchDelay);
            } else {
                launchMoneyToStorage();
            }
        }
    }

    private ContinueExchangeOrLeave(): void {
        const hasStoredGold = (this.orcGoldStorage?.Amount ?? 0) > 0;
        const canContinue = this.sellerUnlocked
            || !!this.exchangeInteractor?.IsPlayerInside;
        if (canContinue && hasStoredGold) {
            this.SetState(EGameFlowState.ExchangeGold);
            this.TryStartExchange();
            return;
        }

        const hasMoneyToCollect = (this.moneyStorage?.Amount ?? 0) > 0;
        this.SetState(hasMoneyToCollect ? EGameFlowState.GoToStorage : EGameFlowState.GoToSand);
    }

    private OnActiveCartReady(_cart: CartUnit): void {
        this.RefreshPriorityHint();

        if (this.sellerUnlocked || this.exchangeInteractor?.IsPlayerInside) {
            this.TryStartExchange();
        }
    }

    private OnExchangeExit(): void {
        if (this.state === EGameFlowState.ExchangeGold && !this.exchangeInProgress) {
            this.SetState(EGameFlowState.GoToStorage);
        }
    }

    private OnOrcGoldStorageAmountChanged(_amount: number): void {
        this.RefreshPriorityHint();
        if (this.sellerUnlocked) {
            this.TryStartExchange();
        }
    }

    private OnStorageEnter(): void {
        if (!this.moneyStorage || !this.inventory || this.storageTransferInProgress) {
            return;
        }

        const amount = this.moneyStorage.Amount;
        if (amount <= 0) {
            return;
        }

        const storageStack = this.moneyStorage.stackView;
        const fallbackStart = this.moneyStorage.receivePivot?.worldPosition
            ?? storageStack?.root?.worldPosition
            ?? this.moneyStorage.node.worldPosition;
        const visibleMoneyCount = storageStack?.VisibleCount ?? 0;
        const startPositions: Vec3[] = [];

        for (let i = 0; i < amount; i++) {
            const stackIndex = Math.max(0, visibleMoneyCount - 1 - i);
            startPositions.push(
                storageStack?.GetItemWorldPosition(stackIndex) ?? fallbackStart.clone(),
            );
        }

        if (!this.moneyStorage.TryTake(amount)) {
            return;
        }

        this.storageTransferInProgress = true;
        const initialMoneyCount = this.inventory.GetCount(EItemType.Money);
        const moneyStack = this.inventory.GetStackView(EItemType.Money);
        const fallbackTarget = moneyStack?.root
            ?? this.playerItemFlyStart
            ?? this.player?.node
            ?? null;
        let completed = 0;

        const staggerDelay = Math.max(0, this.transferItemStaggerDelay);
        for (let i = 0; i < amount; i++) {
            const launchMoney = () => {
                const itemTarget = moneyStack?.CreateItemTarget(initialMoneyCount + i);
                const target = itemTarget ?? fallbackTarget;
                const onMoneyArrived = () => {
                    if (itemTarget?.isValid) {
                        itemTarget.destroy();
                    }
                    this.inventory?.Add(EItemType.Money, 1);
                    completed++;

                    if (completed >= amount) {
                        this.storageTransferInProgress = false;
                        if (this.moneyStorage?.IsPlayerInside && this.moneyStorage.Amount > 0) {
                            this.OnStorageEnter();
                        }
                    }
                };

                const flyingItem = this.flyService && this.moneyFlyPrefab && target
                    ? this.flyService.FlyPrefabToNode(
                        this.moneyFlyPrefab,
                        startPositions[i] ?? fallbackStart.clone(),
                        target,
                        onMoneyArrived,
                        0.35 + i * 0.03,
                        1.2,
                        !!itemTarget,
                    )
                    : null;

                SoundManager.Instance?.Play(ESoundType.MoneyGet);
                if (!flyingItem) {
                    onMoneyArrived();
                }
            };

            const launchDelay = i * staggerDelay;
            if (launchDelay > 0) {
                this.scheduleOnce(launchMoney, launchDelay);
            } else {
                launchMoney();
            }
        }

        this.SetState(EGameFlowState.GoToUpgradeShop);
    }

    private OnStorageAmountChanged(amount: number): void {
        if (amount > 0 && this.moneyStorage?.IsPlayerInside) {
            this.OnStorageEnter();
        }

        this.RefreshPriorityHint();
    }

    private OnConveyorStorageEnter(): void {
        const storage = this.conveyorGoldStorage;
        const inventory = this.inventory;
        if (!storage || !inventory || this.conveyorStorageTransferInProgress || storage.Amount <= 0) {
            return;
        }

        let amount = 0;
        while (amount < storage.Amount && inventory.TryReserve(EItemType.GoldOre, 1)) {
            amount++;
        }
        if (amount <= 0) {
            return;
        }

        const storageStack = storage.stackView;
        const visibleCount = storageStack?.VisibleCount ?? amount;
        const fallbackStart = storage.receivePivot?.worldPosition
            ?? storageStack?.root?.worldPosition
            ?? storage.node.worldPosition;
        const playerStack = inventory.goldOreStack;
        const initialGoldCount = inventory.GetCount(EItemType.GoldOre);
        const fallbackTarget = playerStack?.root ?? this.playerItemFlyStart ?? this.player?.node ?? null;
        let completed = 0;
        this.conveyorStorageTransferInProgress = true;
        if (!storage.TryTake(amount)) {
            this.conveyorStorageTransferInProgress = false;
            return;
        }

        for (let i = 0; i < amount; i++) {
            const start = storageStack?.GetItemWorldPosition(Math.max(0, visibleCount - 1 - i))
                ?? fallbackStart.clone();
            const launch = () => {
                const itemTarget = playerStack?.CreateItemTarget(initialGoldCount + i);
                const target = itemTarget ?? fallbackTarget;
                const onArrived = () => {
                    if (itemTarget?.isValid) {
                        itemTarget.destroy();
                    }
                    inventory.CommitReserved(EItemType.GoldOre, 1);
                    completed++;
                    if (completed >= amount) {
                        this.conveyorStorageTransferInProgress = false;
                        if (storage.IsPlayerInside && storage.Amount > 0) {
                            this.OnConveyorStorageEnter();
                        }
                    }
                };
                const flyingItem = this.flyService && this.goldFlyPrefab && target
                    ? this.flyService.FlyPrefabToNode(
                        this.goldFlyPrefab,
                        start,
                        target,
                        onArrived,
                        0.35 + i * 0.03,
                        1.2,
                        !!itemTarget,
                    )
                    : null;
                SoundManager.Instance?.Play(ESoundType.GetGoldNugget);
                if (!flyingItem) {
                    onArrived();
                }
            };
            const delay = i * Math.max(0, this.transferItemStaggerDelay);
            delay > 0 ? this.scheduleOnce(launch, delay) : launch();
        }
    }

    private OnConveyorStorageAmountChanged(amount: number): void {
        if (amount > 0 && this.longConveyorUnlocked) {
            this.MoveCollectedGoldToOrcStorage();
            return;
        }
        if (amount > 0 && this.conveyorGoldStorage?.IsPlayerInside) {
            this.OnConveyorStorageEnter();
        }
        this.RefreshPriorityHint();
    }

    private OnInventoryAmountChanged(itemType: EItemType): void {
        if (
            itemType === EItemType.Money
            && (this.inventory?.GetCount(EItemType.Money) ?? 0) > 0
        ) {
            this.StartUpgradeShopRevealSequence();
        }
        this.RefreshPriorityHint();
    }

    private StartUpgradeShopRevealSequence(): void {
        const shopRoot = this.upgradeShop?.node;
        if (!shopRoot || shopRoot.active || this.upgradeShopRevealSequenceStarted) {
            return;
        }

        this.upgradeShopRevealSequenceStarted = true;
        this.upgradeShopRevealSequenceInProgress = true;
        this.movementEnabledBeforeShopReveal = this.player?.IsMovementEnabled ?? true;
        this.joystickEnabledBeforeShopReveal = this.player?.joystick?.IsInputEnabled ?? true;
        this.player?.SetMovementEnabled(false);
        this.player?.joystick?.SetInputEnabled(false);
        this.hints?.Hide();

        const cameraFollower = this.player?.cameraFollower;
        if (!cameraFollower) {
            this.RevealUpgradeShop();
            this.FinishUpgradeShopRevealSequence();
            return;
        }

        cameraFollower.PlayFocusSequence(
            shopRoot,
            this.upgradeShopCameraMoveDuration,
            this.upgradeShopCameraHoldDuration,
            this.upgradeShopCameraReturnDuration,
            () => this.RevealUpgradeShop(),
            () => this.FinishUpgradeShopRevealSequence(),
        );
    }

    private FinishUpgradeShopRevealSequence(): void {
        this.RevealUpgradeShop();
        this.player?.SetMovementEnabled(this.movementEnabledBeforeShopReveal);
        this.player?.joystick?.SetInputEnabled(this.joystickEnabledBeforeShopReveal);
        this.upgradeShopRevealSequenceInProgress = false;
        this.RefreshPriorityHint();
    }

    private OnShopEnter(shop: ShopInteractor): void {
        this.TryTransferNextShopItem(shop);
    }

    private OnShopExit(_shop: ShopInteractor): void {
        // Keep the in-flight lock until its item arrives. The callback will stop
        // the transfer when it sees that the player has left the shop.
    }

    private TryTransferNextShopItem(shop: ShopInteractor): void {
        const inventory = this.inventory;
        if (
            (this.shopTransfer && this.shopTransfer !== shop) ||
            !shop?.IsPlayerInside ||
            !inventory ||
            !shop.CanInteract(inventory)
        ) {
            return;
        }

        const paymentStack = inventory.GetStackView(shop.priceItem);
        const fallbackStart = this.playerItemFlyStart?.worldPosition
            ?? this.player?.node.worldPosition
            ?? new Vec3();
        const start = paymentStack && paymentStack.VisibleCount > 0
            ? paymentStack.GetItemWorldPosition(paymentStack.VisibleCount - 1)
            : fallbackStart.clone();

        if (!inventory.TryRemove(shop.priceItem, 1)) {
            return;
        }

        this.shopTransfer = shop;
        const target = shop.receivePivot ?? shop.node;

        const onItemArrived = () => {
            const completesPurchase = shop.Remaining <= 1;
            const paymentAccepted = shop.ReceivePayment(1);
            this.shopTransfer = null;

            if (paymentAccepted) {
                SoundManager.Instance?.Play(
                    shop.priceItem === EItemType.GoldOre ? ESoundType.SpendGold : ESoundType.MoneySpend,
                );
            }

            if (!paymentAccepted || completesPurchase || shop.IsPurchased || !shop.IsPlayerInside) {
                return;
            }

            this.scheduleOnce(
                () => this.TryTransferNextShopItem(shop),
                Math.max(0, this.shopItemTransferDelay),
            );
        };

        const paymentPrefab = shop.priceItem === EItemType.GoldOre
            ? this.goldFlyPrefab
            : this.moneyFlyPrefab;
        const flyingItem = this.flyService && paymentPrefab
            ? this.flyService.FlyPrefabToNode(paymentPrefab, start.clone(), target, onItemArrived, 0.1)
            : null;

        if (!flyingItem) {
            this.scheduleOnce(onItemArrived, Math.max(0, this.shopItemTransferDelay));
        }
    }

    private OnShopPurchased(shop: ShopInteractor): void {
        this.shopTransfer = null;
        if (shop === this.upgradeShop) {
            this.OnUpgradePurchased();
            return;
        }

        SoundManager.Instance?.Play(ESoundType.Upgrade);
        if (shop === this.longConveyorShop) {
            this.OnLongConveyorPurchased();
        } else if (shop === this.sellerShop) {
            this.OnSellerPurchased();
        } else if (shop === this.finalZoneShop) {
            this.OnFinalZonePurchased();
        }
    }

    private OnUpgradePurchased(): void {
        this.upgradePurchases++;
        SoundManager.Instance?.Play(ESoundType.Upgrade);

        if (this.upgradePurchases <= this.vacuumUpgradePurchasesBeforeConveyor) {
            const upgraded = this.vacuum?.UpgradeLength() ?? false;
            if (upgraded && this.sandMachine) {
                ParticleManager.Instance?.PlayAtNode(EParticleType.VacuumUpgrade, this.sandMachine);
            }
            this.SyncUpgradeProgression();
            this.upgradeShop?.ResetShop();
            this.ConfigureUpgradeShopPrice();
            this.SetState(EGameFlowState.GoToSand);
            return;
        }

        this.SetState(EGameFlowState.ConveyorUnlocked);
        this.UnlockConveyorAndFinalShops();
    }

    private SyncUpgradeProgression(): void {
        const upgradeLevel = this.vacuum?.UpgradeLevel ?? 0;
        this.inventory?.SetGoldOreCapacityForUpgradeLevel(upgradeLevel);
        this.sandField?.SetOreCountForUpgradeLevel(upgradeLevel);
    }

    private ConfigureUpgradeShopPrice(): void {
        const prices = this.vacuumUpgradePrices;
        const priceIndex = Math.min(this.upgradePurchases, Math.max(0, prices.length - 1));
        const price = prices[priceIndex] ?? 10;
        this.upgradeShop?.ConfigurePrice(EItemType.Money, price);
    }

    private UnlockConveyorAndFinalShops(): void {
        this.ShowConveyorAnimated();
        this.StartConveyorBeltAnimation();
        this.SetConveyorStorageVisible(true);
        this.SetFinalVisualShopsVisible(true);
        this.SetFinalShopInteractorsVisible(true);
        this.SetState(EGameFlowState.GoToSand);
    }

    private ConfigureFinalShops(): void {
        this.ConfigureShop(this.longConveyorShop, this.longConveyorPrice);
        this.ConfigureShop(this.sellerShop, this.sellerPrice);
        this.ConfigureShop(this.finalZoneShop, this.finalZonePrice);
        this.SetVisualShopPrice(this.finalVisualShop1, this.longConveyorPrice);
        this.SetVisualShopPrice(this.finalVisualShop2, this.sellerPrice);
        this.SetVisualShopPrice(this.finalVisualShop3, this.finalZonePrice);
        this.SetFinalShopInteractorsVisible(false);
    }

    private SetVisualShopPrice(root: Node | null, price: number): void {
        const label = root?.getComponentInChildren(Label);
        if (label) {
            label.string = Math.max(1, Math.floor(price)).toString();
        }
    }

    private ConfigureShop(shop: ShopInteractor | null, price: number): void {
        if (!shop) {
            return;
        }
        shop.ConfigurePrice(EItemType.Money, price);
    }

    private GetAllShops(): ShopInteractor[] {
        const shops = [
            this.upgradeShop,
            this.longConveyorShop,
            this.sellerShop,
            this.finalZoneShop,
        ];
        return shops.filter((shop, index): shop is ShopInteractor => (
            !!shop && shops.indexOf(shop) === index
        ));
    }

    private OnLongConveyorPurchased(): void {
        this.longConveyorUnlocked = true;
        this.ShowNodeAnimated(this.longConveyorRoot);
        this.SetConveyorStorageVisible(false);
        this.MoveCollectedGoldToOrcStorage();
    }

    private MoveCollectedGoldToOrcStorage(): void {
        const source = this.conveyorGoldStorage;
        const destination = this.orcGoldStorage;
        if (!source || !destination || source.Amount <= 0) {
            return;
        }

        const amount = Math.min(source.Amount, this.GetStorageAvailableCapacity(destination));
        if (amount <= 0 || !source.TryTake(amount)) {
            return;
        }

        const from = source.receivePivot?.worldPosition ?? source.node.worldPosition;
        const target = destination.receivePivot ?? destination.node;
        for (let i = 0; i < amount; i++) {
            const launch = () => {
                const onArrived = () => destination.Receive(EItemType.GoldOre, 1);
                const flyingItem = this.flyService && this.goldFlyPrefab
                    ? this.flyService.FlyPrefabToNode(
                        this.goldFlyPrefab,
                        from.clone(),
                        target,
                        onArrived,
                        0.35 + i * 0.02,
                    )
                    : null;
                if (!flyingItem) {
                    onArrived();
                }
            };
            const delay = i * Math.max(0, this.transferItemStaggerDelay);
            delay > 0 ? this.scheduleOnce(launch, delay) : launch();
        }
    }

    private OnSellerPurchased(): void {
        const seller = this.sellerRoot;
        if (!seller) {
            this.sellerUnlocked = true;
            this.TryStartExchange();
            return;
        }

        const spawnPosition = this.sellerShop?.node.worldPosition ?? seller.worldPosition;
        const target = this.sellerMoveTarget ?? this.exchangeInteractor?.node ?? null;
        const targetScale = seller.scale.clone();
        seller.setWorldPosition(spawnPosition);
        seller.setScale(Vec3.ZERO);
        seller.active = true;

        tween(seller)
            .to(0.3, { scale: targetScale }, { easing: 'backOut' })
            .call(() => this.MoveSellerToExchange(target))
            .start();
    }

    private MoveSellerToExchange(target: Node | null): void {
        const seller = this.sellerRoot;
        if (!seller || !target) {
            this.sellerUnlocked = true;
            this.TryStartExchange();
            return;
        }

        const animation = seller.getComponentInChildren(PlayerAnimationController);
        animation?.SetMoving(true);
        const targetPosition = target.worldPosition.clone();
        const directionX = targetPosition.x - seller.worldPosition.x;
        const directionZ = targetPosition.z - seller.worldPosition.z;
        if (directionX * directionX + directionZ * directionZ > 0.0001) {
            const currentRotation = seller.eulerAngles;
            seller.setRotationFromEuler(
                currentRotation.x,
                Math.atan2(directionX, directionZ) * 180 / Math.PI,
                currentRotation.z,
            );
        }
        const duration = Vec3.distance(seller.worldPosition, targetPosition)
            / Math.max(0.1, this.sellerMoveSpeed);
        tween(seller)
            .to(duration, { worldPosition: targetPosition }, { easing: 'linear' })
            .call(() => {
                animation?.SetMoving(false);
                this.sellerUnlocked = true;
                this.TryStartExchange();
            })
            .start();
    }

    private OnFinalZonePurchased(): void {
        this.player?.SetMovementEnabled(false);
        const targets = [...this.finalFenceElements];
        if (this.finalFenceRoot) {
            targets.push(this.finalFenceRoot);
        }
        if (this.finalFenceLock) {
            targets.push(this.finalFenceLock);
        }
        const uniqueTargets = targets.filter((node, index) => !!node && targets.indexOf(node) === index);
        if (uniqueTargets.length === 0) {
            this.RunPlayerToFinalZone();
            return;
        }

        let hidden = 0;
        for (const node of uniqueTargets) {
            Tween.stopAllByTarget(node);
            tween(node)
                .to(Math.max(0.05, this.finalFenceHideDuration), { scale: Vec3.ZERO }, { easing: 'sineIn' })
                .call(() => {
                    node.active = false;
                    hidden++;
                    if (hidden >= uniqueTargets.length) {
                        this.RunPlayerToFinalZone();
                    }
                })
                .start();
        }
    }

    private RunPlayerToFinalZone(): void {
        const showPackshot = () => {
            this.player?.SetMovementEnabled(false);
            this.SetState(EGameFlowState.Packshot);
        };
        if (this.player && this.finalZoneRunTarget) {
            this.player.RunAutomaticallyTo(this.finalZoneRunTarget, showPackshot);
        } else {
            showPackshot();
        }
    }

    private ShowConveyorAnimated(): void {
        const root = this.conveyorRoot;
        if (!root) {
            return;
        }

        const targetScale = root.scale.clone();
        root.setScale(Vec3.ZERO);
        root.active = true;

        tween(root)
            .to(0.3, { scale: targetScale }, { easing: 'backOut' })
            .call(() => this.StartAutoConveyor())
            .start();
    }

    private ShowNodeAnimated(root: Node | null): void {
        if (!root) {
            return;
        }
        const targetScale = root.scale.clone();
        root.setScale(new Vec3(0.01, 0.01, 0.01));
        root.active = true;
        tween(root)
            .to(0.3, { scale: targetScale }, { easing: 'backOut' })
            .start();
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
        if (
            this.conveyorRunning
            || !this.conveyorRoot
            || !this.goldFlyPrefab
            || (!this.conveyorGoldStorage && !this.orcGoldStorage)
        ) {
            return;
        }

        this.conveyorSpawnPoint = this.conveyorRoot.getChildByName('Start');
        if (!this.conveyorSpawnPoint) {
            console.error('[GameFlowController] ConveyorRoot/Start is missing; automatic gold delivery is disabled.');
            return;
        }

        this.conveyorRunning = true;
        this.conveyorSpawnTimer = 0;
        this.SpawnConveyorGold();
    }

    private StopAutoConveyor(): void {
        this.conveyorRunning = false;
        this.conveyorSpawnTimer = 0;

        for (const itemState of this.conveyorItems) {
            if (itemState.node?.isValid) {
                itemState.node.destroy();
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
        this.conveyorItems.push({ node: item, pathIndex: 0 });
    }

    private GetActiveConveyorPath(): Node[] {
        const configuredShortPath = this.shortConveyorPath.filter((node) => !!node?.isValid);
        const fallbackShortEnd = this.conveyorRoot?.getChildByName('ShortConveyorEnd') ?? null;
        const path = configuredShortPath.length > 0
            ? configuredShortPath
            : fallbackShortEnd ? [fallbackShortEnd] : [];
        if (this.longConveyorUnlocked) {
            const configuredLongPath = this.longConveyorPath.filter((node) => !!node?.isValid);
            if (configuredLongPath.length > 0) {
                path.push(...configuredLongPath);
            } else {
                const root = this.longConveyorRoot;
                for (const name of ['LongConveyorPoint_1', 'LongConveyorPoint_2', 'LongConveyorEnd']) {
                    const point = root?.getChildByName(name);
                    if (point) {
                        path.push(point);
                    }
                }
            }
        }
        return path;
    }

    private TryDeliverConveyorGold(
        itemIndex: number,
        itemState: IConveyorGoldItem,
        storage: StorageInteractor | null,
    ): void {
        if (!storage) {
            return;
        }
        const pending = this.conveyorDeliveriesInFlight.get(storage) ?? 0;
        if (!storage.CanReceive(EItemType.GoldOre, pending + 1)) {
            return;
        }

        this.conveyorDeliveriesInFlight.set(storage, pending + 1);
        this.conveyorItems.splice(itemIndex, 1);
        const item = itemState.node;
        const target = storage.receivePivot ?? storage.node;
        const onArrived = () => {
            const remainingPending = Math.max(
                0,
                (this.conveyorDeliveriesInFlight.get(storage) ?? 1) - 1,
            );
            if (remainingPending > 0) {
                this.conveyorDeliveriesInFlight.set(storage, remainingPending);
            } else {
                this.conveyorDeliveriesInFlight.delete(storage);
            }
            if (item?.isValid) {
                item.destroy();
            }
            storage.Receive(EItemType.GoldOre, 1);
        };
        if (this.flyService && item?.isValid) {
            this.flyService.FlyExistingToNode(item, target, onArrived, 0.3, 1.2);
        } else {
            onArrived();
        }
    }

    private GetStorageAvailableCapacity(storage: StorageInteractor): number {
        const pending = this.conveyorDeliveriesInFlight.get(storage) ?? 0;
        return Math.max(0, storage.capacity - storage.Amount - pending);
    }

    private SetConveyorVisible(value: boolean): void {
        if (this.conveyorRoot) {
            this.conveyorRoot.active = value;
        }
    }

    private SetLongConveyorVisible(value: boolean): void {
        if (this.longConveyorRoot) {
            this.longConveyorRoot.active = value;
        }
    }

    private SetConveyorStorageVisible(value: boolean): void {
        if (this.conveyorGoldStorage) {
            this.conveyorGoldStorage.node.active = value;
        }
    }

    private SetMoneyStorageVisible(value: boolean): void {
        const root = this.moneyStorage?.node;
        if (!root) {
            return;
        }

        Tween.stopAllByTarget(root);
        root.active = value;
    }

    private RevealMoneyStorage(): void {
        const root = this.moneyStorage?.node;
        if (!root || root.active) {
            return;
        }

        this.ShowNodeAnimated(root);
    }

    private SetUpgradeShopVisible(value: boolean): void {
        const root = this.upgradeShop?.node;
        if (!root) {
            return;
        }

        Tween.stopAllByTarget(root);
        root.active = value;
    }

    private RevealUpgradeShop(): void {
        const root = this.upgradeShop?.node;
        if (!root || root.active) {
            return;
        }

        this.ShowNodeAnimated(root);
    }

    private SetSellerVisible(value: boolean): void {
        if (this.sellerRoot) {
            this.sellerRoot.active = value;
        }
    }

    private SetFinalShopInteractorsVisible(value: boolean): void {
        for (const shop of [this.longConveyorShop, this.sellerShop, this.finalZoneShop]) {
            if (shop) {
                shop.node.active = value;
            }
        }
    }

    private SetFinalVisualShopsVisible(value: boolean): void {
        for (const shop of [this.finalVisualShop1, this.finalVisualShop2, this.finalVisualShop3]) {
            if (shop) {
                shop.active = value;
            }
        }
    }

}
