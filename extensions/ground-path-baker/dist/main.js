'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EXTENSION_NAME = 'ground-path-baker';

function selectedNodeUuid() {
    const selected = Editor.Selection.getSelected('node');
    if (!selected || selected.length === 0) {
        throw new Error('Select Floor, GroundPaths, a path, or a path point in the Hierarchy first.');
    }
    return selected[0];
}

async function executeScene(method, args) {
    return Editor.Message.request('scene', 'execute-scene-script', {
        name: EXTENSION_NAME,
        method,
        args,
    });
}

async function snapshot() {
    try {
        await Editor.Message.request('scene', 'snapshot');
    } catch (_) {
        // Older editor builds can still track the direct scene changes.
    }
}

function showInfo(title, detail) {
    console.log(`[Ground Paths] ${title}: ${detail}`);
    try {
        Editor.Dialog.info(title, { detail });
    } catch (_) {
        // Console output is enough when no dialog host is available.
    }
}

function showError(error) {
    const detail = error && error.message ? error.message : String(error);
    console.error(`[Ground Paths] ${detail}`);
    try {
        Editor.Dialog.error('Ground Paths', { detail });
    } catch (_) {
        // Console output is enough when no dialog host is available.
    }
}

function resolveOutputPath(outputUrl) {
    const prefix = 'db://assets/';
    if (typeof outputUrl !== 'string' || !outputUrl.startsWith(prefix) || !outputUrl.toLowerCase().endsWith('.png')) {
        throw new Error('GroundPathBaker.outputUrl must be a PNG below db://assets/.');
    }

    const assetsRoot = path.resolve(Editor.Project.path, 'assets');
    const relativePath = outputUrl.slice(prefix.length).replace(/[\\/]+/g, path.sep);
    const outputPath = path.resolve(assetsRoot, relativePath);
    if (outputPath !== assetsRoot && !outputPath.startsWith(assetsRoot + path.sep)) {
        throw new Error(`Refusing to write outside project assets: ${outputPath}`);
    }
    return { assetsRoot, outputPath };
}

let crcTable = null;
function getCrcTable() {
    if (crcTable) {
        return crcTable;
    }
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
        let value = index;
        for (let bit = 0; bit < 8; bit++) {
            value = (value & 1) !== 0 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
        }
        crcTable[index] = value >>> 0;
    }
    return crcTable;
}

function crc32(buffer) {
    const table = getCrcTable();
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < buffer.length; index++) {
        crc = table[(crc ^ buffer[index]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(data.length, 0);
    const checksum = Buffer.allocUnsafe(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
    return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, rgba) {
    const expectedLength = width * height * 4;
    if (rgba.length !== expectedLength) {
        throw new Error(`Bake returned ${rgba.length} RGBA bytes; expected ${expectedLength}.`);
    }

    const header = Buffer.allocUnsafe(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    // Opaque RGB: avoids shipping and uploading an unused alpha channel.
    header[9] = 2;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;

    const stride = width * 3;
    const scanlines = Buffer.allocUnsafe((stride + 1) * height);
    for (let row = 0; row < height; row++) {
        const target = row * (stride + 1);
        scanlines[target] = 0;
        const source = row * width * 4;
        for (let column = 0; column < width; column++) {
            const sourcePixel = source + column * 4;
            const targetPixel = target + 1 + column * 3;
            scanlines[targetPixel] = rgba[sourcePixel];
            scanlines[targetPixel + 1] = rgba[sourcePixel + 1];
            scanlines[targetPixel + 2] = rgba[sourcePixel + 2];
        }
    }

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const compressed = zlib.deflateSync(scanlines, { level: 9 });
    return Buffer.concat([
        signature,
        pngChunk('IHDR', header),
        pngChunk('IDAT', compressed),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

async function readTextureUuid(metaPath) {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const subMetas = Object.values(meta.subMetas || {});
            const textureMeta = subMetas.find(item => item && item.importer === 'texture');
            if (textureMeta && textureMeta.uuid) {
                return textureMeta.uuid;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Cocos did not import the baked texture: ${metaPath}`);
}

async function setupSelectedFloor() {
    try {
        await snapshot();
        const result = await executeScene('setupFloor', [selectedNodeUuid()]);
        if (!result || !result.success) {
            throw new Error(result && result.error ? result.error : 'Could not set up the selected Floor.');
        }
        showInfo('Ground Paths', 'Floor configured. Move Point_* nodes, then choose Bake Selected Floor.');
        return result;
    } catch (error) {
        showError(error);
        return { success: false, error: error.message || String(error) };
    }
}

async function addPath() {
    try {
        await snapshot();
        const result = await executeScene('addPath', [selectedNodeUuid()]);
        if (!result || !result.success) {
            throw new Error(result && result.error ? result.error : 'Could not add path.');
        }
        return result;
    } catch (error) {
        showError(error);
        return { success: false, error: error.message || String(error) };
    }
}

async function addPoint() {
    try {
        await snapshot();
        const result = await executeScene('addPoint', [selectedNodeUuid()]);
        if (!result || !result.success) {
            throw new Error(result && result.error ? result.error : 'Could not add point.');
        }
        return result;
    } catch (error) {
        showError(error);
        return { success: false, error: error.message || String(error) };
    }
}

async function bakeSelectedFloor() {
    try {
        const result = await executeScene('bakeGround', [selectedNodeUuid()]);
        if (!result || !result.success || !result.data) {
            throw new Error(result && result.error ? result.error : 'Ground bake failed.');
        }

        const payload = result.data;
        if (payload.pathCount < 1) {
            throw new Error('The selected baker has no GroundPath components.');
        }
        const raw = Buffer.from(payload.rgbaBase64, 'base64');
        const png = encodePng(payload.width, payload.height, raw);
        const resolved = resolveOutputPath(payload.outputUrl);
        fs.mkdirSync(path.dirname(resolved.outputPath), { recursive: true });
        fs.writeFileSync(resolved.outputPath, png);

        const parentUrl = payload.outputUrl.slice(0, payload.outputUrl.lastIndexOf('/'));
        await Editor.Message.request('asset-db', 'refresh-asset', parentUrl);
        const textureUuid = await readTextureUuid(resolved.outputPath + '.meta');

        await snapshot();
        const applyResult = await executeScene('applyBakedTexture', [payload.bakerNodeUuid, textureUuid]);
        if (!applyResult || !applyResult.success) {
            throw new Error(applyResult && applyResult.error ? applyResult.error : 'Texture baked but could not be assigned.');
        }

        showInfo(
            'Ground baked',
            `${payload.width}x${payload.height}, ${payload.pathCount} path(s), ${payload.outputUrl}`,
        );
        return { success: true, data: payload.outputUrl };
    } catch (error) {
        showError(error);
        return { success: false, error: error.message || String(error) };
    }
}

exports.methods = {
    setupSelectedFloor,
    addPath,
    addPoint,
    bakeSelectedFloor,
};

exports.load = function load() {
    console.log('[Ground Paths] Extension loaded.');
};

exports.unload = function unload() {};

// Kept non-public in the extension UI; exported for automated project setup/tests.
exports._encodePng = encodePng;
