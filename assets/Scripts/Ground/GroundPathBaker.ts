import {
    _decorator,
    CCInteger,
    Color,
    Component,
    Material,
    MeshRenderer,
    Node,
    Texture2D,
    Vec2,
    Vec3,
    Vec4,
} from 'cc';
import { GroundPath } from './GroundPath';
import { distanceToSegmentSquared } from './GroundPathMath';

const { ccclass, executeInEditMode, property } = _decorator;

export interface GroundBakePayload {
    bakerNodeUuid: string;
    width: number;
    height: number;
    rgbaBase64: string;
    outputUrl: string;
    pathCount: number;
}

/**
 * Converts editor-authored GroundPath splines into a single opaque ground texture.
 * Baking is invoked by the Ground Paths editor extension.
 */
@ccclass('GroundPathBaker')
@executeInEditMode(true)
export class GroundPathBaker extends Component {
    @property({ type: MeshRenderer, tooltip: 'Renderer of the plane receiving the baked texture.' })
    public meshRenderer: MeshRenderer | null = null;

    @property({ type: Material, tooltip: 'Optimized one-texture ground material.' })
    public groundMaterial: Material | null = null;

    @property({ type: Texture2D, tooltip: 'Last baked texture. Assigned automatically by the editor extension.' })
    public bakedTexture: Texture2D | null = null;

    @property({ type: Node, tooltip: 'Root containing GroundPath components.' })
    public pathRoot: Node | null = null;

    @property({ type: Vec2, tooltip: 'World-space XZ size covered by the baked texture.' })
    public bakeWorldSize = new Vec2(50, 50);

    @property({ type: Vec2, tooltip: 'World-space XZ offset of the baked area from the Floor centre.' })
    public bakeWorldCenter = new Vec2(0, 0);

    @property({ type: Vec2, tooltip: 'Unscaled local size of the floor mesh. Cocos built-in Plane is 10 x 10.' })
    public sourceMeshLocalSize = new Vec2(10, 10);

    @property({ type: CCInteger, min: 128, max: 2048, step: 128, tooltip: 'Square baked texture size.' })
    public bakeResolution = 512;

    @property({ tooltip: 'Base dry clay colour.' })
    public clayColor = new Color(184, 108, 67, 255);

    @property({ tooltip: 'Compressed and walked-on clay colour.' })
    public pathColor = new Color(126, 76, 52, 255);

    @property({ min: 0, max: 0.5, step: 0.01, tooltip: 'Large-scale clay brightness variation.' })
    public macroVariation = 0.16;

    @property({ min: 0, max: 0.25, step: 0.01, tooltip: 'Fine clay grain brightness variation.' })
    public fineVariation = 0.055;

    @property({ min: 0.1, max: 20, step: 0.1, tooltip: 'Number of broad colour patches over the floor.' })
    public macroScale = 4.2;

    @property({ min: 1, max: 200, step: 1, tooltip: 'Frequency of the fine baked grain.' })
    public fineScale = 58;

    @property({ step: 1, tooltip: 'Stable seed used by clay and edge noise.' })
    public seed = 8317;

    @property({ tooltip: 'Texture asset written by Ground Paths/Bake Selected Floor.' })
    public outputUrl = 'db://assets/Generated/Ground_Baked.png';

    protected onEnable(): void {
        this.applyBakedMaterial();
    }

    protected onValidate(): void {
        this.applyBakedMaterial();
    }

    public applyBakedMaterial(): void {
        const renderer = this.meshRenderer ?? this.getComponent(MeshRenderer);
        if (!renderer || !this.groundMaterial) {
            return;
        }

        this.meshRenderer = renderer;
        renderer.setMaterial(this.groundMaterial, 0);
        const instance = renderer.getMaterialInstance(0);
        if (instance) {
            const worldScale = this.node.worldScale;
            const sourceWorldWidth = Math.max(0.001, Math.abs(this.sourceMeshLocalSize.x * worldScale.x));
            const sourceWorldDepth = Math.max(0.001, Math.abs(this.sourceMeshLocalSize.y * worldScale.z));
            const bakeWidth = Math.max(0.001, Math.abs(this.bakeWorldSize.x));
            const bakeDepth = Math.max(0.001, Math.abs(this.bakeWorldSize.y));
            instance.setProperty('bakeUvTransform', new Vec4(
                sourceWorldWidth / bakeWidth,
                sourceWorldDepth / bakeDepth,
                -this.bakeWorldCenter.x / bakeWidth,
                -this.bakeWorldCenter.y / bakeDepth,
            ));
        }
        if (this.bakedTexture && instance) {
            instance?.setProperty('mainTexture', this.bakedTexture);
        }
    }

