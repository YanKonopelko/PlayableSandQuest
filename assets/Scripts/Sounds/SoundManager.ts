import { _decorator, AudioClip, AudioSource, Component, director, Node } from 'cc';
import { TimeUtils } from '../Utills/TimeUtils';
import { GameplayScene } from '../GameplayScene';
import { ESoundType, SoundPreset } from './SoundPreset';

const { ccclass, property } = _decorator;

@ccclass('SoundManager')
export class SoundManager extends Component {
    @property({ type: [SoundPreset] })
    public presets: SoundPreset[] = [];

    @property({ type: AudioSource })
    public musicSource: AudioSource | null = null;

    @property({ type: AudioSource })
    public soundSource: AudioSource | null = null;

    private static instance: SoundManager | null = null;
    private readonly presetMap: Map<ESoundType, SoundPreset> = new Map();
    private readonly stopableSources: Map<ESoundType, AudioSource> = new Map();
    private readonly stopableSoundsSources: AudioSource[] = [];
    private initPromise: Promise<void> | null = null;
    private _soundMuted: boolean = false;
    private _musicEnabled: boolean = true;
    private _soundSourceVolume: number = 1;
    private _originalVolume: number = 1;
    private currentMusic: ESoundType | null = null;

    public static get Instance(): SoundManager | null {
        return this.instance;
    }

    public static EnsureInstance(): SoundManager | null {
        if (this.instance?.node?.isValid) {
            return this.instance;
        }

        const scene = director.getScene();
        if (!scene) {
            return null;
        }

        const sceneManager = scene.getComponentInChildren(SoundManager);
        if (sceneManager) {
            this.instance = sceneManager;
            sceneManager.EnsureAudioSources();
            return sceneManager;
        }

        const node = new Node('SoundManager');
        scene.addChild(node);
        const manager = node.addComponent(SoundManager);
        manager.EnsureAudioSources();
        return manager;
    }

    public get soundMuted(): boolean {
        return this._soundMuted;
    }

    public get musicEnabled(): boolean {
        return this._musicEnabled;
    }

    public set soundMuted(value: boolean) {
        this._soundMuted = value;
        this.stopableSources.forEach((source, type) => {
            source.volume = value ? 0 : (this.presetMap.get(type)?.volume ?? 0.5);
        });
        if (this.soundSource) {
            this.soundSource.volume = value ? 0 : this._soundSourceVolume;
        }
    }

    public set musicEnabled(value: boolean) {
        this._musicEnabled = value;
        if (this.musicSource) {
            this.musicSource.volume = value ? this._originalVolume : 0;
        }
    }

    protected onLoad(): void {
        if (SoundManager.instance && SoundManager.instance !== this) {
            this.node.destroy();
            return;
        }

        SoundManager.instance = this;
        this.EnsureAudioSources();
        this._soundSourceVolume = this.soundSource?.volume ?? 1;
        this.EnsureDefaultPresets();
        this.RebuildPresetMap();

        if (this.node.parent === director.getScene()) {
            director.addPersistRootNode(this.node);
        }
    }

    protected start(): void {
        void this.Init();
    }

    protected onDestroy(): void {
        if (SoundManager.instance === this) {
            SoundManager.instance = null;
        }
    }

    public mute(value: boolean): void {
        this.soundMuted = value;
        this.musicEnabled = !value;
    }

    public Init(): Promise<void> {
        if (!this.initPromise) {
            this.EnsureDefaultPresets();
            this.RebuildPresetMap();
            this.initPromise = Promise.all(
                this.presets
                    .filter((preset) => preset.isNecessary)
                    .map((preset) => preset.LoadClip()),
            ).then(() => this.LoadAllClips());
        }
        return this.initPromise;
    }

    public LoadAllClips(): void {
        this.presets.forEach((preset) => void preset.LoadClip());
    }

    public HasPreset(type: ESoundType): boolean {
        return this.presetMap.has(type);
    }

    public Play(type: ESoundType, isStopable: boolean = false, isLoop: boolean = false): void {
        const preset = this.presetMap.get(type);
        if (!preset) {
            console.warn(`Have no presets for type: ${type}`);
            return;
        }

        if (!preset.HasLoaded) {
            void preset.LoadClip().then(() => {
                if (preset.clip) {
                    this.Play(type, isStopable, isLoop);
                }
            });
            return;
        }

        if (isStopable) {
            void this.PlayStopableSound(preset, isLoop);
        } else {
            this.PlayLocal(preset);
        }
    }

