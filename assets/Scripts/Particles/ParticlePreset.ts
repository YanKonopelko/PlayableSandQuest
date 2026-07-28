import { _decorator, Enum, Prefab } from 'cc';

const { ccclass, property } = _decorator;

export enum EParticleType {
    VacuumUpgrade = 0,
}

@ccclass('ParticlePreset')
export class ParticlePreset {
    @property({ type: Enum(EParticleType) })
    public particleType: EParticleType = EParticleType.VacuumUpgrade;

    @property(Prefab)
    public prefab: Prefab | null = null;

    @property({ min: 0.1 })
    public duration: number = 1.5;
}
