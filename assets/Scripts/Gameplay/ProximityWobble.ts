import { _decorator, Component, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('ProximityWobble')
export class ProximityWobble extends Component {
    @property(Node)
    public player: Node | null = null;

    @property({ min: 0, tooltip: 'Distance on the XZ plane at which the wobble starts.' })
    public activationDistance: number = 4;

    @property({ min: 0, tooltip: 'Maximum sideways tilt in degrees.' })
    public tiltAngle: number = 8;

    @property({ min: 0, tooltip: 'Number of wobble cycles per second.' })
    public frequency: number = 1.5;

    @property({ min: 0, tooltip: 'How quickly the wobble fades in and out.' })
    public blendSpeed: number = 6;

    private readonly baseEuler: Vec3 = new Vec3();
    private readonly objectWorldPosition: Vec3 = new Vec3();
    private readonly playerWorldPosition: Vec3 = new Vec3();
    private phase: number = 0;
    private blendWeight: number = 0;

    protected onLoad(): void {
        this.baseEuler.set(this.node.eulerAngles);
    }

    protected update(deltaTime: number): void {
        const player = this.player;
        if (!player?.isValid) {
            this.ResetRotation();
            return;
        }

        this.node.getWorldPosition(this.objectWorldPosition);
        player.getWorldPosition(this.playerWorldPosition);

        const dx = this.objectWorldPosition.x - this.playerWorldPosition.x;
        const dz = this.objectWorldPosition.z - this.playerWorldPosition.z;
        const activationDistance = Math.max(0, this.activationDistance);
        const isPlayerNear = dx * dx + dz * dz <= activationDistance * activationDistance;
        const targetWeight = isPlayerNear ? 1 : 0;
        const blendFactor = 1 - Math.exp(-Math.max(0, this.blendSpeed) * deltaTime);

        this.blendWeight += (targetWeight - this.blendWeight) * blendFactor;

        if (this.blendWeight <= 0.001 && !isPlayerNear) {
            this.blendWeight = 0;
            this.phase = 0;
            this.ResetRotation();
            return;
        }

        this.phase += Math.max(0, this.frequency) * Math.PI * 2 * deltaTime;
        const tilt = Math.sin(this.phase) * Math.max(0, this.tiltAngle) * this.blendWeight;
        this.node.setRotationFromEuler(this.baseEuler.x, this.baseEuler.y, this.baseEuler.z + tilt);
    }

    protected onDisable(): void {
        this.blendWeight = 0;
        this.phase = 0;
        this.ResetRotation();
    }

    private ResetRotation(): void {
        this.node.setRotationFromEuler(this.baseEuler);
    }
}
