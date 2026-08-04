import { _decorator, CCFloat, Component, instantiate, Node, NodePool, Prefab, Quat, Tween, Vec3 } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';
import { TweenUtils } from '../../Utills/TweenUtils';

const { ccclass, property } = _decorator;

@ccclass('ItemFlyService')
export class ItemFlyService extends Component {
    @property(Node)
    public flyRoot: Node | null = null;

    @property({ type: CCFloat })
    public defaultDuration: number = 0.35;

    @property({ type: CCFloat, min: 0 })
    public defaultArcHeight: number = 1.8;

    @property({ type: CCFloat, min: 1, tooltip: 'Scale multiplier applied to resources while they are flying.' })
    public flightScaleMultiplier: number = 1.7;

    @property({ type: CCFloat, min: 1, tooltip: 'Largest scale reached near the top of a resource flight.' })
    public flightPeakScale: number = 2.4;

    @property({ type: CCFloat, min: 0, tooltip: 'Horizontal spread of consecutive resource flight arcs.' })
    public flightArcSpread: number = 0.55;

    private flightSequence: number = 0;
    private readonly prefabPools: Map<Prefab, NodePool> = new Map();
    private readonly prefabScales: WeakMap<Node, Vec3> = new WeakMap();
    private readonly prefabRotations: WeakMap<Node, Quat> = new WeakMap();

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.flyRoot, 'flyRoot');
    }

    protected onDestroy(): void {
        this.prefabPools.forEach((pool) => pool.clear());
        this.prefabPools.clear();
    }

    public FlyPrefabToNode(
        prefab: Prefab,
        fromWorld: Vec3,
        target: Node,
        onComplete?: () => void,
        duration: number = this.defaultDuration,
        arcHeight: number = this.defaultArcHeight,
        matchTargetWorldTransform: boolean = false,
    ): Node | null {
        if (!this.flyRoot || !prefab || !target) {
            console.error('[ItemFlyService] Missing flyRoot, prefab or target.');
            return null;
        }

        const item = this.AcquirePrefab(prefab);
        this.flyRoot.addChild(item);
        item.setWorldPosition(fromWorld);
        this.EnlargeFlyingItem(item);

        TweenUtils.FlyTweenWithMidlePointAndScaleToNode(
            item,
            this.CreateFlightArcOffset(arcHeight),
            target,
            Math.max(item.scale.x, this.flightPeakScale),
            () => {
                this.ReleasePrefab(prefab, item);
                onComplete && onComplete();
            },
            duration,
            matchTargetWorldTransform,
        );

        return item;
    }

    private AcquirePrefab(prefab: Prefab): Node {
        let pool = this.prefabPools.get(prefab);
        if (!pool) {
            pool = new NodePool();
            this.prefabPools.set(prefab, pool);
        }

        const item = pool.size() > 0 ? pool.get()! : instantiate(prefab);
        if (!this.prefabScales.has(item)) {
            this.prefabScales.set(item, item.scale.clone());
            this.prefabRotations.set(item, item.rotation.clone());
        }

        Tween.stopAllByTarget(item);
        item.active = true;
        item.setScale(this.prefabScales.get(item)!);
        item.setRotation(this.prefabRotations.get(item)!);
        return item;
    }

    private ReleasePrefab(prefab: Prefab, item: Node): void {
        if (!item?.isValid) {
            return;
        }

        Tween.stopAllByTarget(item);
        const pool = this.prefabPools.get(prefab);
        if (pool) {
            pool.put(item);
        } else {
            item.destroy();
        }
    }

    public FlyExistingToNode(
        item: Node,
        target: Node,
        onComplete?: () => void,
        duration: number = this.defaultDuration,
        arcHeight: number = this.defaultArcHeight,
        matchTargetWorldTransform: boolean = false,
    ): void {
        if (!item || !target) {
            console.error('[ItemFlyService] Missing item or target.');
            return;
        }

        this.EnlargeFlyingItem(item);

        TweenUtils.FlyTweenWithMidlePointAndScaleToNode(
            item,
            this.CreateFlightArcOffset(arcHeight),
            target,
            Math.max(item.scale.x, this.flightPeakScale),
            () => onComplete && onComplete(),
            duration,
            matchTargetWorldTransform,
        );
    }

    private EnlargeFlyingItem(item: Node): void {
        const multiplier = Math.max(1, this.flightScaleMultiplier);
        const scale = item.scale;
        item.setScale(scale.x * multiplier, scale.y * multiplier, scale.z * multiplier);
    }

    private CreateFlightArcOffset(arcHeight: number): Vec3 {
        const sequence = this.flightSequence++;
        const angle = sequence * 2.399963229728653;
        const spread = Math.max(0, this.flightArcSpread) * (0.7 + sequence % 3 * 0.15);
        return new Vec3(
            Math.cos(angle) * spread,
            Math.max(0, arcHeight),
            Math.sin(angle) * spread,
        );
    }
}
