import { _decorator, Component, input, Input } from 'cc';
import { SoundManager } from './Sounds/SoundManager';
import { ESoundType } from './Sounds/SoundPreset';

declare global {
    interface Window {
        ToStore?: () => void;
    }
}

const { ccclass } = _decorator;

@ccclass('GameplayScene')
export class GameplayScene extends Component {
    public static paused: boolean = false;

    private readonly androidLink: string = 'https://play.google.com/store/apps/details?id=com.evrika.miner.camp';
    private readonly iosLink: string = 'https://apps.apple.com/app/id6447562895';

    private audioStarted: boolean = false;

    protected onLoad(): void {
        SoundManager.EnsureInstance();
    }

    protected start(): void {
        document.addEventListener('visibilitychange', this.OnVisibilityChanged);
        input.once(Input.EventType.TOUCH_START, this.StartAudioAfterFirstTap, this);
        void this.StartMusic();
    }

    protected onDestroy(): void {
        document.removeEventListener('visibilitychange', this.OnVisibilityChanged);
        input.off(Input.EventType.TOUCH_START, this.StartAudioAfterFirstTap, this);
    }

    public PlaySound(): void {
        SoundManager.Instance?.Play(ESoundType.None);
        this.ToStore();
    }

    public ToStore(): void {
        SoundManager.Instance?.Play(ESoundType.ButtonClick);
        window.ToStore?.();
    }

    private OnVisibilityChanged(): void {
        GameplayScene.paused = document.hidden;
        console.log(GameplayScene.paused ? 'PAUSE: tab hidden' : 'RESUME: tab active');
    }

    private async StartAudioAfterFirstTap(): Promise<void> {
        if (this.audioStarted) {
            return;
        }

        this.audioStarted = true;
        await this.StartMusic();
    }

    private async StartMusic(): Promise<void> {
        const soundManager = SoundManager.EnsureInstance();
        if (!soundManager) {
            return;
        }

        await soundManager.Init();
        if (soundManager.HasPreset(ESoundType.Music)) {
            soundManager.PlayMusic(ESoundType.Music);
        }
    }
}
