'use strict';

const { join } = require('path');
module.paths.push(join(Editor.App.path, 'node_modules'));

const {
    assetManager,
    director,
    js,
    Material,
    MeshRenderer,
    Node,
    Texture2D,
    Vec2,
    Vec3,
} = require('cc');

const GROUND_MATERIAL_UUID = 'b4c81fd0-0b13-4e89-a56d-ff376cf75d02';
const PREVIEW_MATERIAL_UUID = 'b4c81fd0-0b13-4e89-a56d-ff376cf75d04';

function findNode(uuid) {
    const scene = director.getScene();
    if (!scene) {
        return null;
    }
    const visit = node => {
        if (node.uuid === uuid) {
            return node;
        }
        for (const child of node.children) {
            const found = visit(child);
            if (found) {
                return found;
            }
        }
        return null;
    };
    return visit(scene);
}

function classByName(name) {
    const componentClass = js.getClassByName(name);
    if (!componentClass) {
        throw new Error(`${name} is not compiled yet. Wait for script compilation and try again.`);
    }
    return componentClass;
}

function loadAsset(uuid) {
    return new Promise((resolve, reject) => {
        assetManager.loadAny({ uuid }, (error, asset) => {
            if (error) {
                reject(error);
            } else {
                resolve(asset);
            }
        });
    });
}

