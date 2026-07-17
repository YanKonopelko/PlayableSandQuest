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

    private audioStarted: boolean = false;

    protected start(): void {
        document.addEventListener('visibilitychange', this.OnVisibilityChanged);
        input.once(Input.EventType.TOUCH_START, this.StartAudioAfterFirstTap, this);
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
        window.ToStore?.();
    }

    private OnVisibilityChanged(): void {
        GameplayScene.paused = document.hidden;
        console.log(GameplayScene.paused ? 'PAUSE: tab hidden' : 'RESUME: tab active');
    }

    private async StartAudioAfterFirstTap(): Promise<void> {
        if (this.audioStarted || !SoundManager.Instance) {
            return;
        }

        this.audioStarted = true;
        await SoundManager.Instance.Init();
        SoundManager.Instance.PlayMusic(ESoundType.Music);
    }
}
