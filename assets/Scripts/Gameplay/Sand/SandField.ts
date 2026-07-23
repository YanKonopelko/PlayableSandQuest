import { _decorator, BoxCollider, CCFloat, Collider, Component, ITriggerEvent, Node, Vec3 } from 'cc';
import { SandCollectableOre } from './SandCollectableOre';
import { VacuumSystem } from '../Vacuum/VacuumSystem';
import { PlayerController } from '../Player/PlayerController';
import { RequiredReference } from '../Core/RequiredReference';
import { SandVolumeSurface } from './SandVolumeSurface';
import { CustomActionWithParam } from '../../Utills/CustomActions';
import { SandOreAreaBuilder } from './SandOreAreaBuilder';

const { ccclass, property } = _decorator;

@ccclass('SandField')
export class SandField extends Component {
    @property(VacuumSystem)
    public vacuumSystem: VacuumSystem | null = null;

    @property(Node)
    public vacuumProbe: Node | null = null;

    @property(BoxCollider)
    public zoneCollider: BoxCollider | null = null;

    @property(Node)
    public playerRoot: Node | null = null;

    @property(PlayerController)
    public playerController: PlayerController | null = null;

    @property(SandVolumeSurface)
    public surface: SandVolumeSurface | null = null;

    @property(SandOreAreaBuilder)
    public oreBuilder: SandOreAreaBuilder | null = null;

    @property({ type: CCFloat })
    public collectRadius: number = 0.8;

    @property({ type: CCFloat })
    public tickInterval: number = 0.05;

    private tickTimer: number = 0;
    private readonly playerColliders: Set<Collider> = new Set<Collider>();

    public readonly onPlayerExit: CustomActionWithParam<SandField> = new CustomActionWithParam<SandField>();

    public get CollectedCells(): number {
        return this.surface?.ErasedCellCount ?? 0;
    }

    protected onLoad(): void {
        RequiredReference.Check(this, this.vacuumSystem, 'vacuumSystem');
        RequiredReference.CheckNode(this, this.vacuumProbe, 'vacuumProbe');
        RequiredReference.Check(this, this.zoneCollider, 'zoneCollider');
        RequiredReference.CheckNode(this, this.playerRoot, 'playerRoot');
        RequiredReference.Check(this, this.playerController, 'playerController');
        RequiredReference.Check(this, this.surface, 'surface');
        RequiredReference.Check(this, this.oreBuilder, 'oreBuilder');
    }

    protected start(): void {
        this.oreBuilder?.RebuildNow();
    }

    protected onEnable(): void {
        this.zoneCollider?.on('onTriggerEnter', this.OnTriggerEnter, this);
        this.zoneCollider?.on('onTriggerExit', this.OnTriggerExit, this);
    }

    protected onDisable(): void {
        this.zoneCollider?.off('onTriggerEnter', this.OnTriggerEnter, this);
        this.zoneCollider?.off('onTriggerExit', this.OnTriggerExit, this);
        this.playerColliders.clear();
    }

    protected update(dt: number): void {
        if (this.playerColliders.size === 0 || !this.vacuumSystem?.IsActive || !this.vacuumProbe) {
            return;
        }

        this.tickTimer += dt;
        if (this.tickTimer < this.tickInterval) {
            return;
        }

        this.tickTimer = 0;
        this.CollectAt(this.vacuumProbe.worldPosition);
    }

    public CollectAt(worldPosition: Vec3): void {
        this.surface?.Erase(worldPosition, this.collectRadius);

        for (const ore of this.GetOres()) {
            if (ore?.isValid) {
                ore.TryCollectAt(worldPosition);
            }
        }
    }

    public ResetField(): void {
        this.tickTimer = 0;
        this.surface?.ResetSurface();
        this.oreBuilder?.RebuildWithNextSeed();
    }

    private OnTriggerEnter(event: ITriggerEvent): void {
        const collider = event.otherCollider;
        if (!this.IsPlayer(collider.node)) {
            return;
        }

        this.playerColliders.add(collider);
    }

    private OnTriggerExit(event: ITriggerEvent): void {
        const collider = event.otherCollider;
        if (!this.IsPlayer(collider.node)) {
            return;
        }

        this.playerColliders.delete(collider);
        if (this.playerColliders.size > 0) {
            return;
        }

        this.ResetField();
        this.vacuumSystem?.Deactivate();
        this.playerController?.SetVacuumVisualEnabled(false);
        this.onPlayerExit.Invoke(this);
    }

    private IsPlayer(node: Node): boolean {
        const playerRoot = this.playerRoot;
        let current: Node | null = node;
        while (current) {
            if (current === playerRoot) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    private GetOres(): readonly SandCollectableOre[] {
        return this.oreBuilder?.GetOres() ?? [];
    }
}
