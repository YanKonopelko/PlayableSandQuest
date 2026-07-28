import { _decorator, CCFloat, CCInteger, Component, instantiate, Material, MeshRenderer, Node, Prefab, tween, Tween, Vec3 } from 'cc';
import { TweenUtils } from '../../Utills/TweenUtils';
import { RequiredReference } from '../Core/RequiredReference';
import { SoundManager } from '../../Sounds/SoundManager';
import { ESoundType } from '../../Sounds/SoundPreset';

const { ccclass, property } = _decorator;

@ccclass('VacuumSystem')
export class VacuumSystem extends Component {
    @property(Node)
    public tubeHead: Node | null = null;
  @property(Node)
    public tubePartsRootHead: Node | null = null;
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

    @property(Prefab)
    public tubePartPrefab: Prefab | null = null;

    @property(Node)
    public tubePartsRoot: Node | null = null;

    @property(Material)
    public normalHeadMaterial: Material | null = null;

    @property(Material)
    public warningHeadMaterial: Material | null = null;

    @property(Material)
    public normalHoseMaterial: Material | null = null;

    @property(Material)
    public warningHoseMaterial: Material | null = null;

    @property(Node)
    public windRoot: Node | null = null;

    @property({ type: CCFloat })
    public segmentLength: number = 0.75;

    @property({ type: CCFloat })
    public bendAmplitude: number = 0.35;

    @property({ type: CCFloat, min: 0.1, tooltip: 'Horizontal distance kept between the hose and the player.' })
    public playerHoseClearance: number = 0.8;

    @property({ type: CCFloat, min: 0.1, tooltip: 'How far behind the player the hose is routed.' })
    public hoseBehindDistance: number = 0.9;

    @property({ type: CCFloat, min: 0.05, tooltip: 'Minimum control distance used to keep the hose curve broad.' })
    public hoseCornerRadius: number = 0.35;

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
    private hoseSideSign: number = 1;
    private readonly routeControlPoints: Vec3[] = Array.from({ length: 4 }, () => new Vec3());
    private readonly routePoints: Vec3[] = Array.from({ length: 512 }, () => new Vec3());
    private readonly routeTangents: Vec3[] = Array.from({ length: 512 }, () => new Vec3());
    private readonly routeSegmentLengths: number[] = new Array<number>(511).fill(0);
    private readonly playerForward: Vec3 = new Vec3(0, 0, 1);
    private readonly playerRight: Vec3 = new Vec3(1, 0, 0);
    private readonly curvePosition: Vec3 = new Vec3();
    private readonly curveTangent: Vec3 = new Vec3();
    private readonly tangentRoute = {
        x: 0,
        z: 0,
        angle: 0,
        angleDelta: 0,
        directionSign: 1,
    };

    public get IsActive(): boolean {
        return this.active;
    }

    public get UpgradeLevel(): number {
        return this.upgradeLevel;
    }

    public get CurrentMaxLength(): number {
        return this.baseMaxLength + this.upgradeLengthAdd * this.upgradeLevel;
    }

    public get IsAtMaxLength(): boolean {
        return this.warning;
    }

    protected onLoad(): void {
        RequiredReference.CheckNode(this, this.tubeHead, 'tubeHead');
        RequiredReference.CheckNode(this, this.machinePivot, 'machinePivot');
        RequiredReference.CheckNode(this, this.sandStartPoint, 'sandStartPoint');
        RequiredReference.CheckNode(this, this.tubeHeadHomePivot, 'tubeHeadHomePivot');
        RequiredReference.CheckNode(this, this.playerHandPivot, 'playerHandPivot');
        RequiredReference.CheckNode(this, this.playerFacingRoot, 'playerFacingRoot');
        RequiredReference.Check(this, this.tubePartPrefab, 'tubePartPrefab');
        RequiredReference.CheckNode(this, this.tubePartsRoot, 'tubePartsRoot');
        this.ApplyVacuumMaterials(false);
        this.SnapHeadHome();
        this.SetVisualActive(false);
    }

