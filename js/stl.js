/**
 * STL Import Module
 * Handles STL file import, parsing, positioning, and height map generation.
 * Uses Three.js STLLoader for parsing binary and ASCII STL files.
 */

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader';

// Global state for STL models
window.stlModels = window.stlModels || [];
window.stlModelId = window.stlModelId || 0;

const stlLoader = new STLLoader();

/**
 * Import an STL file from a File object (called from bootstrap-layout file input handler)
 */
window.importSTLFile = function(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const arrayBuffer = event.target.result;
        try {
            const geometry = stlLoader.parse(arrayBuffer);
            geometry.computeVertexNormals();

            const model = createSTLModel(geometry, file.name);
            positionSTLModel(model);
            window.stlModels.push(model);

            console.log('STL imported:', model.name,
                'Triangles:', geometry.attributes.position.count / 3,
                'Bounds (mm):', model.bbox3d);

            // Add to 3D view
            addSTLMesh3D(model);

            // Generate height map for 2D view
            generateHeightMap(model, 0.5);

            // Create bounding box svgpath so the STL can be selected/moved/scaled
            createSTLBoundingPath(model);

            if (typeof window.redraw === 'function') window.redraw();
        } catch (e) {
            console.error('Failed to parse STL file:', e);
            alert('Failed to parse STL file: ' + e.message);
        }
    };
    reader.readAsArrayBuffer(file);
};

/**
 * Create an STL model object from parsed geometry
 */
function createSTLModel(geometry, filename) {
    const id = 'STL' + (++window.stlModelId);
    const name = filename.replace(/\.stl$/i, '');

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;

    return {
        id: id,
        name: name,
        geometry: geometry,
        mesh: null,
        heightMap: null,
        bbox3d: {
            min: { x: bb.min.x, y: bb.min.y, z: bb.min.z },
            max: { x: bb.max.x, y: bb.max.y, z: bb.max.z }
        },
        // Transform applied during positioning (in mm)
        transform: { offsetX: 0, offsetY: 0, offsetZ: 0, scale: 1 },
        visible: true,
        selected: false
    };
}

/**
 * Position STL model on the workpiece:
 * - Center XY on workpiece
 * - Place top surface at Z=0 (CNC convention: Z=0 is stock top)
 * - Scale to fit within workpiece if larger
 */
function positionSTLModel(model) {
    const bb = model.bbox3d;
    const stlWidth = bb.max.x - bb.min.x;
    const stlHeight = bb.max.y - bb.min.y;
    const stlDepth = bb.max.z - bb.min.z;

    // Get workpiece dimensions from global options (in mm)
    const getOpt = window.getOption || (() => undefined);
    const wpWidth = getOpt("workpieceWidth") || 200;
    const wpHeight = getOpt("workpieceLength") || 200;
    const wpDepth = getOpt("workpieceThickness") || 20;

    // Scale to fit within workpiece if needed (leave 10% margin)
    let scale = 1;
    const margin = 0.9;
    if (stlWidth > 0 && stlHeight > 0) {
        const scaleX = (wpWidth * margin) / stlWidth;
        const scaleY = (wpHeight * margin) / stlHeight;
        const scaleZ = wpDepth / stlDepth;
        scale = Math.min(scaleX, scaleY, scaleZ, 1); // Don't upscale
    }

    // Center of STL in its original coordinates
    const stlCenterX = (bb.min.x + bb.max.x) / 2;
    const stlCenterY = (bb.min.y + bb.max.y) / 2;

    // Workpiece center (assuming origin at corner, dimensions in mm)
    const wpCenterX = wpWidth / 2;
    const wpCenterY = wpHeight / 2;

    // Offset to center the scaled STL on the workpiece
    const offsetX = wpCenterX - stlCenterX * scale;
    const offsetY = wpCenterY - stlCenterY * scale;
    // Place top of STL at Z=0
    const offsetZ = -bb.max.z * scale;

    model.transform = { offsetX, offsetY, offsetZ, scale };

    // Update bounding box to reflect positioned model
    model.bbox3d = {
        min: {
            x: bb.min.x * scale + offsetX,
            y: bb.min.y * scale + offsetY,
            z: bb.min.z * scale + offsetZ
        },
        max: {
            x: bb.max.x * scale + offsetX,
            y: bb.max.y * scale + offsetY,
            z: bb.max.z * scale + offsetZ
        }
    };
}

