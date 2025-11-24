import * as THREE from 'three';
import { VoxelGrid } from './voxels/VoxelGrid.js';
import { VoxelMaterialRemover } from './voxels/VoxelMaterialRemover.js';


// Global state
let renderer, scene, camera;
let initialized = false;
let workpieceManager, toolpathAnimation, toolpathVisualizer;
let orbitControls;
let toolMesh;  // Visual representation of the cutting tool
let gridHelper3D;  // Grid helper reference for updates
let axisLines = { x: null, y: null, z: null };  // Store axis line references
let resizeListenerAttached = false;  // Track if resize listener has been added
let isResizing = false;  // Track if window is currently being resized
let resizeTimeoutId = null;  // Timeout ID for detecting end of resize
let animationFrameId = null;  // Track animation loop to prevent duplicates
let animationLoopActive = false;  // Flag to control whether animation loop should run

// Simple profiling: wall-clock timing with frame counter
let profileFrameCount = 0;
let profileStartTime = performance.now();

// Voxel removal profiling: simple frame counter for removal operations
let voxelRemovalFrameCount = 0;
let voxelRemovalTotalTime = 0;

// ============ CONFIGURATION CONSTANTS ============
const CONFIG = {
  // Scene and rendering
  SCENE_BACKGROUND_COLOR: 0x4a4a4a,
  RENDERER_CLEAR_COLOR: 0x4a4a4a,
  ANTIALIAS: true,

  // Camera
  CAMERA_FOV: 75,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 5000,
  INITIAL_CAMERA_POSITION: { x: 0, y: -140, z: 100 },

  // Lighting
  DIRECTIONAL_LIGHT_COLOR: 0xffffff,
  DIRECTIONAL_LIGHT_INTENSITY: 1.2,
  DIRECTIONAL_LIGHT_SHADOW_SCALE: 0.7,
  AMBIENT_LIGHT_COLOR: 0xffffff,
  AMBIENT_LIGHT_INTENSITY: 0.6,

  // Axes
  AXIS_LENGTH: 100,
  AXIS_LINE_WIDTH: 2,
  AXIS_RED: 0xff0000,
  AXIS_GREEN: 0x00ff00,
  AXIS_BLUE: 0x0000ff,

  // Grid
  GRID_DISPLAY_SIZE_MULTIPLIER: 1.5,
  GRID_COLOR: 0x666666,
  GRID_ROTATION_X: Math.PI / 2,

  // Workpiece
  WORKPIECE_MATERIAL_SHININESS: 30,
  WORKPIECE_OPACITY: 0.6,
  WORKPIECE_DEFAULT_WIDTH: 200,
  WORKPIECE_DEFAULT_LENGTH: 200,
  WORKPIECE_DEFAULT_THICKNESS: 50,

  // Tool
  DEFAULT_TOOL_DIAMETER: 6,
  TOOL_MATERIAL_COLOR: 0x888888,
  TOOL_OPACITY: 0.85,
  TOOL_SHAFT_HEIGHT: 80,
  TOOL_SPHERE_SCALE: 1.5,
  TOOL_VISUALIZATION_LENGTH: 40,
  DRILL_HALF_ANGLE_DEGREES: 59,

  // Control panel
  CONTROL_PANEL_OPACITY: 0.8,
  ANIMATION_SPEED_MIN: 1,
  ANIMATION_SPEED_MAX: 10,

  // G-code defaults
  DEFAULT_FEED_RATE: 1000,
  RAPID_FEED_RATE: 6000,
  SAFE_Z_HEIGHT: 5,

  // Grid size default
  DEFAULT_GRID_SIZE: 10
};

// ============ HELPER FUNCTIONS ============
function getWorkpieceDimensions() {
  // Helper to consolidate duplicate dimension fetching
  return {
    width: (typeof getOption === 'function') ? getOption('workpieceWidth') : CONFIG.WORKPIECE_DEFAULT_WIDTH,
    length: (typeof getOption === 'function') ? getOption('workpieceLength') : CONFIG.WORKPIECE_DEFAULT_LENGTH,
    thickness: (typeof getOption === 'function') ? getOption('workpieceThickness') : CONFIG.WORKPIECE_DEFAULT_THICKNESS,
    originPosition: (typeof getOption === 'function') ? getOption('originPosition') : 'middle-center'
  };
}

// Wait for DOM and listen for tab show event
document.addEventListener('DOMContentLoaded', setupTabListener);

function setupTabListener() {
  const tab3dElement = document.getElementById('3d-tab');
  if (tab3dElement) {
    tab3dElement.addEventListener('shown.bs.tab', () => {
      // Enable animation loop and reinitialize when tab is shown
      animationLoopActive = true;
      initThree();
      // Schedule animation if not already running
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(animate);
      }
    });

    tab3dElement.addEventListener('hidden.bs.tab', () => {
      // Disable animation loop when switching to 2D view
      animationLoopActive = false;
      redraw();
    });
  }
}

function refreshToolpath() {
  if (!toolpathAnimation || !workpieceManager) return;

  // Get current workpiece dimensions
  const { width: workpieceWidth, length: workpieceLength, thickness: workpieceThickness, originPosition } = getWorkpieceDimensions();

  // Get wood species color
  const woodSpecies = (typeof getOption === 'function') ? getOption('woodSpecies') : 'Pine';
  let woodColor = 0x8B7355;  // Default wood color (brown)
  if (typeof woodSpeciesDatabase !== 'undefined' && woodSpeciesDatabase[woodSpecies]) {
    const colorHex = woodSpeciesDatabase[woodSpecies].color;
    // Remove '#' and parse as hexadecimal with radix 16
    woodColor = parseInt(colorHex.replace('#', ''), 16);
  }

  // Remove old workpiece
  scene.remove(workpieceManager.mesh);
  if (workpieceManager.mesh.geometry) workpieceManager.mesh.geometry.dispose();
  if (workpieceManager.mesh.material) workpieceManager.mesh.material.dispose();

  // Create new workpiece with current dimensions and wood color
  workpieceManager = new WorkpieceManager(scene, workpieceWidth, workpieceLength, workpieceThickness, originPosition, woodColor);
  workpieceManager.mesh.visible = true;  // Show workpiece

  // Update the toolpath animation's reference
  toolpathAnimation.workpieceManager = workpieceManager;

  // Reset subtraction tracking
  toolpathAnimation.lastSubtractionSegmentIndex = -1;

  // Clear existing toolpath visualization
  toolpathAnimation.clearToolpath();

  // Regenerate from current G-code
  if (typeof toGcode === 'function') {
    const gcode = toGcode();
    toolpathAnimation.loadFromGcode(gcode);
  }

  // Reset animation state
  toolpathAnimation.pause();
  toolpathAnimation.setProgress(0);
}

function initThree() {
  const container = document.getElementById('3d-canvas-container');
  if (!container) {
    console.error('3D canvas container not found');
    return;
  }

  // Cancel old animation loop to prevent duplicates
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Remove old controls UI panel
  const oldControlsPanel = document.getElementById('3d-controls-panel');
  if (oldControlsPanel && oldControlsPanel.parentElement === container) {
    container.removeChild(oldControlsPanel);
  }

  // Clear any existing renderer element from container (don't remove container itself)
  if (renderer && renderer.domElement && renderer.domElement.parentElement === container) {
    container.removeChild(renderer.domElement);
    renderer.dispose();
  }

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  // Setup scene with brighter background
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.SCENE_BACKGROUND_COLOR);

  // Setup camera - perspective view from above and negative Y
  camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, width / height, CONFIG.CAMERA_NEAR, CONFIG.CAMERA_FAR);

  // Get workpiece dimensions (in mm)
  const { width: workpieceWidth, length: workpieceLength, thickness: workpieceThickness, originPosition } = getWorkpieceDimensions();

  // Position camera: above origin (0,0,0), along negative Y axis
  // This gives us a perspective view where:
  // - X axis points right (red)
  // - Y axis points away (green)
  // - Z axis points up (blue)
  const camPos = CONFIG.INITIAL_CAMERA_POSITION;
  camera.position.set(camPos.x, camPos.y, camPos.z);
  camera.lookAt(0, 0, 0);

  // Setup renderer
  renderer = new THREE.WebGLRenderer({ antialias: CONFIG.ANTIALIAS, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(CONFIG.RENDERER_CLEAR_COLOR, 1.0);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // Setup ResizeObserver to watch actual container size changes
  // This is more reliable than window resize events because it fires when the element actually changes size
  let resizeObserverTimeoutId = null;
  const resizeObserver = new ResizeObserver(() => {
    // Debounce the resize callback to avoid multiple calls during a single resize operation
    if (resizeObserverTimeoutId) {
      clearTimeout(resizeObserverTimeoutId);
    }

    resizeObserverTimeoutId = setTimeout(() => {
      // Give the browser a moment to finish layout calculations
      requestAnimationFrame(() => {
        // Use 50px padding to account for timing issues during rapid window resize
        // During window resize events, container dimensions can be reported incorrectly
        // before layout has fully settled. This padding provides a safety buffer.
        doResize(50);
      });
    }, 50);  // Wait 50ms after last resize event before calling doResize
  });
  resizeObserver.observe(container);

  // Setup lighting
  setupLighting();

  // Create and add axis helper at origin
  addAxisHelper();

  // Create and add tool visualization
  createToolVisualization(6);  // 6mm diameter tool

  // Get wood species color for initial workpiece
  const woodSpecies = (typeof getOption === 'function') ? getOption('woodSpecies') : 'Pine';
  let woodColor = 0x8B7355;  // Default wood color (brown)
  if (typeof woodSpeciesDatabase !== 'undefined' && woodSpeciesDatabase[woodSpecies]) {
    const colorHex = woodSpeciesDatabase[woodSpecies].color;
    // Remove '#' and parse as hexadecimal with radix 16
    woodColor = parseInt(colorHex.replace('#', ''), 16);
  }

  // Initialize workpiece manager with workpiece positioned correctly and wood color
  workpieceManager = new WorkpieceManager(scene, workpieceWidth, workpieceLength, workpieceThickness, originPosition, woodColor);
  workpieceManager.mesh.visible = true;  // Show workpiece

  // Initialize visualizers
  toolpathVisualizer = new ToolpathVisualizer(scene);

  // Save current speed before recreating ToolpathAnimation (preserves speed across tab switches)
  const savedSpeed = toolpathAnimation?.speed || 1.0;

  toolpathAnimation = new ToolpathAnimation(workpieceManager, toolpathVisualizer, scene);

  // Restore the saved speed to the newly created animation
  toolpathAnimation.setSpeed(savedSpeed);

  // Expose to global scope for debugging from browser console
  window.toolpathAnimation = toolpathAnimation;

  // Setup orbit controls - center on world origin (0, 0, 0)
  orbitControls = new OrbitControls(camera, renderer.domElement);

  // Initialize orbit controls with correct camera position
  // Calculate distance, phi, theta from desired position (0, -140, 100)
  const camX = 0, camY = -140, camZ = 100;
  orbitControls.distance = Math.sqrt(camX*camX + camY*camY + camZ*camZ);
  orbitControls.phi = Math.asin(camY / orbitControls.distance);
  orbitControls.theta = Math.atan2(camX, camZ);

  orbitControls.setTarget(0, 0, 0);

  // Simulation controls are now created by bootstrap-layout.js overlay system
  // No need to create them here

  // Load toolpaths from generated G-code if available
  if (window.toolpaths && window.toolpaths.length > 0) {
    // Generate G-code using the same toGcode function
    if (typeof toGcode === 'function') {
      const gcode = toGcode();
      toolpathAnimation.loadFromGcode(gcode);
    } else {
      console.warn('toGcode function not found');
    }
  } else {
    console.warn('No toolpaths found - create some in the 2D view first');
  }

  // Start animation loop
  animate();

  // Handle window resize (only add listener once to prevent duplicates)
 //if (!resizeListenerAttached) {
  //  window.addEventListener('resize', onWindowResize);
  //  resizeListenerAttached = true;
  //}

  // Mark as initialized
  initialized = true;
}

function addAxisHelper() {
  // Create axes at world origin (0, 0, 0)
  // X axis: red (positive goes right)
  // Y axis: green (positive goes away from camera)
  // Z axis: blue (positive goes up)

  const axisLength = CONFIG.AXIS_LENGTH;

  // X axis (red)
  const xGeometry = new THREE.BufferGeometry();
  xGeometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([0, 0, 0, axisLength, 0, 0]), 3
  ));
  const xMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_RED, linewidth: CONFIG.AXIS_LINE_WIDTH });
  axisLines.x = new THREE.Line(xGeometry, xMaterial);
  scene.add(axisLines.x);

  // Y axis (green)
  const yGeometry = new THREE.BufferGeometry();
  yGeometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([0, 0, 0, 0, axisLength, 0]), 3
  ));
  const yMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_GREEN, linewidth: CONFIG.AXIS_LINE_WIDTH });
  axisLines.y = new THREE.Line(yGeometry, yMaterial);
  scene.add(axisLines.y);

  // Z axis (blue)
  const zGeometry = new THREE.BufferGeometry();
  zGeometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([0, 0, 0, 0, 0, axisLength]), 3
  ));
  const zMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_BLUE, linewidth: CONFIG.AXIS_LINE_WIDTH });
  axisLines.z = new THREE.Line(zGeometry, zMaterial);
  scene.add(axisLines.z);
}

function createToolVisualization(toolDiameter) {
  // Create initial tool mesh aligned with Z axis at origin
  // The tool geometry will be updated as the tool moves along the toolpath
  // Tool type will be determined from G-code comments (Flat, VBit, BallNose, Drill)

  const geometry = generateToolGeometryAtPosition(toolDiameter, 0, 0, 0, 'End Mill', 0);

  // Create gray translucent material
  const material = new THREE.MeshPhongMaterial({
    color: 0x888888,  // Gray
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });

  toolMesh = new THREE.Mesh(geometry, material);
  toolMesh.castShadow = true;
  toolMesh.receiveShadow = true;
  scene.add(toolMesh);
}