    protected onDestroy(): void {
        SoundManager.Instance?.StopStopableSound(ESoundType.VacuumLoop);
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
        SoundManager.Instance?.Play(ESoundType.VacuumLoop, true, true);
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
        SoundManager.Instance?.StopStopableSound(ESoundType.VacuumLoop);
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
        if (!this.machinePivot || !this.tubePartsRootHead) {
            return;
        }

        const start = this.machinePivot.worldPosition;
        const end = this.tubePartsRootHead.worldPosition;
        const pointCount = this.BuildTubeRoute(start, end);
        let routeLength = 0;
        for (let i = 0; i < pointCount - 1; i++) {
            const length = Vec3.distance(this.routePoints[i], this.routePoints[i + 1]);
            this.routeSegmentLengths[i] = length;
            routeLength += length;
        }

        const count = Math.max(1, Math.ceil(routeLength / Math.max(0.1, this.segmentLength)));
        this.EnsureSegmentCount(count);

        for (let i = 0; i < this.activeTubePartCount; i++) {
            const t = (i + 0.5) / count;
            const part = this.tubeParts[i];
            let distanceAlongRoute = routeLength * t;
            let segmentIndex = 0;
            while (segmentIndex < pointCount - 2 && distanceAlongRoute > this.routeSegmentLengths[segmentIndex]) {
                distanceAlongRoute -= this.routeSegmentLengths[segmentIndex];
                segmentIndex++;
            }

            const segmentStart = this.routePoints[segmentIndex];
            const segmentEnd = this.routePoints[segmentIndex + 1];
            const segmentLength = Math.max(0.0001, this.routeSegmentLengths[segmentIndex]);
            const segmentT = Math.min(1, distanceAlongRoute / segmentLength);
            Vec3.lerp(this.curvePosition, segmentStart, segmentEnd, segmentT);
            this.curvePosition.y += Math.sin(t * Math.PI) * this.bendAmplitude;
            part.setWorldPosition(this.curvePosition);

            Vec3.lerp(
                this.curveTangent,
                this.routeTangents[segmentIndex],
                this.routeTangents[segmentIndex + 1],
                segmentT,
            );
            if (this.curveTangent.x * this.curveTangent.x + this.curveTangent.z * this.curveTangent.z > 0.001) {
                part.setRotationFromEuler(
                    0,
                    Math.atan2(this.curveTangent.x, this.curveTangent.z) * 180 / Math.PI,
                    0,
                );
            }
        }
    }