// ============================================================
// SVG Bounding Path — links STL to the existing selection system
// ============================================================

/**
 * Create a bounding box rectangle in svgpaths[] that references the STL model.
 * This allows the STL to be selected, moved, and scaled using existing tools.
 * The svgpath stores the STL model ID in creationProperties.
 */
function createSTLBoundingPath(model) {
    const vs = window.viewScale || 10;
    const bb = model.bbox3d;

    // Create rectangle path in world coordinates (mm * viewScale)
    const x1 = bb.min.x * vs;
    const y1 = bb.min.y * vs;
    const x2 = bb.max.x * vs;
    const y2 = bb.max.y * vs;

    const path = [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
        { x: x1, y: y1 }  // Close the path
    ];

    const id = 'STL_' + window.svgpathId;
    const svgPath = {
        id: id,
        type: 'path',
        name: model.name,
        selected: false,
        visible: true,
        path: path,
        bbox: window.boundingBox ? window.boundingBox(path) : { minx: x1, miny: y1, maxx: x2, maxy: y2 },
        creationTool: 'STL',
        creationProperties: {
            stlModelId: model.id
        }
    };

    // Store reference back to the svgpath on the model
    model.svgPathId = id;

    window.svgpaths.push(svgPath);
    if (typeof window.addSvgPath === 'function') {
        window.addSvgPath(id, model.name);
    }
    window.svgpathId++;
}

/**
 * Sync STL model transform from its svgpath bounding box.
 * Called before toolpath generation or 3D mesh update.
 * Derives scale and offset from the current svgpath bbox vs original geometry.
 */
function syncSTLFromSvgPath(model) {
    const vs = window.viewScale || 10;
    const svgPath = window.svgpaths.find(p => p.creationProperties && p.creationProperties.stlModelId === model.id);
    if (!svgPath) return;

    const pathBBox = svgPath.bbox || (window.boundingBox ? window.boundingBox(svgPath.path) : null);
    if (!pathBBox) return;

    // Current svgpath bounds in mm
    const curMinX = pathBBox.minx / vs;
    const curMinY = pathBBox.miny / vs;
    const curMaxX = pathBBox.maxx / vs;
    const curMaxY = pathBBox.maxy / vs;
    const curW = curMaxX - curMinX;
    const curH = curMaxY - curMinY;

    // Original STL geometry bounds (before any transform)
    const geom = model.geometry;
    geom.computeBoundingBox();
    const origBB = geom.boundingBox;
    const origW = origBB.max.x - origBB.min.x;
    const origH = origBB.max.y - origBB.min.y;

    if (origW <= 0 || origH <= 0) return;

    // Derive scale (uniform — use average of X and Y)
    const scaleX = curW / origW;
    const scaleY = curH / origH;
    const scale = (scaleX + scaleY) / 2;

    // Derive offset: position the STL so its scaled bbox matches the svgpath bbox
    const offsetX = curMinX - origBB.min.x * scale;
    const offsetY = curMinY - origBB.min.y * scale;

    // Get workpiece thickness for Z positioning
    const getOpt = window.getOption || (() => undefined);
    const wpDepth = getOpt("workpieceThickness") || 20;

    const origDepth = origBB.max.z - origBB.min.z;
    const zScale = Math.min(wpDepth / (origDepth * scale), 1);
    const offsetZ = -origBB.max.z * scale;

    // Update model transform
    model.transform = { offsetX, offsetY, offsetZ, scale };
    model.bbox3d = {
        min: { x: curMinX, y: curMinY, z: origBB.min.z * scale + offsetZ },
        max: { x: curMaxX, y: curMaxY, z: origBB.max.z * scale + offsetZ }
    };
}

/**
 * Update STL 3D mesh and height map after its svgpath has been moved/scaled.
 */
window.syncSTLModels = function() {
    for (const model of window.stlModels) {
        const oldTransform = JSON.stringify(model.transform);
        syncSTLFromSvgPath(model);
        const newTransform = JSON.stringify(model.transform);

        if (oldTransform !== newTransform) {
            // Transform changed — update 3D mesh and height map
            if (model.mesh && window.threeScene) {
                window.threeScene.remove(model.mesh);
                model.mesh.geometry.dispose();
                model.mesh.material.dispose();
                model.mesh = null;
            }
            addSTLMesh3D(model);
            generateHeightMap(model, 0.5);
        }
    }
};

// ============================================================
// 3D View Integration
// ============================================================

