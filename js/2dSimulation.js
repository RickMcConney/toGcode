/**
 * 2D Simulation Module
 *
 * Complete rewrite of the 2D simulation system.
 * Line-number-driven with interpolation-based tool visualization.
 *
 * Features:
 * - Feed-rate responsive point interpolation
 * - V-bit circle radius based on tool angle and depth
 * - Tool change tracking and preprocessing
 * - Canvas-based visualization
 */

// Legacy stub for backward compatibility with old code
var simulationState = {
    isRunning: false,
    isPaused: false
};

// Declare global material removal points array (used by old and new simulation)
var materialRemovalPoints = [];

// Global simulation state
var simulation2D = {
    // Control state
    isRunning: false,
    isPaused: false,
    speed: 5.0,
    shouldCancel: false,  // Flag to cancel pending async operations

    // G-code and parsing
    gcode: '',
    gcodeLines: [],
    currentLineIndex: 0,

    // Tool preprocessing
    toolByLine: {},
    currentTool: null,

    // Simulation state
    toolPosition: { x: 0, y: 0, z: 0 },

    // Animation
    animationFrameId: null,

    // Display tracking
    totalElapsedTime: 0,
    lineExecutionTimes: [],
    totalSimulationTime: 0  // Pre-calculated total time for entire G-code
};

/**
 * Parse a single G-code line and extract command and coordinates
 * @param {string} line - Raw G-code line
 * @returns {Object} Parsed line with command, coordinates, feed rate
 */
function parseGcodeLine(line) {
    // Ensure line is a valid string
    if (!line || typeof line !== 'string') {
        return {
            command: null,
            x: null,
            y: null,
            z: null,
            feedRate: null,
            isRapid: false,
            isCut: false,
            hasCoordinates: false
        };
    }

    // Remove comments: both (comment) and ;comment formats
    let cleanLine = line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim();

    if (!cleanLine) {
        return {
            command: null,
            x: null,
            y: null,
            z: null,
            feedRate: null,
            isRapid: false,
            isCut: false,
            hasCoordinates: false
        };
    }

    // Extract G-code command
    const gCommand = cleanLine.match(/G(\d+)/);
    const mCommand = cleanLine.match(/M(\d+)/);

    let command = null;
    let isRapid = false;
    let isCut = false;

    if (gCommand) {
        if (gCommand[1] === '0') {
            command = 'G0';
            isRapid = true;
        } else if (gCommand[1] === '1') {
            command = 'G1';
            isCut = true;
        } else {
            command = 'G' + gCommand[1];
        }
    } else if (mCommand) {
        command = 'M' + mCommand[1];
    }

    // Extract coordinates
    const xMatch = cleanLine.match(/X([-+]?\d+\.?\d*)/);
    const yMatch = cleanLine.match(/Y([-+]?\d+\.?\d*)/);
    const zMatch = cleanLine.match(/Z([-+]?\d+\.?\d*)/);
    const fMatch = cleanLine.match(/F([-+]?\d+\.?\d*)/);

    let x = xMatch ? parseFloat(xMatch[1]) : null;
    let y = yMatch ? parseFloat(yMatch[1]) : null;
    let z = zMatch ? parseFloat(zMatch[1]) : null;
    let feedRate = fMatch ? parseFloat(fMatch[1]) : null;

    // Validate parsed coordinates
    if (xMatch && isNaN(x)) {
        console.warn('Invalid X coordinate in G-code:', xMatch[1], '- using null');
        x = null;
    }
    if (yMatch && isNaN(y)) {
        console.warn('Invalid Y coordinate in G-code:', yMatch[1], '- using null');
        y = null;
    }
    if (zMatch && isNaN(z)) {
        console.warn('Invalid Z coordinate in G-code:', zMatch[1], '- using null');
        z = null;
    }
    if (fMatch && isNaN(feedRate)) {
        console.warn('Invalid F feed rate in G-code:', fMatch[1], '- using null');
        feedRate = null;
    }

    // Only treat as movement command if there are coordinates
    // Lines like "G0 G54 G17 G21 G90 G94" are configuration, not movement
    const hasCoordinates = x !== null || y !== null || z !== null;

    return {
        command: command,
        x: x,
        y: y,
        z: z,
        feedRate: feedRate,
        isRapid: isRapid && hasCoordinates,  // Only rapid if there are coordinates
        isCut: isCut && hasCoordinates,      // Only cut if there are coordinates
        hasCoordinates: hasCoordinates
    };
}

