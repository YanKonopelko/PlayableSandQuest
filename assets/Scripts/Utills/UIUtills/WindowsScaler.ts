import { Component, _decorator, Node, Size, Vec2, Vec3, equals, math, CCBoolean, size, clamp, ResolutionPolicy } from "cc";
import { UITransform } from "cc";
import { view } from "cc";
import { CustomAction } from "../CustomActions";
import { Camera } from "cc";
import { EDITOR_NOT_IN_PREVIEW } from "cc/env";
const { ccclass, property, executeInEditMode } = _decorator;


export enum EOrientationType {
    Horizontal = 0,
    Vertical = 1
}

@ccclass('WindowsScaler')
@executeInEditMode(true)
export class WindowsScaler extends Component {
    @property(UITransform) private canvasTransform: UITransform = null;
    @property(Camera) private camera: Camera = null;
    @property(Number) private verticalRatio: number = 0.7;
    @property(Size) private screenSize: Size = new Size(1080, 1920);
    private static instance: WindowsScaler = null;

    private lastWindowSize: Size = null;
    private curRatio: number;
    private orientation: number = 0;
    private onUpdate: CustomAction = new CustomAction();
    private windowSizeInCanvas: Vec2 = new Vec2(0, 0);

    public static get Instance() {
        return WindowsScaler.instance;
    }

    public get Orientation() {
        return this.orientation;
    }

    public get CanvasWindowSize() {
        return this.windowSizeInCanvas.clone();
    }

    public get CurrentRatio(): number {
        return this.curRatio;
    }

    public get OnUpdate(): CustomAction {
        return this.onUpdate;
    }

    protected start(): void {
        WindowsScaler.instance = this;
    }
    protected update(dt: number): void {
        const frameSize = view.getFrameSize();

        const camHeight = this.camera.orthoHeight * 2;
        this.CanvasUpdate();
        // Для ортографической камеры ширина видимой области = высота * aspect ratio
        // Используем getFrameSize() для получения реального размера фрейма в пикселях
        // Это более точно отражает реальный размер viewport, чем window.innerWidth/innerHeight
        const aspect = frameSize.width / frameSize.height;

        // Вычисляем ширину видимой области в мировых единицах
        // Для ортографической камеры: ширина = высота * aspect ratio реального фрейма
        const camWidth = camHeight * aspect;


        var windowInnerWidth = camWidth;
        var windowInnerHeight = camHeight;
        let curWindowSize: Size = new Size(windowInnerWidth, windowInnerHeight);
        if(EDITOR_NOT_IN_PREVIEW) {
            curWindowSize = this.screenSize;
        }
        if (!this.lastWindowSize || !this.EqualSize(curWindowSize, this.lastWindowSize)) {
            this.curRatio = curWindowSize.x / curWindowSize.y;
            this.orientation = this.curRatio < this.verticalRatio ? EOrientationType.Vertical : EOrientationType.Horizontal;
            if (this.orientation == EOrientationType.Horizontal) {
                const visibleWidth = camHeight * this.curRatio;
                const visibleHeight = camHeight;
                this.windowSizeInCanvas = new Vec2(visibleWidth, visibleHeight);
            } else {
                const visibleWidth = camWidth;
                const visibleHeight = camWidth / this.curRatio;
                this.windowSizeInCanvas = new Vec2(visibleWidth, visibleHeight);
            }

            this.lastWindowSize = curWindowSize;
            console.log(`New Window Size: ${curWindowSize}`)
            console.log(`Ratio: ${this.curRatio}`)
            this.WindowSizeUpdate();

        }
    }

    private CanvasUpdate() {
        this.canvasTransform.contentSize = this.GetCameraSize();
    }
    private async WindowSizeUpdate() {
        this.onUpdate.Invoke();
    }
    private EqualSize(size1: Size, size2: Size): boolean {
        return size1.x == size2.x && size1.y == size2.y;
    }

    public GetCameraSize(): Size {
        const camHeight = this.camera.orthoHeight * 2;
        const frameSize = view.getFrameSize();
        const aspect = frameSize.width / frameSize.height;
        const camWidth = camHeight * aspect;
        let size = new Size(camWidth, camHeight);
          if(EDITOR_NOT_IN_PREVIEW) {
            size = this.screenSize;
        }
        return size;
    }
}