import { _decorator, CCFloat, CCInteger, Component, instantiate, Material, MeshRenderer, Node, Prefab, tween, Tween, Vec3 } from 'cc';
import { TweenUtils } from '../../Utills/TweenUtils';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

@ccclass('VacuumSystem')
export class VacuumSystem extends Component {
    @property(Node)
    public tubeHead: Node | null = null;

    @property(Node)
    public machinePivot: Node | null = null;

    @property(Node)
    public sandStartPoint: Node | null = null;

    @property(Node)
    public tubeHeadHomePivot: Node | null = null;

    @property(Node)
    public playerHandPivot: Node | null = null;

    @property(Node)
    public playerFacingRoot: Node | null = null;

    @property(Node)
    public backpackTubeRoot: Node | null = null;

    @property(Prefab)
    public tubePartPrefab: Prefab | null = null;

    @property(Node)
    public tubePartsRoot: Node | null = null;

    @property(Material)
    public normalTubeMaterial: Material | null = null;

    @property(Material)
    public warningTubeMaterial: Material | null = null;

    @property(Node)
    public windRoot: Node | null = null;

    @property({ type: CCFloat })
    public segmentLength: number = 0.75;

    @property({ type: CCFloat })
    public bendAmplitude: number = 0.35;

    @property({ type: CCFloat })
    public headFlyDuration: number = 0.35;

    @property({ type: CCFloat })
    public baseMaxLength: number = 5;

    @property({ type: CCFloat })
    public upgradeLengthAdd: number = 3;

    @property({ type: CCInteger })
    public maxUpgradeLevel: number = 2;

    @property({ type: CCFloat })
    public warningBlinkInterval: number = 0.16;

    private active: boolean = false;
    private upgradeLevel: number = 0;
    private warning: boolean = false;
    private warningTimer: number = 0;
    private warningBlinkState: boolean = false;
    private tubeParts: Node[] = [];
    private activeTubePartCount: number = 0;
    private headAttached: boolean = false;
    private returningHome: boolean = false;
    private headTransitionVersion: number = 0;

    public get IsActive(): boolean {
        return this.active;
    }

    public get UpgradeLevel(): number {
        return this.upgradeLevel;
    }

