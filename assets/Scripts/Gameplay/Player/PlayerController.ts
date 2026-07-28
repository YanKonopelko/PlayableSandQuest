import { _decorator, CapsuleCollider, CCFloat, Component, director, geometry, Node, PhysicsSystem, Vec2, Vec3 } from 'cc';
import { AdaptiveCameraFollower } from '../Camera/AdaptiveCameraFollower';
import { FloatingJoystick } from '../Input/FloatingJoystick';
import { RequiredReference } from '../Core/RequiredReference';
import { PlayerAnimationController } from './PlayerAnimationController';
import { VacuumSystem } from '../Vacuum/VacuumSystem';
import { SoundManager } from '../../Sounds/SoundManager';
import { ESoundType } from '../../Sounds/SoundPreset';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
    @property(FloatingJoystick)
    public joystick: FloatingJoystick | null = null;

    @property(AdaptiveCameraFollower)
    public cameraFollower: AdaptiveCameraFollower | null = null;

    @property(Node)
    public movementRoot: Node | null = null;

    @property(Node)
    public visualRoot: Node | null = null;

    @property(PlayerAnimationController)
    public animationController: PlayerAnimationController | null = null;

    @property(VacuumSystem)
    public vacuumSystem: VacuumSystem | null = null;

    @property(CapsuleCollider)
    public movementCollider: CapsuleCollider | null = null;

    @property({ type: CCFloat })
    public moveSpeed: number = 4.5;

    @property({ type: CCFloat, min: 0 })
    public minJoystickAcceleration: number = 0.35;

    @property({ type: CCFloat, min: 0 })
    public maxJoystickAcceleration: number = 1;

    @property({ type: CCFloat })
    public rotationLerp: number = 14;

    @property({ type: CCFloat })
    public inputDeadZone: number = 0.08;

    @property({ type: CCFloat })
    public autoMoveSpeed: number = 5.5;

    @property({ type: CCFloat })
    public autoMoveStoppingDistance: number = 0.12;

    @property({ type: CCFloat })
    public collisionSkin: number = 0.06;

    @property({ type: CCFloat, min: 0.1, tooltip: 'Seconds between footstep sounds while moving.' })
    public stepInterval: number = 0.34;

    private readonly desiredPosition: Vec3 = new Vec3();
    private readonly moveVector: Vec3 = new Vec3();
    private readonly lastDirection: Vec3 = new Vec3(0, 0, 1);
    private movementEnabled: boolean = true;
    private autoMoveTarget: Node | null = null;
    private autoMoveComplete: (() => void) | null = null;
    private readonly movementRay: geometry.Ray = geometry.Ray.create();
    private readonly capsuleCenter: Vec3 = new Vec3();
    private readonly sweepOrigin: Vec3 = new Vec3();
    private readonly resolvedPosition: Vec3 = new Vec3();
    private readonly collisionNormal: Vec3 = new Vec3();
    private readonly slideDirection: Vec3 = new Vec3();
    private readonly worldScale: Vec3 = new Vec3();
    private readonly rayOrigin: Vec3 = new Vec3();
    private stepTimer: number = 0;
    private nextStepType: ESoundType = ESoundType.Step1;

    protected onLoad(): void {
        RequiredReference.Check(this, this.joystick, 'joystick');
        RequiredReference.Check(this, this.movementCollider, 'movementCollider');

        this.cameraFollower ??= director.getScene()?.getComponentInChildren(AdaptiveCameraFollower) ?? null;
        RequiredReference.Check(this, this.cameraFollower, 'cameraFollower');

        if (!this.movementRoot) {
            this.movementRoot = this.node;
        }

        if (!this.visualRoot) {
            this.visualRoot = this.movementRoot;
        }
    }

    protected update(dt: number): void {
        const root = this.movementRoot;
        if (!root) {
            return;
        }

        if (this.autoMoveTarget) {
            this.UpdateAutomaticMovement(dt);
            this.UpdateFootsteps(dt, !!this.autoMoveTarget);
            return;
        }

        if (!this.movementEnabled) {
            this.animationController?.SetMoving(false);
            this.UpdateFootsteps(dt, false);
            return;
        }

        const input = this.joystick?.Direction ?? Vec2.ZERO;
        const magnitude = input.length();
        const isMoving = magnitude > this.inputDeadZone;

        if (!isMoving) {
            this.animationController?.SetMoving(false);
            this.UpdateFootsteps(dt, false);
            return;
        }

        const joystickAngle = Math.atan2(input.x, -input.y);
        const movementAngle = joystickAngle + (this.cameraFollower?.yaw ?? 0) * Math.PI / 180;
        this.moveVector.set(Math.sin(movementAngle), 0, Math.cos(movementAngle));
        this.lastDirection.set(this.moveVector);

        const normalizedInput = Math.min(1, Math.max(
            0,
            (magnitude - this.inputDeadZone) / Math.max(0.001, 1 - this.inputDeadZone),
        ));
        const minAcceleration = Math.max(0, this.minJoystickAcceleration);
        const maxAcceleration = Math.max(minAcceleration, this.maxJoystickAcceleration);
        const acceleration = minAcceleration + (maxAcceleration - minAcceleration) * normalizedInput;
        const currentMoveSpeed = this.moveSpeed * acceleration;

        root.getWorldPosition(this.desiredPosition);
        this.desiredPosition.x += this.moveVector.x * currentMoveSpeed * dt;
        this.desiredPosition.z += this.moveVector.z * currentMoveSpeed * dt;

        const limitedPosition = this.vacuumSystem
            ? this.vacuumSystem.GetLimitedPlayerPosition(this.desiredPosition)
            : this.desiredPosition;

        root.setWorldPosition(this.ResolveMovement(root, limitedPosition));
        this.UpdateRotation(dt);
        this.animationController?.SetMoving(true);
        this.UpdateFootsteps(dt, true);
    }

    public SetMovementEnabled(value: boolean): void {
        this.movementEnabled = value;
        if (!value) {
            this.animationController?.SetMoving(false);
        }
    }

    public SetVacuumVisualEnabled(value: boolean): void {
        this.animationController?.SetVacuumEnabled(value);
    }

    public RunAutomaticallyTo(target: Node, onComplete?: () => void): void {
        this.autoMoveTarget = target;
        this.autoMoveComplete = onComplete ?? null;
        this.movementEnabled = false;
    }

    public CancelAutomaticMovement(): void {
        this.autoMoveTarget = null;
        this.autoMoveComplete = null;
        this.movementEnabled = true;
        this.animationController?.SetMoving(false);
    }

    public GetObstacleDistance(direction: Vec3, maxDistance: number): number {
        const collider = this.movementCollider;
        if (!collider || maxDistance <= 0) {
            return -1;
        }

        this.moveVector.set(direction.x, 0, direction.z);
        if (this.moveVector.lengthSqr() <= 0.0001) {
            return -1;
        }
        this.moveVector.normalize();
        this.GetCapsuleCenter(collider, this.capsuleCenter);
        return this.FindBlockingDistance(
            collider,
            this.capsuleCenter,
            this.moveVector,
            maxDistance,
            this.collisionNormal,
        );
    }

    private UpdateAutomaticMovement(dt: number): void {
        const root = this.movementRoot;
        const target = this.autoMoveTarget;
        if (!root || !target) {
            this.CancelAutomaticMovement();
            return;
        }

        root.getWorldPosition(this.desiredPosition);
        const targetPosition = target.worldPosition;
        const dx = targetPosition.x - this.desiredPosition.x;
        const dz = targetPosition.z - this.desiredPosition.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const stopDistance = Math.max(0.01, this.autoMoveStoppingDistance);
        if (distance <= stopDistance) {
            this.desiredPosition.x = targetPosition.x;
            this.desiredPosition.z = targetPosition.z;
            root.setWorldPosition(this.desiredPosition);
            const complete = this.autoMoveComplete;
            this.autoMoveTarget = null;
            this.autoMoveComplete = null;
            this.movementEnabled = true;
            this.animationController?.SetMoving(false);
            complete?.();
            return;
        }

        this.moveVector.set(dx / distance, 0, dz / distance);
        this.lastDirection.set(this.moveVector);
        const step = Math.min(distance, Math.max(0.01, this.autoMoveSpeed) * dt);
        this.desiredPosition.x += this.moveVector.x * step;
        this.desiredPosition.z += this.moveVector.z * step;
        root.setWorldPosition(this.ResolveMovement(root, this.desiredPosition));
        this.UpdateRotation(dt);
        this.animationController?.SetMoving(true);
    }

    private ResolveMovement(root: Node, desiredWorldPosition: Vec3): Vec3 {
        const collider = this.movementCollider;
        root.getWorldPosition(this.resolvedPosition);
        if (!collider) {
            this.resolvedPosition.set(desiredWorldPosition);
            return this.resolvedPosition;
        }

        const dx = desiredWorldPosition.x - this.resolvedPosition.x;
        const dz = desiredWorldPosition.z - this.resolvedPosition.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance <= 0.0001) {
            return this.resolvedPosition;
        }

        this.moveVector.set(dx / distance, 0, dz / distance);
        this.GetCapsuleCenter(collider, this.capsuleCenter);
        const firstHitDistance = this.FindBlockingDistance(
            collider,
            this.capsuleCenter,
            this.moveVector,
            distance,
            this.collisionNormal,
        );
        if (firstHitDistance < 0) {
            this.resolvedPosition.set(desiredWorldPosition);
            return this.resolvedPosition;
        }

        const skin = Math.max(0.001, this.collisionSkin);
        const forwardDistance = Math.max(0, Math.min(distance, firstHitDistance - skin));
        this.resolvedPosition.x += this.moveVector.x * forwardDistance;
        this.resolvedPosition.z += this.moveVector.z * forwardDistance;

        const remainingDistance = distance - forwardDistance;
        const normalDot = Vec3.dot(this.moveVector, this.collisionNormal);
        this.slideDirection.set(
            this.moveVector.x - this.collisionNormal.x * normalDot,
            0,
            this.moveVector.z - this.collisionNormal.z * normalDot,
        );
        const slideLength = this.slideDirection.length();
        if (remainingDistance <= 0.0001 || slideLength <= 0.0001) {
            return this.resolvedPosition;
        }

        this.slideDirection.multiplyScalar(1 / slideLength);
        this.sweepOrigin.set(this.capsuleCenter);
        this.sweepOrigin.x += this.moveVector.x * forwardDistance;
        this.sweepOrigin.z += this.moveVector.z * forwardDistance;
        const requestedSlideDistance = remainingDistance * slideLength;
        const slideHitDistance = this.FindBlockingDistance(
            collider,
            this.sweepOrigin,
            this.slideDirection,
            requestedSlideDistance,
            this.collisionNormal,
        );
        const allowedSlideDistance = slideHitDistance < 0
            ? requestedSlideDistance
            : Math.max(0, Math.min(requestedSlideDistance, slideHitDistance - skin));
        this.resolvedPosition.x += this.slideDirection.x * allowedSlideDistance;
        this.resolvedPosition.z += this.slideDirection.z * allowedSlideDistance;
        return this.resolvedPosition;
    }

    private FindBlockingDistance(
        collider: CapsuleCollider,
        origin: Vec3,
        direction: Vec3,
        distance: number,
        outNormal: Vec3,
    ): number {
        if (distance <= 0.0001) {
            return -1;
        }

        collider.node.getWorldScale(this.worldScale);
        const radius = collider.radius * Math.max(Math.abs(this.worldScale.x), Math.abs(this.worldScale.z));
        let closestDistance = Number.POSITIVE_INFINITY;
        const sideX = -direction.z * radius * 0.85;
        const sideZ = direction.x * radius * 0.85;
        for (const side of [0, -1, 1]) {
            this.rayOrigin.set(origin.x + sideX * side, origin.y, origin.z + sideZ * side);
            geometry.Ray.set(
                this.movementRay,
                this.rayOrigin.x,
                this.rayOrigin.y,
                this.rayOrigin.z,
                direction.x,
                0,
                direction.z,
            );
            const hit = PhysicsSystem.instance.raycast(
                this.movementRay,
                0xffffffff,
                distance + radius + Math.max(0.001, this.collisionSkin),
                false,
            );
            if (!hit) {
                continue;
            }

            for (const result of PhysicsSystem.instance.raycastResults) {
                if (this.IsOwnCollider(result.collider.node)) {
                    continue;
                }

                const allowedCenterDistance = result.distance - radius;
                if (allowedCenterDistance < closestDistance) {
                    closestDistance = allowedCenterDistance;
                    outNormal.set(result.hitNormal.x, 0, result.hitNormal.z);
                    if (outNormal.lengthSqr() > 0.0001) {
                        outNormal.normalize();
                    }
                }
            }
        }
        return Number.isFinite(closestDistance) ? Math.max(0, closestDistance) : -1;
    }

    private GetCapsuleCenter(collider: CapsuleCollider, out: Vec3): void {
        Vec3.transformMat4(out, collider.center, collider.node.worldMatrix);
    }

    private IsOwnCollider(node: Node): boolean {
        let current: Node | null = node;
        while (current) {
            if (current === this.node) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    private UpdateRotation(dt: number): void {
        const visual = this.visualRoot;
        if (!visual) {
            return;
        }

        const targetAngle = Math.atan2(this.lastDirection.x, this.lastDirection.z) * 180 / Math.PI;
        const current = visual.eulerAngles;
        const nextY = this.LerpAngle(current.y, targetAngle, Math.min(1, this.rotationLerp * dt));
        visual.setRotationFromEuler(current.x, nextY, current.z);
    }

    private UpdateFootsteps(dt: number, isMoving: boolean): void {
        if (!isMoving) {
            this.stepTimer = 0;
            return;
        }

        this.stepTimer -= Math.max(0, dt);
        if (this.stepTimer > 0) {
            return;
        }

        SoundManager.Instance?.Play(this.nextStepType);
        this.nextStepType = this.nextStepType === ESoundType.Step1
            ? ESoundType.Step2
            : ESoundType.Step1;
        this.stepTimer = Math.max(0.1, this.stepInterval);
    }

    private LerpAngle(a: number, b: number, t: number): number {
        let delta = (b - a + 540) % 360 - 180;
        return a + delta * t;
    }
}
