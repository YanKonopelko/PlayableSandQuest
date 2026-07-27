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

    @property({ type: CCFloat, min: 0.05, tooltip: 'Radius used to round hose route corners.' })
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
    private readonly routeControlPoints: Vec3[] = Array.from({ length: 32 }, () => new Vec3());
    private readonly routePoints: Vec3[] = Array.from({ length: 512 }, () => new Vec3());
    private readonly routeSegmentLengths: number[] = new Array<number>(511).fill(0);
    private readonly playerForward: Vec3 = new Vec3(0, 0, 1);
    private readonly playerRight: Vec3 = new Vec3(1, 0, 0);
    private readonly flatDirection: Vec3 = new Vec3();

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
        RequiredReference.Check(this, this.tubePartPrefab, 'tubePartPrefab');
        RequiredReference.CheckNode(this, this.tubePartsRoot, 'tubePartsRoot');
        this.ApplyVacuumMaterials(false);
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
        if (!this.machinePivot || !this.tubeHead) {
            return;
        }

        const start = this.machinePivot.worldPosition;
        const end = this.tubeHead.worldPosition;
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
            Vec3.lerp(this.flatDirection, segmentStart, segmentEnd, segmentT);
            this.flatDirection.y += Math.sin(t * Math.PI) * this.bendAmplitude;
            part.setWorldPosition(this.flatDirection);

            const directionX = segmentEnd.x - segmentStart.x;
            const directionZ = segmentEnd.z - segmentStart.z;
            if (directionX * directionX + directionZ * directionZ > 0.001) {
                part.setRotationFromEuler(0, Math.atan2(directionX, directionZ) * 180 / Math.PI, 0);
            }
        }
    }

    private BuildTubeRoute(start: Readonly<Vec3>, end: Readonly<Vec3>): number {
        this.routeControlPoints[0].set(start);

        if (!this.playerFacingRoot) {
            this.routeControlPoints[1].set(end);
            return this.RoundRouteCorners(2);
        }

        const playerPosition = this.playerFacingRoot.worldPosition;
        Vec3.transformQuat(this.playerForward, Vec3.UNIT_Z, this.playerFacingRoot.worldRotation);
        this.playerForward.y = 0;
        if (this.playerForward.lengthSqr() <= 0.0001) {
            this.playerForward.set(0, 0, 1);
        } else {
            this.playerForward.normalize();
        }
        this.playerRight.set(this.playerForward.z, 0, -this.playerForward.x);

        const endSide = (end.x - playerPosition.x) * this.playerRight.x
            + (end.z - playerPosition.z) * this.playerRight.z;
        if (Math.abs(endSide) > 0.002) {
            this.hoseSideSign = endSide < 0 ? -1 : 1;
        }

        const clearance = Math.max(0.1, this.playerHoseClearance);
        const behindDistance = Math.max(0.1, this.hoseBehindDistance);
        const routeRadius = Math.max(clearance, behindDistance);
        const approachAngle = Math.atan2(this.hoseSideSign * clearance, -clearance * 0.15);
        const approachForward = Math.cos(approachAngle) * routeRadius;
        const approachRight = Math.sin(approachAngle) * routeRadius;
        const approachX = playerPosition.x
            + this.playerForward.x * approachForward
            + this.playerRight.x * approachRight;
        const approachZ = playerPosition.z
            + this.playerForward.z * approachForward
            + this.playerRight.z * approachRight;
        const startX = start.x - playerPosition.x;
        const startZ = start.z - playerPosition.z;
        const startDistanceSqr = startX * startX + startZ * startZ;
        const routeRadiusSqr = routeRadius * routeRadius;
        let pointCount = 1;
        let tangentAngle = approachAngle;

        if (startDistanceSqr >= clearance * clearance
            && this.GetSegmentDistanceSqrXZ(start, approachX, approachZ, playerPosition) >= clearance * clearance
            && this.IsDirectRouteTurnSmooth(start, approachX, approachZ, end)) {
            this.routeControlPoints[pointCount++].set(approachX, playerPosition.y, approachZ);
            this.routeControlPoints[pointCount++].set(end);
            return this.RoundRouteCorners(pointCount);
        }

        if (startDistanceSqr > routeRadiusSqr + 0.0001) {
            const baseScale = routeRadiusSqr / startDistanceSqr;
            const tangentScale = routeRadius * Math.sqrt(startDistanceSqr - routeRadiusSqr) / startDistanceSqr;
            const tangent1X = startX * baseScale - startZ * tangentScale;
            const tangent1Z = startZ * baseScale + startX * tangentScale;
            const tangent2X = startX * baseScale + startZ * tangentScale;
            const tangent2Z = startZ * baseScale - startX * tangentScale;
            const tangent1Angle = this.GetPlayerLocalAngle(tangent1X, tangent1Z);
            const tangent2Angle = this.GetPlayerLocalAngle(tangent2X, tangent2Z);
            const tangent1Delta = this.GetShortestAngleDelta(tangent1Angle, approachAngle);
            const tangent2Delta = this.GetShortestAngleDelta(tangent2Angle, approachAngle);
            const useFirstTangent = Math.abs(tangent1Delta) <= Math.abs(tangent2Delta);
            const tangentX = useFirstTangent ? tangent1X : tangent2X;
            const tangentZ = useFirstTangent ? tangent1Z : tangent2Z;
            tangentAngle = useFirstTangent ? tangent1Angle : tangent2Angle;
            this.routeControlPoints[pointCount++].set(
                playerPosition.x + tangentX,
                playerPosition.y,
                playerPosition.z + tangentZ,
            );
        } else if (startDistanceSqr > 0.0001) {
            const startDistance = Math.sqrt(startDistanceSqr);
            tangentAngle = this.GetPlayerLocalAngle(startX, startZ);
            this.routeControlPoints[pointCount++].set(
                playerPosition.x + startX / startDistance * routeRadius,
                playerPosition.y,
                playerPosition.z + startZ / startDistance * routeRadius,
            );
        }

        const approachRouteAngle = tangentAngle + this.GetShortestAngleDelta(tangentAngle, approachAngle);
        pointCount = this.AppendRouteArc(pointCount, tangentAngle, approachRouteAngle, routeRadius, playerPosition);
        this.routeControlPoints[pointCount++].set(end);
        return this.RoundRouteCorners(pointCount);
    }

    private GetPlayerLocalAngle(worldOffsetX: number, worldOffsetZ: number): number {
        const forwardAmount = worldOffsetX * this.playerForward.x + worldOffsetZ * this.playerForward.z;
        const rightAmount = worldOffsetX * this.playerRight.x + worldOffsetZ * this.playerRight.z;
        return Math.atan2(rightAmount, forwardAmount);
    }

    private GetShortestAngleDelta(fromAngle: number, toAngle: number): number {
        return (toAngle - fromAngle + Math.PI * 3) % (Math.PI * 2) - Math.PI;
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

    private IsDirectRouteTurnSmooth(
        start: Readonly<Vec3>,
        cornerX: number,
        cornerZ: number,
        end: Readonly<Vec3>,
    ): boolean {
        const incomingX = cornerX - start.x;
        const incomingZ = cornerZ - start.z;
        const outgoingX = end.x - cornerX;
        const outgoingZ = end.z - cornerZ;
        const incomingLength = Math.sqrt(incomingX * incomingX + incomingZ * incomingZ);
        const outgoingLength = Math.sqrt(outgoingX * outgoingX + outgoingZ * outgoingZ);
        if (incomingLength <= 0.0001 || outgoingLength <= 0.0001) {
            return true;
        }

        const directionDot = (incomingX * outgoingX + incomingZ * outgoingZ)
            / (incomingLength * outgoingLength);
        return directionDot >= Math.cos(Math.PI * 5 / 12);
    }

    private AppendRouteArc(
        pointCount: number,
        fromAngle: number,
        toAngle: number,
        radius: number,
        center: Readonly<Vec3>,
    ): number {
        const maxAngleStep = Math.PI / 12;
        const stepCount = Math.max(1, Math.ceil(Math.abs(toAngle - fromAngle) / maxAngleStep));
        for (let i = 1; i <= stepCount && pointCount < this.routeControlPoints.length - 1; i++) {
            const angle = fromAngle + (toAngle - fromAngle) * i / stepCount;
            const forwardAmount = Math.cos(angle) * radius;
            const rightAmount = Math.sin(angle) * radius;
            this.routeControlPoints[pointCount++].set(
                center.x + this.playerForward.x * forwardAmount + this.playerRight.x * rightAmount,
                center.y,
                center.z + this.playerForward.z * forwardAmount + this.playerRight.z * rightAmount,
            );
        }
        return pointCount;
    }

    private RoundRouteCorners(controlPointCount: number): number {
        if (controlPointCount <= 0) {
            return 0;
        }

        let routePointCount = 0;
        this.routePoints[routePointCount++].set(this.routeControlPoints[0]);
        const cornerRadius = Math.max(0.05, this.hoseCornerRadius);
        for (let i = 1; i < controlPointCount - 1 && routePointCount < this.routePoints.length - 14; i++) {
            const previous = this.routeControlPoints[i - 1];
            const corner = this.routeControlPoints[i];
            const next = this.routeControlPoints[i + 1];
            const incomingX = corner.x - previous.x;
            const incomingY = corner.y - previous.y;
            const incomingZ = corner.z - previous.z;
            const outgoingX = next.x - corner.x;
            const outgoingY = next.y - corner.y;
            const outgoingZ = next.z - corner.z;
            const incomingLength = Math.sqrt(
                incomingX * incomingX + incomingY * incomingY + incomingZ * incomingZ,
            );
            const outgoingLength = Math.sqrt(
                outgoingX * outgoingX + outgoingY * outgoingY + outgoingZ * outgoingZ,
            );
            if (incomingLength <= 0.0001 || outgoingLength <= 0.0001) {
                continue;
            }

            const trimDistance = Math.min(cornerRadius, incomingLength * 0.45, outgoingLength * 0.45);
            const entry = this.routePoints[routePointCount++];
            entry.set(
                corner.x - incomingX / incomingLength * trimDistance,
                corner.y - incomingY / incomingLength * trimDistance,
                corner.z - incomingZ / incomingLength * trimDistance,
            );
            const exitX = corner.x + outgoingX / outgoingLength * trimDistance;
            const exitY = corner.y + outgoingY / outgoingLength * trimDistance;
            const exitZ = corner.z + outgoingZ / outgoingLength * trimDistance;
            const directionDot = Math.max(-1, Math.min(1,
                (incomingX * outgoingX + incomingY * outgoingY + incomingZ * outgoingZ)
                / (incomingLength * outgoingLength),
            ));
            const turnAngle = Math.acos(directionDot);
            const curveStepCount = Math.max(3, Math.ceil(turnAngle / (Math.PI / 12)));
            for (let step = 1; step <= curveStepCount; step++) {
                const t = step / curveStepCount;
                const oneMinusT = 1 - t;
                const startWeight = oneMinusT * oneMinusT;
                const cornerWeight = 2 * oneMinusT * t;
                const endWeight = t * t;
                this.routePoints[routePointCount++].set(
                    entry.x * startWeight + corner.x * cornerWeight + exitX * endWeight,
                    entry.y * startWeight + corner.y * cornerWeight + exitY * endWeight,
                    entry.z * startWeight + corner.z * cornerWeight + exitZ * endWeight,
                );
            }
        }
        this.routePoints[routePointCount++].set(this.routeControlPoints[controlPointCount - 1]);
        return routePointCount;
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