    private BuildTubeRoute(start: Readonly<Vec3>, end: Readonly<Vec3>): number {
        if (!this.playerFacingRoot) {
            return this.BuildDirectTubeRoute(start, end);
        }

        const playerRoot = this.playerFacingRoot;
        const playerPosition = playerRoot.worldPosition;
        Vec3.transformQuat(this.playerForward, Vec3.UNIT_Z, playerRoot.worldRotation);
        this.playerForward.y = 0;
        if (this.playerForward.lengthSqr() <= 0.0001) {
            this.playerForward.set(0, 0, 1);
        } else {
            this.playerForward.normalize();
        }
        this.playerRight.set(this.playerForward.z, 0, -this.playerForward.x);

        const clearance = Math.max(0.1, this.playerHoseClearance);
        const endSide = (end.x - playerPosition.x) * this.playerRight.x
            + (end.z - playerPosition.z) * this.playerRight.z;
        if (Math.abs(endSide) > clearance * 0.1) {
            this.hoseSideSign = endSide < 0 ? -1 : 1;
        }

        const behindDistance = Math.max(0.1, this.hoseBehindDistance);
        let approachDirectionX = end.x - playerPosition.x;
        let approachDirectionZ = end.z - playerPosition.z;
        let approachDirectionLength = Math.sqrt(
            approachDirectionX * approachDirectionX + approachDirectionZ * approachDirectionZ,
        );
        if (approachDirectionLength <= 0.05) {
            approachDirectionX = this.playerRight.x * this.hoseSideSign - this.playerForward.x * 0.35;
            approachDirectionZ = this.playerRight.z * this.hoseSideSign - this.playerForward.z * 0.35;
            approachDirectionLength = Math.sqrt(
                approachDirectionX * approachDirectionX + approachDirectionZ * approachDirectionZ,
            );
        }
        approachDirectionX /= approachDirectionLength;
        approachDirectionZ /= approachDirectionLength;

        const endDistanceFromPlayer = Math.sqrt(
            (end.x - playerPosition.x) * (end.x - playerPosition.x)
                + (end.z - playerPosition.z) * (end.z - playerPosition.z),
        );
        const avoidanceRadius = Math.max(
            clearance,
            behindDistance,
            endDistanceFromPlayer + Math.max(0.05, this.hoseCornerRadius),
        );
        const approachX = playerPosition.x + approachDirectionX * avoidanceRadius;
        const approachZ = playerPosition.z + approachDirectionZ * avoidanceRadius;
        const startOffsetX = start.x - playerPosition.x;
        const startOffsetZ = start.z - playerPosition.z;
        const startDistanceSqr = startOffsetX * startOffsetX + startOffsetZ * startOffsetZ;
        const sampleSpacing = this.GetTubeRouteSampleSpacing();
        let pointCount = 0;
        let incomingTangentX = approachX - start.x;
        let incomingTangentZ = approachZ - start.z;

        if (startDistanceSqr > avoidanceRadius * avoidanceRadius + 0.0001
            && this.GetSegmentDistanceSqrXZ(start, approachX, approachZ, playerPosition)
                < avoidanceRadius * avoidanceRadius - 0.0001) {
            const tangentRoute = this.GetShortestTangentRoute(
                start,
                playerPosition,
                approachDirectionX,
                approachDirectionZ,
                avoidanceRadius,
            );
            pointCount = this.AppendTubeLine(
                pointCount,
                start.x,
                start.z,
                tangentRoute.x,
                tangentRoute.z,
                sampleSpacing,
            );
            pointCount = this.AppendTubeArc(
                pointCount,
                playerPosition.x,
                playerPosition.z,
                avoidanceRadius,
                tangentRoute.angle,
                tangentRoute.angleDelta,
                sampleSpacing,
            );
            const approachAngle = tangentRoute.angle + tangentRoute.angleDelta;
            incomingTangentX = -Math.sin(approachAngle) * tangentRoute.directionSign;
            incomingTangentZ = Math.cos(approachAngle) * tangentRoute.directionSign;
        } else {
            pointCount = this.AppendTubeLine(
                pointCount,
                start.x,
                start.z,
                approachX,
                approachZ,
                sampleSpacing,
            );
        }

        const incomingTangentLength = Math.sqrt(
            incomingTangentX * incomingTangentX + incomingTangentZ * incomingTangentZ,
        );
        if (incomingTangentLength > 0.0001) {
            incomingTangentX /= incomingTangentLength;
            incomingTangentZ /= incomingTangentLength;
        } else {
            incomingTangentX = -approachDirectionZ * this.hoseSideSign;
            incomingTangentZ = approachDirectionX * this.hoseSideSign;
        }
        pointCount = this.AppendTubeEntryCurve(
            pointCount,
            approachX,
            approachZ,
            end.x,
            end.z,
            incomingTangentX,
            incomingTangentZ,
            approachDirectionX,
            approachDirectionZ,
            sampleSpacing,
        );
        this.ApplyTubeRouteHeight(pointCount, start.y, end.y);
        return pointCount;
    }

