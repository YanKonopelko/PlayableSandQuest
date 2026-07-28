import { _decorator, Component, director, instantiate, Node, ParticleSystem, Quat, Vec3 } from 'cc';
import { EParticleType, ParticlePreset } from './ParticlePreset';

const { ccclass, property } = _decorator;

export { EParticleType } from './ParticlePreset';

@ccclass('ParticleManager')
export class ParticleManager extends Component {
    @property({ type: [ParticlePreset] })
    public presets: ParticlePreset[] = [];

    private static instance: ParticleManager | null = null;
    private readonly presetMap: Map<EParticleType, ParticlePreset> = new Map();
    private readonly activeParticles: Set<Node> = new Set();
    private readonly destroyCallbacks: Map<Node, () => void> = new Map();

    public static get Instance(): ParticleManager | null {
        if (this.instance?.node?.isValid) {
            return this.instance;
        }

        const sceneManager = director.getScene()?.getComponentInChildren(ParticleManager) ?? null;
        this.instance = sceneManager;
        return sceneManager;
    }

    protected onLoad(): void {
        if (ParticleManager.instance && ParticleManager.instance !== this) {
            console.warn('Only one ParticleManager may exist in a scene.');
            this.node.destroy();
            return;
        }

        ParticleManager.instance = this;
        this.RebuildPresetMap();
    }

    protected onDestroy(): void {
        this.StopAll();
        if (ParticleManager.instance === this) {
            ParticleManager.instance = null;
        }
    }

    public Play(type: EParticleType, worldPosition: Readonly<Vec3>, worldRotation?: Readonly<Quat>): Node | null {
        const preset = this.presetMap.get(type);
        if (!preset?.prefab) {
            console.warn(`Particle prefab is not configured for type: ${type}`);
            return null;
        }

        const particleNode = instantiate(preset.prefab);
        this.node.addChild(particleNode);
        particleNode.setWorldPosition(worldPosition);
        if (worldRotation) {
            particleNode.setWorldRotation(worldRotation);
        }
        particleNode.active = true;

        const particleSystems = particleNode.getComponentsInChildren(ParticleSystem);
        for (const particleSystem of particleSystems) {
            particleSystem.stop();
            particleSystem.clear();
            particleSystem.play();
        }

        this.activeParticles.add(particleNode);
        const destroyCallback = () => this.Stop(particleNode);
        this.destroyCallbacks.set(particleNode, destroyCallback);
        this.scheduleOnce(destroyCallback, Math.max(0.1, preset.duration));
        return particleNode;
    }

    public PlayAtNode(type: EParticleType, target: Node): Node | null {
        if (!target?.isValid) {
            console.warn(`Cannot play particle ${type}: target node is invalid.`);
            return null;
        }

        return this.Play(type, target.worldPosition, target.worldRotation);
    }

    public Stop(particleNode: Node): void {
        const destroyCallback = this.destroyCallbacks.get(particleNode);
        if (destroyCallback) {
            this.unschedule(destroyCallback);
            this.destroyCallbacks.delete(particleNode);
        }

        this.activeParticles.delete(particleNode);
        if (!particleNode?.isValid) {
            return;
        }

        for (const particleSystem of particleNode.getComponentsInChildren(ParticleSystem)) {
            particleSystem.stop();
            particleSystem.clear();
        }
        particleNode.destroy();
    }

    public StopAll(): void {
        for (const particleNode of [...this.activeParticles]) {
            this.Stop(particleNode);
        }
    }

    private RebuildPresetMap(): void {
        this.presetMap.clear();
        for (const preset of this.presets) {
            if (this.presetMap.has(preset.particleType)) {
                console.warn(`Duplicate particle preset for type: ${preset.particleType}`);
            }
            this.presetMap.set(preset.particleType, preset);
        }
    }
}