    public get CurrentMaxLength(): number {
        return this.baseMaxLength + this.upgradeLengthAdd * this.upgradeLevel;
    }

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.tubeHead, 'tubeHead');
        RequiredReference.CheckNode(this, this.machinePivot, 'machinePivot');
        RequiredReference.CheckNode(this, this.sandStartPoint, 'sandStartPoint');
        RequiredReference.CheckNode(this, this.tubeHeadHomePivot, 'tubeHeadHomePivot');
        RequiredReference.CheckNode(this, this.playerHandPivot, 'playerHandPivot');
        RequiredReference.CheckNode(this, this.playerFacingRoot, 'playerFacingRoot');
        this.backpackTubeRoot ??= this.FindDescendantByName(this.playerFacingRoot, 'TubeRoot');
        RequiredReference.CheckNode(this, this.backpackTubeRoot, 'backpackTubeRoot');
        RequiredReference.Check(this, this.tubePartPrefab, 'tubePartPrefab');
        RequiredReference.CheckNode(this, this.tubePartsRoot, 'tubePartsRoot');
        this.SnapHeadHome();
        this.SetVisualActive(false);
    }

    protected update(dt: number): void {
        if (!this.active && !this.returningHome) {
            return;
        }

        if (this.active && this.headAttached) {
            this.SyncHeadToHand();
        }
        this.RebuildTube();
        if (this.active) {
            this.UpdateWarningBlink(dt);
        }
    }

    public Activate(): void {
        if (!this.tubeHead || !this.playerHandPivot) {
            return;
        }

        Tween.stopAllByTarget(this.tubeHead);
        const transitionVersion = ++this.headTransitionVersion;
        this.active = true;
        this.returningHome = false;
        this.headAttached = false;
        this.SetVisualActive(true);
        TweenUtils.FlyTweenWithMidlePointAndScaleToNode(
            this.tubeHead,
            new Vec3(0, 1.2, 0),
            this.playerHandPivot,
            1.15,
            () => {
                if (transitionVersion !== this.headTransitionVersion) {
                    return;
                }
                this.headAttached = true;
                this.SyncHeadToHand();
            },
            this.headFlyDuration,
        );
    }

    public Deactivate(): void {
        this.active = false;
        this.headAttached = false;
        this.SetWarning(false);
        if (!this.tubeHead || !this.tubeHeadHomePivot) {
            this.returningHome = false;
            this.SetVisualActive(false);
            this.EnsureSegmentCount(0);
            return;
        }

        Tween.stopAllByTarget(this.tubeHead);
        const transitionVersion = ++this.headTransitionVersion;
        this.returningHome = true;
        this.SetVisualActive(true);
        TweenUtils.FlyTweenWithMidlePointAndScaleToNode(
            this.tubeHead,
            new Vec3(0, 0.8, 0),
            this.tubeHeadHomePivot,
            1.05,
            () => {
                if (transitionVersion !== this.headTransitionVersion) {
                    return;
                }
                this.returningHome = false;
                this.SnapHeadHome();
                this.SetVisualActive(false);
                this.EnsureSegmentCount(0);
            },
            this.headFlyDuration,
        );
    }

    public UpgradeLength(): boolean {
        if (this.upgradeLevel >= this.maxUpgradeLevel) {
            return false;
        }

        this.upgradeLevel++;
        tween(this.node)
            .to(0.12, { scale: new Vec3(1.08, 1.08, 1.08) })
            .to(0.12, { scale: Vec3.ONE })
            .start();
        return true;
    }

    public GetLimitedPlayerPosition(desiredWorldPosition: Vec3): Vec3 {
        if (!this.active || !this.sandStartPoint) {
            this.SetWarning(false);
            return desiredWorldPosition;
        }

        const anchor = this.sandStartPoint.worldPosition;
        const dx = desiredWorldPosition.x - anchor.x;
        const dz = desiredWorldPosition.z - anchor.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const maxLength = this.CurrentMaxLength;

        if (distance <= maxLength || distance <= 0.001) {
            this.SetWarning(false);
            return desiredWorldPosition;
        }

        this.SetWarning(true);
        const scale = maxLength / distance;
        return new Vec3(anchor.x + dx * scale, desiredWorldPosition.y, anchor.z + dz * scale);
    }

    private SetVisualActive(value: boolean): void {
        if (this.tubeHead) {
            this.tubeHead.active = value;
        }
        if (this.windRoot) {
            this.windRoot.active = value;
        }
        if (this.tubePartsRoot) {
            this.tubePartsRoot.active = value;
        }
    }

    private SyncHeadToHand(): void {
        if (!this.tubeHead || !this.playerHandPivot) {
            return;
        }

        this.tubeHead.setWorldPosition(this.playerHandPivot.worldPosition);
        this.tubeHead.setWorldRotation(this.playerFacingRoot?.worldRotation ?? this.playerHandPivot.worldRotation);
    }

    private SnapHeadHome(): void {
        if (!this.tubeHead || !this.tubeHeadHomePivot) {
            return;
        }

        this.tubeHead.setWorldPosition(this.tubeHeadHomePivot.worldPosition);
        this.tubeHead.setWorldRotation(this.tubeHeadHomePivot.worldRotation);
    }

    private RebuildTube(): void {
        if (!this.machinePivot || !this.backpackTubeRoot) {
            return;
        }

        const start = this.machinePivot.worldPosition;
        const end = this.backpackTubeRoot.worldPosition;
        const distance = Vec3.distance(start, end);
        const count = Math.max(1, Math.ceil(distance / Math.max(0.1, this.segmentLength)));
        this.EnsureSegmentCount(count);
        const directionX = end.x - start.x;
        const directionZ = end.z - start.z;
        const hasDirection = directionX * directionX + directionZ * directionZ > 0.001;
        const yaw = hasDirection
            ? Math.atan2(directionX, directionZ) * 180 / Math.PI
            : 0;

        for (let i = 0; i < this.activeTubePartCount; i++) {
            const t = (i + 0.5) / count;
            const part = this.tubeParts[i];
            part.setWorldPosition(
                start.x + directionX * t,
                start.y + (end.y - start.y) * t + Math.sin(t * Math.PI) * this.bendAmplitude,
                start.z + directionZ * t,
            );
            if (hasDirection) {
                part.setRotationFromEuler(0, yaw, 0);
            }
        }
    }

    private EnsureSegmentCount(count: number): void {
        if (!this.tubePartsRoot || !this.tubePartPrefab) {
            return;
        }

        while (this.tubeParts.length < count) {
            const part = instantiate(this.tubePartPrefab);
            this.tubePartsRoot.addChild(part);
            this.tubeParts.push(part);
            this.ApplyMaterial(part, this.warning && this.warningBlinkState ? this.warningTubeMaterial : this.normalTubeMaterial);
        }

        for (let i = 0; i < this.tubeParts.length; i++) {
            this.tubeParts[i].active = i < count;
        }
        this.activeTubePartCount = count;
    }

    private SetWarning(value: boolean): void {
        if (this.warning === value) {
            return;
        }

        this.warning = value;
        this.warningTimer = 0;
        this.warningBlinkState = false;
        this.ApplyTubeMaterial(this.normalTubeMaterial);
    }

    private UpdateWarningBlink(dt: number): void {
        if (!this.warning) {
            return;
        }

        this.warningTimer += dt;
        if (this.warningTimer < this.warningBlinkInterval) {
            return;
        }

        this.warningTimer = 0;
        this.warningBlinkState = !this.warningBlinkState;
        this.ApplyTubeMaterial(this.warningBlinkState ? this.warningTubeMaterial : this.normalTubeMaterial);
    }

    private ApplyTubeMaterial(material: Material | null): void {
        for (const part of this.tubeParts) {
            this.ApplyMaterial(part, material);
        }
        if (this.tubeHead) {
            this.ApplyMaterial(this.tubeHead, material);
        }
    }

    private ApplyMaterial(node: Node, material: Material | null): void {
        if (!material) {
            return;
        }

        const renderers = node.getComponentsInChildren(MeshRenderer);
        for (const renderer of renderers) {
            renderer.setMaterial(material, 0);
        }
    }

    private FindDescendantByName(root: Node | null, name: string): Node | null {
        if (!root) {
            return null;
        }
        if (root.name === name) {
            return root;
        }

        for (const child of root.children) {
            const match = this.FindDescendantByName(child, name);
            if (match) {
                return match;
            }
        }
        return null;
    }
}