/**
 * Extract tool information from G-code comment
 * Format: (Tool: ID=X Type=Y Diameter=Z Angle=A StepDown=S)
 * @param {string} line - Raw G-code line
 * @returns {Object|null} Tool info object or null if not found
 */
function extractToolFromComment(line) {
    // Look for tool comment: (Tool: ID=X Type=Y Diameter=Z Angle=A ...)
    const toolMatch = line.match(/Tool:\s*ID=(\d+)\s+Type=([A-Za-z ]+)\s+Diameter=([\d.]+)\s+Angle=([\d.]+)(?:\s+StepDown=([\d.]+))?/);


    if (toolMatch) {
        return {
            id: parseInt(toolMatch[1]),
            type: toolMatch[2],
            diameter: parseFloat(toolMatch[3]),
            angle: parseFloat(toolMatch[4]),
            stepDown: parseFloat(toolMatch[5])
        };
    }

    return null;
}

/**
 * Setup simulation: generate G-code and preprocess tool information
 * @returns {boolean} Success indicator
 */
function setupSimulation2D() {
    try {
        // Generate G-code from toolpaths
        simulation2D.gcode = toGcode();

        if (!simulation2D.gcode || simulation2D.gcode.length === 0) {
            console.error('No G-code generated. Check that toolpaths exist.');
            return false;
        }

        // Split into non-empty lines
        simulation2D.gcodeLines = simulation2D.gcode
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (simulation2D.gcodeLines.length === 0) {
            console.error('No valid G-code lines after parsing.');
            return false;
        }

        console.log(`Loaded ${simulation2D.gcodeLines.length} G-code lines`);

        // Preprocess tool changes
        simulation2D.toolByLine = {};

        for (let i = 0; i < simulation2D.gcodeLines.length; i++) {
            const line = simulation2D.gcodeLines[i];
            const toolInfo = extractToolFromComment(line);

            if (toolInfo) {

                simulation2D.toolByLine[i] = toolInfo;
            }
        }
        simulation2D.currentTool = getToolForLineNumber(0)

        // Initialize state
        simulation2D.currentLineIndex = 0;
        simulation2D.toolPosition = { x: 0, y: 0, z: 0 };
        simulation2D.totalElapsedTime = 0;
        simulation2D.lineExecutionTimes = [];
        simulation2D.totalSimulationTime = 0;

        // Pre-calculate total execution time for all G-code lines
        let toolPos = { x: 0, y: 0, z: 0 };
        let totalTime = 0;

        for (let i = 0; i < simulation2D.gcodeLines.length; i++) {
            const line = simulation2D.gcodeLines[i];

            // Update tool if changed
            if (simulation2D.toolByLine[i]) {
                currentToolInfo = simulation2D.toolByLine[i];
            }

            const parsed = parseGcodeLine(line);

            // Calculate time for this line
            let lineTime = 0;
            if (parsed.isRapid || parsed.isCut) {
                const to = {
                    x: parsed.x !== null ? parsed.x : toolPos.x,
                    y: parsed.y !== null ? parsed.y : toolPos.y,
                    z: parsed.z !== null ? parsed.z : toolPos.z
                };

                const feedRate = parsed.feedRate || (parsed.isRapid ? 3000 : 500);
                const distance = Math.sqrt(
                    Math.pow(to.x - toolPos.x, 2) +
                    Math.pow(to.y - toolPos.y, 2) +
                    Math.pow(to.z - toolPos.z, 2)
                );
                lineTime = (distance / feedRate) * 60; // seconds

                // Update position
                toolPos = to;
            } else {
                // Noop
                lineTime = 0.001;
            }

            simulation2D.lineExecutionTimes[i] = lineTime;
            totalTime += lineTime;
        }

        simulation2D.totalSimulationTime = totalTime;

        // Show G-code viewer panel and populate with G-code
        if (typeof gcodeView !== 'undefined' && gcodeView) {
            gcodeView.populate(simulation2D.gcode);
            showGcodeViewerPanel();
        }

        return true;
    } catch (error) {
        console.error('Error setting up 2D simulation:', error);
        return false;
    }
}

function getToolForLineNumber(lineNumber) {
    // Find the most recent tool that was active at or before this line
    // With typical 1-2 tool changes, linear search is fast and simple
    let activeToolInfo = null;

    for (let i in simulation2D.toolByLine) {
        if (i <= lineNumber) {
            activeToolInfo = simulation2D.toolByLine[i];
        } else {
            // Since array is sorted, we can stop when we exceed the line number
            break;
        }
    }

    return activeToolInfo;
}

