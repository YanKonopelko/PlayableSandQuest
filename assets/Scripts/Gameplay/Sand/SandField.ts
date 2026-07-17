import { _decorator, CCFloat, Component, Node, Vec3 } from 'cc';
import { SandCollectableOre } from './SandCollectableOre';
import { VacuumSystem } from '../Vacuum/VacuumSystem';

const { ccclass, property } = _decorator;

@ccclass('SandField')
export class SandField extends Component {
    @property(VacuumSystem)
    public vacuumSystem: VacuumSystem | null = null;

    @property(Node)
    public vacuumProbe: Node | null = null;

    @property(Node)
    public sandCell1: Node | null = null;

    @property(Node)
    public sandCell2: Node | null = null;

    @property(Node)
    public sandCell3: Node | null = null;

    @property(Node)
    public sandCell4: Node | null = null;

    @property(SandCollectableOre)
    public ore1: SandCollectableOre | null = null;

    @property(SandCollectableOre)
    public ore2: SandCollectableOre | null = null;

    @property(SandCollectableOre)
    public ore3: SandCollectableOre | null = null;

    @property(SandCollectableOre)
    public ore4: SandCollectableOre | null = null;

    @property({ type: CCFloat })
    public collectRadius: number = 0.8;

    @property({ type: CCFloat })
    public tickInterval: number = 0.05;

    private tickTimer: number = 0;
    private collectedCells: number = 0;

    public get CollectedCells(): number {
        return this.collectedCells;
    }

    protected update(dt: number): void {
        if (!this.vacuumSystem?.IsActive || !this.vacuumProbe) {
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
        const radiusSqr = this.collectRadius * this.collectRadius;

        for (const cell of this.GetSandCells()) {
            if (!cell || !cell.active) {
                continue;
            }

            if (this.DistanceXZSqr(cell.worldPosition, worldPosition) <= radiusSqr) {
                cell.active = false;
                this.collectedCells++;
            }
        }

        for (const ore of [this.ore1, this.ore2, this.ore3, this.ore4]) {
            ore?.TryCollectFrom(this.vacuumProbe);
        }
    }

    public ResetField(): void {
        this.collectedCells = 0;
        for (const cell of this.GetSandCells()) {
            if (cell) {
                cell.active = true;
            }
        }
    }

    private DistanceXZSqr(a: Vec3, b: Vec3): number {
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return dx * dx + dz * dz;
    }

    private GetSandCells(): Array<Node | null> {
        return [this.sandCell1, this.sandCell2, this.sandCell3, this.sandCell4];
    }
}