    public PlayMusic(type: ESoundType): void {
        const preset = this.presetMap.get(type);
        if (!preset) {
            console.warn(`Have no presets for type: ${type}`);
            return;
        }

        if (!preset.HasLoaded) {
            void preset.LoadClip().then(() => {
                if (preset.clip) {
                    this.PlayMusic(type);
                }
            });
            return;
        }

        this.PlayMusicLocal(preset);
    }

    public PauseMusic(): void {
        if (this.musicSource?.playing) {
            this.musicSource.pause();
        }
    }

    public ResumeMusic(): void {
        if (this.musicSource && !this.musicSource.playing && this.musicSource.clip) {
            this.musicSource.play();
        }
    }

    public StopStopableSound(type: ESoundType): void {
        const source = this.stopableSources.get(type);
        if (!source) {
            return;
        }

        source.stop();
        source.clip = null;
        this.stopableSources.delete(type);
    }

    public StopAllSounds(): void {
        this.stopableSources.forEach((source) => {
            source.stop();
            source.clip = null;
        });
        this.stopableSources.clear();
    }

    private PlayLocal(preset: SoundPreset): void {
        if (this._soundMuted || GameplayScene.paused || !preset.clip || !this.soundSource) {
            return;
        }

        this.soundSource.playOneShot(preset.clip, preset.volume);
    }

    private PlayMusicLocal(preset: SoundPreset): void {
        if (GameplayScene.paused || !preset.clip || !this.musicSource) {
            return;
        }

        if (this.musicSource.playing && this.musicSource.clip && this.currentMusic === preset.soundType) {
            return;
        }

        this._originalVolume = preset.volume;
        this.musicSource.volume = this.musicEnabled ? preset.volume : 0;
        this.musicSource.loop = true;
        this.musicSource.stop();
        this.musicSource.clip = preset.clip;
        this.musicSource.play();
        this.currentMusic = preset.soundType;
    }

    private async PlayStopableSound(preset: SoundPreset, isLoop: boolean): Promise<void> {
        if (this._soundMuted || GameplayScene.paused || !preset.clip) {
            return;
        }

        const clip: AudioClip = preset.clip;
        const alreadyPlaying = this.stopableSoundsSources.find(
            (candidate) => candidate.clip === clip && candidate.playing,
        );
        if (alreadyPlaying) {
            return;
        }

        let source = this.stopableSoundsSources.find((candidate) => !candidate.playing) ?? null;
        if (!source) {
            source = this.node.addComponent(AudioSource);
            this.stopableSoundsSources.push(source);
        }

        this.stopableSources.set(preset.soundType, source);
        source.volume = preset.volume;
        source.clip = clip;
        source.loop = isLoop;
        source.play();

        if (isLoop) {
            return;
        }

        await TimeUtils.TimeoutSeconds(clip.getDuration());
        if (source.clip === clip) {
            this.StopStopableSound(preset.soundType);
        }
    }

    private EnsureAudioSources(): void {
        this.musicSource ??= this.node.addComponent(AudioSource);
        this.soundSource ??= this.node.addComponent(AudioSource);
        if (this._soundMuted) {
            this.soundSource.volume = 0;
        }
    }

    private EnsureDefaultPresets(): void {
        const defaults: Array<[ESoundType, string, number]> = [
            [ESoundType.Music, 'Music', 0.3],
            [ESoundType.VacuumLoop, '01_vacuum_loop', 0.28],
            [ESoundType.Step1, 'stepSound', 0.38],
            [ESoundType.Step2, 'stepSound_2', 0.38],
            [ESoundType.GetGoldNugget, 'GetGoldNuggetSound', 0.55],
            [ESoundType.SpendGold, 'SpendGold', 0.65],
            [ESoundType.MoneyGet, 'MoneyGet', 0.6],
            [ESoundType.MoneySpend, 'MoneySpend', 0.6],
            [ESoundType.LockInteract, 'LockInteract', 0.55],
            [ESoundType.Upgrade, 'Upgrade', 0.7],
            [ESoundType.ButtonClick, 'ButtonClick', 0.7],
            [ESoundType.StopWarning, 'StopSound', 0.75],
        ];
        const configuredTypes = new Set(this.presets.map((preset) => preset.soundType));

        for (const [soundType, path, volume] of defaults) {
            if (configuredTypes.has(soundType)) {
                continue;
            }

            const preset = new SoundPreset();
            preset.soundType = soundType;
            preset.PathPlusSoundName = path;
            preset.bundleName = 'Audio';
            preset.isNecessary = true;
            preset.volume = volume;
            this.presets.push(preset);
        }
    }

    private RebuildPresetMap(): void {
        this.presetMap.clear();
        this.presets.forEach((preset) => this.presetMap.set(preset.soundType, preset));
    }
}