    public createBakePayload(): GroundBakePayload {
        const resolution = Math.max(128, Math.min(2048, Math.round(this.bakeResolution)));
        const pixels = new Uint8Array(resolution * resolution * 4);
        const mask = new Float32Array(resolution * resolution);
        const paths = this.pathRoot?.getComponentsInChildren(GroundPath) ?? [];

        for (let index = 0; index < paths.length; index++) {
            this.rasterizePath(mask, resolution, paths[index], index);
        }
        this.colorize(pixels, mask, resolution);

        return {
            bakerNodeUuid: this.node.uuid,
            width: resolution,
            height: resolution,
            rgbaBase64: this.encodeBase64(pixels),
            outputUrl: this.outputUrl,
            pathCount: paths.length,
        };
    }

    private rasterizePath(mask: Float32Array, resolution: number, path: GroundPath, pathIndex: number): void {
        const worldPoints = path.getSampledWorldPoints();
        if (worldPoints.length < 2) {
            return;
        }

        const localPoint = new Vec3();
        const pixelPoints: Vec2[] = [];
        const sizeX = Math.max(0.001, Math.abs(this.bakeWorldSize.x));
        const sizeZ = Math.max(0.001, Math.abs(this.bakeWorldSize.y));
        const minX = this.bakeWorldCenter.x - sizeX * 0.5;
        const minZ = this.bakeWorldCenter.y - sizeZ * 0.5;
        const worldScale = this.node.worldScale;
        const scaleX = Math.abs(worldScale.x);
        const scaleZ = Math.abs(worldScale.z);

        for (const worldPoint of worldPoints) {
            this.node.inverseTransformPoint(localPoint, worldPoint);
            const u = (localPoint.x * scaleX - minX) / sizeX;
            const v = (localPoint.z * scaleZ - minZ) / sizeZ;
            pixelPoints.push(new Vec2(u * (resolution - 1), (1 - v) * (resolution - 1)));
        }

        const groundWorldWidth = sizeX;
        const groundWorldDepth = sizeZ;
        const pixelsPerWorld = 0.5 * (
            (resolution - 1) / groundWorldWidth
            + (resolution - 1) / groundWorldDepth
        );
        const radius = Math.max(0.5, path.width * 0.5 * pixelsPerWorld);
        const feather = Math.max(0, path.edgeFeather * pixelsPerWorld);
        const noiseAmplitude = Math.max(0, path.edgeNoise * pixelsPerWorld);
        const padding = Math.ceil(radius + feather + noiseAmplitude + 2);
        const noiseSeed = this.seed + pathIndex * 977;

        for (let segment = 0; segment < pixelPoints.length - 1; segment++) {
            const a = pixelPoints[segment];
            const b = pixelPoints[segment + 1];
            const minPixelX = Math.max(0, Math.floor(Math.min(a.x, b.x) - padding));
            const maxPixelX = Math.min(resolution - 1, Math.ceil(Math.max(a.x, b.x) + padding));
            const minPixelY = Math.max(0, Math.floor(Math.min(a.y, b.y) - padding));
            const maxPixelY = Math.min(resolution - 1, Math.ceil(Math.max(a.y, b.y) + padding));

            for (let y = minPixelY; y <= maxPixelY; y++) {
                for (let x = minPixelX; x <= maxPixelX; x++) {
                    const distance = Math.sqrt(distanceToSegmentSquared(
                        x + 0.5,
                        y + 0.5,
                        a.x,
                        a.y,
                        b.x,
                        b.y,
                    ));
                    const edgeNoise = (this.fractalNoise(x * 0.055, y * 0.055, noiseSeed, 2) - 0.5)
                        * 2 * noiseAmplitude;
                    const noisyRadius = Math.max(0, radius + edgeNoise);
                    let coverage = 0;
                    if (distance <= noisyRadius) {
                        coverage = 1;
                    } else if (feather > 0 && distance < noisyRadius + feather) {
                        coverage = 1 - this.smoothStep(noisyRadius, noisyRadius + feather, distance);
                    }

                    const maskIndex = y * resolution + x;
                    if (coverage > mask[maskIndex]) {
                        mask[maskIndex] = coverage;
                    }
                }
            }
        }
    }