function isDescendant(node, ancestor) {
    let current = node;
    while (current) {
        if (current === ancestor) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

function findBaker(selectedNode) {
    const BakerClass = classByName('GroundPathBaker');
    let current = selectedNode;
    while (current) {
        const baker = current.getComponent(BakerClass);
        if (baker) {
            return baker;
        }
        current = current.parent;
    }

    const scene = director.getScene();
    const bakers = scene ? scene.getComponentsInChildren(BakerClass) : [];
    return bakers.find(baker => baker.pathRoot && isDescendant(selectedNode, baker.pathRoot)) || null;
}

function findPath(selectedNode) {
    const PathClass = classByName('GroundPath');
    let current = selectedNode;
    while (current) {
        const path = current.getComponent(PathClass);
        if (path) {
            return path;
        }
        current = current.parent;
    }
    return null;
}

function createPoint(pathNode, position) {
    const point = new Node(`Point_${String(pathNode.children.length).padStart(2, '0')}`);
    point.setParent(pathNode);
    point.setPosition(position);
    return point;
}

function nextPathName(pathRoot) {
    let index = 1;
    while (pathRoot.getChildByName(`Path_${String(index).padStart(2, '0')}`)) {
        index++;
    }
    return `Path_${String(index).padStart(2, '0')}`;
}

function createPathInternal(baker, previewMaterial) {
    const PathClass = classByName('GroundPath');
    const pathNode = new Node(nextPathName(baker.pathRoot));
    pathNode.setParent(baker.pathRoot);
    pathNode.setPosition(0, 0.025, 0);
    const path = pathNode.addComponent(PathClass);
    path.width = 1.35;
    path.edgeFeather = 0.28;
    path.edgeNoise = 0.12;
    path.samplesPerSegment = 8;
    path.previewMaterial = previewMaterial;
    createPoint(pathNode, new Vec3(-3.5, 0, -2));
    createPoint(pathNode, new Vec3(0, 0, 0));
    createPoint(pathNode, new Vec3(3.5, 0, 2));
    path.forcePreviewRebuild();
    return path;
}

async function setupFloor(nodeUuid) {
    try {
        const floor = findNode(nodeUuid);
        if (!floor) {
            throw new Error('Selected node no longer exists.');
        }
        const renderer = floor.getComponent(MeshRenderer);
        if (!renderer) {
            throw new Error('Selected node must be the Floor node with a MeshRenderer.');
        }

        const BakerClass = classByName('GroundPathBaker');
        const baker = floor.getComponent(BakerClass) || floor.addComponent(BakerClass);
        const groundMaterial = await loadAsset(GROUND_MATERIAL_UUID);
        const previewMaterial = await loadAsset(PREVIEW_MATERIAL_UUID);
        if (!(groundMaterial instanceof Material) || !(previewMaterial instanceof Material)) {
            throw new Error('Ground material assets are not imported yet.');
        }

        baker.meshRenderer = renderer;
        baker.groundMaterial = groundMaterial;
        baker.bakeWorldSize = new Vec2(50, 50);
        baker.bakeWorldCenter = new Vec2(0, 0);
        baker.sourceMeshLocalSize = new Vec2(10, 10);
        baker.bakeResolution = 512;

        if (!baker.pathRoot || !baker.pathRoot.isValid) {
            const parent = floor.parent || director.getScene();
            let pathRoot = parent.getChildByName('GroundPaths');
            if (!pathRoot) {
                pathRoot = new Node('GroundPaths');
                pathRoot.setParent(parent);
                pathRoot.setWorldPosition(floor.worldPosition);
                pathRoot.setWorldRotation(floor.worldRotation);
            }
            baker.pathRoot = pathRoot;
        }

        const PathClass = classByName('GroundPath');
        const existingPaths = baker.pathRoot.getComponentsInChildren(PathClass);
        if (existingPaths.length === 0) {
            createPathInternal(baker, previewMaterial);
        } else {
            for (const path of existingPaths) {
                path.previewMaterial = previewMaterial;
                path.forcePreviewRebuild();
            }
        }
        baker.applyBakedMaterial();

        return {
            success: true,
            data: {
                bakerNodeUuid: floor.uuid,
                pathRootUuid: baker.pathRoot.uuid,
            },
        };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

async function addPath(nodeUuid) {
    try {
        const selectedNode = findNode(nodeUuid);
        const baker = selectedNode ? findBaker(selectedNode) : null;
        if (!baker || !baker.pathRoot) {
            throw new Error('Select a configured Floor or one of its GroundPaths nodes.');
        }
        const previewMaterial = await loadAsset(PREVIEW_MATERIAL_UUID);
        const path = createPathInternal(baker, previewMaterial);
        return { success: true, data: { pathNodeUuid: path.node.uuid } };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

function addPoint(nodeUuid) {
    try {
        const selectedNode = findNode(nodeUuid);
        const path = selectedNode ? findPath(selectedNode) : null;
        if (!path) {
            throw new Error('Select a Path_* node or one of its Point_* children.');
        }

        const points = path.node.children;
        let position = new Vec3(2, 0, 0);
        if (points.length === 1) {
            const last = points[0].position;
            position = new Vec3(last.x + 2, last.y, last.z);
        } else if (points.length >= 2) {
            const last = points[points.length - 1].position;
            const previous = points[points.length - 2].position;
            position = new Vec3(
                last.x + (last.x - previous.x),
                last.y + (last.y - previous.y),
                last.z + (last.z - previous.z),
            );
        }
        const point = createPoint(path.node, position);
        path.forcePreviewRebuild();
        return { success: true, data: { pointNodeUuid: point.uuid } };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

function bakeGround(nodeUuid) {
    try {
        const selectedNode = findNode(nodeUuid);
        const baker = selectedNode ? findBaker(selectedNode) : null;
        if (!baker) {
            throw new Error('Select a configured Floor or one of its GroundPaths nodes.');
        }
        return { success: true, data: baker.createBakePayload() };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

async function applyBakedTexture(bakerNodeUuid, textureUuid) {
    try {
        const bakerNode = findNode(bakerNodeUuid);
        const baker = bakerNode ? findBaker(bakerNode) : null;
        if (!baker) {
            throw new Error('GroundPathBaker disappeared before texture assignment.');
        }
        const texture = await loadAsset(textureUuid);
        if (!(texture instanceof Texture2D)) {
            throw new Error('Imported baked asset is not a Texture2D.');
        }
        baker.bakedTexture = texture;
        baker.applyBakedMaterial();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

exports.methods = {
    setupFloor,
    addPath,
    addPoint,
    bakeGround,
    applyBakedTexture,
};

exports.load = function load() {};
exports.unload = function unload() {};
