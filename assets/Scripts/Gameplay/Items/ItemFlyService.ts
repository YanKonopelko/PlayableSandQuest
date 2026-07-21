import { _decorator, CCFloat, Component, instantiate, Node, Prefab, Vec3 } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';
import { TweenUtils } from '../../Utills/TweenUtils';

const { ccclass, property } = _decorator;

@ccclass('ItemFlyService')
export class ItemFlyService extends Component {
    @property(Node)
    public flyRoot: Node | null = null;

    @property({ type: CCFloat })
    public defaultDuration: number = 0.35;

    @property({ type: CCFloat })
    public defaultArcHeight: number = 1.2;

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.flyRoot, 'flyRoot');
    }

    public FlyPrefabToNode(
        prefab: Prefab,
        fromWorld: Vec3,
        target: Node,
        onComplete?: () => void,
        duration: number = this.defaultDuration,
        arcHeight: number = this.defaultArcHeight,
    ): Node | null {
        if (!this.flyRoot || !prefab || !target) {
            console.error('[ItemFlyService] Missing flyRoot, prefab or target.');
            return null;
        }

        const item = instantiate(prefab);
        this.flyRoot.addChild(item);
        item.setWorldPosition(fromWorld);

        TweenUtils.FlyTweenWithMidlePointAndScaleToNode(
            item,
            new Vec3(0, arcHeight, 0),
            target,
            1.25,
            () => {
                item.destroy();
                onComplete && onComplete();
            },
            duration,
        );

        return item;
    }

    public FlyExistingToNode(
        item: Node,
        target: Node,
        onComplete?: () => void,
        duration: number = this.defaultDuration,
        arcHeight: number = this.defaultArcHeight,
    ): void {
        if (!item || !target) {
            console.error('[ItemFlyService] Missing item or target.');
            return;
        }

        TweenUtils.FlyTweenWithMidlePointAndScaleToNode(
            item,
            new Vec3(0, arcHeight, 0),
            target,
            1.25,
            () => onComplete && onComplete(),
            duration,
        );
    }
}