/**
 * Add STL mesh to the Three.js 3D scene.
 * If the scene isn't initialized yet (3D tab not opened), queues for later.
 */
function addSTLMesh3D(model) {
    const scene = window.threeScene;
    if (!scene) {
        // Scene not ready — will be added when 3D tab opens via addPendingSTLMeshes()
        return;
    }

    const material = new THREE.MeshPhongMaterial({
        color: 0x88aacc,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        flatShading: false
    });

    // Clone geometry and bake in the CNC positioning transform
    const geom = model.geometry.clone();
    const t = model.transform;
    const matrix = new THREE.Matrix4();
    matrix.makeScale(t.scale, t.scale, t.scale);
    matrix.setPosition(t.offsetX, t.offsetY, t.offsetZ);
    geom.applyMatrix4(matrix);

    const mesh = new THREE.Mesh(geom, material);

    // The 3D view uses CNC coordinates directly (X,Y,Z = CNC X,Y,Z)
    // with the CNC origin at (0,0,0). The workpiece is offset based on origin position.
    // Our STL is positioned in absolute workpiece coords (0→width, 0→length).
    // We need to offset so it aligns with the 3D view's origin-relative system.
    const getOpt = window.getOption || (() => undefined);
    const originPos = getOpt('originPosition') || 'middle-center';
    const wpW = getOpt('workpieceWidth') || 200;
    const wpL = getOpt('workpieceLength') || 200;

    // Calculate offset from workpiece corner (0,0) to CNC origin
    let originX = 0, originY = 0;
    if (originPos.includes('center') && !originPos.includes('top') && !originPos.includes('bottom')) originY = wpL / 2;
    if (originPos.includes('right')) originX = wpW;
    else if (originPos.includes('center')) originX = wpW / 2;
    if (originPos.includes('bottom')) originY = wpL;
    else if (originPos.includes('middle')) originY = wpL / 2;

    // Shift STL from workpiece-absolute to origin-relative coords
    mesh.position.set(-originX, -originY, 0);

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.stlModelId = model.id;

    model.mesh = mesh;
    scene.add(mesh);

    // Trigger render
    if (typeof window.requestThreeRender === 'function') {
        window.requestThreeRender();
    }
}

/**
 * Add any STL models that were imported before the 3D scene was ready.
 * Called when the 3D tab is first shown.
 */
window.addPendingSTLMeshes = function() {
    for (const model of window.stlModels) {
        if (!model.mesh && model.geometry) {
            addSTLMesh3D(model);
        }
    }
};

// Listen for 3D tab activation to add pending meshes
const tab3d = document.getElementById('3d-tab');
if (tab3d) {
    tab3d.addEventListener('shown.bs.tab', () => {
        // Small delay to let initThree() finish setting window.threeScene
        setTimeout(() => {
            if (typeof window.addPendingSTLMeshes === 'function') {
                window.addPendingSTLMeshes();
            }
        }, 100);
    });
}

/**
 * Clear all STL models (called from newProject)
 */
window.clearSTLModels = function() {
    const scene = window.threeScene;
    for (const model of window.stlModels) {
        if (model.mesh && scene) {
            scene.remove(model.mesh);
            model.mesh.geometry.dispose();
            model.mesh.material.dispose();
        }
    }
    window.stlModels = [];
    window.stlModelId = 0;
};

/**
 * Serialize STL models for project save.
 * Stores raw STL binary data as base64 alongside model metadata.
 */
