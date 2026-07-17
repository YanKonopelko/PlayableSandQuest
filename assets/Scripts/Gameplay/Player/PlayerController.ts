import { _decorator, CCFloat, Component, Node, Vec2, Vec3 } from 'cc';
import { FloatingJoystick } from '../Input/FloatingJoystick';
import { RequiredReference } from '../Core/RequiredReference';
import { PlayerAnimationController } from './PlayerAnimationController';
import { VacuumSystem } from '../Vacuum/VacuumSystem';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
    @property(FloatingJoystick)
    public joystick: FloatingJoystick | null = null;

    @property(Node)
    public movementRoot: Node | null = null;

    @property(Node)
    public visualRoot: Node | null = null;

    @property(PlayerAnimationController)
    public animationController: PlayerAnimationController | null = null;

    @property(VacuumSystem)
    public vacuumSystem: VacuumSystem | null = null;

    @property({ type: CCFloat })
    public moveSpeed: number = 4.5;

    @property({ type: CCFloat })
    public rotationLerp: number = 14;

    @property({ type: CCFloat })
    public inputDeadZone: number = 0.08;

    private readonly desiredPosition: Vec3 = new Vec3();
    private readonly moveVector: Vec3 = new Vec3();
    private readonly lastDirection: Vec3 = new Vec3(0, 0, 1);
    private movementEnabled: boolean = true;

    protected onLoad(): void {
        RequiredReference.Check(this, this.joystick, 'joystick');

        if (!this.movementRoot) {
            this.movementRoot = this.node;
        }

        if (!this.visualRoot) {
            this.visualRoot = this.movementRoot;
        }
    }

    protected update(dt: number): void {
        const root = this.movementRoot;
        if (!root || !this.movementEnabled) {
            this.animationController?.SetMoving(false);
            return;
        }

        const input = this.joystick?.Direction ?? Vec2.ZERO;
        const magnitude = input.length();
        const isMoving = magnitude > this.inputDeadZone;

        if (!isMoving) {
            this.animationController?.SetMoving(false);
            return;
        }

        this.moveVector.set(input.x, 0, -input.y);
        this.moveVector.normalize();
        this.lastDirection.set(this.moveVector);

        root.getWorldPosition(this.desiredPosition);
        this.desiredPosition.x += this.moveVector.x * this.moveSpeed * dt;
        this.desiredPosition.z += this.moveVector.z * this.moveSpeed * dt;

        const limitedPosition = this.vacuumSystem
            ? this.vacuumSystem.GetLimitedPlayerPosition(this.desiredPosition)
            : this.desiredPosition;

        root.setWorldPosition(limitedPosition);
        this.UpdateRotation(dt);
        this.animationController?.SetMoving(true);
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

    private LerpAngle(a: number, b: number, t: number): number {
        let delta = (b - a + 540) % 360 - 180;
        return a + delta * t;
    }
}