    private BuildDirectTubeRoute(start: Readonly<Vec3>, end: Readonly<Vec3>): number {
        const startControl = this.routeControlPoints[0];
        const firstControl = this.routeControlPoints[1];
        const secondControl = this.routeControlPoints[2];
        const endControl = this.routeControlPoints[3];
        startControl.set(start.x, 0, start.z);
        endControl.set(end.x, 0, end.z);
        firstControl.set(
            start.x + (end.x - start.x) / 3,
            0,
            start.z + (end.z - start.z) / 3,
        );
        secondControl.set(
            end.x - (end.x - start.x) / 3,
            0,
            end.z - (end.z - start.z) / 3,
        );
        const routeLength = Math.sqrt(
            (end.x - start.x) * (end.x - start.x) + (end.z - start.z) * (end.z - start.z),
        );
        const sampleStepCount = Math.max(1, Math.min(
            this.routePoints.length - 1,
            Math.ceil(routeLength / this.GetTubeRouteSampleSpacing()),
        ));
        for (let i = 0; i <= sampleStepCount; i++) {
            const t = i / sampleStepCount;
            this.EvaluateTubeBezier(t, this.routePoints[i]);
            this.EvaluateTubeBezierTangent(t, this.routeTangents[i]);
        }
        this.ApplyTubeRouteHeight(sampleStepCount + 1, start.y, end.y);
        return sampleStepCount + 1;
    }

    private GetTubeRouteSampleSpacing(): number {
        return Math.max(0.025, Math.min(0.1, this.segmentLength * 0.5));
    }

    private GetSegmentDistanceSqrXZ(
        start: Readonly<Vec3>,
        endX: number,
        endZ: number,
        point: Readonly<Vec3>,
    ): number {
        const segmentX = endX - start.x;
        const segmentZ = endZ - start.z;
        const segmentLengthSqr = segmentX * segmentX + segmentZ * segmentZ;
        if (segmentLengthSqr <= 0.0001) {
            const pointX = point.x - start.x;
            const pointZ = point.z - start.z;
            return pointX * pointX + pointZ * pointZ;
        }

        const projection = Math.max(0, Math.min(1,
            ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / segmentLengthSqr,
        ));
        const closestX = start.x + segmentX * projection;
        const closestZ = start.z + segmentZ * projection;
        const pointX = point.x - closestX;
        const pointZ = point.z - closestZ;
        return pointX * pointX + pointZ * pointZ;
    }

    private GetShortestTangentRoute(
        start: Readonly<Vec3>,
        center: Readonly<Vec3>,
        approachDirectionX: number,
        approachDirectionZ: number,
        radius: number,
    ): { x: number; z: number; angle: number; angleDelta: number; directionSign: number } {
        const startX = start.x - center.x;
        const startZ = start.z - center.z;
        const startDistanceSqr = startX * startX + startZ * startZ;
        const baseScale = radius * radius / startDistanceSqr;
        const tangentScale = radius * Math.sqrt(startDistanceSqr - radius * radius) / startDistanceSqr;
        const approachAngle = Math.atan2(approachDirectionZ, approachDirectionX);
        let bestX = 0;
        let bestZ = 0;
        let bestAngle = 0;
        let bestAngleDelta = 0;
        let bestDirectionSign = 1;
        let bestLength = Number.POSITIVE_INFINITY;
        for (let tangentIndex = 0; tangentIndex < 2; tangentIndex++) {
            const tangentSide = tangentIndex === 0 ? -1 : 1;
            const tangentX = startX * baseScale - startZ * tangentScale * tangentSide;
            const tangentZ = startZ * baseScale + startX * tangentScale * tangentSide;
            const tangentAngle = Math.atan2(tangentZ, tangentX);
            const derivativeX = -Math.sin(tangentAngle);
            const derivativeZ = Math.cos(tangentAngle);
            const incomingX = center.x + tangentX - start.x;
            const incomingZ = center.z + tangentZ - start.z;
            const directionSign = incomingX * derivativeX + incomingZ * derivativeZ >= 0 ? 1 : -1;
            const rawAngleDelta = approachAngle - tangentAngle;
            const angleDelta = directionSign > 0
                ? (rawAngleDelta + Math.PI * 4) % (Math.PI * 2)
                : -(-rawAngleDelta + Math.PI * 4) % (Math.PI * 2);
            const routeLength = Math.sqrt(incomingX * incomingX + incomingZ * incomingZ)
                + Math.abs(angleDelta) * radius;
            if (routeLength < bestLength) {
                bestLength = routeLength;
                bestX = center.x + tangentX;
                bestZ = center.z + tangentZ;
                bestAngle = tangentAngle;
                bestAngleDelta = angleDelta;
                bestDirectionSign = directionSign;
            }
        }
        this.tangentRoute.x = bestX;
        this.tangentRoute.z = bestZ;
        this.tangentRoute.angle = bestAngle;
        this.tangentRoute.angleDelta = bestAngleDelta;
        this.tangentRoute.directionSign = bestDirectionSign;
        return this.tangentRoute;
    }