function updateToolMesh(toolDiameter, posX, posY, posZ, toolType = 'End Mill', toolAngle = 0) {
  // Update tool mesh geometry to new position with tip at (posX, posY, posZ)
  // Supports different tool types: End Mill, VBit, Ball Nose, Drill
  if (!toolMesh) return;

  // Create new geometry at the position using the tool type
  // (geometry is created in world space with vertices at posX, posY, posZ)
  const newGeometry = generateToolGeometryAtPosition(toolDiameter, posX, posY, posZ, toolType, toolAngle);

  // Dispose old geometry and assign new one
  if (toolMesh.geometry) {
    toolMesh.geometry.dispose();
  }
  toolMesh.geometry = newGeometry;
}

function generateToolGeometryAtPosition(toolDiameter, posX, posY, posZ, toolType = 'End Mill', toolAngle = 0) {
  // Generate tool geometry with tip at (posX, posY, posZ) extending upward along Z
  // Supports different tool types: End Mill (endmill), VBit (cone), Ball Nose (sphere), Drill (cone tip + cylinder)
  // Returns geometry in world space for boolean operations

  const radius = toolDiameter / 2;
  const toolLength = 40;
  let geometry;

  // Map tool type names: G-code uses 'End Mill', 'Ball Nose', 'VBit', 'Drill'
  // Geometry creation expects 'Flat' for End Mill
  const geometryToolType = (toolType === 'End Mill') ? 'Flat' : toolType;

  if (geometryToolType === 'VBit') {
    // V-bit: cone shape pointing downward with specified angle
    // Tip should be at gcode location, extending upward with cylinder shaft
    // Convert angle to radians and calculate cone dimensions
    const angleRad = (toolAngle / 2) * (Math.PI / 180);  // Half angle
    const coneHeight = radius / Math.tan(angleRad);
    const cylinderHeight = toolLength - coneHeight;  // Remaining length is shaft

    // Create cone geometry (points upward initially)
    const coneGeometry = new THREE.ConeGeometry(radius, coneHeight, 16);
    const conePositions = coneGeometry.attributes.position;

    // Transform cone: flip upside down so it points down, then shift tip to Y=0
    // Initial cone: tip at Y=+coneHeight/2, base at Y=-coneHeight/2
    // After flip: tip at Y=-coneHeight/2, base at Y=+coneHeight/2
    // After shift: tip at Y=0, base at Y=coneHeight
    for (let i = 0; i < conePositions.count; i++) {
      const y = conePositions.getY(i);
      // Flip upside down then shift tip to Y=0
      conePositions.setY(i, -y + coneHeight / 2);
    }
    conePositions.needsUpdate = true;
    coneGeometry.computeVertexNormals();

    // Create cylinder for shaft above cone
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 16);
    const cylinderPositions = cylinderGeometry.attributes.position;

    // Position cylinder so its bottom sits at cone base (Y = coneHeight)
    // Default cylinder: top at Y=+cylinderHeight/2, bottom at Y=-cylinderHeight/2
    // Need: bottom at Y=coneHeight, top at Y=coneHeight+cylinderHeight
    for (let i = 0; i < cylinderPositions.count; i++) {
      const y = cylinderPositions.getY(i);
      // Shift so bottom aligns with cone base
      cylinderPositions.setY(i, y + coneHeight + cylinderHeight / 2);
    }
    cylinderPositions.needsUpdate = true;
    cylinderGeometry.computeVertexNormals();

    // Merge cone and cylinder geometries
    const mergedGeometry = new THREE.BufferGeometry();

    // Combine vertex positions
    const combinedPositions = [];
    const combinedNormals = [];
    const combinedIndices = [];

    // Add cone vertices and indices
    const conePos = coneGeometry.attributes.position;
    const coneNorm = coneGeometry.attributes.normal;
    for (let i = 0; i < conePos.count; i++) {
      combinedPositions.push(conePos.getX(i), conePos.getY(i), conePos.getZ(i));
      if (coneNorm) {
        combinedNormals.push(coneNorm.getX(i), coneNorm.getY(i), coneNorm.getZ(i));
      }
    }

    if (coneGeometry.index) {
      for (let i = 0; i < coneGeometry.index.count; i++) {
        combinedIndices.push(coneGeometry.index.getX(i));
      }
    }

    // Add cylinder vertices and indices
    const cylPos = cylinderGeometry.attributes.position;
    const cylNorm = cylinderGeometry.attributes.normal;
    const coneVertexCount = conePos.count;
    for (let i = 0; i < cylPos.count; i++) {
      combinedPositions.push(cylPos.getX(i), cylPos.getY(i), cylPos.getZ(i));
      if (cylNorm) {
        combinedNormals.push(cylNorm.getX(i), cylNorm.getY(i), cylNorm.getZ(i));
      }
    }

    if (cylinderGeometry.index) {
      for (let i = 0; i < cylinderGeometry.index.count; i++) {
        combinedIndices.push(cylinderGeometry.index.getX(i) + coneVertexCount);
      }
    }

    mergedGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(combinedPositions), 3));
    if (combinedNormals.length > 0) {
      mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(combinedNormals), 3));
    }
    if (combinedIndices.length > 0) {
      mergedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(combinedIndices), 1));
    }
    mergedGeometry.computeVertexNormals();

    geometry = mergedGeometry;
  } else if (geometryToolType === 'BallNose' || geometryToolType === 'Ball Nose') {
    // Ball nose: sphere at tip with cylinder shaft
    // Shaft diameter is 3/4 the ball diameter, 30mm long
    // Geometry created along Y axis, alignment code will swap to Z axis for world space
    const sphereRadius = radius;
    const shaftRadius = radius * 0.75;
    const shaftHeight = 30;

    // Create sphere geometry (centered at origin)
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
    const spherePositions = sphereGeometry.attributes.position;

    // Position sphere so its bottom (lowest point) is at Y=0
    // Default sphere is centered at origin, so lowest point is at Y=-radius
    // We need to shift up by radius so lowest point is at Y=0
    for (let i = 0; i < spherePositions.count; i++) {
      const y = spherePositions.getY(i);
      spherePositions.setY(i, y + sphereRadius);
    }
    spherePositions.needsUpdate = true;
    sphereGeometry.computeVertexNormals();

    // Create cylinder for shaft above sphere (along Y axis)
    // CylinderGeometry is Y-axis aligned by default
    const cylinderGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftHeight, 16);
    const cylinderPositions = cylinderGeometry.attributes.position;

    // Position cylinder so its bottom sits at sphere top (Y = 2*sphereRadius)
    // Default cylinder: top at Y=+shaftHeight/2, bottom at Y=-shaftHeight/2
    // Need: bottom at Y=2*sphereRadius, top at Y=2*sphereRadius+shaftHeight
    for (let i = 0; i < cylinderPositions.count; i++) {
      const y = cylinderPositions.getY(i);
      cylinderPositions.setY(i, y + sphereRadius * 2 + shaftHeight / 2);
    }
    cylinderPositions.needsUpdate = true;
    cylinderGeometry.computeVertexNormals();

    // Merge sphere and cylinder geometries
    const mergedGeometry = new THREE.BufferGeometry();
    const combinedPositions = [];
    const combinedNormals = [];
    const combinedIndices = [];

    // Add sphere vertices and indices
    const spherePos = sphereGeometry.attributes.position;
    const sphereNorm = sphereGeometry.attributes.normal;
    for (let i = 0; i < spherePos.count; i++) {
      combinedPositions.push(spherePos.getX(i), spherePos.getY(i), spherePos.getZ(i));
      if (sphereNorm) {
        combinedNormals.push(sphereNorm.getX(i), sphereNorm.getY(i), sphereNorm.getZ(i));
      }
    }

    if (sphereGeometry.index) {
      for (let i = 0; i < sphereGeometry.index.count; i++) {
        combinedIndices.push(sphereGeometry.index.getX(i));
      }
    }

    // Add cylinder vertices and indices
    const cylPos = cylinderGeometry.attributes.position;
    const cylNorm = cylinderGeometry.attributes.normal;
    const sphereVertexCount = spherePos.count;
    for (let i = 0; i < cylPos.count; i++) {
      combinedPositions.push(cylPos.getX(i), cylPos.getY(i), cylPos.getZ(i));
      if (cylNorm) {
        combinedNormals.push(cylNorm.getX(i), cylNorm.getY(i), cylNorm.getZ(i));
      }
    }

    if (cylinderGeometry.index) {
      for (let i = 0; i < cylinderGeometry.index.count; i++) {
        combinedIndices.push(cylinderGeometry.index.getX(i) + sphereVertexCount);
      }
    }

    mergedGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(combinedPositions), 3));
    if (combinedNormals.length > 0) {
      mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(combinedNormals), 3));
    }
    if (combinedIndices.length > 0) {
      mergedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(combinedIndices), 1));
    }
    mergedGeometry.computeVertexNormals();

    geometry = mergedGeometry;
  } else if (geometryToolType === 'Drill') {
    // Drill bit: cylindrical body with conical pointed tip
    // Tip angle is typically around 118 degrees, so half angle is 59 degrees
    const tipHeight = radius / Math.tan((59 * Math.PI) / 180);  // Half angle = 59°
    const bodyHeight = toolLength - tipHeight;

    // Create cone for the pointed tip
    const coneGeometry = new THREE.ConeGeometry(radius, tipHeight, 16);
    const conePositions = coneGeometry.attributes.position;

    // Transform cone: flip upside down so tip points down, then shift tip to Y=0
    for (let i = 0; i < conePositions.count; i++) {
      const y = conePositions.getY(i);
      conePositions.setY(i, -y + tipHeight / 2);
    }
    conePositions.needsUpdate = true;
    coneGeometry.computeVertexNormals();

    // Create cylinder for the drill body
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, bodyHeight, 16);
    const cylinderPositions = cylinderGeometry.attributes.position;

    // Position cylinder so its bottom sits at the cone base
    for (let i = 0; i < cylinderPositions.count; i++) {
      const y = cylinderPositions.getY(i);
      cylinderPositions.setY(i, y + tipHeight + bodyHeight / 2);
    }
    cylinderPositions.needsUpdate = true;
    cylinderGeometry.computeVertexNormals();

    // Merge cone and cylinder geometries
    const mergedGeometry = new THREE.BufferGeometry();
    const combinedPositions = [];
    const combinedNormals = [];
    const combinedIndices = [];

    // Add cone vertices and indices
    const conePos = coneGeometry.attributes.position;
    const coneNorm = coneGeometry.attributes.normal;
    for (let i = 0; i < conePos.count; i++) {
      combinedPositions.push(conePos.getX(i), conePos.getY(i), conePos.getZ(i));
      if (coneNorm) {
        combinedNormals.push(coneNorm.getX(i), coneNorm.getY(i), coneNorm.getZ(i));
      }
    }

    if (coneGeometry.index) {
      for (let i = 0; i < coneGeometry.index.count; i++) {
        combinedIndices.push(coneGeometry.index.getX(i));
      }
    }

    // Add cylinder vertices and indices
    const cylPos = cylinderGeometry.attributes.position;
    const cylNorm = cylinderGeometry.attributes.normal;
    const coneVertexCount = conePos.count;
    for (let i = 0; i < cylPos.count; i++) {
      combinedPositions.push(cylPos.getX(i), cylPos.getY(i), cylPos.getZ(i));
      if (cylNorm) {
        combinedNormals.push(cylNorm.getX(i), cylNorm.getY(i), cylNorm.getZ(i));
      }
    }

    if (cylinderGeometry.index) {
      for (let i = 0; i < cylinderGeometry.index.count; i++) {
        combinedIndices.push(cylinderGeometry.index.getX(i) + coneVertexCount);
      }
    }

    mergedGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(combinedPositions), 3));
    if (combinedNormals.length > 0) {
      mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(combinedNormals), 3));
    }
    if (combinedIndices.length > 0) {
      mergedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(combinedIndices), 1));
    }
    mergedGeometry.computeVertexNormals();

    geometry = mergedGeometry;
  } else {
    // End Mill / Flat endmill (default): cylinder
    geometry = new THREE.CylinderGeometry(radius, radius, toolLength, 16);
  }

  // Transform vertices to world space
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    let alignedX, alignedY, alignedZ;

    // Use geometryToolType which was calculated at the start of the function
    if (geometryToolType === 'Flat') {
      // Cylinder: swap Y and Z to align with Z axis
      alignedX = x;
      alignedY = z;
      alignedZ = y + toolLength / 2;  // Position so tip is at Z=0
    } else if (geometryToolType === 'VBit') {
      // Cone (flipped to point downward) + cylinder: align with Z axis
      // The tip is at Y=0 in local space, positioned at gcode location
      alignedX = x;
      alignedY = z;
      alignedZ = y;  // Tip is at Y=0, positioned at posZ in world space
    } else if (geometryToolType === 'Drill') {
      // Drill bit (cone tip + cylinder body): align with Z axis
      // The tip is at Y=0 in local space, positioned at gcode location
      alignedX = x;
      alignedY = z;
      alignedZ = y;  // Tip is at Y=0, positioned at posZ in world space
    } else if (geometryToolType === 'Ball Nose' || geometryToolType === 'BallNose') {
      // Ball nose (sphere + shaft): align with Z axis
      // The tip (sphere bottom) is at Y=0 in local space, positioned at gcode location
      alignedX = x;
      alignedY = z;
      alignedZ = y;  // Tip is at Y=0, positioned at posZ in world space
    } else {
      // Unknown types: default to cylinder behavior
      alignedX = x;
      alignedY = z;
      alignedZ = y + toolLength / 2;
    }

    // Translate to world position (posX, posY, posZ)
    const worldX = alignedX + posX;
    const worldY = alignedY + posY;
    const worldZ = alignedZ + posZ;

    positions.setXYZ(i, worldX, worldY, worldZ);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function setupLighting() {
  // Get workpiece dimensions for proper light setup
  const { width: workpieceWidth, length: workpieceLength, thickness: workpieceThickness } = getWorkpieceDimensions();
  const maxDim = Math.max(workpieceWidth, workpieceLength);

  // Directional light from above and front (positive Z, negative Y)
  const dirLight = new THREE.DirectionalLight(CONFIG.DIRECTIONAL_LIGHT_COLOR, CONFIG.DIRECTIONAL_LIGHT_INTENSITY);
  dirLight.position.set(0, -maxDim * 0.5, maxDim);
  dirLight.castShadow = true;
  const shadowScale = CONFIG.DIRECTIONAL_LIGHT_SHADOW_SCALE;
  dirLight.shadow.camera.left = -maxDim * shadowScale;
  dirLight.shadow.camera.right = maxDim * shadowScale;
  dirLight.shadow.camera.top = maxDim * shadowScale;
  dirLight.shadow.camera.bottom = -maxDim * shadowScale;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = workpieceThickness + maxDim;
  scene.add(dirLight);

  // Ambient light for overall illumination
  const ambientLight = new THREE.AmbientLight(CONFIG.AMBIENT_LIGHT_COLOR, CONFIG.AMBIENT_LIGHT_INTENSITY);
  scene.add(ambientLight);

  // Create grid with user's gridSize setting
  updateGridSize3D();
}