/**
 * Interpolate points between two positions based on feed rate
 * Point density inversely proportional to feed rate
 * @param {Object} from - Starting position {x, y, z}
 * @param {Object} to - Ending position {x, y, z}
 * @param {number} feedRate - Feed rate in mm/min
 * @returns {Array} Array of interpolated points
 */
function interpolatePoints(from, to, feedRate) {
    // Validate feedRate
    if (!feedRate || feedRate <= 0 || isNaN(feedRate)) {
        console.warn('Invalid feedRate in interpolatePoints:', feedRate, '- using default 1000 mm/min');
        feedRate = 1000;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = (to.z || 0) - (from.z || 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance < 0.001) {
        return [to];
    }

    // Point density: ~1 point per 5mm at 1000 mm/min feed
    // Faster feeds = fewer points, slower feeds = more points
    const pointCount = Math.max(2, Math.ceil(distance / (feedRate / 100)));

    const points = [];
    for (let i = 0; i <= pointCount; i++) {
        const t = i / pointCount;
        points.push({
            x: from.x + dx * t,
            y: from.y + dy * t,
            z: (from.z || 0) + dz * t
        });
    }

    return points;
}

/**
 * Calculate tool circle radius based on tool type and depth
 * For V-bits: radius = depth * tan(angle/2) when cutting (Z < 0)
 * For V-bits above material (Z >= 0): use 0.5mm (rapid size)
 * For other tools: radius = diameter/2 (constant)
 * @param {number} depth - Current depth (typically negative for cuts into material, positive = above material)
 * @param {Object} tool - Tool information object
 * @returns {number} Circle radius in world coordinates
 */
function getToolCircleRadius(depth, tool) {
    if (!tool) {
        return 0;
    }

    // If tool is above material (Z >= 0), show as small rapid circle
    if (depth >= 0) {
        return 0.5;  // Same size as rapid movements
    }

    // Check if V-bit tool (angle > 0)
    if (tool.angle && tool.angle > 0) {
        // Validate angle is in valid range
        let angle = tool.angle;
        if (angle <= 0 || angle >= 180 || isNaN(angle)) {
            console.warn('Invalid tool angle:', angle, '- clamping to valid range (0, 180)');
            angle = Math.max(0.1, Math.min(179.9, angle));
        }

        // V-bit: radius grows with depth
        const halfAngleRad = (angle / 2) * (Math.PI / 180);
        // At depth 0: radius = 0, grows as depth increases
        const radius = Math.abs(depth) * Math.tan(halfAngleRad);
        return radius;
    }

    // End Mill, Drill, Ball Nose: constant radius
    const radius = tool.diameter / 2;
    return radius;
}

/**
 * Execute a noop command (tool change, spindle, etc)
 * @param {number} lineIndex - Index of the G-code line
 */
function executeNoop(lineIndex) {
    // Update tool if changed
    if (simulation2D.toolByLine[lineIndex]) {
        simulation2D.currentTool = simulation2D.toolByLine[lineIndex];
    }

    // Calculate elapsed time (noop takes minimal time)
    simulation2D.lineExecutionTimes[lineIndex] = 0.001;
    simulation2D.totalElapsedTime += 0.001;
}

/**
 * Execute a rapid movement (G0)
 * @param {Object} parsed - Parsed G-code line
 * @returns {Promise} Resolves when movement animation is complete
 */
async function executeRapid(parsed) {
    // Check if simulation should cancel
    if (simulation2D.shouldCancel) {
        return;
    }

    const to = {
        x: parsed.x !== null ? parsed.x : simulation2D.toolPosition.x,
        y: parsed.y !== null ? parsed.y : simulation2D.toolPosition.y,
        z: parsed.z !== null ? parsed.z : simulation2D.toolPosition.z
    };

    // Rapid movements use a default high feed rate if not specified
    const feedRate = parsed.feedRate || 3000; // Default rapid feed

    // Generate interpolated points
    const points = interpolatePoints(simulation2D.toolPosition, to, feedRate);

    // Calculate total movement time
    const distance = Math.sqrt(
        Math.pow(to.x - simulation2D.toolPosition.x, 2) +
        Math.pow(to.y - simulation2D.toolPosition.y, 2) +
        Math.pow(to.z - simulation2D.toolPosition.z, 2)
    );
    const totalMoveTime = (distance / feedRate) * 60; // seconds

    simulation2D.lineExecutionTimes[simulation2D.currentLineIndex] = totalMoveTime;
    simulation2D.totalElapsedTime += totalMoveTime;

    // Add points one at a time with proper delays based on feed rate
    for (let i = 0; i < points.length; i++) {
        // Check if should cancel at each iteration
        if (simulation2D.shouldCancel || !simulation2D.isRunning) {
            simulation2D.toolPosition = to;  // Update position before returning
            return;
        }

        // Wait if paused (also check cancel flag inside the pause loop)
        while (simulation2D.isPaused && !simulation2D.shouldCancel) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Check cancel again after exiting pause loop
        if (simulation2D.shouldCancel || !simulation2D.isRunning) {
            simulation2D.toolPosition = to;
            return;
        }

        const pt = points[i];
        const toolRadius = 0.5; // Small visualization for rapid moves

        materialRemovalPoints.push({
            x: pt.x * viewScale + origin.x,              // Convert MM to world coords
            y: origin.y - pt.y * viewScale,              // Convert MM to world coords
            z: pt.z,
            radius: toolRadius * viewScale,   // Convert to world coords
            tool: simulation2D.currentTool,
            isRapid: true  // Mark as rapid movement
        });

        // Trigger canvas redraw
        redraw();

        // Calculate delay between this point and next
        // Total time distributed evenly across all point intervals
        if (i < points.length - 1) {
            // Validate speed multiplier
            let speed = simulation2D.speed;
            if (!speed || speed <= 0 || isNaN(speed)) {
                console.warn('Invalid speed multiplier in executeRapid:', speed, '- using 1.0');
                speed = 1.0;
            }
            const delayMs = (totalMoveTime / (points.length - 1)) / speed * 1000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    // Update tool position
    simulation2D.toolPosition = to;
}

/**
 * Execute a cutting movement (G1)
 * @param {Object} parsed - Parsed G-code line
 * @returns {Promise} Resolves when movement animation is complete
 */
async function executeCut(parsed) {
    // Check if simulation should cancel
    if (simulation2D.shouldCancel) {
        return;
    }

    const to = {
        x: parsed.x !== null ? parsed.x : simulation2D.toolPosition.x,
        y: parsed.y !== null ? parsed.y : simulation2D.toolPosition.y,
        z: parsed.z !== null ? parsed.z : simulation2D.toolPosition.z
    };

    // Use specified feed rate or default
    const feedRate = parsed.feedRate || 500; // Default cut feed

    // Generate interpolated points
    const points = interpolatePoints(simulation2D.toolPosition, to, feedRate);

    // Calculate total movement time
    const distance = Math.sqrt(
        Math.pow(to.x - simulation2D.toolPosition.x, 2) +
        Math.pow(to.y - simulation2D.toolPosition.y, 2) +
        Math.pow(to.z - simulation2D.toolPosition.z, 2)
    );
    const totalMoveTime = (distance / feedRate) * 60; // seconds

    simulation2D.lineExecutionTimes[simulation2D.currentLineIndex] = totalMoveTime;
    simulation2D.totalElapsedTime += totalMoveTime;

    // Add points one at a time with proper delays based on feed rate
    for (let i = 0; i < points.length; i++) {
        // Check if should cancel at each iteration
        if (simulation2D.shouldCancel || !simulation2D.isRunning) {
            simulation2D.toolPosition = to;  // Update position before returning
            return;
        }

        // Wait if paused (also check cancel flag inside the pause loop)
        while (simulation2D.isPaused && !simulation2D.shouldCancel) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Check cancel again after exiting pause loop
        if (simulation2D.shouldCancel || !simulation2D.isRunning) {
            simulation2D.toolPosition = to;
            return;
        }

        const pt = points[i];
        const toolRadius = getToolCircleRadius(pt.z, simulation2D.currentTool);

        materialRemovalPoints.push({
            x: pt.x * viewScale + origin.x,              // Convert MM to world coords
            y: origin.y - pt.y * viewScale,              // Convert MM to world coords
            z: pt.z,
            radius: toolRadius * viewScale,   // Convert to world coords
            tool: simulation2D.currentTool
        });

        // Trigger canvas redraw
        redraw();

        // Calculate delay between this point and next
        // Total time distributed evenly across all point intervals
        if (i < points.length - 1) {
            // Validate speed multiplier
            let speed = simulation2D.speed;
            if (!speed || speed <= 0 || isNaN(speed)) {
                console.warn('Invalid speed multiplier in executeCut:', speed, '- using 1.0');
                speed = 1.0;
            }
            const delayMs = (totalMoveTime / (points.length - 1)) / speed * 1000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    // Update tool position
    simulation2D.toolPosition = to;
}

/**
 * Draw material removal as slots (connecting circles) on canvas
 */
function drawMaterialRemovalCircles() {
    if (!ctx) return;

    if (materialRemovalPoints.length === 0) {
        return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Build segments of consecutive cutting and rapid points
    // This preserves ordering and prevents drawing strokes across rapid sections
    const segments = [];
    let currentSegment = [];
    let currentType = null;  // 'cutting' or 'rapid'

    for (let i = 0; i < materialRemovalPoints.length; i++) {
        const point = materialRemovalPoints[i];
        const pointType = point.isRapid ? 'rapid' : 'cutting';

        // If type changed, save current segment and start new one
        if (currentType !== null && pointType !== currentType) {
            segments.push({ type: currentType, points: currentSegment });
            currentSegment = [point];
            currentType = pointType;
        } else {
            currentSegment.push(point);
            currentType = pointType;
        }
    }
    // Add final segment
    if (currentSegment.length > 0) {
        segments.push({ type: currentType, points: currentSegment });
    }

    // Draw each segment
    for (const segment of segments) {
        if (segment.type === 'rapid') {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';  // Red for rapids
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            drawDashedPath(segment.points);
            ctx.setLineDash([]);  // Clear line dash
        } else {
            ctx.strokeStyle = 'rgba(139, 69, 19, 0.3)';  // Brown for cutting
            drawPointSlot(segment.points);
        }
    }

    ctx.restore();
}

/**
 * Helper function to draw dashed lines through points
 * @param {Array} points - Array of points to connect with dashed lines
 */
function drawDashedPath(points) {
    if (points.length < 2) return;

    ctx.beginPath();
    const firstPt = worldToScreen(points[0].x, points[0].y);
    ctx.moveTo(firstPt.x, firstPt.y);

    for (let i = 1; i < points.length; i++) {
        const pt = worldToScreen(points[i].x, points[i].y);
        ctx.lineTo(pt.x, pt.y);
    }

    ctx.stroke();
}

/**
 * Helper function to draw a continuous slot through points
 * Draws individual strokes between each pair of points to preserve width throughout
 * @param {Array} points - Array of points to connect
 */
function drawPointSlot(points) {
    if (points.length === 0) return;

    // Draw stroke between each pair of consecutive points
    for (let i = 0; i < points.length - 1; i++) {
        const fromPoint = points[i];
        const toPoint = points[i + 1];

        const fromPt = worldToScreen(fromPoint.x, fromPoint.y);
        const toPt = worldToScreen(toPoint.x, toPoint.y);

        // Set line width based on current point's radius
        ctx.lineWidth = fromPoint.radius * 2 * zoomLevel;

        // Draw stroke from this point to next
        ctx.beginPath();
        ctx.moveTo(fromPt.x, fromPt.y);
        ctx.lineTo(toPt.x, toPt.y);
        ctx.stroke();
    }

    // Draw endpoint circle to ensure clean termination with rounded cap
    const lastPoint = points[points.length - 1];
    const lastPt = worldToScreen(lastPoint.x, lastPoint.y);
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, lastPoint.radius * zoomLevel, 0, 2 * Math.PI);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
}

/**
 * Main simulation animation loop
 */
async function runSimulation2D() {
    if (!simulation2D.isRunning) {
        return;
    }

    // Check if we should cancel (we're seeking)
    if (simulation2D.shouldCancel) {
        return;
    }

    // Check if we've reached the end
    if (simulation2D.currentLineIndex >= simulation2D.gcodeLines.length) {
        finishSimulation2D();
        return;
    }

    // Get current line
    const line = simulation2D.gcodeLines[simulation2D.currentLineIndex];

    if (!line) {
        console.error('No line at index', simulation2D.currentLineIndex);
        stopSimulation2D();
        return;
    }

    // Debug: verify parseGcodeLine function exists
    if (typeof parseGcodeLine !== 'function') {
        console.error('FATAL: parseGcodeLine is not a function!', typeof parseGcodeLine);
        stopSimulation2D();
        return;
    }

    let parsed;
    try {
        parsed = parseGcodeLine(line);
    } catch (error) {
        console.error('Exception parsing G-code line', simulation2D.currentLineIndex, ':', line, error);
        stopSimulation2D();
        return;
    }

    if (!parsed) {
        console.error('parseGcodeLine returned falsy for line', simulation2D.currentLineIndex, ':', line, 'parsed=', parsed);
        stopSimulation2D();
        return;
    }

    // Dispatch execution based on command type
    try {
        if (parsed.isRapid) {
            // G0 - Rapid movement
            await executeRapid(parsed);
        } else if (parsed.isCut) {
            // G1 - Feed movement (cutting)
            await executeCut(parsed);
        } else {
            // All other commands (M commands, G-code that doesn't move)
            executeNoop(simulation2D.currentLineIndex);
        }
    } catch (error) {
        console.error('Error executing G-code line', simulation2D.currentLineIndex, ':', error);
    }

    // Update control display
    updateSimulation2DDisplay();
        	// Update G-code viewer highlight
	if (typeof gcodeView !== 'undefined' && gcodeView) {
		gcodeView.setCurrentLine(simulation2D.currentLineIndex);
	}

    // Trigger canvas redraw
    redraw();

    // Move to next line
    simulation2D.currentLineIndex++;

    // Schedule next iteration immediately (timing is now handled per-point)
    // Use minimal delay to allow UI updates
    simulation2D.animationFrameId = setTimeout(() => {
        runSimulation2D();
    }, 0);
}

/**
 * Start the simulation
 */
function startSimulation2D() {
    if (simulation2D.isRunning) {
        return; // Already running
    }

    // Always setup fresh (ensures we have latest G-code)
    if (!setupSimulation2D()) {
        alert('Cannot start simulation: ' + (
            (!svgpaths || svgpaths.length === 0) ? 'No paths to simulate' :
                (!toolpaths || toolpaths.length === 0) ? 'No toolpaths generated. Run a CNC operation first.' :
                    'Failed to generate G-code'
        ));
        return;
    }

    // Clear old points and reset for new simulation
    materialRemovalPoints = [];
    simulation2D.currentLineIndex = 0;
    simulation2D.shouldCancel = false;  // Clear cancel flag when starting

    simulation2D.isRunning = true;
    simulation2D.isPaused = false;
    simulationState.isRunning = true;  // Update legacy stub
    simulationState.isPaused = false;
    simulation2D.startTime = Date.now();

    // Update button states: disable start, enable pause and stop
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');
    const stopBtn = document.getElementById('stop-simulation');
    const progressSlider = document.getElementById('simulation-step');

    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = false;
    // Keep slider enabled so user can seek at any time

    runSimulation2D();
}

/**
 * Pause the simulation
 */
function pauseSimulation2D() {
    if (!simulation2D.isRunning) {
        return;
    }

    simulation2D.isPaused = !simulation2D.isPaused;
    simulationState.isPaused = simulation2D.isPaused;  // Update legacy stub

    // Update button text and states
    const pauseBtn = document.getElementById('pause-simulation');

    if (pauseBtn) {
        pauseBtn.textContent = simulation2D.isPaused ? 'Play' : 'Pause';
        pauseBtn.innerHTML = `<i data-lucide="${simulation2D.isPaused ? 'play' : 'pause'}"></i>`;
    }

    // Slider is always enabled - user can seek at any time

    // When pausing, clear any pending timeout so the next line doesn't start
    if (simulation2D.isPaused && simulation2D.animationFrameId) {
        clearTimeout(simulation2D.animationFrameId);
        simulation2D.animationFrameId = null;
    }

    // When resuming from pause
    if (!simulation2D.isPaused) {
        const wasSeekCancel = simulation2D.shouldCancel;  // Check if we seeked
        simulation2D.shouldCancel = false;  // Clear the cancel flag
        simulation2D.isRunning = true;      // Resume execution

        // Only call runSimulation2D() if we seeked (shouldCancel was true)
        // If we just paused mid-line, the async will wake up naturally
        if (wasSeekCancel && typeof runSimulation2D === 'function') {
            runSimulation2D();
        }
    }

    // Reload lucide icons after changing them
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // When just resuming (not after a seek), the async executeRapid/executeCut functions
    // will detect isPaused=false and continue from where they were waiting
}

/**
 * Finish the simulation (reached end of G-code)
 * Pauses the simulation but keeps material points visible
 * User can click play to restart or stop to clear
 */
function finishSimulation2D() {
    simulation2D.isRunning = false;
    simulation2D.isPaused = true;
    simulationState.isRunning = false;
    simulationState.isPaused = true;

    // Keep G-code viewer visible so user can review the completed simulation
    // Do NOT hide it - only hide when user explicitly clicks stop

    // Update button states: enable start, show play icon on pause button
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');
    const stopBtn = document.getElementById('stop-simulation');

    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) {
        pauseBtn.disabled = false;  // Enable pause button so user can see play icon
        pauseBtn.innerHTML = `<i data-lucide="play"></i>`;
    }
    if (stopBtn) stopBtn.disabled = false;
    // Slider always stays enabled

    // Reload lucide icons after changing them
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Keep material removal points visible - do NOT clear them
    // Keep current state - user can restart by clicking play
    updateSimulation2DDisplay();
    redraw();
}

/**
 * Stop the simulation
 */
function stopSimulation2D() {
    // Signal any pending async operations to stop
    simulation2D.shouldCancel = true;

    simulation2D.isRunning = false;
    simulation2D.isPaused = false;
    simulationState.isRunning = false;  // Update legacy stub
    simulationState.isPaused = false;

    if (simulation2D.animationFrameId) {
        clearTimeout(simulation2D.animationFrameId);
        simulation2D.animationFrameId = null;
    }

    if (typeof hideGcodeViewerPanel === 'function') {
        hideGcodeViewerPanel();
    }

    // Clear material removal points when stopping
    materialRemovalPoints = [];

    // Update button states: enable start, disable pause and stop
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');
    const stopBtn = document.getElementById('stop-simulation');

    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.innerHTML = `<i data-lucide="pause"></i>`;
    }
    if (stopBtn) stopBtn.disabled = true;
    // Slider always stays enabled

    // Reload lucide icons after changing them
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Reset state
    // Tool position should be in G-code MM coordinates, starting at 0,0,0
    simulation2D.currentLineIndex = 0;
    simulation2D.toolPosition = { x: 0, y: 0, z: 0 };
    simulation2D.totalElapsedTime = 0;

    updateSimulation2DDisplay();
    redraw();
}

/**
 * Set simulation to a specific line number (seeking)
 * Replays from start to target line, regenerating material removal points
 * @param {number} targetLineIndex - 0-based index into gcodeLines
 */
function setSimulation2DLineNumber(targetLineIndex) {
    // Ensure setup is done
    if (!simulation2D.gcodeLines || simulation2D.gcodeLines.length === 0) {
        if (!setupSimulation2D()) {
            console.error('Failed to setup simulation for seeking');
            return;
        }
    }

    // Validate
    if (targetLineIndex < 0 || targetLineIndex >= simulation2D.gcodeLines.length) {
        return;
    }

    // Stop any running/pending operations and pause the simulation
    // This handles both slider and gcode viewer clicks
    simulation2D.shouldCancel = true;  // Signal pending operations to stop
    simulation2D.isRunning = false;    // Stop the main loop
    simulation2D.isPaused = true;      // Put into paused state so user can resume

    if (simulation2D.animationFrameId) {
        clearTimeout(simulation2D.animationFrameId);
        simulation2D.animationFrameId = null;
    }

    // CRITICAL: Clear material removal points BEFORE regenerating
    materialRemovalPoints = [];

    // Reset state
    // Tool position should be in G-code MM coordinates, starting at 0,0,0
    simulation2D.currentLineIndex = 0;
    simulation2D.toolPosition = { x: 0, y: 0, z: 0 };
    simulation2D.totalElapsedTime = 0;
    simulation2D.currentTool = null;
    simulation2D.lineExecutionTimes = [];

    // Replay from start to target line (synchronous, regenerating material removal points)
    for (let i = 0; i < targetLineIndex; i++) {
        const line = simulation2D.gcodeLines[i];
        const parsed = parseGcodeLine(line);

        // Update tool
        if (simulation2D.toolByLine[i]) {
            simulation2D.currentTool = simulation2D.toolByLine[i];
        }

        // Execute movement and generate points
        if (parsed.isRapid) {
            const to = {
                x: parsed.x !== null ? parsed.x : simulation2D.toolPosition.x,
                y: parsed.y !== null ? parsed.y : simulation2D.toolPosition.y,
                z: parsed.z !== null ? parsed.z : simulation2D.toolPosition.z
            };

            const feedRate = parsed.feedRate || 3000;
            const points = interpolatePoints(simulation2D.toolPosition, to, feedRate);

            const distance = Math.sqrt(
                Math.pow(to.x - simulation2D.toolPosition.x, 2) +
                Math.pow(to.y - simulation2D.toolPosition.y, 2) +
                Math.pow(to.z - simulation2D.toolPosition.z, 2)
            );
            const moveTime = (distance / feedRate) * 60;

            simulation2D.lineExecutionTimes[i] = moveTime;
            simulation2D.totalElapsedTime += moveTime;

            // Generate rapid movement points (no material removal, just visualization)
            for (let j = 0; j < points.length; j++) {
                const pt = points[j];
                materialRemovalPoints.push({
                    x: pt.x * viewScale + origin.x,
                    y: origin.y - pt.y * viewScale,
                    z: pt.z,
                    radius: (0.5) * viewScale,
                    tool: simulation2D.currentTool,
                    isRapid: true  // Mark as rapid movement
                });
            }

            simulation2D.toolPosition = to;
        } else if (parsed.isCut) {
            const to = {
                x: parsed.x !== null ? parsed.x : simulation2D.toolPosition.x,
                y: parsed.y !== null ? parsed.y : simulation2D.toolPosition.y,
                z: parsed.z !== null ? parsed.z : simulation2D.toolPosition.z
            };

            const feedRate = parsed.feedRate || 500;
            const points = interpolatePoints(simulation2D.toolPosition, to, feedRate);

            const distance = Math.sqrt(
                Math.pow(to.x - simulation2D.toolPosition.x, 2) +
                Math.pow(to.y - simulation2D.toolPosition.y, 2) +
                Math.pow(to.z - simulation2D.toolPosition.z, 2)
            );
            const moveTime = (distance / feedRate) * 60;

            simulation2D.lineExecutionTimes[i] = moveTime;
            simulation2D.totalElapsedTime += moveTime;

            // Generate cutting movement points with material removal
            for (let j = 0; j < points.length; j++) {
                const pt = points[j];
                const toolRadius = getToolCircleRadius(pt.z, simulation2D.currentTool);
                materialRemovalPoints.push({
                    x: pt.x * viewScale + origin.x,
                    y: origin.y - pt.y * viewScale,
                    z: pt.z,
                    radius: toolRadius * viewScale,
                    tool: simulation2D.currentTool
                });
            }

            simulation2D.toolPosition = to;
        } else {
            // Noop
            simulation2D.lineExecutionTimes[i] = 0.001;
            simulation2D.totalElapsedTime += 0.001;
        }
    }

    // Set current line to target
    simulation2D.currentLineIndex = targetLineIndex;

    // Update display
    updateSimulation2DDisplay();

    redraw();

    // Always leave in paused state after seeking
    // User will click resume (the play button) to continue
    // IMPORTANT: Set isRunning = true so pauseSimulation2D() can toggle the pause state
    simulation2D.isRunning = true;
    simulation2D.isPaused = true;

    // The pause button will show the play icon
    const pauseBtn = document.getElementById('pause-simulation');
    if (pauseBtn) {
        pauseBtn.disabled = false;
        pauseBtn.innerHTML = `<i data-lucide="play"></i>`;
    }
    // Slider is always enabled so user can seek anytime

    // Reload lucide icons after changing them
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

/**
 * Update the control display with current simulation state
 */
function updateSimulation2DDisplay() {
    // Update line number
    const lineDisplay = document.getElementById('2d-step-display');
    if (lineDisplay) {
        lineDisplay.textContent = `${simulation2D.currentLineIndex} / ${simulation2D.gcodeLines.length}`;
    }

    // Update feed rate (from current line)
    if (simulation2D.currentLineIndex < simulation2D.gcodeLines.length) {
        const line = simulation2D.gcodeLines[simulation2D.currentLineIndex];
        const parsed = parseGcodeLine(line);
        const feedDisplay = document.getElementById('2d-feed-rate-display');
        if (feedDisplay && parsed && parsed.feedRate) {
            feedDisplay.textContent = `${parsed.feedRate.toFixed(0)} mm/min`;
        }
    }

    // Update time displays
    const timeElapsedDisplay = document.getElementById('2d-simulation-time');
    const timeTotalDisplay = document.getElementById('2d-total-time');

    if (timeElapsedDisplay) {
        timeElapsedDisplay.textContent = formatTimeMMSS(simulation2D.totalElapsedTime);
    }

    if (timeTotalDisplay) {
        // Use pre-calculated total simulation time
        timeTotalDisplay.textContent = formatTimeMMSS(simulation2D.totalSimulationTime);
    }

    // Update progress slider if present
    const progressSlider = document.getElementById('simulation-step');
    if (progressSlider) {
        progressSlider.value = simulation2D.currentLineIndex;
        progressSlider.max = simulation2D.gcodeLines.length - 1;
    }
}

/**
 * Format time in M:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatTimeMMSS(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update simulation speed multiplier
 * @param {number} speed - Speed multiplier (1.0 = normal, 2.0 = 2x, etc)
 */
function updateSimulation2DSpeed(speed) {
    simulation2D.speed = Math.max(0.5, Math.min(10, speed)); // Clamp between 0.5x and 10x
}
