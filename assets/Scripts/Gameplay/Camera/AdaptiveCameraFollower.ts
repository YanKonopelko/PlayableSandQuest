import { _decorator, Camera, CCFloat, Component, Node, Quat, Vec3, view } from 'cc';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

@ccclass('AdaptiveCameraFollower')
export class AdaptiveCameraFollower extends Component {
    @property(Node)
    public target: Node | null = null;

    @property(Camera)
    public camera: Camera | null = null;

    @property({ type: CCFloat })
    public baseHeight: number = 7.5;

    @property({ type: CCFloat })
    public baseDistance: number = 7.5;

    @property({ type: CCFloat })
    public wideDistanceBonus: number = 4;

    @property({ type: CCFloat })
    public minAspect: number = 0.55;

    @property({ type: CCFloat })
    public maxAspect: number = 1.8;

    @property({ type: CCFloat })
    public followLerp: number = 8;

    @property({ type: CCFloat })
    public pitch: number = -48;

    @property({ type: CCFloat })
    public yaw: number = 0;

    private readonly targetPosition: Vec3 = new Vec3();
    private readonly offset: Vec3 = new Vec3();

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.target, 'target');
        if (!this.camera) {
            this.camera = this.getComponent(Camera);
        }
    }

    protected lateUpdate(dt: number): void {
        if (!this.target) {
            return;
        }

        const aspect = this.GetAspect();
        const normalizedWide = Math.max(0, Math.min(1, (aspect - this.minAspect) / Math.max(0.001, this.maxAspect - this.minAspect)));
        const distance = this.baseDistance + this.wideDistanceBonus * normalizedWide;

        this.offset.set(0, this.baseHeight, distance);
        this.target.getWorldPosition(this.targetPosition);
        this.targetPosition.add(this.offset);

        const current = this.node.worldPosition;
        const lerp = Math.min(1, this.followLerp * dt);
        const next = new Vec3();
        Vec3.lerp(next, current, this.targetPosition, lerp);
        this.node.setWorldPosition(next);

        const rotation = new Quat();
        Quat.fromEuler(rotation, this.pitch, this.yaw, 0);
        this.node.setWorldRotation(rotation);
    }

    private GetAspect(): number {
        const size = view.getVisibleSize();
        return size.height <= 0 ? 1 : size.width / size.height;
    }
}