function updateGridSize3D(gridSizeMM) {
  // Update 3D grid to match the user's gridSize setting
  if (!scene) return;  // Scene not initialized yet

  // Use provided gridSize or fall back to getOption
  if (gridSizeMM === undefined) {
    gridSizeMM = (typeof getOption === 'function') ? getOption("gridSize") : 10;
  }

  // Get workpiece dimensions
  const { width: workpieceWidth, length: workpieceLength, thickness: workpieceThickness } = getWorkpieceDimensions();
  const maxDim = Math.max(workpieceWidth, workpieceLength);

  // Remove old grid if it exists
  if (gridHelper3D && scene) {
    scene.remove(gridHelper3D);
  }

  // Create new grid with size based on gridSize setting
  const displaySize = maxDim * CONFIG.GRID_DISPLAY_SIZE_MULTIPLIER;
  const gridDivisions = Math.ceil(displaySize / gridSizeMM);

  // GridHelper(size, divisions, colorGrid, colorCenterLine)
  // Use the same lighter color for all grid lines
  gridHelper3D = new THREE.GridHelper(displaySize, gridDivisions, CONFIG.GRID_COLOR, CONFIG.GRID_COLOR);

  // Position grid on X-Y plane at bottom of workpiece
  gridHelper3D.rotation.x = CONFIG.GRID_ROTATION_X;
  gridHelper3D.position.z = -workpieceThickness;

  scene.add(gridHelper3D);
}

// Export functions for external access
window.updateGridSize3D = updateGridSize3D;

function updateWorkpiece3D(width, length, thickness, originPosition, woodSpecies) {
  // Update 3D workpiece with new dimensions and species color
  if (!scene || !workpieceManager) return;  // Scene or workpiece not initialized yet

  // Use provided values or fall back to getOption
  if (width === undefined) {
    width = (typeof getOption === 'function') ? getOption('workpieceWidth') : 200;
  }
  if (length === undefined) {
    length = (typeof getOption === 'function') ? getOption('workpieceLength') : 200;
  }
  if (thickness === undefined) {
    thickness = (typeof getOption === 'function') ? getOption('workpieceThickness') : 50;
  }
  if (originPosition === undefined) {
    originPosition = (typeof getOption === 'function') ? getOption('originPosition') : 'middle-center';
  }
  if (woodSpecies === undefined) {
    woodSpecies = (typeof getOption === 'function') ? getOption('woodSpecies') : 'Pine';
  }

  // Get wood color from species database
  let woodColor = 0x8B7355;  // Default wood color (brown)
  if (typeof woodSpeciesDatabase !== 'undefined' && woodSpeciesDatabase[woodSpecies]) {
    const colorHex = woodSpeciesDatabase[woodSpecies].color;
    // Convert CSS hex color (e.g., '#F5DEB3') to THREE.js hex (e.g., 0xF5DEB3)
    // Remove '#' and parse as hexadecimal with radix 16
    woodColor = parseInt(colorHex.replace('#', ''), 16);
  }

  // Remove old workpiece
  scene.remove(workpieceManager.mesh);
  if (workpieceManager.mesh.geometry) workpieceManager.mesh.geometry.dispose();
  if (workpieceManager.mesh.material) workpieceManager.mesh.material.dispose();

  // Create new workpiece with updated dimensions and color
  workpieceManager = new WorkpieceManager(scene, width, length, thickness, originPosition, woodColor);
  workpieceManager.mesh.visible = true;

  // Update the toolpath animation's reference
  if (toolpathAnimation) {
    toolpathAnimation.workpieceManager = workpieceManager;
  }
}

window.updateWorkpiece3D = updateWorkpiece3D;

// Wrapper functions for 3D simulation controls called from bootstrap-layout.js
window.setAxesVisibility3D = function(visible) {
  if (axisLines.x) axisLines.x.visible = visible;
  if (axisLines.y) axisLines.y.visible = visible;
  if (axisLines.z) axisLines.z.visible = visible;
};

window.setToolpathVisibility3D = function(visible) {
  if (!toolpathAnimation || !toolpathAnimation.toolpathLines) return;
  for (const line of toolpathAnimation.toolpathLines) {
    line.visible = visible;
  }
};

window.setWorkpieceVisibility3D = function(visible) {
  // Instead of toggling visibility (which causes GPU corruption), move meshes off-screen
  // This keeps them rendering but hidden from view, avoiding blotchy discoloration
  const offscreenPosition = new THREE.Vector3(10000, 10000, 10000);  // Far behind camera
  const originalPosition = new THREE.Vector3(0, 0, 0);  // Original position at origin

  // Move workpiece
  if (workpieceManager && workpieceManager.mesh) {
    workpieceManager.mesh.position.copy(visible ? originalPosition : offscreenPosition);
  }

  // Move filler workpiece boxes
  if (toolpathAnimation && toolpathAnimation.workpieceOutlineBox) {
    toolpathAnimation.workpieceOutlineBox.position.copy(visible ? originalPosition : offscreenPosition);
  }

  // Move voxel grid
  if (toolpathAnimation && toolpathAnimation.voxelGrid && toolpathAnimation.voxelGrid.mesh) {
    toolpathAnimation.voxelGrid.mesh.position.copy(visible ? originalPosition : offscreenPosition);
  }
};

window.startSimulation3D = function() {
  if (toolpathAnimation && !toolpathAnimation.isPlaying) {
    if (toolpathAnimation.elapsedTime >= toolpathAnimation.totalAnimationTime) {
      toolpathAnimation.setProgress(0);
    }
    toolpathAnimation.play();

    // Update total time display when starting
    const totalTimeElem = document.getElementById('3d-total-time');
    if (totalTimeElem) {
      totalTimeElem.textContent = formatTime(toolpathAnimation.totalAnimationTime);
    }
    const totalTimeElem2d = document.getElementById('2d-total-time');
    if (totalTimeElem2d) {
      totalTimeElem2d.textContent = formatTime(toolpathAnimation.totalAnimationTime);
    }

    updateSimulation3DUI();
  }
};

window.pauseSimulation3D = function() {
  if (toolpathAnimation && toolpathAnimation.isPlaying) {
    toolpathAnimation.pause();
    updateSimulation3DUI();
  }
};

window.stopSimulation3D = function() {
  if (toolpathAnimation) {
    toolpathAnimation.pause();
    toolpathAnimation.wasStopped = true;  // Mark that we were stopped (not paused)
    updateSimulation3DUI();
  }
};

window.updateSimulation3DSpeed = function(speed) {
  if (toolpathAnimation) {
    toolpathAnimation.setSpeed(speed);
  }
};

window.setSimulation3DProgress = function(lineNumber) {
  if (toolpathAnimation) {
    // Seek animation to this line
    toolpathAnimation.seekToLineNumber(lineNumber);
    // Update viewer to match
    if (typeof gcodeView !== 'undefined' && gcodeView) {
      gcodeView.setCurrentLine(lineNumber);
    }
  }
};

/**
 * Format seconds to MM:SS format
 * @param {number} seconds - Total seconds
 * @returns {string} - Formatted time string "MM:SS"
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update 2D simulation display elements
 */
function updateSimulation2DDisplays() {
  if (!toolpathAnimation) return;

  const lineDisplay = document.getElementById('2d-step-display');
  const feedRateDisplay = document.getElementById('2d-feed-rate-display');
  const simTimeElem = document.getElementById('2d-simulation-time');
  const totalTimeElem = document.getElementById('2d-total-time');

  if (lineDisplay) {
    lineDisplay.textContent = `${toolpathAnimation.currentGcodeLineNumber} / ${toolpathAnimation.totalGcodeLines}`;
  }

  if (feedRateDisplay) {
    feedRateDisplay.textContent = `${Math.round(toolpathAnimation.currentFeedRate)}`;
  }

  if (simTimeElem) {
    // Calculate cumulative elapsed time by finding previous movement's cumulative time + current elapsed
    let cumulativeElapsedTime = 0;

    // Find previous movement (same logic as in update() method)
    let prevMovement = null;
    for (const move of toolpathAnimation.movementTiming) {
      if (move.gcodeLineNumber < toolpathAnimation.currentGcodeLineNumber) {
        if (!prevMovement || move.gcodeLineNumber > prevMovement.gcodeLineNumber) {
          prevMovement = move;
        }
      }
    }

    // Cumulative elapsed = previous movement's cumulative time + current elapsed within movement
    const prevMovementEndTime = prevMovement ? prevMovement.cumulativeTime : 0;
    cumulativeElapsedTime = prevMovementEndTime + toolpathAnimation.elapsedTime;

    simTimeElem.textContent = formatTime(cumulativeElapsedTime);
  }

  if (totalTimeElem) {
    totalTimeElem.textContent = formatTime(toolpathAnimation.totalAnimationTime);
  }
}

/**
 * Update 3D simulation display elements
 */
function updateSimulation3DDisplays() {
  if (!toolpathAnimation) return;

  const lineDisplay = document.getElementById('3d-step-display');
  const feedRateDisplay = document.getElementById('3d-feed-rate-display');
  const progressSlider = document.getElementById('3d-simulation-progress');
  const progressDisplay = document.getElementById('3d-progress-display');
  const simTimeElem = document.getElementById('3d-simulation-time');
  const totalTimeElem = document.getElementById('3d-total-time');

  if (lineDisplay) {
    lineDisplay.textContent = `${toolpathAnimation.currentGcodeLineNumber} / ${toolpathAnimation.totalGcodeLines}`;
  }

  if (feedRateDisplay) {
    feedRateDisplay.textContent = `${Math.round(toolpathAnimation.currentFeedRate)}`;
  }

  if (progressSlider && toolpathAnimation.totalGcodeLines > 0) {
    progressSlider.max = toolpathAnimation.totalGcodeLines - 1;
    progressSlider.value = toolpathAnimation.currentGcodeLineNumber;
  }

  if (progressDisplay) {
    const percent = toolpathAnimation.totalGcodeLines > 0
      ? Math.round((toolpathAnimation.currentGcodeLineNumber / (toolpathAnimation.totalGcodeLines - 1)) * 100)
      : 0;
    progressDisplay.textContent = `Line ${toolpathAnimation.currentGcodeLineNumber} (${percent}%)`;
  }

  if (simTimeElem) {
    // Calculate cumulative elapsed time by finding previous movement's cumulative time + current elapsed
    let cumulativeElapsedTime = 0;

    // Find previous movement (same logic as in update() method)
    let prevMovement = null;
    for (const move of toolpathAnimation.movementTiming) {
      if (move.gcodeLineNumber < toolpathAnimation.currentGcodeLineNumber) {
        if (!prevMovement || move.gcodeLineNumber > prevMovement.gcodeLineNumber) {
          prevMovement = move;
        }
      }
    }

    // Cumulative elapsed = previous movement's cumulative time + current elapsed within movement
    const prevMovementEndTime = prevMovement ? prevMovement.cumulativeTime : 0;
    cumulativeElapsedTime = prevMovementEndTime + toolpathAnimation.elapsedTime;

    simTimeElem.textContent = formatTime(cumulativeElapsedTime);
  }

  if (totalTimeElem) {
    totalTimeElem.textContent = formatTime(toolpathAnimation.totalAnimationTime);
  }
}

function updateSimulation3DUI() {
  const startBtn = document.getElementById('3d-start-simulation');
  const pauseBtn = document.getElementById('3d-pause-simulation');
  const stopBtn = document.getElementById('3d-stop-simulation');

  if (!startBtn || !pauseBtn || !stopBtn) return;

  if (toolpathAnimation && toolpathAnimation.isPlaying) {
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
  } else {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
  }

  // Update all displays including progress slider
  updateSimulation3DDisplays();
}

function animate() {
  // If animation loop is disabled (switched to 2D view), stop here
  if (!animationLoopActive) {
    return;
  }

  animationFrameId = requestAnimationFrame(animate);

  // Increment frame counter for profiling
  profileFrameCount++;

  // Measure component times
  const updateStart = performance.now();
  if (toolpathAnimation) {
    toolpathAnimation.update();

    // Update 3D progress slider in overlay (now line-based, not percentage)
    const progressSlider = document.getElementById('3d-simulation-progress');
    if (progressSlider) {
      progressSlider.value = toolpathAnimation.currentGcodeLineNumber;
      const lineDisplay = toolpathAnimation.currentGcodeLineNumber + ' / ' + toolpathAnimation.totalGcodeLines;
      document.getElementById('3d-progress-display').textContent = lineDisplay;
    }

    // Update simulation displays for both 2D and 3D
    updateSimulation2DDisplays();
    updateSimulation3DDisplays();

    // If animation has completed, update UI to re-enable play button
    if (toolpathAnimation.currentGcodeLineNumber >= toolpathAnimation.totalGcodeLines && !toolpathAnimation.isPlaying) {
      updateSimulation3DUI();
    }
  }
  const updateTime = performance.now() - updateStart;

  // Skip rendering while window is being resized to avoid WebGL context issues
  if (!isResizing) {
    const renderStart = performance.now();
    renderer.render(scene, camera);
    const renderTime = performance.now() - renderStart;

    // Track timing stats
    if (!window.timingStats) {
      window.timingStats = { updateTotal: 0, renderTotal: 0, count: 0 };
    }
    window.timingStats.updateTotal += updateTime;
    window.timingStats.renderTotal += renderTime;
    window.timingStats.count++;

    // Report FPS every 300 frames using wall-clock timing (includes all overhead)
    /*
    if (profileFrameCount % 300 === 0) {
      const now = performance.now();
      const elapsedSeconds = (now - profileStartTime) / 1000;
      const fps = (profileFrameCount / elapsedSeconds).toFixed(1);
      const avgUpdate = (window.timingStats.updateTotal / window.timingStats.count).toFixed(2);
      const avgRender = (window.timingStats.renderTotal / window.timingStats.count).toFixed(2);

      console.log(`[Frame Profile] Frames: ${profileFrameCount}, FPS: ${fps}, Update: ${avgUpdate}ms, Render: ${avgRender}ms`);

      // Reset for next 300 frames
      profileFrameCount = 0;
      profileStartTime = now;
      window.timingStats.updateTotal = 0;
      window.timingStats.renderTotal = 0;
      window.timingStats.count = 0;
    }
    */
  }
}