    private AppendTubeLine(
        pointCount: number,
        startX: number,
        startZ: number,
        endX: number,
        endZ: number,
        sampleSpacing: number,
    ): number {
        const directionX = endX - startX;
        const directionZ = endZ - startZ;
        const length = Math.sqrt(directionX * directionX + directionZ * directionZ);
        const stepCount = Math.max(1, Math.ceil(length / sampleSpacing));
        const firstStep = pointCount === 0 ? 0 : 1;
        for (let step = firstStep; step <= stepCount && pointCount < this.routePoints.length; step++) {
            const t = step / stepCount;
            this.routePoints[pointCount].set(
                startX + directionX * t,
                0,
                startZ + directionZ * t,
            );
            this.routeTangents[pointCount].set(directionX, 0, directionZ);
            pointCount++;
        }
        return pointCount;
    }

    private AppendTubeArc(
        pointCount: number,
        centerX: number,
        centerZ: number,
        radius: number,
        startAngle: number,
        angleDelta: number,
        sampleSpacing: number,
    ): number {
        const stepCount = Math.max(1, Math.ceil(Math.abs(angleDelta) * radius / sampleSpacing));
        const directionSign = angleDelta >= 0 ? 1 : -1;
        for (let step = 1; step <= stepCount && pointCount < this.routePoints.length; step++) {
            const angle = startAngle + angleDelta * step / stepCount;
            this.routePoints[pointCount].set(
                centerX + Math.cos(angle) * radius,
                0,
                centerZ + Math.sin(angle) * radius,
            );
            this.routeTangents[pointCount].set(
                -Math.sin(angle) * directionSign,
                0,
                Math.cos(angle) * directionSign,
            );
            pointCount++;
        }
        return pointCount;
    }

    private AppendTubeEntryCurve(
        pointCount: number,
        startX: number,
        startZ: number,
        endX: number,
        endZ: number,
        incomingTangentX: number,
        incomingTangentZ: number,
        approachDirectionX: number,
        approachDirectionZ: number,
        sampleSpacing: number,
    ): number {
        const distance = Math.sqrt(
            (endX - startX) * (endX - startX) + (endZ - startZ) * (endZ - startZ),
        );
        const controlDistance = Math.min(
            distance * 0.4,
            Math.max(Math.max(0.05, this.hoseCornerRadius), distance * 0.3),
        );
        this.routeControlPoints[0].set(startX, 0, startZ);
        this.routeControlPoints[1].set(
            startX + incomingTangentX * controlDistance,
            0,
            startZ + incomingTangentZ * controlDistance,
        );
        this.routeControlPoints[2].set(
            endX + approachDirectionX * controlDistance,
            0,
            endZ + approachDirectionZ * controlDistance,
        );
        this.routeControlPoints[3].set(endX, 0, endZ);
        const stepCount = Math.max(2, Math.ceil(distance * 1.5 / sampleSpacing));
        for (let step = 1; step <= stepCount && pointCount < this.routePoints.length; step++) {
            const t = step / stepCount;
            this.EvaluateTubeBezier(t, this.routePoints[pointCount]);
            this.EvaluateTubeBezierTangent(t, this.routeTangents[pointCount]);
            pointCount++;
        }
        return pointCount;
    }