    private colorize(pixels: Uint8Array, mask: Float32Array, resolution: number): void {
        const seed = Math.floor(this.seed);
        for (let y = 0; y < resolution; y++) {
            const v = y / Math.max(1, resolution - 1);
            for (let x = 0; x < resolution; x++) {
                const u = x / Math.max(1, resolution - 1);
                const macro = this.fractalNoise(u * this.macroScale, v * this.macroScale, seed, 4);
                const fine = this.fractalNoise(u * this.fineScale, v * this.fineScale, seed + 193, 2);
                const clayBrightness = 1
                    + (macro - 0.5) * 2 * this.macroVariation
                    + (fine - 0.5) * 2 * this.fineVariation;
                const pathBrightness = 0.94 + (macro - 0.5) * 0.1 + (fine - 0.5) * 0.06;
                const maskValue = mask[y * resolution + x];
                const pixelIndex = (y * resolution + x) * 4;

                const clayR = this.clampByte(this.clayColor.r * clayBrightness);
                const clayG = this.clampByte(this.clayColor.g * clayBrightness);
                const clayB = this.clampByte(this.clayColor.b * clayBrightness);
                const pathR = this.clampByte(this.pathColor.r * pathBrightness);
                const pathG = this.clampByte(this.pathColor.g * pathBrightness);
                const pathB = this.clampByte(this.pathColor.b * pathBrightness);

                pixels[pixelIndex] = this.clampByte(clayR + (pathR - clayR) * maskValue);
                pixels[pixelIndex + 1] = this.clampByte(clayG + (pathG - clayG) * maskValue);
                pixels[pixelIndex + 2] = this.clampByte(clayB + (pathB - clayB) * maskValue);
                pixels[pixelIndex + 3] = 255;
            }
        }
    }

    private fractalNoise(x: number, y: number, seed: number, octaves: number): number {
        let value = 0;
        let amplitude = 0.5;
        let totalAmplitude = 0;
        for (let octave = 0; octave < octaves; octave++) {
            value += this.valueNoise(x, y, seed + octave * 1013) * amplitude;
            totalAmplitude += amplitude;
            x = x * 2.03 + 17.17;
            y = y * 2.03 - 9.41;
            amplitude *= 0.5;
        }
        return totalAmplitude > 0 ? value / totalAmplitude : 0.5;
    }

    private valueNoise(x: number, y: number, seed: number): number {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const tx = x - x0;
        const ty = y - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = this.hash(x0, y0, seed);
        const b = this.hash(x0 + 1, y0, seed);
        const c = this.hash(x0, y0 + 1, seed);
        const d = this.hash(x0 + 1, y0 + 1, seed);
        const top = a + (b - a) * sx;
        const bottom = c + (d - c) * sx;
        return top + (bottom - top) * sy;
    }

    private hash(x: number, y: number, seed: number): number {
        let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
        value = Math.imul(value ^ (value >>> 13), 1274126177);
        return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    }

    private smoothStep(edge0: number, edge1: number, value: number): number {
        if (edge1 <= edge0) {
            return value >= edge1 ? 1 : 0;
        }
        const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    private clampByte(value: number): number {
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    private encodeBase64(bytes: Uint8Array): string {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const chunks: string[] = [];
        let chunk = '';
        for (let index = 0; index < bytes.length; index += 3) {
            const a = bytes[index];
            const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
            const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
            const packed = (a << 16) | (b << 8) | c;
            chunk += characters[(packed >>> 18) & 63]
                + characters[(packed >>> 12) & 63]
                + (index + 1 < bytes.length ? characters[(packed >>> 6) & 63] : '=')
                + (index + 2 < bytes.length ? characters[packed & 63] : '=');
            if (chunk.length >= 12288) {
                chunks.push(chunk);
                chunk = '';
            }
        }
        if (chunk) {
            chunks.push(chunk);
        }
        return chunks.join('');
    }
}