function onWindowResize() {
  // Mark that we're resizing to pause animation loop
  isResizing = true;

  // Clear any existing timeout
  if (resizeTimeoutId) {
    clearTimeout(resizeTimeoutId);
  }

  // Detect when resize ends and resume animation
  resizeTimeoutId = setTimeout(() => {
    // Wait for browser to complete layout recalculation before reading dimensions
    requestAnimationFrame(() => {
      doResize(0);
      isResizing = false;
    });
  }, 200);

}

  function doResize(padding = 0)
  {
      const container = document.getElementById('3d-canvas-container');
      if (!container || !renderer || !camera) return;

  
      let newWidth = container.getBoundingClientRect().width - padding;
      let newHeight = container.clientHeight;

      if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
      }

 
  }


// ============ WORKPIECE MANAGER ============
class WorkpieceManager {
  constructor(scene, width, length, thickness, originPosition, woodColor) {
    this.scene = scene;
    this.width = width;
    this.length = length;
    this.thickness = thickness;
    this.originPosition = originPosition || 'middle-center';
    this.woodColor = woodColor || 0x8B7355;  // Default wood color if not provided

    // Calculate the workpiece bounds based on origin position
    // Top surface is always at Z = 0, bottom at Z = -thickness
    // X and Y bounds depend on where the origin is
    const bounds = this.calculateBounds(width, length, thickness, this.originPosition);

    // Create geometry with correct bounds built in
    // BoxGeometry(width, height, depth) - we need to adjust for correct positioning
    const geomWidth = bounds.maxX - bounds.minX;
    const geomLength = bounds.maxY - bounds.minY;
    const geomThickness = bounds.maxZ - bounds.minZ;

    // Simple box geometry - minimal segments for efficient boolean operations
    // We don't need high detail since cuts will add the geometry detail
    const geometry = new THREE.BoxGeometry(geomWidth, geomLength, geomThickness, 1, 1, 1);

    // The BoxGeometry is centered at (0, 0, 0) by default
    // We need to translate it so that:
    // - minX, minY, minZ are at the desired corners
    // - maxX, maxY, maxZ are at the opposite corners
    const offsetX = (bounds.minX + bounds.maxX) / 2;
    const offsetY = (bounds.minY + bounds.maxY) / 2;
    const offsetZ = (bounds.minZ + bounds.maxZ) / 2;

    const matrix = new THREE.Matrix4();
    matrix.makeTranslation(offsetX, offsetY, offsetZ);
    geometry.applyMatrix4(matrix);

    const material = new THREE.MeshPhongMaterial({
      color: this.woodColor,  // Use wood species color
      shininess: 30,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6  // 60% opaque, 40% transparent
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // Store original vertices for deformation
    this.geometry = geometry;
    this.originalPositions = geometry.attributes.position.array.slice();
  }

  calculateBounds(width, length, thickness, originPosition) {
    // Calculate where the workpiece box should be positioned based on origin
    // Top surface is always at Z = 0, bottom at Z = -thickness
    // X and Y positioning depends on originPosition

    let minX, maxX, minY, maxY;

    // Handle X (width) positioning
    switch (originPosition) {
      case 'top-left':
      case 'middle-left':
      case 'bottom-left':
        minX = 0;
        maxX = width;
        break;
      case 'top-center':
      case 'middle-center':
      case 'bottom-center':
        minX = -width / 2;
        maxX = width / 2;
        break;
      case 'top-right':
      case 'middle-right':
      case 'bottom-right':
        minX = -width;
        maxX = 0;
        break;
      default:
        minX = -width / 2;
        maxX = width / 2;
    }

    // Handle Y (length) positioning
    switch (originPosition) {
      case 'top-left':
      case 'top-center':
      case 'top-right':
        minY = -length;
        maxY = 0;
        break;
      case 'middle-left':
      case 'middle-center':
      case 'middle-right':
        minY = -length / 2;
        maxY = length / 2;
        break;
      case 'bottom-left':
      case 'bottom-center':
      case 'bottom-right':
        minY = 0;
        maxY = length;
        break;
      default:
        minY = -length / 2;
        maxY = length / 2;
    }

    return {
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY,
      minZ: -thickness,  // Bottom surface
      maxZ: 0            // Top surface
    };
  }

  reset() {
    const pos = this.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, this.originalPositions[i * 3]);
      pos.setY(i, this.originalPositions[i * 3 + 1]);
      pos.setZ(i, this.originalPositions[i * 3 + 2]);
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

// ============ TOOLPATH ANIMATION ============
class ToolpathAnimation {
  constructor(workpieceManager, toolpathVisualizer, scene) {
    this.workpieceManager = workpieceManager;
    this.toolpathVisualizer = toolpathVisualizer;
    this.scene = scene;

    this.isPlaying = false;
    this.speed = 1.0;  // Speed multiplier for animation
    this.toolpaths = [];
    this.flattenedPath = [];
    this.currentPathIndex = 0;
    this.lastDeformedIndex = 0;  // Track last deformed point to avoid redundant work
    this.onStatusChange = null;
    this.toolVisual = null;
    this.toolRadius = 1;
    this.toolpathLines = [];  // Store references to line meshes for cleanup
    this.movementTiming = [];  // Array of movement timings with G-code line numbers
    this.lastSubtractionSegmentIndex = -1;  // Track last segment where we performed subtraction
    this.subtractionStepDistance = 2;  // Subtract every N mm of movement (reduced for smoother cuts)
    this.toolCommentsInOrder = [];  // Array of tool comments in chronological order for tool switching

    // G-code text for line iteration
    this.gcodeLines = [];  // Array of G-code lines (split from gcode text)

    // Line-driven animation state (PRIMARY STATE)
    this.currentGcodeLineNumber = 1;  // Current G-code line number (1-indexed, source of truth)
    this.totalGcodeLines = 0;  // Total number of G-code lines
    this.justSeeked = false;  // Flag to prevent advancing on frame immediately after seek
    this.justAdvancedLine = false;  // Flag to skip tool update on frame we advance lines
    this.wasStopped = false;  // Flag to track if stopped (vs paused) - affects play behavior

    // Time-based animation (internal, for interpolation within current movement)
    this.elapsedTime = 0;  // Elapsed time within current movement in seconds
    this.totalAnimationTime = 0;  // Total animation time in seconds

    // Display and tool state
    this.currentFeedRate = 0;  // Current feed rate in mm/min
    this.currentToolInfo = null;  // Current tool being used
    this.lineNumberToTimeMap = new Map();  // Map: lineNumber -> cumulativeTime (for progress display)
    this.totalJobTime = 0;  // Pre-calculated total job time in seconds

    // Voxel-based material removal
    this.voxelGrid = null;
    this.voxelMaterialRemover = new VoxelMaterialRemover();
    this.voxelSize = 0.1;  // 0.1mm voxel size in X/Y (Z is step-down from tool, sparse grid reduces performance impact)
    this.enableVoxelRemoval = true;  // Toggle for voxel removal feature
    this.voxelRemovalRate = 2;  // Only remove voxels every N frames to reduce per-frame cost
    this.frameCount = 0;  // Frame counter for throttling voxel removal

    // Tool lookup by line number (sparse array - only stores tool change points)
    this.toolChangePoints = [];  // Array of {lineNumber, toolInfo} - only tool changes, not every line
  }

  clearToolpath() {
    // Remove all toolpath line meshes from the scene
    for (const line of this.toolpathLines) {
      this.scene.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    }
    this.toolpathLines = [];
  }

  /**
   * Calculate bounding box of all toolpaths with padding
   * @returns {Object} {minX, maxX, minY, maxY, minZ, maxZ} with padding applied
   */
  calculateToolPathBounds() {
    const padding = 4;  // 10mm padding around toolpath bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    // Iterate through all movements to find bounds
    if (this.movementTiming && this.movementTiming.length > 0) {
      for (const move of this.movementTiming) {
        minX = Math.min(minX, move.x);
        maxX = Math.max(maxX, move.x);
        minY = Math.min(minY, move.y);
        maxY = Math.max(maxY, move.y);
        minZ = Math.min(minZ, move.z);
        maxZ = Math.max(maxZ, move.z);
      }
    } else {
      // Fallback if no movement timing available
      return null;
    }

    // Apply padding
    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
      minZ: minZ - padding,
      maxZ: maxZ + padding
    };
  }

  initializeVoxelGrid() {
    try {
      // Dispose of old voxel grid if it exists
      if (this.voxelGrid) {
        const voxelMesh = this.voxelGrid.getMesh();
        this.scene.remove(voxelMesh);
        this.voxelGrid.dispose();
      }

      // Remove old wireframe shell if it exists
      if (this.workpieceOutlineBox) {
        this.scene.remove(this.workpieceOutlineBox);
      }

      // Get workpiece dimensions from the manager
      if (!this.workpieceManager) {
        console.warn('Voxel grid: workpiece manager not available');
        return;
      }

      const width = this.workpieceManager.width;
      const length = this.workpieceManager.length;
      const thickness = this.workpieceManager.thickness;

      if (!width || !length || !thickness) {
        console.warn('Voxel grid: invalid workpiece dimensions', { width, length, thickness });
        return;
      }

      // Get workpiece color
      const woodColor = this.workpieceManager.woodColor || 0x8B6914;

      // Calculate toolpath bounding box
      const bounds = this.calculateToolPathBounds();
      let gridWidth = width;
      let gridLength = length;
      let gridThickness = thickness;
      let gridOrigin = new THREE.Vector3(0, 0, 0);

      if (bounds) {
        // Calculate material bounds in world space (centered at origin)
        const materialMinX = -width / 2;
        const materialMaxX = width / 2;
        const materialMinY = -length / 2;
        const materialMaxY = length / 2;
        const materialMinZ = -thickness;
        const materialMaxZ = 0;

        // Clip toolpath bounds to material bounds first
        const clippedMinX = Math.max(bounds.minX, materialMinX);
        const clippedMaxX = Math.min(bounds.maxX, materialMaxX);
        const clippedMinY = Math.max(bounds.minY, materialMinY);
        const clippedMaxY = Math.min(bounds.maxY, materialMaxY);
        const clippedMinZ = Math.max(bounds.minZ, materialMinZ);
        const clippedMaxZ = Math.min(bounds.maxZ, materialMaxZ);

        let clippedWidth = clippedMaxX - clippedMinX;
        let clippedLength = clippedMaxY - clippedMinY;
        let numberOfVoxels = clippedWidth*clippedLength/(this.voxelSize*this.voxelSize);

    
        while (numberOfVoxels > 750000)
        {
            this.voxelSize += 0.1;
            numberOfVoxels = clippedWidth*clippedLength/(this.voxelSize*this.voxelSize);

        }
        console.log("number of voxels = "+numberOfVoxels+ " voxex size = "+this.voxelSize);     
  

        // Round clipped bounds UP to clean voxel boundaries to ensure all in-bounds toolpath is captured
        const toolpathWidthMM = Math.ceil((clippedMaxX - clippedMinX) / this.voxelSize) * this.voxelSize;
        const toolpathLengthMM = Math.ceil((clippedMaxY - clippedMinY) / this.voxelSize) * this.voxelSize;

        // Final clip to material bounds (safety check)
        gridWidth = Math.min(toolpathWidthMM, width);
        gridLength = Math.min(toolpathLengthMM, length);
        gridThickness = thickness;  // Always use full material thickness for 2D height-based voxels

        // Use clipped bounds center for grid origin
        gridOrigin = new THREE.Vector3(
          (clippedMinX + clippedMaxX) / 2,
          (clippedMinY + clippedMaxY) / 2,
          0  // Keep Z at surface
        );
      }


      // Create new voxel grid (2D grid with height-based voxels)
      this.voxelGrid = new VoxelGrid(
        gridWidth,
        gridLength,
        gridThickness,
        this.voxelSize,
        gridOrigin,
        woodColor
      );


      // Add voxel mesh to scene (single 2D height-based mesh)
      const voxelMesh = this.voxelGrid.getMesh();
      this.scene.add(voxelMesh);

      // Create solid boxes filling gaps between workpiece and voxel grid
      this.createWorkpieceOutlineBox(width, length, thickness, gridWidth, gridLength, gridOrigin);

      // Hide original workpiece mesh when voxels are active (voxels replace the visual representation)
      if (this.workpieceManager && this.workpieceManager.mesh) {
        this.workpieceManager.mesh.visible = false;
      }

      // Reset material remover
      this.voxelMaterialRemover.reset();
    } catch (error) {
      console.error('Error initializing voxel grid:', error);
      this.enableVoxelRemoval = false;  // Disable voxel removal if initialization fails
    }
  }

  /**
   * Create single InstancedMesh with 4 large filler voxels
   * Fills gaps between workpiece edges and voxel grid edges
   * Uses exact same coloring as main voxel grid for seamless appearance
   * @param {number} width - Workpiece width in mm
   * @param {number} length - Workpiece length in mm
   * @param {number} thickness - Workpiece thickness in mm
   * @param {number} gridWidth - Voxel grid width in mm
   * @param {number} gridLength - Voxel grid length in mm
   * @param {THREE.Vector3} gridOrigin - Center position of voxel grid in world space
   */
  createWorkpieceOutlineBox(width, length, thickness, gridWidth, gridLength, gridOrigin) {
    // Get workpiece color
    let woodColor = 0x8B6914;  // Default wood color
    if (typeof getOption === 'function') {
      const woodSpecies = getOption('woodSpecies');
      const colorHex = woodSpeciesDatabase[woodSpecies]?.color || '#8B6914';
      woodColor = parseInt(colorHex.replace('#', ''), 16);
    } else if (this.workpieceManager?.woodColor) {
      woodColor = this.workpieceManager.woodColor;
    }

    // Calculate workpiece boundaries (centered at origin)
    const wpMinX = -width / 2;
    const wpMaxX = width / 2;
    const wpMinY = -length / 2;
    const wpMaxY = length / 2;

    // Calculate voxel grid boundaries (centered at gridOrigin)
    const vgMinX = gridOrigin.x - gridWidth / 2;
    const vgMaxX = gridOrigin.x + gridWidth / 2;
    const vgMinY = gridOrigin.y - gridLength / 2;
    const vgMaxY = gridOrigin.y + gridLength / 2;

    // Collect filler box data (up to 4 boxes)
    const fillerBoxes = [];

    // LEFT BOX: from workpiece left to voxel grid left
    if (vgMinX > wpMinX) {
      fillerBoxes.push({
        width: vgMinX - wpMinX,
        length: gridLength,
        x: wpMinX + (vgMinX - wpMinX) / 2,
        y: gridOrigin.y,
        z: -thickness / 2
      });
    }

    // RIGHT BOX: from voxel grid right to workpiece right
    if (vgMaxX < wpMaxX) {
      fillerBoxes.push({
        width: wpMaxX - vgMaxX,
        length: gridLength,
        x: vgMaxX + (wpMaxX - vgMaxX) / 2,
        y: gridOrigin.y,
        z: -thickness / 2
      });
    }

    // FRONT BOX: full workpiece width
    if (vgMinY > wpMinY) {
      fillerBoxes.push({
        width: width,
        length: vgMinY - wpMinY,
        x: 0,
        y: wpMinY + (vgMinY - wpMinY) / 2,
        z: -thickness / 2
      });
    }

    // BACK BOX: full workpiece width
    if (vgMaxY < wpMaxY) {
      fillerBoxes.push({
        width: width,
        length: wpMaxY - vgMaxY,
        x: 0,
        y: vgMaxY + (wpMaxY - vgMaxY) / 2,
        z: -thickness / 2
      });
    }

    // Only create InstancedMesh if there are filler boxes
    if (fillerBoxes.length === 0) {
      this.workpieceOutlineBox = new THREE.Group();
      this.scene.add(this.workpieceOutlineBox);
      return;
    }

    // Create geometry for large filler voxels (same structure as main voxel grid)
    const geometry = new THREE.BoxGeometry(1, 1, thickness);
    geometry.computeVertexNormals();

    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    const materialColor = new THREE.Color(woodColor);

    const colors = [];
    for (let i = 0; i < positions.length; i += 3) {
      const normalZ = normals[i + 2];
      const absNormalZ = Math.abs(normalZ);

      // Top/bottom faces get wood color, sides get wood color for consistent appearance
      colors.push(materialColor.r, materialColor.g, materialColor.b);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

    // Create material (same as voxel grid)
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 30,
      transparent: false,
      opacity: 1.0,
      wireframe: false
    });

    // Create InstancedMesh for filler voxels
    this.workpieceOutlineBox = new THREE.InstancedMesh(geometry, material, fillerBoxes.length);
    this.workpieceOutlineBox.castShadow = true;
    this.workpieceOutlineBox.receiveShadow = true;

    // Create dummy object for transforms
    const dummy = new THREE.Object3D();

    // Position each filler voxel
    for (let i = 0; i < fillerBoxes.length; i++) {
      const box = fillerBoxes[i];

      dummy.position.set(box.x, box.y, box.z);
      dummy.scale.set(box.width, box.length, 1);  // Scale to box dimensions
      dummy.updateMatrix();

      this.workpieceOutlineBox.setMatrixAt(i, dummy.matrix);
      this.workpieceOutlineBox.setColorAt(i, materialColor);
    }

    this.workpieceOutlineBox.instanceMatrix.needsUpdate = true;

    this.scene.add(this.workpieceOutlineBox);
  }

  createToolVisual(radius) {
    // Remove old tool visual if it exists
    if (this.toolVisual) {
      this.scene.remove(this.toolVisual);
    }

    // Create a group to hold the tool components
    this.toolVisual = new THREE.Group();

    // Add a sphere at the tool tip (cutting point)
    const sphereGeometry = new THREE.SphereGeometry(radius * 1.5, 12, 12);
    const toolMaterial = new THREE.MeshPhongMaterial({
      color: 0xff0000,  // Red for the tool
      emissive: 0xff0000,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.8,
      depthTest: false,  // Always render on top
      depthWrite: false
    });
    const sphere = new THREE.Mesh(sphereGeometry, toolMaterial);
    // Sphere at the tip (Z = 0 in the group coordinate system)
    sphere.position.z = 0;
    this.toolVisual.add(sphere);

    // Add a small white cube marker at the exact tip position for debugging
    const debugCubeGeometry = new THREE.BoxGeometry(2, 2, 2);
    const debugMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,  // White for visibility
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
      depthTest: false,  // Always render on top
      depthWrite: false
    });
    const debugCube = new THREE.Mesh(debugCubeGeometry, debugMaterial);
    debugCube.position.z = 0;  // Same position as sphere tip
    this.toolVisual.add(debugCube);

