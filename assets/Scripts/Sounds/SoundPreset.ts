import { Enum } from "cc";
import { AudioClip, CCFloat, _decorator } from "cc";
import { Utils } from "../Utills/Utils";

const { ccclass, property } = _decorator;

export enum ESoundType{
    None,
    Music,
    VacuumLoop,
    Step1,
    Step2,
    GetGoldNugget,
    SpendGold,
    MoneyGet,
    MoneySpend,
    LockInteract,
    Upgrade,
    ButtonClick,
    StopWarning,
}

@ccclass('SoundPreset')
export class SoundPreset {
    @property({ visible: true, type: Enum(ESoundType) }) public soundType: ESoundType = ESoundType.None;

    @property({ visible: true }) public PathPlusSoundName:string = "FolderName/AudioName";
    @property({ visible: true }) public bundleName:string = "Audio";

    @property isNecessary: boolean = true;
    @property({ type: CCFloat, range: [0, 1] }) volume: number = 0.5;

    public clip: AudioClip | null = null;

    public HasLoaded:boolean = false;
    private loadPromise: Promise<void> | null = null;

    public LoadClip(): Promise<void> {
        if (this.HasLoaded) {
            return Promise.resolve();
        }
        if (this.loadPromise) {
            return this.loadPromise;
        }

        this.loadPromise = Utils.LoadAudio(this.PathPlusSoundName, "", this.bundleName)
            .then((clip) => {
                this.clip = clip;
                this.HasLoaded = true;
                if (!clip) {
                    console.warn(`[SoundPreset] Failed to load ${this.bundleName}/${this.PathPlusSoundName}`);
                }
            })
            .finally(() => this.loadPromise = null);
        return this.loadPromise;
    }

}
