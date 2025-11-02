/**
 * VoxelGrid - Manages voxel-based material representation for CNC simulation
 * Uses Two Three.js InstancedMeshes for efficient rendering with dual-color visualization
 * Top layer: workpiece color on top face, lighter on sides/bottom
 * Internal: lighter color on all faces
 */

import * as THREE from 'three';

class VoxelGrid {
  /**
   * Initialize a voxel grid representation of the workpiece
   * @param {number} workpieceWidth - Width of workpiece in mm
   * @param {number} workpieceLength - Length of workpiece in mm
   * @param {number} workpieceThickness - Thickness of workpiece in mm
   * @param {number} voxelSize - Size of X and Y voxels in mm
   * @param {THREE.Vector3} originOffset - Offset of workpiece origin in world space
   * @param {string} workpieceColor - Hex color or material color for voxels
   * @param {number} voxelSizeZ - Size of Z voxels in mm (default: same as voxelSize for cubic voxels)
   */
  constructor(workpieceWidth, workpieceLength, workpieceThickness, voxelSize = 1.0, originOffset = new THREE.Vector3(0, 0, 0), workpieceColor = 0x8B6914, voxelSizeZ = null) {
    this.workpieceWidth = workpieceWidth;
    this.workpieceLength = workpieceLength;
    this.workpieceThickness = workpieceThickness;
    this.voxelSize = voxelSize;  // XY voxel size
    this.voxelSizeZ = voxelSizeZ || voxelSize;  // Z voxel size (default to XY size if not specified)
    this.originOffset = originOffset;
    this.workpieceColor = workpieceColor;

    // Calculate grid dimensions (Z uses separate voxelSizeZ)
    this.gridWidth = Math.ceil(workpieceWidth / voxelSize);
    this.gridLength = Math.ceil(workpieceLength / voxelSize);
    this.gridHeight = Math.ceil(workpieceThickness / this.voxelSizeZ);

    // Total voxel count
    this.maxVoxels = this.gridWidth * this.gridLength * this.gridHeight;

    // Track active voxels using a Set of indices for sparse representation
    this.activeVoxels = new Set();
    this.voxelColors = new Map();  // Store colors per voxel for visualization feedback

    // Lookup array: maps global voxel index → {mesh: 'top'|'internal', instanceIndex: number}
    this.voxelIndexMap = new Array(this.maxVoxels);

    // Three.js meshes for rendering (dual-color system)
    this.topLayerMesh = null;      // Top surface: workpiece color on top, lighter on sides/bottom
    this.internalMesh = null;      // Internal: lighter color on all faces

    // Debug tracking
    this.frameNumber = 0;
    this.debugLog = [];

    // Initialize the grid with all voxels active
    this.initializeGrid();
  }