    // Create a cylinder to represent the tool shaft (extending upward along Z axis from the sphere)
    const toolHeight = 80;  // Extended height for visibility (should exceed max cut depth)
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, toolHeight, 16);
    const cylinder = new THREE.Mesh(cylinderGeometry, toolMaterial);
    // Rotate cylinder 90 degrees to align with Z axis (default is Y axis)
    cylinder.rotation.x = Math.PI / 2;
    // Position cylinder so it extends upward from the sphere tip
    cylinder.position.z = toolHeight / 2;  // Extend upward from the sphere
    this.toolVisual.add(cylinder);

    // Add to scene
    this.toolVisual.renderOrder = 1000;  // Render on top of everything
    this.scene.add(this.toolVisual);
  }

  updateToolPosition(x, y, z) {
    if (this.toolVisual) {
      this.toolVisual.position.set(x, y, z);
    }
  }

  loadFromGcode(gcode) {
    // Performance profiling
    const perfStart = performance.now();
    const timers = {};

    // Parse G-code and extract all movements (G0 and G1) with feed rates
    this.flattenedPath = [];
    const movements = [];  // Track all movements with G0/G1 type and feed rate

    // Store toolpaths for tool info access
    this.toolpaths = window.toolpaths || [];

    // Parse tool information from G-code comments
    timers.toolInfoStart = performance.now();
    this.extractToolInfoFromGcode(gcode);
    timers.toolInfoTime = performance.now() - timers.toolInfoStart;

    // Query the currently selected post-processor profile
    const profile = window.currentGcodeProfile || null;
    if (!profile) {
      console.warn('No post-processor profile found, using defaults (G0/G1 with X Y Z)');
    }

    // Create parse configuration from the post-processor profile
    const parseConfig = createGcodeParseConfig(profile);

    // Split G-code into lines for line-driven animation and processing
    const lines = gcode.split('\n');
    this.gcodeLines = lines;  // Store for line-by-line animation

    // Count total G-code lines (including all lines: empty, comments, commands, etc.)
    this.totalGcodeLines = lines.length;

    // Use shared G-code parser to parse movements
    timers.parseStart = performance.now();
    const parsedMovements = parseGcodeFile(gcode, parseConfig);
    timers.parseGcodeTime = performance.now() - timers.parseStart;

    // Add starting movement from safe position (0, 0, 5) to first actual position
    let firstPosition = null;
    if (parsedMovements.length > 0) {
      firstPosition = {
        x: parsedMovements[0].x,
        y: parsedMovements[0].y,
        z: parsedMovements[0].z
      };
    }

    // Build movements array with safe position at start
    if (firstPosition) {
      movements.push({
        x: firstPosition.x,
        y: firstPosition.y,
        z: 5,  // Start at safe height
        isG1: false,  // Rapid move
        feedRate: 6000  // Fast rapid rate
      });
    }

    // Add all parsed movements
    movements.push(...parsedMovements);

    // Build flattened path for cutting movements only
    for (const movement of parsedMovements) {
      if (movement.isCutting) {
        this.flattenedPath.push({
          x: movement.x,
          y: movement.y,
          z: movement.z,
          isCutting: true
        });
      }
    }

    // G-code parsing complete
    timers.parseGcodeTime = performance.now() - perfStart;

    // Calculate cumulative times for animation based on feed rates
    timers.animationStart = performance.now();
    this.calculateAnimationTiming(movements);
    timers.animationTime = performance.now() - timers.animationStart;

    // Build line-to-time map for direct line-based seeking and time display
    this.buildLineNumberToTimeMap();

    // Build lookup table for which tool is active at each line number
    this.buildToolLineRangeLookup();

    // Visualize the complete toolpath with G0/G1 distinction
    timers.visualizeStart = performance.now();
    this.visualizeToolpathWithGCode(movements);
    timers.visualizeTime = performance.now() - timers.visualizeStart;

    // Create tool visual representation
    let toolRadius = 1;
    if (this.toolpaths && this.toolpaths.length > 0) {
      const activeTool = this.toolpaths[0]?.tool;
      if (activeTool && activeTool.diameter) {
        toolRadius = activeTool.diameter / 2;
      }
    }
    this.toolRadius = toolRadius;

    // Initialize voxel grid for material removal simulation
    if (this.enableVoxelRemoval && this.workpieceManager) {
      timers.voxelGridStart = performance.now();
      this.initializeVoxelGrid();
      timers.voxelGridTime = performance.now() - timers.voxelGridStart;
    }

    // Report performance metrics
    const totalTime = performance.now() - perfStart;
    console.log(`=== G-CODE LOADING PROFILE ===`);
    console.log(`Tool Info Parsing:      ${timers.toolInfoTime.toFixed(2)}ms`);
    console.log(`G-code Parsing:         ${timers.parseGcodeTime.toFixed(2)}ms`);
    console.log(`Animation Timing:       ${timers.animationTime.toFixed(2)}ms`);
    console.log(`Path Visualization:     ${timers.visualizeTime.toFixed(2)}ms`);
    if (timers.voxelGridTime) console.log(`Voxel Grid Init:        ${timers.voxelGridTime.toFixed(2)}ms`);
    console.log(`TOTAL:                  ${totalTime.toFixed(2)}ms`);
    console.log(`Movements parsed: ${movements.length}`);

    // Update progress slider range for line-based animation
    const progressSlider = document.getElementById('3d-simulation-progress');
    if (progressSlider) {
      progressSlider.min = 1;
      progressSlider.max = this.totalGcodeLines;
      progressSlider.step = 1;
      progressSlider.value = 1;  // Start at line 1
    }

    // Update status
    this.updateStatus();
  }

  extractToolInfoFromGcode(gcode) {
    // Parse tool information comments from G-code
    // Format: (Tool: ID=X Type=Y Diameter=Z Angle=A [StepDown=S])
    this.toolInfo = {};
    this.toolCommentsByLineIndex = {};  // Map of line index to tool info for tool switching during animation
    this.toolCommentsInOrder = [];  // Array of unique tool comments in order they appear
    const lines = gcode.split('\n');
    const seenToolIds = new Set();  // Track which tool IDs we've already added to avoid duplicates

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const trimmed = line.trim();
      if (trimmed.includes('Tool:')) {
        // Extract tool information from comment (StepDown is optional)
        // Note: Type can have spaces (e.g., "End Mill"), so we match [A-Za-z ]+ instead of \w+
        const toolMatch = trimmed.match(/Tool:\s*ID=(\d+)\s+Type=([A-Za-z ]+)\s+Diameter=([\d.]+)\s+Angle=([\d.]+)(?:\s+StepDown=([\d.]+))?/);
        if (toolMatch) {
          const toolId = toolMatch[1];
          const toolType = toolMatch[2].trim();  // Trim whitespace from type (keep original: End Mill, Ball Nose, VBit, Drill)

          const toolData = {
            id: toolId,
            type: toolType,  // Store original type name (End Mill, Ball Nose, VBit, Drill)
            diameter: parseFloat(toolMatch[3]),
            angle: parseFloat(toolMatch[4]),
            vbitAngle: parseFloat(toolMatch[4]),  // Also store as vbitAngle for VoxelMaterialRemover
            stepDown: toolMatch[5] ? parseFloat(toolMatch[5]) : null
          };

          // Store all tool comments for tool switching during animation
          this.toolCommentsByLineIndex[lineIndex] = toolData;

          // Track tool comment appearances in chronological order (avoid consecutive duplicates)
          if (!seenToolIds.has(toolId) || this.toolCommentsInOrder.length === 0 ||
              this.toolCommentsInOrder[this.toolCommentsInOrder.length - 1].id !== toolId) {
            this.toolCommentsInOrder.push(toolData);
            seenToolIds.add(toolId);
          }

          // Use FIRST tool comment for initialization
          if (Object.keys(this.toolInfo).length === 0) {
            this.toolInfo = toolData;
          }
        }
      }
    }
  }

  calculateAnimationTiming(movements) {
    // Calculate cumulative times for each movement based on distance and feed rate
    // This allows animation speed to be proportional to actual feed rates

    this.movementTiming = [];  // Array of {x, y, z, cumulativeTime, feedRate, isG1}
    let cumulativeTime = 0;  // In seconds
    let prevX = 0, prevY = 0, prevZ = 5;  // Start at safe position

    for (const move of movements) {
      const dx = move.x - prevX;
      const dy = move.y - prevY;
      const dz = move.z - prevZ;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Calculate time for this segment: distance (mm) / feedRate (mm/min) = time (min)
      // Convert to seconds
      const feedRateMMPerSec = move.feedRate / 60;
      const segmentTime = distance > 0 ? distance / feedRateMMPerSec : 0;
      cumulativeTime += segmentTime;

      this.movementTiming.push({
        x: move.x,
        y: move.y,
        z: move.z,
        cumulativeTime: cumulativeTime,
        feedRate: move.feedRate,
        isG1: move.isG1,
        distance: distance,
        gcodeLineNumber: move.gcodeLineNumber  // Track the original G-code line number
      });

      prevX = move.x;
      prevY = move.y;
      prevZ = move.z;
    }

    this.totalAnimationTime = cumulativeTime;
  }

  /**
   * Build line number to cumulative time map for direct seeking by line number
   * Allows O(1) lookup: given a line number, get its cumulative time
   */
  buildLineNumberToTimeMap() {
    this.lineNumberToTimeMap = new Map();
    this.totalJobTime = 0;

    for (const movement of this.movementTiming) {
      if (movement.gcodeLineNumber !== undefined) {
        this.lineNumberToTimeMap.set(movement.gcodeLineNumber, movement.cumulativeTime);
        this.totalJobTime = Math.max(this.totalJobTime, movement.cumulativeTime);
      }
    }
  }

  /**
   * Build lookup table: create a sparse array of only tool change points
   * Instead of storing tool info for every line, only store where tools actually change
   * This is much more memory efficient (1-2 entries vs hundreds of duplicates)
   *
   * Example output:
   * toolChangePoints[0] = {lineNumber: 5, toolInfo: ballNoseTool}    (lines 5-19 use ball nose)
   * toolChangePoints[1] = {lineNumber: 20, toolInfo: vbitTool}       (lines 20+ use vbit)
   */
  buildToolLineRangeLookup() {
    this.toolChangePoints = [];

    if (!this.toolCommentsByLineIndex) {
      return;
    }

    // Build sorted list of tool changes from comments
    let toolChanges = [];
    for (const lineIndexStr in this.toolCommentsByLineIndex) {
      const lineNum = parseInt(lineIndexStr);
      toolChanges.push({
        lineNumber: lineNum,
        toolInfo: this.toolCommentsByLineIndex[lineIndexStr]
      });
    }
    toolChanges.sort((a, b) => a.lineNumber - b.lineNumber);

    // Store only the actual tool change points (sparse array)
    // This is much more memory efficient than storing for every line
    this.toolChangePoints = toolChanges;
  }

  /**
   * Get the active tool for a specific G-code line number
   * Linear search through sparse tool change points (typically 1-2 entries)
   * @param {number} lineNumber - G-code line number
   * @returns {object} Tool info object (or null if not found)
   */
  getToolForLine(lineNumber) {
    // Find the most recent tool that was active at or before this line
    // With typical 1-2 tool changes, linear search is fast and simple
    let activeToolInfo = null;

    for (const changePoint of this.toolChangePoints) {
      if (changePoint.lineNumber <= lineNumber) {
        activeToolInfo = changePoint.toolInfo;
      } else {
        // Since array is sorted, we can stop when we exceed the line number
        break;
      }
    }

    return activeToolInfo;
  }

  /**
   * Get movement for a specific G-code line number
   * Returns the movement object if this line has a G0/G1 command, null otherwise
   * Uses the parser's results which handle custom post-processor profiles
   */
  getMovementForLine(lineNumber) {
    for (const movement of this.movementTiming) {
      if (movement.gcodeLineNumber === lineNumber) {
        return movement;
      }
    }
    return null;
  }

  visualizeToolpathWithGCode(movements) {
    // Draw toolpath in chronological order, coloring by G0/G1 type
    if (!movements || movements.length === 0) return;

    // Build line segments in order, grouping consecutive segments of same type
    let currentSegmentPoints = [];
    let currentIsG1 = null;
    let totalSegments = 0;

    for (let i = 0; i < movements.length; i++) {
      const move = movements[i];
      const point = new THREE.Vector3(move.x, move.y, move.z);

      // Check if we need to start a new segment (type changed)
      if (currentIsG1 !== null && move.isG1 !== currentIsG1) {
        // Draw the current segment and start a new one
        if (currentSegmentPoints.length > 1) {
          this.drawToolpathSegment(currentSegmentPoints, currentIsG1);
          totalSegments++;
        }
        // Start new segment with the last point of previous segment AND current point
        // This ensures continuity between G0 and G1 segments
        const lastPoint = currentSegmentPoints[currentSegmentPoints.length - 1];
        currentSegmentPoints = [lastPoint, point];
        currentIsG1 = move.isG1;
      } else {
        // Continue current segment
        if (currentIsG1 === null) {
          currentIsG1 = move.isG1;
        }
        currentSegmentPoints.push(point);
      }
    }

    // Draw the final segment
    if (currentSegmentPoints.length > 1) {
      this.drawToolpathSegment(currentSegmentPoints, currentIsG1);
      totalSegments++;
    }
  }

  drawToolpathSegment(points, isG1) {
    // Draw a single toolpath segment with appropriate color
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const color = isG1 ? 0x00ffff : 0xff0000;  // Cyan for G1, Red for G0
    const linewidth = isG1 ? 2 : 1;

    const material = new THREE.LineBasicMaterial({
      color: color,
      linewidth: linewidth,
      fog: false,
      depthTest: true
    });

    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.toolpathLines.push(line);  // Store for cleanup
  }

  play() {
    // Reset voxels and line number if coming from a stop or if animation naturally finished
    if (this.wasStopped || this.currentGcodeLineNumber > this.totalGcodeLines) {
      if (this.voxelGrid) {
        this.voxelGrid.reset();
        this.voxelMaterialRemover.reset();
        this.voxelGrid.updateVoxelColors();
        this.voxelGrid.updateInstanceMatrices();
      }
      this.currentGcodeLineNumber = 1;
      this.elapsedTime = 0;
      this.wasStopped = false;  // Clear the stop flag
    }
    this.isPlaying = true;
    this.updateStatus();
  }

  pause() {
    this.isPlaying = false;
    this.wasStopped = false;  // Pause keeps current position (not a stop)
    this.updateStatus();
  }

  setSpeed(speed) {
    this.speed = Math.max(1, Math.min(10, speed));
  }

  /**
   * Convert G-code line number to elapsed time
   * @param {number} lineNumber - Target G-code line number
   * @returns {number} - Elapsed time in seconds for that line (finds closest movement at or before line)
   */
  getTimeFromLineNumber(lineNumber) {
    // Find the movement with the closest line number at or before the target
    let bestTime = 0;
    for (const move of this.movementTiming) {
      const moveLineNum = move.gcodeLineNumber || 0;
      if (moveLineNum <= lineNumber) {
        bestTime = move.cumulativeTime;
      } else {
        break;
      }
    }
    return bestTime;
  }

  /**
   * Convert elapsed time to G-code line number
   * @param {number} elapsedTime - Time in seconds
   * @returns {number} - G-code line number at that time
   */
  getLineNumberFromTime(elapsedTime) {
    let lineNumber = 0;
    for (const move of this.movementTiming) {
      if (move.cumulativeTime <= elapsedTime) {
        lineNumber = move.gcodeLineNumber || 0;
      } else {
        break;
      }
    }
    return lineNumber;
  }

  /**
   * Seek animation to a specific G-code line number
   * Handles backward seeking (reset voxels, replay from start) and forward seeking (incremental replay)
   * Called by viewer clicks, slider changes, or programmatically
   * Does NOT update viewer - caller is responsible for that to avoid feedback loops
   */
  seekToLineNumber(targetLineNumber) {
    // Clamp to valid range
    if (targetLineNumber < 1) targetLineNumber = 1;
    if (targetLineNumber > this.totalGcodeLines) targetLineNumber = this.totalGcodeLines;

    const oldLineNumber = this.currentGcodeLineNumber;
    const isBackwardSeek = targetLineNumber < oldLineNumber;

    // Reset voxels if seeking backward
    if (isBackwardSeek) {
      if (this.voxelGrid) {
        this.voxelGrid.reset();
        this.voxelMaterialRemover.reset();
      }
      this.currentToolInfo = null;
    }

    // Replay material removal from old to new line
    if (isBackwardSeek && targetLineNumber > 1) {
      // Backward seek: replay from line 1 to target
      this._replayFromLineToLine(1, targetLineNumber);
    } else if (!isBackwardSeek && targetLineNumber > oldLineNumber) {
      // Forward seek: replay from current to target
      this._replayFromLineToLine(oldLineNumber, targetLineNumber);
    }

    // Set state to target line
    this.currentGcodeLineNumber = targetLineNumber;
    this.elapsedTime = 0;  // Reset time at start of target line
    this.justSeeked = true;  // Prevent advancing on next update call

    // Update tool and voxel grid
    const targetMovement = this.getMovementForLine(targetLineNumber);
    if (targetMovement) {
      this.currentFeedRate = targetMovement.feedRate || 0;
      // Update tool position to target line
      this.updateToolPositionAtCoordinates(targetMovement.x, targetMovement.y, targetMovement.z, targetMovement.isG1, targetLineNumber);
    } else {
      // No movement at this line, find last movement position
      let lastMovement = null;
      for (let i = targetLineNumber - 1; i >= 1; i--) {
        lastMovement = this.getMovementForLine(i);
        if (lastMovement) break;
      }
      if (lastMovement) {
        this.updateToolPositionAtCoordinates(lastMovement.x, lastMovement.y, lastMovement.z, false, targetLineNumber);
      }
    }

    // Batch update GPU
    if (this.voxelGrid) {
      this.voxelGrid.updateVoxelColors();
      this.voxelGrid.updateInstanceMatrices();
    }

    this.updateWorkpiece();
  }

  setProgress(lineNumber, skipViewerUpdate) {
    // Seek to a specific G-code line number
    // Find the movement with this exact line number

    let targetMovementIndex = -1;
    for (let i = 0; i < this.movementTiming.length; i++) {
      if (this.movementTiming[i].gcodeLineNumber === lineNumber) {
        targetMovementIndex = i;
        break;
      }
    }

    if (targetMovementIndex === -1) return; // Line not found

    const oldMovementIndex = this.currentMovementIndex;
    const oldElapsedTime = this.elapsedTime;

    // Determine if this is backward seeking
    const isBackwardSeek = targetMovementIndex < oldMovementIndex;

    // Reset voxels if seeking backward or making a large jump
    if (isBackwardSeek || (targetMovementIndex - oldMovementIndex) > 10) {
      if (this.voxelGrid) {
        this.voxelGrid.reset();
        this.voxelMaterialRemover.reset();
      }
      this.currentToolInfo = null;

      // Replay from start to target
      if (targetMovementIndex > 0) {
        this._replayFromMovementIndexToIndex(0, targetMovementIndex);
      }
    } else {
      // Small forward step: incremental replay
      this._replayFromMovementIndexToIndex(oldMovementIndex, targetMovementIndex);
    }

    // Set state directly from the target movement
    this.currentMovementIndex = targetMovementIndex;
    const targetMovement = this.movementTiming[targetMovementIndex];
    this.currentGcodeLineNumber = targetMovement.gcodeLineNumber;
    this.elapsedTime = targetMovement.cumulativeTime;
    this.previousElapsedTime = this.elapsedTime;
    this.currentFeedRate = targetMovement.feedRate || 0;

    // Update G-code viewer highlight when progress slider moves
    if (!skipViewerUpdate && typeof gcodeView !== 'undefined' && gcodeView) {
      gcodeView.setCurrentLine(this.currentGcodeLineNumber);
    }

    // Batch update GPU: commit all material removal calculations in one render batch
    if (this.voxelGrid) {
      this.voxelGrid.updateVoxelColors();
      this.voxelGrid.updateInstanceMatrices();
    }

    this.updateWorkpiece();
  }

  /**
   * Replay material removal from one G-code line to another
   * Processes all lines between start and end, executing movements and material removal
   * Used for both forward and backward seeking
   */
  _replayFromLineToLine(startLine, endLine) {
    const stepsPerSegment = 10;  // Number of interpolation steps per cutting move

    for (let lineNum = startLine; lineNum <= endLine && lineNum <= this.totalGcodeLines; lineNum++) {
      const movement = this.getMovementForLine(lineNum);

      if (!movement) continue;  // Line has no movement, skip

      if (movement.isG1 && this.voxelGrid && this.voxelMaterialRemover) {
        // Find previous movement position for interpolation
        let prevPos = { x: 0, y: 0, z: 5 };
        for (let searchLine = lineNum - 1; searchLine >= 1; searchLine--) {
          const prevMove = this.getMovementForLine(searchLine);
          if (prevMove) {
            prevPos = { x: prevMove.x, y: prevMove.y, z: prevMove.z };
            break;
          }
        }

        // Interpolate along the movement path
        for (let step = 1; step <= stepsPerSegment; step++) {
          const t = step / stepsPerSegment;  // 0 to 1 along this segment

          const toolX = prevPos.x + (movement.x - prevPos.x) * t;
          const toolY = prevPos.y + (movement.y - prevPos.y) * t;
          const toolZ = prevPos.z + (movement.z - prevPos.z) * t;

          try {
            const toolData = this.getToolForLine(lineNum) || this.toolInfo;
            this.voxelMaterialRemover.removeAtToolPosition(
              this.voxelGrid,
              toolX, toolY, toolZ,
              toolData || { diameter: this.toolRadius * 2, type: 'End Mill', angle: 0 }
            );
          } catch (e) {
            console.error('Voxel replay error at line ' + lineNum + ':', e);
          }
        }
      }
    }
  }

  _replayFromMovementIndexToIndex(startIndex, endIndex) {
    // Replay material removal from one movement index to another
    // Interpolates along each movement segment for smooth material removal

    const stepsPerSegment = 10;  // Number of interpolation steps per movement segment

    for (let i = startIndex; i <= endIndex && i < this.movementTiming.length; i++) {
      const move = this.movementTiming[i];

      if (move.isG1 && this.voxelGrid && this.voxelMaterialRemover) {
        // Only remove material on cutting moves
        const prevMove = i > 0
          ? this.movementTiming[i - 1]
          : { x: 0, y: 0, z: 5, isG1: false };

        // Interpolate along the movement path
        for (let step = 1; step <= stepsPerSegment; step++) {
          const t = step / stepsPerSegment;  // 0 to 1 along this segment

          const toolX = prevMove.x + (move.x - prevMove.x) * t;
          const toolY = prevMove.y + (move.y - prevMove.y) * t;
          const toolZ = prevMove.z + (move.z - prevMove.z) * t;

          try {
            const toolData = this.getToolForLine(move.gcodeLineNumber) || this.toolInfo;
            this.voxelMaterialRemover.removeAtToolPosition(
              this.voxelGrid,
              toolX, toolY, toolZ,
              toolData || { diameter: this.toolRadius * 2, type: 'End Mill', angle: 0 }
            );
          } catch (e) {
            console.error('Voxel replay error:', e);
          }
        }
      }
    }
  }

  _replayFromCurrentToNew(oldElapsedTime, newElapsedTime) {
    // Legacy method - kept for backwards compatibility
    // Simple approach: for each movement in the time range, look up which tool
    // should be used based on the G-code line number using our lookup table
    let movementsProcessed = 0;

    for (let i = 0; i < this.movementTiming.length; i++) {
      const move = this.movementTiming[i];
      const moveStartTime = i > 0 ? this.movementTiming[i - 1].cumulativeTime : 0;
      const moveEndTime = move.cumulativeTime;
      const moveLineNum = move.gcodeLineNumber || 0;

      // Skip moves that end before our replay range
      if (moveEndTime < oldElapsedTime) {
        continue;
      }

      // Stop if move starts at or after our replay range
      if (moveStartTime >= newElapsedTime) {
        this.currentProgressIndex = i;
        // Look up the tool for this line number
        this.currentToolInfo = this.getToolForLine(moveLineNum) || this.currentToolInfo;
        break;
      }

      // Look up which tool should be used for this line number
      const toolForThisLine = this.getToolForLine(moveLineNum);

      if (!toolForThisLine) {
        continue;  // Skip if no tool is assigned for this line
      }

      // This move is (at least partially) in our replay range [oldElapsedTime, newElapsedTime]
      const prevMove = i > 0 ? this.movementTiming[i - 1] : null;

      if (move.isG1 && prevMove) {  // Only process cutting moves
        movementsProcessed++;

        // Convert tool type name to lowercase format for voxel removal
        // Create tool info from G-code (source of truth)
        // VoxelMaterialRemover will normalize the type name automatically
        const toolInfoForRemoval = {
          diameter: toolForThisLine.diameter,
          type: toolForThisLine.type || 'End Mill',  // Use G-code tool type directly
          angle: toolForThisLine.angle || 90
        };

        // Determine the actual start and end points for this move segment
        let segmentStartTime = Math.max(moveStartTime, oldElapsedTime);
        let segmentEndTime = Math.min(moveEndTime, newElapsedTime);

        // Calculate interpolation factors for partial moves
        let startInterp = (segmentStartTime - moveStartTime) / (moveEndTime - moveStartTime);
        let endInterp = (segmentEndTime - moveStartTime) / (moveEndTime - moveStartTime);

        // Clamp to [0, 1]
        startInterp = Math.max(0, Math.min(1, startInterp));
        endInterp = Math.max(0, Math.min(1, endInterp));

        if (startInterp === 0 && endInterp === 1) {
          // Full move - remove material using the tool assigned to this line number
          try {
            this.voxelMaterialRemover.removeAlongPath(
              this.voxelGrid,
              { x: prevMove.x, y: prevMove.y, z: prevMove.z },
              { x: move.x, y: move.y, z: move.z },
              toolInfoForRemoval
            );
          } catch (error) {
            console.error('Error removing voxel along path:', error);
          }
        } else {
          // Partial move - interpolate and remove using the tool assigned to this line
          const startPos = this._interpolatePosition(move, startInterp);
          const endPos = this._interpolatePosition(move, endInterp);

          try {
            this.voxelMaterialRemover.removeAlongPath(
              this.voxelGrid,
              startPos,
              endPos,
              toolInfoForRemoval
            );
          } catch (error) {
            console.error('Error removing voxel along partial path:', error);
          }
        }
      }

      this.currentProgressIndex = i;
      this.currentToolInfo = toolForThisLine;
    }
  }

  _interpolatePosition(move, t) {
    t = Math.max(0, Math.min(1, t));
    const prevMove = this.movementTiming[this.currentProgressIndex - 1];

    if (prevMove) {
      return {
        x: prevMove.x + (move.x - prevMove.x) * t,
        y: prevMove.y + (move.y - prevMove.y) * t,
        z: prevMove.z + (move.z - prevMove.z) * t
      };
    } else {
      return { x: move.x, y: move.y, z: move.z };
    }
  }



  getProgress() {
    // Return normalized progress (0-1) for UI display
    if (this.totalAnimationTime > 0) {
      return this.elapsedTime / this.totalAnimationTime;
    }
    return 0;
  }

  /**
   * Analyze removed voxel positions - call this from browser console after animation completes
   * Usage: toolpathAnimation.analyzeRemovalPattern()
   */
  analyzeRemovalPattern() {
    if (this.voxelGrid) {
      this.voxelGrid.analyzeRemovedPositions();
    } else {
      console.log('Voxel grid not initialized');
    }
  }

  /**
   * Diagnostic function: Show all voxel grid positions and their world coordinates
   * Usage from browser console: toolpathAnimation.logAllVoxelMappings()
   */
  logAllVoxelMappings() {
    if (!this.voxelGrid) {
      console.log('Voxel grid not initialized');
      return;
    }

    const vg = this.voxelGrid;
    console.log('\n=== COMPLETE VOXEL MAPPING ===');
    console.log('Workpiece: width=' + vg.workpieceWidth + ', length=' + vg.workpieceLength + ', thickness=' + vg.workpieceThickness);
    console.log('Voxel size: ' + vg.voxelSize);
    console.log('Grid dimensions: ' + vg.gridWidth + ' × ' + vg.gridLength + ' × ' + vg.gridHeight + ' = ' + vg.maxVoxels + ' voxels\n');

    console.log('Grid Coordinates → World Coordinates (voxel center):');
    for (let index = 0; index < vg.maxVoxels; index++) {
      const coords = vg.indexToCoords(index);
      const worldPos = vg.getVoxelWorldPosition(index);
      console.log(`Voxel ${index.toString().padStart(2)}: grid(${coords.x},${coords.y},${coords.z}) → world(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)})`);
    }
  }

  /**
   * Test function: Remove voxels at a specific world position
   * Usage from browser console: toolpathAnimation.testRemoveVoxelsAt(0, 0, 0, 2)
   * @param {number} worldX - World X coordinate in mm
   * @param {number} worldY - World Y coordinate in mm
   * @param {number} worldZ - World Z coordinate in mm
   * @param {number} toolDiameter - Tool diameter in mm (default 2)
   */
  testRemoveVoxelsAt(worldX, worldY, worldZ, toolDiameter = 2) {
    if (!this.voxelGrid) {
      console.log('Voxel grid not initialized');
      return;
    }

    console.log('\n=== VOXEL REMOVAL TEST ===');
    console.log('Input world position:', { worldX, worldY, worldZ });
    console.log('Tool diameter:', toolDiameter);

    const toolInfo = {
      diameter: toolDiameter,
      type: 'flat',
      vbitAngle: 90
    };

    // Call the remover
    const removedCount = this.voxelMaterialRemover.removeAtToolPosition(
      this.voxelGrid,
      worldX,
      worldY,
      worldZ,
      toolInfo
    );

    console.log('Voxels removed:', removedCount.length, 'voxels');
    console.log('Removed voxel indices:', removedCount);

    // Show detailed grid coordinate info for the removed voxels
    if (removedCount && removedCount.length > 0) {
      console.log('\nDetailed removed voxel info:');
      for (const index of removedCount.slice(0, 10)) {  // Show first 10
        const coords = this.voxelGrid.indexToCoords(index);
        const worldPos = this.voxelGrid.getVoxelWorldPosition(index);
        console.log(`  Voxel ${index}: grid(${coords.x},${coords.y},${coords.z}) → world(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)})`);
      }
      // Manually calculate grid coords to show user where voxels actually are
      // Using proper mathematical inverse of positioning formula
      let gridX = Math.floor((worldX - this.voxelGrid.originOffset.x + this.voxelGrid.workpieceWidth / 2 - this.voxelGrid.voxelSize / 2) / this.voxelGrid.voxelSize);
      let gridY = Math.floor((worldY - this.voxelGrid.originOffset.y + this.voxelGrid.workpieceLength / 2 - this.voxelGrid.voxelSize / 2) / this.voxelGrid.voxelSize);
      let gridZ = Math.floor((this.voxelGrid.originOffset.z - worldZ + this.voxelGrid.voxelSize / 2) / this.voxelGrid.voxelSize);

      // Clamp to valid grid bounds
      gridX = Math.max(0, Math.min(this.voxelGrid.gridWidth - 1, gridX));
      gridY = Math.max(0, Math.min(this.voxelGrid.gridLength - 1, gridY));
      gridZ = Math.max(0, Math.min(this.voxelGrid.gridHeight - 1, gridZ));

      console.log('Grid coordinates where voxels were removed:', { gridX, gridY, gridZ });

      console.log('✓ Grid coordinates clamped to valid bounds');
    }

    console.log('Check the 3D view - dark voxels should appear at the position you specified!');
    console.log('Expected location: worldX=' + worldX + ', worldY=' + worldY + ', worldZ=' + worldZ);
  }

  /**
   * Test function: Remove a single voxel by index
   * Usage from browser console: toolpathAnimation.testRemoveVoxelByIndex(0)
   * This helps verify which voxel visually corresponds to which index
   * @param {number} index - Voxel index to remove (0-9 for 10-voxel grid)
   */
  testRemoveVoxelByIndex(index) {
    if (!this.voxelGrid) {
      console.log('Voxel grid not initialized');
      return;
    }

    if (index < 0 || index >= this.voxelGrid.maxVoxels) {
      console.log('Invalid voxel index. Valid range: 0-' + (this.voxelGrid.maxVoxels - 1));
      return;
    }

    console.log('\n=== REMOVE VOXEL BY INDEX ===');
    console.log('Removing voxel index:', index);

    const coords = this.voxelGrid.indexToCoords(index);
    const worldPos = this.voxelGrid.getVoxelWorldPosition(index);

    console.log('Grid coordinates:', coords);
    console.log('World position:', {
      x: worldPos.x.toFixed(1),
      y: worldPos.y.toFixed(1),
      z: worldPos.z.toFixed(1)
    });

    // Remove the voxel
    this.voxelGrid.removeVoxel(index);

    console.log('✓ Voxel removed! Check the 3D view to see which voxel disappeared.');
  }

  update() {
    if (this.movementTiming.length === 0 || this.currentGcodeLineNumber > this.totalGcodeLines) return;

    // Skip all simulation work if not playing
    if (!this.isPlaying) {
      return;
    }

    // If playing, increment elapsed time within the current movement
    const deltaTime = (1 / 60) * this.speed;  // Assume 60fps, multiply by speed factor
    this.elapsedTime += deltaTime;

    // Get the movement for the current G-code line (if it exists)
    const currentMovement = this.getMovementForLine(this.currentGcodeLineNumber);

    // Find previous movement to calculate segment start time
    let prevMovement = null;
    for (const move of this.movementTiming) {
      if (move.gcodeLineNumber < this.currentGcodeLineNumber) {
        if (!prevMovement || move.gcodeLineNumber > prevMovement.gcodeLineNumber) {
          prevMovement = move;
        }
      }
    }

    const prevMovementEndTime = prevMovement ? prevMovement.cumulativeTime : 0;
    const currentMovementEndTime = currentMovement ? currentMovement.cumulativeTime : prevMovementEndTime;
    const movementDuration = currentMovementEndTime - prevMovementEndTime;

    // Check if current movement is complete and advance to next line if needed
    // (but only if playing, and not on the frame immediately after seeking)
    if (this.isPlaying && !this.justSeeked && currentMovement && this.elapsedTime >= movementDuration) {
      // Movement is complete, advance to next line
      this.currentGcodeLineNumber++;
      this.elapsedTime = 0;  // Reset time for next line
      this.justAdvancedLine = true;  // Skip tool update this frame

      // Skip ahead until we find a line with a movement or reach end
      let maxIterations = this.totalGcodeLines;
      while (this.currentGcodeLineNumber <= this.totalGcodeLines && !this.getMovementForLine(this.currentGcodeLineNumber) && maxIterations-- > 0) {
        this.currentGcodeLineNumber++;
      }

      // If we've reached the end, clamp to total lines, pause, and keep voxels visible
      if (this.currentGcodeLineNumber > this.totalGcodeLines) {
        this.currentGcodeLineNumber = this.totalGcodeLines;  // Clamp to final line

        // Update tool position one final time to show final location
        const finalMovement = this.getMovementForLine(this.currentGcodeLineNumber);
        if (finalMovement) {
          this.updateToolPositionAtCoordinates(finalMovement.x, finalMovement.y, finalMovement.z, finalMovement.isG1, this.currentGcodeLineNumber);
        }

        this.pause();
        this.updateStatus();
        return;
      }

      // Get the new movement (will process it this frame)
      const nextMovement = this.getMovementForLine(this.currentGcodeLineNumber);
      if (!nextMovement) return;  // No more movements
    }

    // Clear the seek flag now that we've processed this frame
    if (this.justSeeked) {
      this.justSeeked = false;
    }

    // Skip tool position update if we just advanced to a new line
    // (let the next frame recalculate with fresh movement data)
    if (this.justAdvancedLine) {
      this.justAdvancedLine = false;
      // Sync viewer to current line and return
      if (typeof gcodeView !== 'undefined' && gcodeView) {
        gcodeView.setCurrentLine(this.currentGcodeLineNumber);
      }
      this.updateWorkpiece();
      return;
    }

    // Calculate tool position - interpolate within current movement if it exists
    let toolX, toolY, toolZ, isG1 = false;

    if (currentMovement) {
      // Interpolate between previous and current movement
      const prevPos = prevMovement
        ? { x: prevMovement.x, y: prevMovement.y, z: prevMovement.z }
        : { x: 0, y: 0, z: 5 };

      let t = 0;
      if (movementDuration > 0) {
        t = this.elapsedTime / movementDuration;
        t = Math.max(0, Math.min(1, t));  // Clamp to [0, 1]
      }

      // Linear interpolation
      toolX = prevPos.x + (currentMovement.x - prevPos.x) * t;
      toolY = prevPos.y + (currentMovement.y - prevPos.y) * t;
      toolZ = prevPos.z + (currentMovement.z - prevPos.z) * t;
      isG1 = currentMovement.isG1 || false;
      this.currentFeedRate = currentMovement.feedRate || 0;
    } else {
      // No movement at this line - stay at previous position (no-op)
      if (prevMovement) {
        toolX = prevMovement.x;
        toolY = prevMovement.y;
        toolZ = prevMovement.z;
        isG1 = false;
      } else {
        toolX = 0;
        toolY = 0;
        toolZ = 5;
        isG1 = false;
      }
    }

    // Update tool position and remove material at interpolated location
    this.updateToolPositionAtCoordinates(toolX, toolY, toolZ, isG1, this.currentGcodeLineNumber);

    // Sync G-code viewer to current line
    if (typeof gcodeView !== 'undefined' && gcodeView) {
      gcodeView.setCurrentLine(this.currentGcodeLineNumber);
    }

    this.updateWorkpiece();
  }

  updateWorkpiece() {
    // Tool position is already updated in update() method
    // This method is for any additional workpiece updates
  }

  updateToolPositionAtCoordinates(toolX, toolY, toolZ, isG1, gcodeLineNumber) {
    // Update tool position at specific interpolated coordinates
    // This is called every frame during animation with interpolated positions

    // Get the tool for this line
    const toolForCurrentSegment = this.getToolForLine(gcodeLineNumber);
    if (toolForCurrentSegment) {
      if (toolForCurrentSegment !== this.toolInfo) {
        this.toolInfo = toolForCurrentSegment;
        this.currentToolInfo = toolForCurrentSegment;

        if (this.toolInfo?.diameter) {
          this.toolRadius = this.toolInfo.diameter / 2;
        }
      }
    }

    // Always update tool mesh position every frame (not just on tool changes)
    const currentTool = this.toolInfo || { diameter: this.toolRadius * 2, type: 'End Mill', angle: 0 };
    updateToolMesh(this.toolRadius * 2, toolX, toolY, toolZ,
      currentTool?.type || 'End Mill', currentTool?.angle || 0);

    // Remove material from voxel grid if enabled (only on cutting moves)
    if (this.enableVoxelRemoval && this.voxelGrid && this.voxelMaterialRemover && isG1 && this.isPlaying) {
      try {
        const currentToolData = this.getToolForLine(gcodeLineNumber) || this.toolInfo;
        this.voxelMaterialRemover.removeAtToolPosition(
          this.voxelGrid,
          toolX, toolY, toolZ,
          currentToolData || { diameter: this.toolRadius * 2, type: 'End Mill', angle: 0 }
        );
      } catch (e) {
        console.error('Voxel removal error:', e);
      }
    }
  }

  updateToolPositionFromMovement(movement) {
    // Update tool position directly from a movement object
    // Used for direct movement seeking (not used in playback, kept for compatibility)

    if (!movement) return;

    const toolX = movement.x;
    const toolY = movement.y;
    const toolZ = movement.z;
    const isG1 = movement.isG1 || false;

    this.updateToolPositionAtCoordinates(toolX, toolY, toolZ, isG1, movement.gcodeLineNumber);
  }

  updateToolPositionByTime() {
    // Legacy method - now kept for backwards compatibility but not used in line-driven mode
    // Find tool position based on elapsed time using movement timing info
    if (this.movementTiming.length === 0) return;

    // Use forced movement index if set (handles no-op moves with same time)
    let segmentIndex = this._forcedMovementIndex !== undefined && this._forcedMovementIndex !== null
      ? this._forcedMovementIndex
      : null;

    // If no forced index, find which movement segment we're in based on elapsed time
    if (segmentIndex === null) {
      segmentIndex = 0;
      for (let i = 0; i < this.movementTiming.length; i++) {
        if (this.elapsedTime <= this.movementTiming[i].cumulativeTime) {
          segmentIndex = i;
          break;
        }
        segmentIndex = i;  // In case we're past the last point
      }
    }

    // Get the current line number directly from the movement (not from imprecise time conversion)
    // This ensures the correct line is always shown
    const currentMovement = this.movementTiming[segmentIndex];
    this.currentGcodeLineNumber = currentMovement ? currentMovement.gcodeLineNumber : 0;

    // Use the tool lookup table to get the correct tool for this line number
    // This ensures consistency between slider replay and normal animation
    const toolForCurrentSegment = this.getToolForLine(this.currentGcodeLineNumber);

    if (toolForCurrentSegment) {
      // Switch tools if different from current
      if (toolForCurrentSegment !== this.toolInfo) {
        this.toolInfo = toolForCurrentSegment;
        this.currentToolInfo = toolForCurrentSegment;  // Track for progress slider

        // Update tool radius for visualization
        if (this.toolInfo?.diameter) {
          this.toolRadius = this.toolInfo.diameter / 2;
        }

        // Get current movement for position info
        const currMove = this.movementTiming[Math.min(segmentIndex, this.movementTiming.length - 1)];
        if (currMove) {
          // Regenerate tool geometry with new tool info
          updateToolMesh(this.toolRadius * 2, currMove.x, currMove.y, currMove.z,
            this.toolInfo?.type || 'End Mill', this.toolInfo?.angle || 0);
        }
      }
    }

    // Update current progress tracking for slider support
    if (segmentIndex !== this.currentProgressIndex) {
      this.currentProgressIndex = segmentIndex;
    }

    let toolX, toolY, toolZ;
    let isG1 = false;  // Track if current move is a cutting move

    if (segmentIndex >= this.movementTiming.length - 1) {
      // At or past the end
      const lastMove = this.movementTiming[this.movementTiming.length - 1];
      toolX = lastMove.x;
      toolY = lastMove.y;
      toolZ = lastMove.z;
      isG1 = lastMove.isG1 || false;
      this.currentFeedRate = lastMove.feedRate || 0;
    } else {
      // Interpolate between current and next movement
      const prevMove = segmentIndex > 0 ? this.movementTiming[segmentIndex - 1] : { cumulativeTime: 0, x: 0, y: 0, z: 5, isG1: false, feedRate: 0 };
      const currMove = this.movementTiming[segmentIndex];

      const timeSinceLastMove = this.elapsedTime - prevMove.cumulativeTime;
      const totalSegmentTime = currMove.cumulativeTime - prevMove.cumulativeTime;

      let t = 0;
      if (totalSegmentTime > 0) {
        t = timeSinceLastMove / totalSegmentTime;
        t = Math.max(0, Math.min(1, t));  // Clamp to [0, 1]
      }

      // Linear interpolation between previous and current position
      toolX = prevMove.x + (currMove.x - prevMove.x) * t;
      toolY = prevMove.y + (currMove.y - prevMove.y) * t;
      toolZ = prevMove.z + (currMove.z - prevMove.z) * t;
      isG1 = currMove.isG1 || false;  // Only remove material on cutting moves

      // Update current feed rate
      this.currentFeedRate = currMove.feedRate || 0;
    }

    // Remove material from voxel grid if enabled
    // ONLY on cutting moves (G1), skip on rapid moves (G0), and only when playing (not paused)
    if (this.enableVoxelRemoval && this.voxelGrid && this.voxelMaterialRemover && isG1 && this.isPlaying) {
      const voxelRemovalStart = performance.now();
      try {
        // Get the correct tool for the current G-code line (not just the first tool)
        const currentToolData = this.getToolForLine(this.currentGcodeLineNumber) || this.toolInfo;

        // Use tool type directly from G-code (source of truth)
        // VoxelMaterialRemover will normalize the type name automatically
        const toolInfo = {
          diameter: this.toolRadius * 2,
          type: currentToolData?.type || 'End Mill',  // Use G-code tool type directly
          angle: currentToolData?.angle || 90
        };

        // Track last tool position for interpolated removal along path
        // Check if previous move was a G0 (rapid) - if so, don't interpolate across the gap
        const prevMove = segmentIndex > 0 ? this.movementTiming[segmentIndex - 1] : null;
        const prevWasRapid = prevMove && !prevMove.isG1;  // Previous move was G0

        if (!this.lastToolPos) {
          this.lastToolPos = { x: toolX, y: toolY, z: toolZ };
        }

        // Calculate distance tool moved since last removal
        const dx = toolX - this.lastToolPos.x;
        const dy = toolY - this.lastToolPos.y;
        const dz = toolZ - this.lastToolPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // If tool moved more than 1mm, interpolate removal along the path
        // But don't interpolate across G0 moves (after rapid travel between holes)
        if (distance > 1 && !prevWasRapid) {
          const steps = Math.ceil(distance);

          for (let i = 0; i <= steps; i++) {
            const t = steps > 0 ? i / steps : 0;
            const interpX = this.lastToolPos.x + dx * t;
            const interpY = this.lastToolPos.y + dy * t;
            const interpZ = this.lastToolPos.z + dz * t;
            this.voxelMaterialRemover.removeAtToolPosition(this.voxelGrid, interpX, interpY, interpZ, toolInfo);
          }
        } else {
          // Small movement - just remove at current position
          this.voxelMaterialRemover.removeAtToolPosition(this.voxelGrid, toolX, toolY, toolZ, toolInfo);
        }

        this.lastToolPos = { x: toolX, y: toolY, z: toolZ };
      } catch (error) {
        console.error('Error removing voxel material:', error);
        this.enableVoxelRemoval = false;  // Disable on error
      }

      // Profile voxel removal time - simple frame counter
      const voxelRemovalTime = performance.now() - voxelRemovalStart;
      voxelRemovalFrameCount++;
      voxelRemovalTotalTime += voxelRemovalTime;

      // Report average every 100 frames
      if (voxelRemovalFrameCount % 100 === 0) {
        const avg = (voxelRemovalTotalTime / voxelRemovalFrameCount).toFixed(2);
       // console.log(`[Voxel Removal Profile] Frames: ${voxelRemovalFrameCount}, Avg: ${avg}ms`);

        // Reset counters for next 100 frames
        voxelRemovalFrameCount = 0;
        voxelRemovalTotalTime = 0;
      }
    }

    // Update the 3D tool mesh to the interpolated position with tool type info
    const toolType = this.toolInfo?.type || 'End Mill';
    const toolAngle = this.toolInfo?.angle || 0;
    updateToolMesh(this.toolRadius * 2, toolX, toolY, toolZ, toolType, toolAngle);  // toolRadius * 2 = diameter
  }

  updateStatus() {
    if (this.onStatusChange) {
      const status = this.isPlaying ? 'Playing...' : (this.elapsedTime >= this.totalAnimationTime ? 'Complete' : 'Paused');
      this.onStatusChange(status);
    }
  }
}