window.saveSTLModels = function() {
    if (!window.stlModels || window.stlModels.length === 0) return null;

    return window.stlModels.map(model => {
        // Extract raw vertex data from BufferGeometry to reconstruct later
        const posAttr = model.geometry.attributes.position;
        const floatArray = new Float32Array(posAttr.array);
        // Convert Float32Array to base64
        const bytes = new Uint8Array(floatArray.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        return {
            id: model.id,
            name: model.name,
            vertexData: base64,
            vertexCount: posAttr.count,
            svgPathId: model.svgPathId,
            transform: model.transform,
            bbox3d: model.bbox3d
        };
    });
};

/**
 * Restore STL models from saved project data.
 * Reconstructs Three.js geometry from base64 vertex data.
 */
window.loadSTLModels = function(savedModels) {
    if (!savedModels || savedModels.length === 0) return;

    for (const saved of savedModels) {
        // Decode base64 back to Float32Array
        const binary = atob(saved.vertexData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const positions = new Float32Array(bytes.buffer);

        // Rebuild BufferGeometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        const model = {
            id: saved.id,
            name: saved.name,
            geometry: geometry,
            mesh: null,
            heightMap: null,
            bbox3d: saved.bbox3d,
            transform: saved.transform,
            svgPathId: saved.svgPathId,
            visible: true,
            selected: false
        };

        window.stlModels.push(model);

        // Update stlModelId counter to avoid collisions
        const idNum = parseInt(saved.id.replace('STL', ''), 10);
        if (!isNaN(idNum) && idNum >= window.stlModelId) {
            window.stlModelId = idNum + 1;
        }

        // Add to 3D view
        addSTLMesh3D(model);

        // Generate height map for 2D view
        generateHeightMap(model, 0.5);
    }

    if (typeof window.redraw === 'function') window.redraw();
};

/**
 * Remove STL mesh from 3D scene
 */
window.removeSTLMesh3D = function(modelId) {
    const scene = window.threeScene;
    if (!scene) return;

    const model = window.stlModels.find(m => m.id === modelId);
    if (model && model.mesh) {
        scene.remove(model.mesh);
        model.mesh.geometry.dispose();
        model.mesh.material.dispose();
        model.mesh = null;
    }
};

/**
 * Toggle STL mesh visibility in 3D scene
 */
window.updateSTLMeshVisibility3D = function(modelId, visible) {
    const model = window.stlModels.find(m => m.id === modelId);
    if (model && model.mesh) {
        model.mesh.visible = visible;
        model.visible = visible;
        if (typeof window.requestThreeRender === 'function') {
            window.requestThreeRender();
        }
    }
};

// ============================================================
// Height Map Generation
// ============================================================

/**
 * Generate a height map by rasterizing triangles directly onto a grid.
 * Much faster than raycasting — iterates over triangles and stamps Z values.
 * The height map stores Z values (in mm) for a regular XY grid.
 */
function generateHeightMap(model, resolutionMM) {
    const bb = model.bbox3d;
    const cellSize = resolutionMM || 0.5;

    const width = Math.ceil((bb.max.x - bb.min.x) / cellSize) + 1;
    const height = Math.ceil((bb.max.y - bb.min.y) / cellSize) + 1;
    const data = new Float32Array(width * height);
    data.fill(NaN); // NaN = no surface

    // Get transformed vertex positions
    const geom = model.geometry;
    const pos = geom.attributes.position.array;
    const t = model.transform;
    const triCount = pos.length / 9; // 3 vertices * 3 components, non-indexed

    for (let tri = 0; tri < triCount; tri++) {
        const base = tri * 9;
        // Transform vertices to CNC mm coordinates
        const v0x = pos[base]     * t.scale + t.offsetX;
        const v0y = pos[base + 1] * t.scale + t.offsetY;
        const v0z = pos[base + 2] * t.scale + t.offsetZ;
        const v1x = pos[base + 3] * t.scale + t.offsetX;
        const v1y = pos[base + 4] * t.scale + t.offsetY;
        const v1z = pos[base + 5] * t.scale + t.offsetZ;
        const v2x = pos[base + 6] * t.scale + t.offsetX;
        const v2y = pos[base + 7] * t.scale + t.offsetY;
        const v2z = pos[base + 8] * t.scale + t.offsetZ;

        // Bounding box of triangle in grid coordinates
        const minIx = Math.max(0, Math.floor((Math.min(v0x, v1x, v2x) - bb.min.x) / cellSize));
        const maxIx = Math.min(width - 1, Math.ceil((Math.max(v0x, v1x, v2x) - bb.min.x) / cellSize));
        const minIy = Math.max(0, Math.floor((Math.min(v0y, v1y, v2y) - bb.min.y) / cellSize));
        const maxIy = Math.min(height - 1, Math.ceil((Math.max(v0y, v1y, v2y) - bb.min.y) / cellSize));

        // Precompute barycentric denominator
        const d00 = v1x - v0x, d01 = v2x - v0x;
        const d10 = v1y - v0y, d11 = v2y - v0y;
        const denom = d00 * d11 - d01 * d10;
        if (Math.abs(denom) < 1e-10) continue; // Degenerate triangle
        const invDenom = 1.0 / denom;

        // Rasterize: for each grid cell in the triangle's bbox, check if inside
        for (let iy = minIy; iy <= maxIy; iy++) {
            const py = bb.min.y + iy * cellSize;
            for (let ix = minIx; ix <= maxIx; ix++) {
                const px = bb.min.x + ix * cellSize;

                // Barycentric coordinates
                const dx = px - v0x, dy = py - v0y;
                const u = (dx * d11 - d01 * dy) * invDenom;
                const v = (d00 * dy - dx * d10) * invDenom;

                if (u >= -0.001 && v >= -0.001 && (u + v) <= 1.001) {
                    // Point is inside triangle — interpolate Z
                    const z = v0z + u * (v1z - v0z) + v * (v2z - v0z);
                    const idx = iy * width + ix;
                    // Keep highest Z (top surface)
                    if (isNaN(data[idx]) || z > data[idx]) {
                        data[idx] = z;
                    }
                }
            }
        }
    }

    model.heightMap = {
        data: data,
        width: width,
        height: height,
        minZ: bb.min.z,
        maxZ: bb.max.z,
        originX: bb.min.x,
        originY: bb.min.y,
        cellSize: cellSize
    };

    console.log('Height map generated:', width, 'x', height, 'cells at', cellSize, 'mm resolution');
}

// ============================================================
// 2D View - Height Map Drawing
// ============================================================

/**
 * Draw STL height map as colored overlay on the 2D canvas.
 * Called from redrawCore() in 2dView.js
 */
window.drawSTLHeightMap = function(ctx) {
    if (!window.stlModels) return;

    for (const model of window.stlModels) {
        if (!model.visible || !model.heightMap) continue;

        const hm = model.heightMap;
        const vs = window.viewScale || 10;
        const zl = window.zoomLevel || 1;

        // Draw each height map cell as a colored rectangle
        for (let iy = 0; iy < hm.height; iy++) {
            for (let ix = 0; ix < hm.width; ix++) {
                const z = hm.data[iy * hm.width + ix];
                if (isNaN(z)) continue;

                // Map Z to color: maxZ (surface) = light, minZ (deep) = dark
                const range = hm.maxZ - hm.minZ || 1;
                const t = (z - hm.minZ) / range; // 0=deep, 1=surface

                // Color gradient: dark brown (deep) to light tan (surface)
                const r = Math.round(80 + t * 140);
                const g = Math.round(50 + t * 130);
                const b = Math.round(20 + t * 60);

                // Convert world mm to screen coordinates
                // worldToScreen expects world units (mm * viewScale)
                const worldX = (hm.originX + ix * hm.cellSize) * vs;
                const worldY = (hm.originY + iy * hm.cellSize) * vs;
                const screen = window.worldToScreen(worldX, worldY);
                const cellScreenSize = hm.cellSize * vs * zl;

                ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
                ctx.fillRect(screen.x, screen.y, Math.max(cellScreenSize, 1), Math.max(cellScreenSize, 1));
            }
        }

        // Draw contour lines
        drawContourLines(ctx, model);
    }
};

/**
 * Draw contour lines at fixed Z intervals on the 2D canvas
 */
function drawContourLines(ctx, model) {
    const hm = model.heightMap;
    if (!hm) return;

    const vs = window.viewScale || 10;
    const range = hm.maxZ - hm.minZ;
    if (range <= 0) return;

    // Draw contours every 1mm of depth
    const interval = Math.max(1, Math.round(range / 10));

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.5;

    for (let zLevel = hm.minZ; zLevel <= hm.maxZ; zLevel += interval) {
        for (let iy = 0; iy < hm.height - 1; iy++) {
            for (let ix = 0; ix < hm.width - 1; ix++) {
                const z00 = hm.data[iy * hm.width + ix];
                const z10 = hm.data[iy * hm.width + ix + 1];
                const z01 = hm.data[(iy + 1) * hm.width + ix];
                const z11 = hm.data[(iy + 1) * hm.width + ix + 1];

                // Simple marching squares: check if contour crosses this cell
                if (isNaN(z00) || isNaN(z10) || isNaN(z01) || isNaN(z11)) continue;

                const above00 = z00 >= zLevel;
                const above10 = z10 >= zLevel;
                const above01 = z01 >= zLevel;
                const above11 = z11 >= zLevel;

                // If all same side, no contour here
                if (above00 === above10 && above10 === above01 && above01 === above11) continue;

                // Draw a simple line through the center of the cell
                const cx = hm.originX + (ix + 0.5) * hm.cellSize;
                const cy = hm.originY + (iy + 0.5) * hm.cellSize;
                const screenPos = window.worldToScreen(cx * vs, cy * vs);

                ctx.beginPath();
                ctx.arc(screenPos.x, screenPos.y, 0.5, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
}

// ============================================================
// 3D Profile Toolpath Generation
// ============================================================

/**
 * Look up the Z height from the height map at a given CNC mm position.
 * Uses bilinear interpolation for smooth results.
 * Returns NaN if outside the height map or no surface data.
 */
function sampleHeightMap(hm, xMM, yMM) {
    const fx = (xMM - hm.originX) / hm.cellSize;
    const fy = (yMM - hm.originY) / hm.cellSize;

    const ix = Math.floor(fx);
    const iy = Math.floor(fy);

    if (ix < 0 || ix >= hm.width - 1 || iy < 0 || iy >= hm.height - 1) return NaN;

    const tx = fx - ix;
    const ty = fy - iy;

    const z00 = hm.data[iy * hm.width + ix];
    const z10 = hm.data[iy * hm.width + ix + 1];
    const z01 = hm.data[(iy + 1) * hm.width + ix];
    const z11 = hm.data[(iy + 1) * hm.width + ix + 1];

    if (isNaN(z00) || isNaN(z10) || isNaN(z01) || isNaN(z11)) return NaN;

    // Bilinear interpolation
    return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) +
           z01 * (1 - tx) * ty + z11 * tx * ty;
}

/**
 * Drop cutter algorithm for ball nose bit.
 * For a given (X,Y) position, finds the highest Z the tool center must be at
 * so the ball nose sphere doesn't gouge the surface.
 *
 * The ball nose tip touches at Z_center - R, so we need:
 *   Z_center = max over all (dx,dy) within R of:
 *     heightMap(x+dx, y+dy) + R - sqrt(R^2 - dx^2 - dy^2)
 */
function dropCutter(hm, xMM, yMM, radiusMM) {
    const R = radiusMM;
    const cellSize = hm.cellSize;
    const cellsInRadius = Math.ceil(R / cellSize);
    let maxZc = -Infinity;

    for (let dy = -cellsInRadius; dy <= cellsInRadius; dy++) {
        for (let dx = -cellsInRadius; dx <= cellsInRadius; dx++) {
            const dxMM = dx * cellSize;
            const dyMM = dy * cellSize;
            const distSq = dxMM * dxMM + dyMM * dyMM;
            if (distSq > R * R) continue;

            const surfZ = sampleHeightMap(hm, xMM + dxMM, yMM + dyMM);
            if (isNaN(surfZ)) continue;

            // Ball nose contact: tool center Z = surface Z + R - sqrt(R^2 - dist^2)
            const zc = surfZ + R - Math.sqrt(R * R - distSq);
            if (zc > maxZc) maxZc = zc;
        }
    }

    return maxZc === -Infinity ? NaN : maxZc;
}

/**
 * Generate 3D profile raster toolpaths over the STL surface.
 * Uses the selected svgpath(s) with STL references, or falls back to first visible model.
 * Called from handleOperationClick via window.do3dProfile.
 */
window.do3dProfile = function() {
    const vs = window.viewScale || 10;

    // Find STL model from selected svgpaths
    let model = null;
    let stlSvgPath = null;
    const selectedPaths = window.selectMgr ? window.selectMgr.selectedPaths() : [];
    for (const sp of selectedPaths) {
        if (sp.creationProperties && sp.creationProperties.stlModelId) {
            const m = window.stlModels.find(s => s.id === sp.creationProperties.stlModelId);
            if (m) {
                model = m;
                stlSvgPath = sp;
                break;
            }
        }
    }

    if (!model) {
        if (typeof window.notify === 'function') window.notify('Select an STL path to 3D Profile', 'info');
        return;
    }

    // Sync transform from svgpath in case it was moved/scaled
    syncSTLFromSvgPath(model);
    generateHeightMap(model, 0.5);

    const hm = model.heightMap;
    const tool = window.currentTool;
    if (!tool) {
        if (typeof window.notify === 'function') window.notify('No tool selected', 'error');
        return;
    }

    const props = window.currentToolpathProperties || {};
    const toolDiameter = tool.diameter; // mm
    const toolRadius = toolDiameter / 2;
    const stepoverPct = tool.stepover || props.stepover || 15;
    const stepover = toolDiameter * stepoverPct / 100; // mm between raster lines
    const angle = props.angle || 0; // degrees
    const maxDepth = props.depth || Math.abs(hm.minZ); // mm, total depth
    const stepDown = props.step || maxDepth; // mm per pass
    // Sample interval along raster lines: use height map resolution
    // or half the tool diameter, whichever is larger (avoids excessive points)
    const sampleInterval = Math.max(hm.cellSize, toolDiameter / 2); // mm

    if (stepover <= 0 || sampleInterval <= 0) {
        if (typeof window.notify === 'function') window.notify('Invalid stepover or tool diameter', 'error');
        return;
    }

    const bb = model.bbox3d;
    const angleRad = angle * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // Center of the STL bounding box in mm
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;

    // Expand bounding box by tool radius so the tool edge reaches the STL boundary
    const expandedBB = {
        minX: bb.min.x - toolRadius,
        maxX: bb.max.x + toolRadius,
        minY: bb.min.y - toolRadius,
        maxY: bb.max.y + toolRadius
    };

    // Rotate the bounding box corners by -angle to find the extent in rotated frame
    const corners = [
        { x: expandedBB.minX, y: expandedBB.minY },
        { x: expandedBB.maxX, y: expandedBB.minY },
        { x: expandedBB.maxX, y: expandedBB.maxY },
        { x: expandedBB.minX, y: expandedBB.maxY }
    ];

    const rotCorners = corners.map(p => ({
        x: cosA * (p.x - cx) + sinA * (p.y - cy) + cx,
        y: -sinA * (p.x - cx) + cosA * (p.y - cy) + cy
    }));

    const rMinX = Math.min(...rotCorners.map(p => p.x));
    const rMaxX = Math.max(...rotCorners.map(p => p.x));
    const rMinY = Math.min(...rotCorners.map(p => p.y));
    const rMaxY = Math.max(...rotCorners.map(p => p.y));

    // Determine number of depth passes
    const numPasses = Math.max(1, Math.ceil(maxDepth / stepDown));

    const allPaths = [];
    let lineIndex = 0;

    for (let pass = 0; pass < numPasses; pass++) {
        // Z clamp for this pass: how deep we're allowed to go (negative value)
        // Final pass has no clamp (follows actual surface)
        const passMinZ = (pass < numPasses - 1) ? -(pass + 1) * stepDown : -maxDepth;

        for (let y = rMinY; y <= rMaxY; y += stepover) {
            const linePts = [];

            for (let x = rMinX; x <= rMaxX; x += sampleInterval) {
                // Rotate back to world coordinates
                const worldX = cosA * (x - cx) - sinA * (y - cy) + cx;
                const worldY = sinA * (x - cx) + cosA * (y - cy) + cy;

                // Drop cutter to find tool center Z
                let zc = dropCutter(hm, worldX, worldY, toolRadius);

                if (isNaN(zc)) {
                    // Outside STL surface — if we have points, end this segment
                    if (linePts.length > 0) {
                        // Convert to world units for the toolpath
                        const tpath = linePts.map(p => ({
                            x: p.x * vs,
                            y: p.y * vs,
                            z: p.z // z stays in mm
                        }));
                        allPaths.push({ tpath: tpath });
                        linePts.length = 0;
                    }
                    continue;
                }

                // Tool tip Z = tool center Z - radius
                let tipZ = zc - toolRadius;

                // Clamp to pass depth
                tipZ = Math.max(tipZ, passMinZ);

                linePts.push({ x: worldX, y: worldY, z: tipZ });
            }

            // Flush remaining points
            if (linePts.length > 1) {
                // Zigzag: alternate direction
                if (lineIndex % 2 !== 0) linePts.reverse();

                const tpath = linePts.map(p => ({
                    x: p.x * vs,
                    y: p.y * vs,
                    z: p.z // z in mm
                }));
                allPaths.push({ tpath: tpath });
            }
            lineIndex++;
        }
    }

    if (allPaths.length === 0) {
        if (typeof window.notify === 'function') window.notify('No toolpath generated — check STL model and tool settings', 'error');
        return;
    }

    console.log('3D Profile: generated', allPaths.length, 'raster lines');
    if (typeof window.pushToolPath === 'function') {
        const svgId = stlSvgPath ? stlSvgPath.id : null;
        window.pushToolPath(allPaths, '3dProfile', '3dProfile', svgId, svgId ? [svgId] : null);
    }
};