  /**
   * Create colored BoxGeometry for top-layer voxels
   * Top face: workpiece color, sides/bottom: yellow (fresh-cut material)
   * X and Y: voxelSize, Z: voxelSizeZ (rectangular voxels for step-down support)
   * @private
   * @returns {THREE.BoxGeometry} Geometry with per-vertex colors
   */
  createTopLayerGeometry() {
    const geometry = new THREE.BoxGeometry(this.voxelSize * 0.95, this.voxelSize * 0.95, this.voxelSizeZ * 0.95);

    // Create color array for all vertices
    const colors = [];
    const topColor = new THREE.Color(this.workpieceColor);  // Full workpiece color on top face
    const sideColor = new THREE.Color(0xFFFF00);  // Yellow for sides/bottom (fresh-cut material)

    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const z = geometry.attributes.position.getZ(i);

      if (z > 0) {  // Top face (+Z face)
        colors.push(topColor.r, topColor.g, topColor.b);
      } else {  // Bottom and sides - show as fresh-cut (yellow)
        colors.push(sideColor.r, sideColor.g, sideColor.b);
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    return geometry;
  }

  /**
   * Create colored BoxGeometry for internal voxels
   * All faces: bright yellow uniform color
   * X and Y: voxelSize, Z: voxelSizeZ (rectangular voxels for step-down support)
   * @private
   * @returns {THREE.BoxGeometry} Geometry with uniform yellow color
   */
  createInternalGeometry() {
    const geometry = new THREE.BoxGeometry(this.voxelSize * 0.95, this.voxelSize * 0.95, this.voxelSizeZ * 0.95);

    // Create color array for all vertices - all yellow
    const colors = [];
    const yellow = new THREE.Color(0xFFFF00);  // Bright yellow

    for (let i = 0; i < geometry.attributes.position.count; i++) {
      colors.push(yellow.r, yellow.g, yellow.b);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    return geometry;
  }

  /**
   * Initialize the voxel grid with all voxels active
   * Creates two InstancedMeshes with colored geometries
   * Pre-calculates mesh capacities to avoid unused instances at origin
   */
  initializeGrid() {
    // Pre-calculate how many voxels go into each mesh
    // Top layer: worldZ > -voxelSizeZ
    let topLayerCount = 0;
    let internalCount = 0;

    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridLength; y++) {
        for (let z = 0; z < this.gridHeight; z++) {
          const worldZ = this.originOffset.z - (z * this.voxelSizeZ + this.voxelSizeZ / 2);
          if (worldZ > -this.voxelSizeZ) {
            topLayerCount++;
          } else {
            internalCount++;
          }
        }
      }
    }

    // Create colored geometries
    const topLayerGeometry = this.createTopLayerGeometry();
    const internalGeometry = this.createInternalGeometry();

    // Create material with vertex colors
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 30,
      transparent: true,
      opacity: 0.85,
      wireframe: false
    });

    // Create InstancedMeshes with exact capacity needed (no unused instances)
    this.topLayerMesh = new THREE.InstancedMesh(topLayerGeometry, material, topLayerCount);
    this.topLayerMesh.castShadow = true;
    this.topLayerMesh.receiveShadow = true;

    this.internalMesh = new THREE.InstancedMesh(internalGeometry, material.clone(), internalCount);
    this.internalMesh.castShadow = true;
    this.internalMesh.receiveShadow = true;

    // Create dummy matrix for transforms
    const dummy = new THREE.Object3D();
    let topLayerInstanceIndex = 0;
    let internalInstanceIndex = 0;

    // Position all voxels in the grid and build lookup map
    let index = 0;

    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridLength; y++) {
        for (let z = 0; z < this.gridHeight; z++) {
          // Calculate world position (centered in each voxel cell)
          const worldX = this.originOffset.x - this.workpieceWidth / 2 + x * this.voxelSize + this.voxelSize / 2;
          const worldY = this.originOffset.y - this.workpieceLength / 2 + y * this.voxelSize + this.voxelSize / 2;
          const worldZ = this.originOffset.z - (z * this.voxelSizeZ + this.voxelSizeZ / 2);  // Subtract to go downward

          dummy.position.set(worldX, worldY, worldZ);
          dummy.updateMatrix();

          // Determine if this voxel is in the top layer based on world Z
          // Top layer: if worldZ is between 0 and -voxelSizeZ (the surface layer)
          const isTopLayer = worldZ > -this.voxelSizeZ;

          if (isTopLayer) {
            this.topLayerMesh.setMatrixAt(topLayerInstanceIndex, dummy.matrix);
            // Store mapping: global index → {mesh: 'top', instanceIndex}
            this.voxelIndexMap[index] = { mesh: 'top', instanceIndex: topLayerInstanceIndex };
            topLayerInstanceIndex++;
          } else {
            this.internalMesh.setMatrixAt(internalInstanceIndex, dummy.matrix);
            // Store mapping: global index → {mesh: 'internal', instanceIndex}
            this.voxelIndexMap[index] = { mesh: 'internal', instanceIndex: internalInstanceIndex };
            internalInstanceIndex++;
          }

          // Track this voxel as active
          this.activeVoxels.add(index);
          this.voxelColors.set(index, new THREE.Color(this.workpieceColor));

          index++;
        }
      }
    }

    this.topLayerMesh.instanceMatrix.needsUpdate = true;
    this.internalMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Convert 3D grid coordinates to linear index
   * @param {number} x - X grid coordinate
   * @param {number} y - Y grid coordinate
   * @param {number} z - Z grid coordinate
   * @returns {number} Linear index or -1 if out of bounds
   */
  coordsToIndex(x, y, z) {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridLength || z < 0 || z >= this.gridHeight) {
      return -1;
    }
    return z + y * this.gridHeight + x * this.gridLength * this.gridHeight;
  }

  /**
   * Convert linear index to 3D grid coordinates
   * @param {number} index - Linear index
   * @returns {Object} {x, y, z} coordinates or null if invalid
   */
  indexToCoords(index) {
    if (index < 0 || index >= this.maxVoxels) return null;
    const x = Math.floor(index / (this.gridLength * this.gridHeight));
    const remainder = index % (this.gridLength * this.gridHeight);
    const y = Math.floor(remainder / this.gridHeight);
    const z = remainder % this.gridHeight;
    return { x, y, z };
  }

  /**
   * Get world position of a voxel center by grid index
   * @param {number} index - Linear voxel index
   * @returns {THREE.Vector3} World position
   */
  getVoxelWorldPosition(index) {
    const coords = this.indexToCoords(index);
    if (!coords) return null;

    const worldX = this.originOffset.x - this.workpieceWidth / 2 + coords.x * this.voxelSize + this.voxelSize / 2;
    const worldY = this.originOffset.y - this.workpieceLength / 2 + coords.y * this.voxelSize + this.voxelSize / 2;
    const worldZ = this.originOffset.z - (coords.z * this.voxelSizeZ + this.voxelSizeZ / 2);  // Subtract to go downward

    return new THREE.Vector3(worldX, worldY, worldZ);
  }

  /**
   * Remove a voxel from the grid
   * Uses lookup array to find the correct mesh and instance index
   * @param {number} index - Linear voxel index
   */
  removeVoxel(index) {
    if (!this.activeVoxels.has(index)) return;

    this.activeVoxels.delete(index);

    // Look up which mesh and instance this voxel belongs to
    const mapping = this.voxelIndexMap[index];
    if (!mapping) return;  // Safety check

    // Hide the voxel by scaling it to 0 in the correct mesh
    const dummy = new THREE.Object3D();
    dummy.scale.set(0, 0, 0);  // Invisible
    dummy.updateMatrix();

    if (mapping.mesh === 'top') {
      this.topLayerMesh.setMatrixAt(mapping.instanceIndex, dummy.matrix);
    } else {
      this.internalMesh.setMatrixAt(mapping.instanceIndex, dummy.matrix);
    }
    // Don't update here - let the caller batch the update
  }

  /**
   * Signal that instance matrices have been updated and need to be re-rendered
   * Updates both top layer and internal meshes
   */
  updateInstanceMatrices() {
    this.topLayerMesh.instanceMatrix.needsUpdate = true;
    this.internalMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Remove all voxels that intersect with a tool at a given position
   * This method is called by VoxelMaterialRemover
   * Optimized with spatial bounding to only check nearby voxels
   * @param {number} toolX - Tool X position in world space
   * @param {number} toolY - Tool Y position in world space
   * @param {number} toolZ - Tool Z position in world space (cutting depth)
   * @param {number} toolRadius - Tool radius in mm
   * @param {string} toolType - Type of tool: 'flat', 'ball', 'vbit', 'drill'
   * @param {number} vbitAngle - V-bit angle in degrees (only for 'vbit')
   * @returns {Array} Array of removed voxel indices
   */
  removeVoxelsAtToolPosition(toolX, toolY, toolZ, toolRadius, toolType = 'flat', vbitAngle = 90) {
    const removedVoxels = [];
    this.frameNumber++;

    // Calculate search radius with margin for vbit/drill cone expansion
    const searchRadius = toolRadius * 2 + this.voxelSize;
    const searchDepth = Math.max(toolRadius * 3, this.workpieceThickness);  // Search entire workpiece depth

    // Convert world coordinates to grid coordinates for spatial search
    // Inverse of positioning formula
    // NOTE: gridX and gridY use voxelSize (XY resolution), but gridZ uses voxelSizeZ (step-down)
    let gridX = Math.floor((toolX - this.originOffset.x + this.workpieceWidth / 2 - this.voxelSize / 2) / this.voxelSize);
    let gridY = Math.floor((toolY - this.originOffset.y + this.workpieceLength / 2 - this.voxelSize / 2) / this.voxelSize);
    let gridZ = Math.floor((this.originOffset.z - toolZ + this.voxelSizeZ / 2) / this.voxelSizeZ);


    // Clamp to valid grid bounds (tools can be outside the grid, but we search the nearest valid cells)
    gridX = Math.max(0, Math.min(this.gridWidth - 1, gridX));
    gridY = Math.max(0, Math.min(this.gridLength - 1, gridY));
    gridZ = Math.max(0, Math.min(this.gridHeight - 1, gridZ));

    const searchRadiusVoxels = Math.ceil(searchRadius / this.voxelSize);
    const searchDepthVoxels = Math.ceil(searchDepth / this.voxelSizeZ);  // Use voxelSizeZ for Z depth, not voxelSize!

    let voxelsChecked = 0;
    let voxelsActive = 0;

    // Only check voxels within search bounds (spatial optimization)
    // Search upward from tool tip toward surface (Z increases toward surface)
    for (let dx = -searchRadiusVoxels; dx <= searchRadiusVoxels; dx++) {
      for (let dy = -searchRadiusVoxels; dy <= searchRadiusVoxels; dy++) {
        for (let dz = 0; dz <= searchDepthVoxels; dz++) {
          const x = gridX + dx;
          const y = gridY + dy;
          const z = gridZ - dz;  // Search upward: subtract dz to go toward surface

          const index = this.coordsToIndex(x, y, z);
          voxelsChecked++;
          if (index < 0 || !this.activeVoxels.has(index)) continue;

          voxelsActive++;
          const voxelPos = this.getVoxelWorldPosition(index);
          if (!voxelPos) continue;

          let shouldRemove = false;

          switch (toolType) {
            case 'flat':
              // Flat endmill: cylindrical intersection
              shouldRemove = this.isFlatEndmillIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius);
              break;
            case 'ball':
              // Ball nose: spherical intersection
              shouldRemove = this.isBallNoseIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius);
              break;
            case 'vbit':
              // V-bit: conical intersection
              shouldRemove = this.isVBitIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius, vbitAngle);
              break;
            case 'drill':
              // Drill: conical tip + cylindrical body
              shouldRemove = this.isDrillIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius);
              break;
            default:
              // Fallback to flat endmill
              shouldRemove = this.isFlatEndmillIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius);
          }

          if (shouldRemove) {
            this.removeVoxel(index);
            removedVoxels.push(index);
          }
        }
      }
    }


    // Batch update: notify Three.js that matrices changed (only once, not per-voxel)
    if (removedVoxels.length > 0) {
      this.updateInstanceMatrices();
    }

    return removedVoxels;
  }

  /**
   * Check if a voxel intersects with flat endmill
   * @private
   */
  isFlatEndmillIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius) {
    // Flat endmill: check if voxel is within cylinder defined by tool position and radius
    // Tool extends downward from toolZ
    // Coordinate system: Z=0 at surface, Z<0 going deeper into material

    // Distance in XY plane from tool center
    const dx = voxelPos.x - toolX;
    const dy = voxelPos.y - toolY;
    const distXY = Math.sqrt(dx * dx + dy * dy);

    // Check if voxel is in XY footprint (within radius)
    if (distXY > toolRadius) {
      return false;
    }

    // Check if voxel's top surface is at or above (less negative than) tool depth
    // Voxel top = voxel center + voxelSizeZ/2 (the shallower edge in Z)
    // NOTE: voxels are rectangular - use voxelSizeZ for Z dimension, not voxelSize!
    const voxelTop = voxelPos.z + this.voxelSizeZ / 2;

    // Tool removes material from surface (Z=0) down to toolZ depth
    // So we check: is voxel top at or above tool depth?
    if (voxelTop >= toolZ) {
      return true;
    }
    return false;
  }

  /**
   * Check if a voxel intersects with ball nose tool
   * @private
   */
  isBallNoseIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius) {
    // Ball nose: check if voxel intersects with sphere defined by tool tip and radius
    // The sphere includes the curved cutting surface
    const dx = voxelPos.x - toolX;
    const dy = voxelPos.y - toolY;
    const dz = voxelPos.z - toolZ;

    // Distance from voxel center to tool center
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Check if voxel intersects the sphere (use largest voxel dimension for loose intersection)
    // Voxels are rectangular: 0.5×0.5 in XY, and voxelSizeZ in Z
    // Use max dimension for conservative intersection test
    const voxelHalfSize = Math.max(this.voxelSize / 2, this.voxelSizeZ / 2);
    if (distance <= toolRadius + voxelHalfSize) {
      return true;
    }
    return false;
  }

  /**
   * Check if a voxel intersects with V-bit (cone)
   * @private
   */
  isVBitIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius, vbitAngle) {
    // V-bit: conical shape that expands as you go deeper
    // Tip is at toolZ, opens downward (negative Z direction)
    const dx = voxelPos.x - toolX;
    const dy = voxelPos.y - toolY;

    // Distance in XY plane
    const distXY = Math.sqrt(dx * dx + dy * dy);

    // Cone angle (half-angle) in radians
    const halfAngleRad = (vbitAngle / 2) * (Math.PI / 180);
    const tanAngle = Math.tan(halfAngleRad);

    // Check if voxel's top surface is at or above tool tip
    // NOTE: Use voxelSizeZ for Z dimension, not voxelSize!
    const voxelTop = voxelPos.z + this.voxelSizeZ / 2;

    if (voxelTop >= toolZ) {
      // Voxel is at or shallower than tool tip
      // Calculate cone radius at voxel depth
      const depth = voxelTop - toolZ;  // How far above tool tip (towards surface)
      const coneRadius = depth * tanAngle;

      // Add voxel XY size for loose intersection test
      if (distXY <= coneRadius + this.voxelSize / 2) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a voxel intersects with drill bit
   * @private
   */
  isDrillIntersecting(voxelPos, toolX, toolY, toolZ, toolRadius) {
    // Drill: conical tip (59° total angle = 29.5° half angle) + cylindrical body
    const dx = voxelPos.x - toolX;
    const dy = voxelPos.y - toolY;
    const distXY = Math.sqrt(dx * dx + dy * dy);

    // Drill has a conical tip and cylindrical body
    const drillHalfAngle = 29.5 * (Math.PI / 180);  // 59° total angle
    const tanDrillAngle = Math.tan(drillHalfAngle);

    // Check voxel top surface
    // NOTE: Use voxelSizeZ for Z dimension, not voxelSize!
    const voxelTop = voxelPos.z + this.voxelSizeZ / 2;

    // Conical tip extends from surface down to toolZ
    if (voxelTop >= toolZ) {
      const depth = voxelTop - toolZ;  // How far above tool tip (towards surface)
      const tipRadius = depth * tanDrillAngle;

      // Voxel intersects if it's within cone or cylindrical body
      if (distXY <= Math.max(tipRadius, toolRadius) + this.voxelSize / 2) {
        return true;
      }
    }

    // Cylindrical body below toolZ
    if (voxelTop < toolZ && distXY <= toolRadius + this.voxelSize / 2) {
      return true;
    }

    return false;
  }

  /**
   * Reset all voxels to active state
   * Rebuilds both meshes and the lookup array
   * Disposes and recreates meshes to ensure correct capacity
   */
  reset() {
    this.activeVoxels.clear();

    // Dispose old meshes
    if (this.topLayerMesh) {
      this.topLayerMesh.geometry.dispose();
      this.topLayerMesh.material.dispose();
    }
    if (this.internalMesh) {
      this.internalMesh.geometry.dispose();
      this.internalMesh.material.dispose();
    }

    // Pre-calculate counts
    let topLayerCount = 0;
    let internalCount = 0;

    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridLength; y++) {
        for (let z = 0; z < this.gridHeight; z++) {
          const worldZ = this.originOffset.z - (z * this.voxelSizeZ + this.voxelSizeZ / 2);
          if (worldZ > -this.voxelSizeZ) {
            topLayerCount++;
          } else {
            internalCount++;
          }
        }
      }
    }

    // Create new geometries and materials
    const topLayerGeometry = this.createTopLayerGeometry();
    const internalGeometry = this.createInternalGeometry();
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 30,
      transparent: true,
      opacity: 0.85,
      wireframe: false
    });

    // Create new meshes with correct capacities
    this.topLayerMesh = new THREE.InstancedMesh(topLayerGeometry, material, topLayerCount);
    this.topLayerMesh.castShadow = true;
    this.topLayerMesh.receiveShadow = true;

    this.internalMesh = new THREE.InstancedMesh(internalGeometry, material.clone(), internalCount);
    this.internalMesh.castShadow = true;
    this.internalMesh.receiveShadow = true;

    // Reinitialize all voxels
    const dummy = new THREE.Object3D();
    let topLayerInstanceIndex = 0;
    let internalInstanceIndex = 0;

    for (let index = 0; index < this.maxVoxels; index++) {
      const coords = this.indexToCoords(index);
      const worldX = this.originOffset.x - this.workpieceWidth / 2 + coords.x * this.voxelSize + this.voxelSize / 2;
      const worldY = this.originOffset.y - this.workpieceLength / 2 + coords.y * this.voxelSize + this.voxelSize / 2;
      const worldZ = this.originOffset.z - (coords.z * this.voxelSizeZ + this.voxelSizeZ / 2);  // Subtract to go downward

      dummy.position.set(worldX, worldY, worldZ);
      dummy.scale.set(1, 1, 1);  // Reset scale to visible
      dummy.updateMatrix();

      // Determine if this voxel is in the top layer based on world Z
      const isTopLayer = worldZ > -this.voxelSizeZ;

      if (isTopLayer) {
        this.topLayerMesh.setMatrixAt(topLayerInstanceIndex, dummy.matrix);
        this.voxelIndexMap[index] = { mesh: 'top', instanceIndex: topLayerInstanceIndex };
        topLayerInstanceIndex++;
      } else {
        this.internalMesh.setMatrixAt(internalInstanceIndex, dummy.matrix);
        this.voxelIndexMap[index] = { mesh: 'internal', instanceIndex: internalInstanceIndex };
        internalInstanceIndex++;
      }

      this.activeVoxels.add(index);
    }

    this.topLayerMesh.instanceMatrix.needsUpdate = true;
    this.internalMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Get the Three.js meshes for rendering
   * Returns both top layer and internal meshes
   * @returns {Array} Array containing [topLayerMesh, internalMesh]
   */
  getMesh() {
    return [this.topLayerMesh, this.internalMesh];
  }

  /**
   * Get count of active (non-removed) voxels
   * @returns {number} Number of active voxels
   */
  getActiveVoxelCount() {
    return this.activeVoxels.size;
  }

  /**
   * Get material removal percentage
   * @returns {number} Percentage of material removed (0-100)
   */
  getMaterialRemovalPercentage() {
    return ((this.maxVoxels - this.activeVoxels.size) / this.maxVoxels) * 100;
  }

  /**
   * Get statistics about the voxel grid
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      totalVoxels: this.maxVoxels,
      activeVoxels: this.activeVoxels.size,
      removedVoxels: this.maxVoxels - this.activeVoxels.size,
      removalPercentage: this.getMaterialRemovalPercentage(),
      gridDimensions: {
        width: this.gridWidth,
        length: this.gridLength,
        height: this.gridHeight
      },
      voxelSize: this.voxelSize,
      memoryEstimate: `~${(this.maxVoxels * 64 / 1024 / 1024).toFixed(2)} MB` // Rough estimate
    };
  }

  /**
   * Analyze and log removed voxel positions to identify duplication pattern
   * @public
   */
  analyzeRemovedPositions() {
    if (!this.removedPositions || this.removedPositions.length === 0) {
      console.log('No removed positions recorded');
      return;
    }

    console.log('\n=== REMOVED POSITIONS ANALYSIS ===');
    console.log(`Total removed voxel records: ${this.removedPositions.length}`);

    // Group by tool position (within small tolerance)
    const groupedByToolPos = {};
    const tolerance = 0.5;

    for (const record of this.removedPositions) {
      const key = `${Math.round(record.toolPos.x / tolerance) * tolerance},${Math.round(record.toolPos.y / tolerance) * tolerance},${Math.round(record.toolPos.z / tolerance) * tolerance}`;
      if (!groupedByToolPos[key]) {
        groupedByToolPos[key] = [];
      }
      groupedByToolPos[key].push(record);
    }

    console.log(`Unique tool positions: ${Object.keys(groupedByToolPos).length}`);

    // For each unique tool position, show where voxels were removed
    for (const [toolPos, records] of Object.entries(groupedByToolPos).slice(0, 5)) {
      console.log(`\nTool position: ${toolPos} (${records.length} removals)`);
      const uniqueVoxelPos = {};
      for (const record of records) {
        const voxelKey = `${record.voxelPos.x},${record.voxelPos.y},${record.voxelPos.z}`;
        if (!uniqueVoxelPos[voxelKey]) {
          uniqueVoxelPos[voxelKey] = record;
        }
      }
      console.log(`  Unique voxel positions: ${Object.keys(uniqueVoxelPos).length}`);
      for (const [voxelPos, record] of Object.entries(uniqueVoxelPos).slice(0, 10)) {
        console.log(`    Voxel at ${voxelPos} (grid: ${record.gridCoords.x},${record.gridCoords.y},${record.gridCoords.z})`);
      }
    }

    // Check for duplicated voxel world positions across different tool positions
    const voxelPosCount = {};
    for (const record of this.removedPositions) {
      const key = `${record.voxelPos.x},${record.voxelPos.y},${record.voxelPos.z}`;
      if (!voxelPosCount[key]) {
        voxelPosCount[key] = 0;
      }
      voxelPosCount[key]++;
    }

    const duplicatedVoxels = Object.entries(voxelPosCount).filter(([_, count]) => count > 1);
    console.log(`\nDuplicated voxel world positions: ${duplicatedVoxels.length}`);
    for (const [voxelPos, count] of duplicatedVoxels.slice(0, 10)) {
      console.log(`  ${voxelPos}: removed ${count} times`);
    }
  }

  /**
   * Dispose of Three.js resources
   * Cleans up both top layer and internal meshes
   */
  dispose() {
    if (this.topLayerMesh) {
      this.topLayerMesh.geometry.dispose();
      this.topLayerMesh.material.dispose();
      this.topLayerMesh = null;
    }
    if (this.internalMesh) {
      this.internalMesh.geometry.dispose();
      this.internalMesh.material.dispose();
      this.internalMesh = null;
    }
    this.activeVoxels.clear();
    this.voxelColors.clear();
    this.voxelIndexMap = null;
  }
}

export { VoxelGrid };