    private ApplyTubeRouteHeight(pointCount: number, startY: number, endY: number): void {
        let totalLength = 0;
        for (let i = 0; i < pointCount - 1; i++) {
            const dx = this.routePoints[i + 1].x - this.routePoints[i].x;
            const dz = this.routePoints[i + 1].z - this.routePoints[i].z;
            totalLength += Math.sqrt(dx * dx + dz * dz);
        }
        let distance = 0;
        for (let i = 0; i < pointCount; i++) {
            if (i > 0) {
                const dx = this.routePoints[i].x - this.routePoints[i - 1].x;
                const dz = this.routePoints[i].z - this.routePoints[i - 1].z;
                distance += Math.sqrt(dx * dx + dz * dz);
            }
            this.routePoints[i].y = startY + (endY - startY) * distance / Math.max(0.0001, totalLength);
        }
    }

    private EvaluateTubeBezier(t: number, out: Vec3): void {
        const oneMinusT = 1 - t;
        const startWeight = oneMinusT * oneMinusT * oneMinusT;
        const firstWeight = 3 * oneMinusT * oneMinusT * t;
        const secondWeight = 3 * oneMinusT * t * t;
        const endWeight = t * t * t;
        const start = this.routeControlPoints[0];
        const first = this.routeControlPoints[1];
        const second = this.routeControlPoints[2];
        const end = this.routeControlPoints[3];
        out.set(
            start.x * startWeight + first.x * firstWeight + second.x * secondWeight + end.x * endWeight,
            start.y * startWeight + first.y * firstWeight + second.y * secondWeight + end.y * endWeight,
            start.z * startWeight + first.z * firstWeight + second.z * secondWeight + end.z * endWeight,
        );
    }

    private EvaluateTubeBezierTangent(t: number, out: Vec3): void {
        const oneMinusT = 1 - t;
        const start = this.routeControlPoints[0];
        const first = this.routeControlPoints[1];
        const second = this.routeControlPoints[2];
        const end = this.routeControlPoints[3];
        out.set(
            3 * oneMinusT * oneMinusT * (first.x - start.x)
                + 6 * oneMinusT * t * (second.x - first.x)
                + 3 * t * t * (end.x - second.x),
            3 * oneMinusT * oneMinusT * (first.y - start.y)
                + 6 * oneMinusT * t * (second.y - first.y)
                + 3 * t * t * (end.y - second.y),
            3 * oneMinusT * oneMinusT * (first.z - start.z)
                + 6 * oneMinusT * t * (second.z - first.z)
                + 3 * t * t * (end.z - second.z),
        );
    }

    private EnsureSegmentCount(count: number): void {
        if (!this.tubePartsRoot || !this.tubePartPrefab) {
            return;
        }

        while (this.tubeParts.length < count) {
            const part = instantiate(this.tubePartPrefab);
            this.tubePartsRoot.addChild(part);
            this.tubeParts.push(part);
            this.ApplyMaterial(
                part,
                this.warning && this.warningBlinkState ? this.warningHoseMaterial : this.normalHoseMaterial,
            );
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
        this.ApplyVacuumMaterials(false);
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
        this.ApplyVacuumMaterials(this.warningBlinkState);
    }

    private ApplyVacuumMaterials(useWarningMaterials: boolean): void {
        const hoseMaterial = useWarningMaterials ? this.warningHoseMaterial : this.normalHoseMaterial;
        for (const part of this.tubeParts) {
            this.ApplyMaterial(part, hoseMaterial);
        }

        if (this.tubeHead) {
            const headMaterial = useWarningMaterials ? this.warningHeadMaterial : this.normalHeadMaterial;
            this.ApplyMaterial(this.tubeHead, headMaterial);
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
}