// ============ TOOLPATH VISUALIZER ============
class ToolpathVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.pathLine = null;
    this.cutProfileLine = null;
  }

  visualizeToolpath(path) {
    // Remove old lines
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
    }
    if (this.cutProfileLine) {
      this.scene.remove(this.cutProfileLine);
    }

    if (!path || path.length === 0) return;

    // Draw main toolpath on the top surface (Z = 0.1) so it's visible
    // Use only X, Y from the path, ignore Z depth for visualization
    const points = path.map(p => {
      return new THREE.Vector3(p.x || 0, p.y || 0, 0.2);  // Z = 0.2 puts it slightly above surface
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 3,
      fog: false,
      depthTest: false  // Draw on top regardless of depth
    });
    this.pathLine = new THREE.Line(geometry, material);
    this.pathLine.renderOrder = 100;  // Render on top
    this.scene.add(this.pathLine);

    // Also draw a profile showing the cutting depth
    // Draw vertical lines from surface down to cutting depth
    const profilePoints = [];
    for (let i = 0; i < path.length; i += Math.max(1, Math.floor(path.length / 50))) {
      const p = path[i];
      // Draw line from surface (0) down to cutting depth (negative Z)
      profilePoints.push(new THREE.Vector3(p.x || 0, p.y || 0, 0));
      profilePoints.push(new THREE.Vector3(p.x || 0, p.y || 0, p.z || -5));
    }

    if (profilePoints.length > 0) {
      const profileGeom = new THREE.BufferGeometry().setFromPoints(profilePoints);
      const profileMat = new THREE.LineBasicMaterial({
        color: 0xff8800,  // Orange for depth profile
        linewidth: 1,
        fog: false,
        depthTest: false
      });
      this.cutProfileLine = new THREE.LineSegments(profileGeom, profileMat);
      this.cutProfileLine.renderOrder = 99;
      this.scene.add(this.cutProfileLine);
    }
  }
}

