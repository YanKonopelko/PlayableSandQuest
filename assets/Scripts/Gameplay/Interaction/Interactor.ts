import { _decorator, BoxCollider, Component, ITriggerEvent, Node } from 'cc';
import { CustomActionWithParam } from '../../Utills/CustomActions';
import { RequiredReference } from '../Core/RequiredReference';

const { ccclass, property } = _decorator;

@ccclass('Interactor')
export class Interactor extends Component {
    @property(BoxCollider)
    public trigger: BoxCollider | null = null;

    @property(Node)
    public playerRoot: Node | null = null;

    public readonly onPlayerEnter: CustomActionWithParam<Interactor> = new CustomActionWithParam<Interactor>();
    public readonly onPlayerExit: CustomActionWithParam<Interactor> = new CustomActionWithParam<Interactor>();

    private playerInside: boolean = false;

    public get IsPlayerInside(): boolean {
        return this.playerInside;
    }

    protected onLoad(): void {
        RequiredReference.Check(this, this.trigger, 'trigger');
        RequiredReference.CheckNode(this, this.playerRoot, 'playerRoot');
    }

    protected onEnable(): void {
        this.trigger?.on('onTriggerEnter', this.OnTriggerEnter, this);
        this.trigger?.on('onTriggerExit', this.OnTriggerExit, this);
    }

    protected onDisable(): void {
        this.trigger?.off('onTriggerEnter', this.OnTriggerEnter, this);
        this.trigger?.off('onTriggerExit', this.OnTriggerExit, this);
    }

    private OnTriggerEnter(event: ITriggerEvent): void {
        if (!this.IsPlayer(event.otherCollider?.node)) {
            return;
        }

        this.playerInside = true;
        this.HandlePlayerEnter();
        this.onPlayerEnter.Invoke(this);
    }

    private OnTriggerExit(event: ITriggerEvent): void {
        if (!this.IsPlayer(event.otherCollider?.node)) {
            return;
        }

        this.playerInside = false;
        this.HandlePlayerExit();
        this.onPlayerExit.Invoke(this);
    }

    protected HandlePlayerEnter(): void {
    }

    protected HandlePlayerExit(): void {
    }

    private IsPlayer(node: Node | null | undefined): boolean {
        if (!node || !this.playerRoot) {
            return false;
        }

        let current: Node | null = node;
        while (current) {
            if (current === this.playerRoot) {
                return true;
            }
            current = current.parent;
        }

        return false;
    }
}
