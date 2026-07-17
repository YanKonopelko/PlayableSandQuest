import { _decorator, CCInteger, Component, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('HintTarget')
export class HintTarget extends Component {
    @property(Node)
    public pivot: Node | null = null;

    @property({ type: CCInteger })
    public priority: number = 0;

    @property(Vec3)
    public worldOffset: Vec3 = new Vec3(0, 1.5, 0);

    public GetWorldPosition(out: Vec3): Vec3 {
        const source = this.pivot ?? this.node;
        source.getWorldPosition(out);
        out.add(this.worldOffset);
        return out;
    }
}