// ============ ORBIT CONTROLS ============
class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.target = new THREE.Vector3();
    this.distance = this.camera.position.length();
    this.phi = 0;
    this.theta = 0;

    this.minDistance = 10;
    this.maxDistance = 1000;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.1;

    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.dragMode = null;  // Track which mouse button is being used: 'rotate' or 'pan'
    this.panSpeed = 0.1;   // Speed of panning (world units per pixel)

    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('wheel', this.onMouseWheel.bind(this), false);
  }

  setTarget(x, y, z) {
    this.target.set(x, y, z);
    this.updateCamera();
  }

  onMouseDown(event) {
    this.isDragging = true;
    this.previousMousePosition = { x: event.clientX, y: event.clientY };

    // Determine drag mode based on mouse button
    if (event.button === 0) {
      // Left mouse button: rotation
      this.dragMode = 'rotate';
    } else if (event.button === 1) {
      // Middle mouse button: panning
      this.dragMode = 'pan';
    }
  }

  onMouseMove(event) {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.previousMousePosition.x;
    const deltaY = event.clientY - this.previousMousePosition.y;

    if (this.dragMode === 'rotate') {
      // Rotation mode
      this.theta -= deltaX * this.rotateSpeed;
      this.phi += deltaY * this.rotateSpeed;  // Reversed: positive deltaY increases phi
      this.phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.phi));
    } else if (this.dragMode === 'pan') {
      // Panning mode: move camera target in world space
      // Simple approach: pan proportional to screen movement, scaled by distance
      const panScale = this.distance * this.panSpeed * 0.01;

      // Pan in X-Y plane (horizontal movement follows screen)
      this.target.x -= deltaX * panScale;
      this.target.y += deltaY * panScale;
      // Z panning: if desired, could add modifier key support
    }

    this.previousMousePosition = { x: event.clientX, y: event.clientY };
    this.updateCamera();
  }

  onMouseUp() {
    this.isDragging = false;
    this.dragMode = null;
  }

  onMouseWheel(event) {
    event.preventDefault();
    this.distance += event.deltaY * this.zoomSpeed;
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    this.updateCamera();
  }

  updateCamera() {
    this.camera.position.x = this.target.x + this.distance * Math.cos(this.phi) * Math.sin(this.theta);
    this.camera.position.y = this.target.y + this.distance * Math.sin(this.phi);
    this.camera.position.z = this.target.z + this.distance * Math.cos(this.phi) * Math.cos(this.theta);
    this.camera.lookAt(this.target);
  }
}