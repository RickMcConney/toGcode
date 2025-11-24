// Global simulation variables
var simulationData = null;
var simulationState = {
	isRunning: false,
	isPaused: false,
	currentGcodeLine: 0,  // Current G-code line number (1-indexed)
	currentMoveIndex: 0,  // Index into simulationData.moves
	currentPointIndexInMove: 0,  // Index into currentMovePoints
	animationFrame: null,
	speed: 1.0,
	startTime: 0,
	totalTime: 0,
	travelMoves: [],
	lastPosition: null,
	currentMovePoints: null  // Cached interpolated points for current move
};
var materialRemovalPoints = [];
var currentToolInfo = null;  // Track current tool for display

// Parse G-code into simulation moves
function parseGcodeForSimulation(gcode) {
	var moves = [];
	var totalTime = 0;
	var currentPos = { x: 0, y: 0, z: 5 }; // Start at safe height
	var currentFeed = 600;
	var currentTool = null;
	const zbacklash = getOption("zbacklash");

	// Get the current profile for post-processor configuration
	var profile = currentGcodeProfile || null;

	// Create parse configuration from post-processor profile
	var parseConfig = createGcodeParseConfig(profile);

	// Use shared G-code parser to parse movements
	var parsedMovements = parseGcodeFile(gcode, parseConfig);

	// Build operation information from G-code comments
	var lines = gcode.split('\n');
	var operationsByLineIndex = {}; // Map line index to operation name
	var currentOperation = '';

	for (var i = 0; i < lines.length; i++) {
		var line = lines[i].trim();
		if (line === '' || line.startsWith(';')) continue;

		// Parse operation and tool comments
		if (line.startsWith('(') && line.endsWith(')')) {
			var comment = line.substring(1, line.length - 1);

			// Check if this is a tool info comment
			if (!comment.includes('Tool:')) {
				// It's an operation comment
				currentOperation = comment;
				operationsByLineIndex[i] = comment;
			}
		}
	}

	// Count total G-code lines (for display purposes)
	var totalGcodeLines = lines.filter(line => line.trim() !== '').length;

	// Process parsed movements to calculate times and tool radii
	// Each movement from parseGcodeFile() already has current tool info
	for (var i = 0; i < parsedMovements.length; i++) {
		var movement = parsedMovements[i];
		var newPos = { x: movement.x, y: movement.y, z: movement.z };
		var moveType = movement.isCutting ? 'feed' : 'rapid';
		var newFeed = movement.feedRate;

		// Use tool info from parsed movement (which tracks tool changes throughout G-code)
		var currentToolDiameter = movement.toolDiameter || 6; // Default to 6 if not specified
		var currentToolAngle = movement.toolAngle || 0;
		var movementTool = movement.tool; // Tool name string

		// Calculate move distance and time
		var distance = Math.sqrt(
			Math.pow(newPos.x - currentPos.x, 2) +
			Math.pow(newPos.y - currentPos.y, 2) +
			Math.pow(newPos.z - currentPos.z, 2)
		);

		var moveTime = distance / newFeed * 60; // Convert mm/min to seconds

		// Create move object
		if (distance > 0) {
			var toolRadius = currentToolDiameter / 2;

			// For V-carve operations, calculate radius based on Z depth
			if (currentOperation.includes('VCarve') && currentToolAngle > 0) {
				if (newPos.z > zbacklash) toolRadius = 0; // Clamp to 0 max
				else toolRadius = Math.abs(newPos.z) * Math.tan((currentToolAngle * Math.PI / 180) / 2);
			}

			moves.push({
				type: moveType,
				x: newPos.x,
				y: newPos.y,
				z: newPos.z,
				feed: newFeed,
				toolRadius: toolRadius,
				operation: currentOperation,
				time: moveTime,
				isCutting: newPos.z <= zbacklash,
				tool: movementTool,
				toolDiameter: currentToolDiameter,
				toolAngle: currentToolAngle,
				toolId: movement.toolId,
				gcodeLineNumber: movement.gcodeLineNumber || 0  // Track G-code line number
			});

			totalTime += moveTime;
		}

		currentPos = newPos;
		currentFeed = newFeed;
	}

	return {
		moves: moves,
		totalTime: totalTime,
		totalGcodeLines: totalGcodeLines
	};
}

// Extract tool information from G-code comments
function extractToolInfoFromGcode(gcode) {
	const toolInfo = {};
	const toolCommentsByLineIndex = {};  // Map of line index to tool info for tool switching
	const toolChangePoints = [];  // Array of {lineNumber, toolInfo} sorted by line number

	const lines = gcode.split('\n');
	const seenToolIds = new Set();

	// First pass: extract all tool comments
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const trimmed = line.trim();
		if (trimmed.includes('Tool:')) {
			// Extract tool information from comment
			// Format: (Tool: ID=X Type=Y Diameter=Z Angle=A)
			const toolMatch = trimmed.match(/Tool:\s*ID=(\d+)\s+Type=([A-Za-z ]+)\s+Diameter=([\d.]+)\s+Angle=([\d.]+)(?:\s+StepDown=([\d.]+))?/);
			if (toolMatch) {
				const toolId = toolMatch[1];
				const toolType = toolMatch[2].trim();

				const toolData = {
					id: toolId,
					type: toolType,
					diameter: parseFloat(toolMatch[3]),
					angle: parseFloat(toolMatch[4]),
					stepDown: toolMatch[5] ? parseFloat(toolMatch[5]) : null
				};

				// Store tool info by line index
				toolCommentsByLineIndex[lineIndex] = toolData;

				// Use FIRST tool as default
				if (Object.keys(toolInfo).length === 0) {
					Object.assign(toolInfo, toolData);
				}
			}
		}
	}

	// Second pass: build tool change points (only store actual changes)
	for (const lineIndexStr in toolCommentsByLineIndex) {
		const lineNum = parseInt(lineIndexStr);
		toolChangePoints.push({
			lineNumber: lineNum,
			toolInfo: toolCommentsByLineIndex[lineIndexStr]
		});
	}
	toolChangePoints.sort((a, b) => a.lineNumber - b.lineNumber);

	return { toolInfo, toolCommentsByLineIndex, toolChangePoints };
}

// Get the active tool for a specific G-code line number
function getToolForLine(lineNumber, toolChangePoints) {
	if (!toolChangePoints || toolChangePoints.length === 0) {
		return null;
	}

	// Find the most recent tool that was active at or before this line
	let activeToolInfo = null;

	for (const changePoint of toolChangePoints) {
		if (changePoint.lineNumber <= lineNumber) {
			activeToolInfo = changePoint.toolInfo;
		} else {
			break;  // Array is sorted, so stop when we exceed
		}
	}

	return activeToolInfo;
}

// Build a map of G-code line numbers to move indices for fast lookup
function buildLineNumberToMoveMap(simulationData) {
	const lineToMoveMap = new Map();
	const moveToLineMap = new Map();

	for (let i = 0; i < simulationData.moves.length; i++) {
		const move = simulationData.moves[i];
		if (move.gcodeLineNumber) {
			lineToMoveMap.set(move.gcodeLineNumber, i);
			moveToLineMap.set(i, move.gcodeLineNumber);
		}
	}

	return { lineToMoveMap, moveToLineMap };
}

// Generate interpolated material removal points for a single move
function generateMaterialPointsForMove(moveIndex, previousPosition, simulationData, toolChangePoints) {
	const points = [];
	const move = simulationData.moves[moveIndex];

	if (!move.isCutting) {
		return points;  // No material removal for non-cutting moves
	}

	// Get the correct tool for this G-code line
	const toolForLine = getToolForLine(move.gcodeLineNumber, toolChangePoints);
	const toolDiameter = toolForLine ? toolForLine.diameter : move.toolDiameter;
	const toolAngle = toolForLine ? toolForLine.angle : move.toolAngle;

	// Convert G-code coordinates to canvas coordinates
	const canvasX = move.x * viewScale + origin.x;
	const canvasY = origin.y - move.y * viewScale;
	// Use tool diameter from G-code comments if available, otherwise from move
	const canvasRadius = (toolDiameter / 2) * viewScale;

	if (!previousPosition) {
		// Single point cutting (like drilling)
		points.push({
			x: canvasX,
			y: canvasY,
			radius: canvasRadius,
			operation: move.operation,
			moveIndex: moveIndex,
			stepIndex: 1,
			totalSteps: 1,
			timeForThisStep: move.time,
			moveType: move.type,
			isRapid: move.type === 'rapid',
			isActualGcodePoint: true
		});
		return points;
	}

	// Interpolate from previous position to current position
	const lastCanvasX = previousPosition.x * viewScale + origin.x;
	const lastCanvasY = origin.y - previousPosition.y * viewScale;
	const lastCanvasRadius = previousPosition.r * viewScale;

	const dist = Math.sqrt(
		(lastCanvasX - canvasX) * (lastCanvasX - canvasX) +
		(lastCanvasY - canvasY) * (lastCanvasY - canvasY)
	);

	// Calculate steps based on feed rate
	let baseSteps = Math.ceil(dist / 5);
	const referenceFeedTime = dist / 1000 * 60;
	const feedRateMultiplier = Math.max(0.2, Math.min(5, move.time / referenceFeedTime));
	const steps = Math.max(1, Math.ceil(baseSteps * feedRateMultiplier));
	const timePerStep = move.time / steps;

	for (let j = 1; j <= steps; j++) {
		const t = j / steps;
		const interpX = lastCanvasX + (canvasX - lastCanvasX) * t;
		const interpY = lastCanvasY + (canvasY - lastCanvasY) * t;

		// Calculate radius at this interpolation point
		// For V-bits, radius depends on Z depth, so recalculate for each point
		let interpRadius = lastCanvasRadius;

		// Check if this is a V-carve operation by looking at tool angle from comments
		if (toolAngle && toolAngle > 0) {
			// V-carve operation: radius = |Z| * tan(angle/2)
			const interpZ = previousPosition.z + (move.z - previousPosition.z) * t;
			const zbacklash = getOption("zbacklash");
			const calculatedRadius = (interpZ > zbacklash) ? 0 : Math.abs(interpZ) * Math.tan((toolAngle * Math.PI / 180) / 2);
			interpRadius = calculatedRadius * viewScale;
		} else {
			// For regular tools (end mills, drill bits), radius stays constant during a move
			interpRadius = canvasRadius;
		}

		points.push({
			x: interpX,
			y: interpY,
			radius: interpRadius,
			operation: move.operation,
			moveIndex: moveIndex,
			stepIndex: j,
			totalSteps: steps,
			timeForThisStep: timePerStep,
			moveType: move.type,
			isRapid: move.type === 'rapid',
			feedRateMultiplier: feedRateMultiplier,
			isActualGcodePoint: (j === steps)
		});
	}

	return points;
}

// Simulation control functions
function startSimulation() {
	// Auto-close tool properties when starting simulation
	if (typeof autoCloseToolProperties === 'function') {
		autoCloseToolProperties('simulation start');
	}

	if (toolpaths.length === 0) {
		notify('No toolpaths to simulate');
		return;
	}

	// Generate G-code and parse it for simulation
	var gcode = toGcode();
	simulationData = parseGcodeForSimulation(gcode);

	// Show G-code viewer panel and populate with G-code
	if (typeof gcodeView !== 'undefined' && gcodeView) {
		gcodeView.populate(gcode);
		showGcodeViewerPanel();
	}

	// Extract tool information from G-code comments
	const toolData = extractToolInfoFromGcode(gcode);
	simulationState.toolChangePoints = toolData.toolChangePoints;
	simulationState.defaultTool = toolData.toolInfo;

	// Store raw G-code lines for direct line-by-line parsing
	simulationState.gcodeLines = gcode.split('\n');

	// Build line-to-move mapping for fast seeking
	simulationState.lineToMoveMap = buildLineNumberToMoveMap(simulationData).lineToMoveMap;

	simulationState.isRunning = true;
	simulationState.isPaused = false;
	simulationState.currentGcodeLine = 0;
	simulationState.currentMoveIndex = 0;
	simulationState.currentPointIndexInMove = 0;
	simulationState.currentMovePoints = null;
	simulationState.startTime = Date.now();
	simulationState.totalTime = simulationData.totalTime;
	simulationState.totalGcodeLines = simulationData.totalGcodeLines || 0;
	materialRemovalPoints = [];
	simulationState.travelMoves = [];
	simulationState.lastPosition = null;
	currentToolInfo = null;

	// Update UI
	const startBtn = document.getElementById('start-simulation');
	if (startBtn) startBtn.disabled = true;
	const pauseBtn = document.getElementById('pause-simulation');
	if (pauseBtn) pauseBtn.disabled = false;
	const stopBtn = document.getElementById('stop-simulation');
	if (stopBtn) stopBtn.disabled = false;

	const totalTimeDisplay = document.getElementById('2d-total-time');
	if (totalTimeDisplay) totalTimeDisplay.textContent = formatTime(simulationData.totalTime);

	// Setup slider based on G-code line numbers
	const stepSlider = document.getElementById('simulation-step');
	if (stepSlider) {
		stepSlider.min = 1;
		stepSlider.max = simulationState.totalGcodeLines;
		stepSlider.step = 1;
		stepSlider.value = 0;
		stepSlider.disabled = false;
	}

	// Start animation
	runSmoothSimulation();
}

function pauseSimulation() {
	simulationState.isPaused = !simulationState.isPaused;

	const pauseBtn = document.getElementById('pause-simulation');

	if (pauseBtn) {
		if (simulationState.isPaused) {
			pauseBtn.innerHTML = '<i data-lucide="play"></i> Resume';
			cancelAnimationFrame(simulationState.animationFrame);
		} else {
			pauseBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
			runSmoothSimulation();
		}
		if (typeof lucide !== 'undefined' && lucide.createIcons) {
			lucide.createIcons();
		}
	} else if (!simulationState.isPaused) {
		// If button doesn't exist but we're resuming, restart animation
		runSmoothSimulation();
	}
}



function stopSimulation() {
	simulationState.isRunning = false;
	simulationState.isPaused = false;
	simulationState.currentGcodeLine = 0;
	simulationState.currentMoveIndex = 0;
	simulationState.currentPointIndexInMove = 0;
	simulationState.currentMovePoints = null;
	simulationState.lastPosition = null;
	materialRemovalPoints = [];
	simulationState.travelMoves = [];
	currentToolInfo = null;

	// Hide G-code viewer and restore previous sidebar tab
	if (typeof hideGcodeViewerPanel === 'function') {
		hideGcodeViewerPanel();
	}

	if (simulationState.animationFrame) {
		cancelAnimationFrame(simulationState.animationFrame);
	}

	// Reset step slider (if it exists)
	const stepSlider = document.getElementById('simulation-step');
	if (stepSlider) {
		stepSlider.max = 100;
		stepSlider.value = 0;
		stepSlider.disabled = true;
	}

	// Reset displays
	const lineDisplay = document.getElementById('2d-step-display');
	if (lineDisplay) {
		lineDisplay.textContent = '0 / 0';
	}

	// Update UI
	const startSimBtn = document.getElementById('start-simulation');
	if (startSimBtn) {
		startSimBtn.innerHTML = '<i data-lucide="Play"></i> Play';
		startSimBtn.disabled = false;
	}
	const pauseSimBtn = document.getElementById('pause-simulation');
	if (pauseSimBtn) {
		pauseSimBtn.disabled = true;
		pauseSimBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
	}
	const stopSimBtn = document.getElementById('stop-simulation');
	if (stopSimBtn) {
		stopSimBtn.disabled = true;
	}
	const simTimeDisplay = document.getElementById('2d-simulation-time');
	if (simTimeDisplay) {
		simTimeDisplay.textContent = '0:00';
	}
	if (typeof lucide !== 'undefined' && lucide.createIcons) {
		lucide.createIcons();
	}

	// Restore normal status
	if (typeof setMode === 'function') {
		setMode(null);
	}

	// Redraw without simulation overlay
	redraw();
}

function updateSimulationSpeed(speed) {
	simulationState.speed = speed;
}

// Set simulation to a specific G-code line (primary seeking interface)
function setSimulationLineNumber(lineNumber, skipViewerUpdate) {
	if (!simulationData || !simulationState.lineToMoveMap) {
		return;
	}

	// Clamp line number to valid range
	lineNumber = Math.max(1, Math.min(lineNumber, simulationState.totalGcodeLines));

	// Rebuild material removal from line 1 to target line
	materialRemovalPoints = [];
	simulationState.travelMoves = [];
	simulationState.lastPosition = null;
	let elapsedTime = 0;
	let currentFeedRate = 0;

	// Iterate through all moves and build material removal points up to the target line
	for (let i = 0; i < simulationData.moves.length; i++) {
		const move = simulationData.moves[i];
		const moveLineNumber = move.gcodeLineNumber || 0;

		// Stop when we've reached the target line
		if (moveLineNumber > lineNumber) {
			break;
		}

		// Skip non-cutting moves but update position
		if (!move.isCutting) {
			// Add travel move visualization
			if (simulationState.lastPosition) {
				const lastCanvasX = simulationState.lastPosition.x * viewScale + origin.x;
				const lastCanvasY = origin.y - simulationState.lastPosition.y * viewScale;
				const canvasX = move.x * viewScale + origin.x;
				const canvasY = origin.y - move.y * viewScale;

				simulationState.travelMoves.push({
					fromX: lastCanvasX,
					fromY: lastCanvasY,
					toX: canvasX,
					toY: canvasY,
					moveIndex: i,
					timeForThisMove: move.time,
					moveType: move.type
				});
			}

			simulationState.lastPosition = { x: move.x, y: move.y, z: move.z, r: move.toolRadius };
			elapsedTime += move.time;
			continue;
		}

		// Generate material points for this cutting move with correct tool from G-code comments
		const movePoints = generateMaterialPointsForMove(i, simulationState.lastPosition, simulationData, simulationState.toolChangePoints);
		materialRemovalPoints.push(...movePoints);

		// Update elapsed time
		elapsedTime += move.time;
		currentFeedRate = move.feed || 0;

		// Update tool info
		if (move.tool) {
			currentToolInfo = { name: move.tool };
			if (move.toolDiameter) {
				currentToolInfo.name += ` (${move.toolDiameter}mm)`;
			}
		}

		// Update last position
		simulationState.lastPosition = { x: move.x, y: move.y, z: move.z, r: move.toolRadius };
	}

	// Update simulation state and reset animation point tracking for smooth continuation
	simulationState.currentGcodeLine = lineNumber;
	simulationState.currentPointIndexInMove = 0;
	simulationState.currentMovePoints = null;

	// Find the move index for this line
	simulationState.currentMoveIndex = 0;
	for (let i = 0; i < simulationData.moves.length; i++) {
		if (simulationData.moves[i].gcodeLineNumber > lineNumber) {
			simulationState.currentMoveIndex = i;
			break;
		}
	}

	// Update slider to reflect line number
	const stepSlider = document.getElementById('simulation-step');
	if (stepSlider) {
		stepSlider.value = lineNumber;
	}

	// Update UI displays
	const lineDisplay = document.getElementById('2d-step-display');
	if (lineDisplay) {
		lineDisplay.textContent = `${lineNumber} / ${simulationState.totalGcodeLines}`;
	}

	const simTimeElem = document.getElementById('2d-simulation-time');
	if (simTimeElem) {
		simTimeElem.textContent = formatTime(elapsedTime);
	}

	const feedRateDisplay = document.getElementById('2d-feed-rate-display');
	if (feedRateDisplay) {
		feedRateDisplay.textContent = Math.round(currentFeedRate);
	}

	if (typeof updateStatusWithSimulation === 'function') {
		updateStatusWithSimulation(elapsedTime, simulationState.totalTime);
	}

	// Update G-code viewer highlight
	if (!skipViewerUpdate && typeof gcodeView !== 'undefined' && gcodeView) {
		gcodeView.setCurrentLine(lineNumber);
	}

	// Redraw with current simulation state
	redraw();
}

// Parse a G-code line to extract coordinates and command info
function parseGcodeLine(line) {
	const trimmed = line.trim();

	// Skip comments and empty lines
	if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('(')) {
		return null;
	}

	// Extract G command (G0 or G1)
	const gMatch = trimmed.match(/G(\d+)/i);
	const gCommand = gMatch ? parseInt(gMatch[1]) : 1; // Default to G1

	// Extract coordinates
	const xMatch = trimmed.match(/X([-+]?[\d.]+)/i);
	const yMatch = trimmed.match(/Y([-+]?[\d.]+)/i);
	const zMatch = trimmed.match(/Z([-+]?[\d.]+)/i);
	const fMatch = trimmed.match(/F([\d.]+)/i);

	// Return null if no coordinates found
	if (!xMatch && !yMatch && !zMatch) {
		return null;
	}

	return {
		gCommand: gCommand,
		x: xMatch ? parseFloat(xMatch[1]) : null,
		y: yMatch ? parseFloat(yMatch[1]) : null,
		z: zMatch ? parseFloat(zMatch[1]) : null,
		f: fMatch ? parseFloat(fMatch[1]) : null,
		isCutting: gCommand === 1, // G1 is feed (cutting), G0 is rapid (not cutting)
		isRapid: gCommand === 0
	};
}

// G-code-driven simulation - process one line per frame
function runSmoothSimulation() {
	if (!simulationState.isRunning || simulationState.isPaused) {
		return;
	}

	// If we need to load a new line
	if (simulationState.currentMovePoints === null) {
		// Increment to next G-code line
		simulationState.currentGcodeLine++;

		// Check if animation is complete
		if (simulationState.currentGcodeLine > simulationState.totalGcodeLines) {
			pauseSimulation();
			return;
		}

		// Parse this G-code line
		const gcodeLineIndex = simulationState.currentGcodeLine - 1;
		if (gcodeLineIndex < 0 || gcodeLineIndex >= simulationState.gcodeLines.length) {
			// Out of bounds, skip to next frame
			setTimeout(() => {
				simulationState.animationFrame = requestAnimationFrame(runSmoothSimulation);
			}, 1);
			return;
		}

		const parsed = parseGcodeLine(simulationState.gcodeLines[gcodeLineIndex]);

		// If no valid coordinates, skip to next line (next frame will load it)
		if (!parsed) {
			setTimeout(() => {
				simulationState.animationFrame = requestAnimationFrame(runSmoothSimulation);
			}, 1);
			return;
		}

		// Get position and tool info
		const toolForLine = getToolForLine(simulationState.currentGcodeLine, simulationState.toolChangePoints);
		const prevPos = simulationState.lastPosition || { x: 0, y: 0, z: 5, r: 0 };
		const newX = parsed.x !== null ? parsed.x : prevPos.x;
		const newY = parsed.y !== null ? parsed.y : prevPos.y;
		const newZ = parsed.z !== null ? parsed.z : prevPos.z;

		// Update position for next line
		simulationState.lastPosition = { x: newX, y: newY, z: newZ, r: toolForLine?.diameter / 2 || 3 };

		// Update tool info
		if (toolForLine) {
			currentToolInfo = { name: toolForLine.type };
			if (toolForLine.diameter) {
				currentToolInfo.name += ` (${toolForLine.diameter}mm)`;
			}
		}

		// Handle non-cutting moves (rapid G0)
		if (!parsed.isCutting) {
			// Add travel visualization
			const lastCanvasX = prevPos.x * viewScale + origin.x;
			const lastCanvasY = origin.y - prevPos.y * viewScale;
			const canvasX = newX * viewScale + origin.x;
			const canvasY = origin.y - newY * viewScale;

			simulationState.travelMoves.push({
				fromX: lastCanvasX,
				fromY: lastCanvasY,
				toX: canvasX,
				toY: canvasY,
				moveIndex: -1,
				timeForThisMove: 0,
				moveType: 'rapid'
			});

			// Update display and schedule next frame to load next line
			const lineDisplay = document.getElementById('2d-step-display');
			if (lineDisplay) {
				lineDisplay.textContent = `${simulationState.currentGcodeLine} / ${simulationState.totalGcodeLines}`;
			}

			const stepSlider = document.getElementById('simulation-step');
			if (stepSlider) {
				stepSlider.value = simulationState.currentGcodeLine;
			}

			redraw();

			// Next frame loads next line
			setTimeout(() => {
				simulationState.animationFrame = requestAnimationFrame(runSmoothSimulation);
			}, 1);
			return;
		}

		// Handle cutting moves (G1) - generate interpolated points
		const movePoints = [];
		const dist = Math.sqrt(
			Math.pow(newX - prevPos.x, 2) +
			Math.pow(newY - prevPos.y, 2) +
			Math.pow(newZ - prevPos.z, 2)
		);

		if (dist > 0) {
			const feed = parsed.f || 100;
			const moveTime = (dist / feed) * 60;
			const toolDiameter = toolForLine ? toolForLine.diameter : 6;
			const toolAngle = toolForLine ? toolForLine.angle : 0;

			// Calculate interpolation steps
			let baseSteps = Math.ceil(dist / 5);
			const referenceFeedTime = dist / 1000 * 60;
			const feedRateMultiplier = Math.max(0.2, Math.min(5, moveTime / referenceFeedTime));
			const steps = Math.max(1, Math.ceil(baseSteps * feedRateMultiplier));
			const timePerStep = moveTime / steps;

			// Generate interpolated points from prevPos to newPos
			for (let j = 1; j <= steps; j++) {
				const t = j / steps;
				const interpX = prevPos.x + (newX - prevPos.x) * t;
				const interpY = prevPos.y + (newY - prevPos.y) * t;
				const interpZ = prevPos.z + (newZ - prevPos.z) * t;

				// Calculate tool radius (for V-bits)
				let radius = toolDiameter / 2;
				if (toolAngle > 0) {
					const zbacklash = getOption("zbacklash");
					radius = (interpZ > zbacklash) ? 0 : Math.abs(interpZ) * Math.tan((toolAngle * Math.PI / 180) / 2);
				}

				const canvasX = interpX * viewScale + origin.x;
				const canvasY = origin.y - interpY * viewScale;
				const canvasRadius = radius * viewScale;

				movePoints.push({
					x: canvasX,
					y: canvasY,
					radius: canvasRadius,
					stepIndex: j,
					totalSteps: steps,
					timeForThisStep: timePerStep
				});
			}
		}

		// Cache points and start drawing them
		simulationState.currentMovePoints = movePoints;
		simulationState.currentPointIndexInMove = 0;
	}

	// Add the next interpolated point for the current move
	if (simulationState.currentMovePoints && simulationState.currentPointIndexInMove < simulationState.currentMovePoints.length) {
		const point = simulationState.currentMovePoints[simulationState.currentPointIndexInMove];
		materialRemovalPoints.push(point);
		simulationState.currentPointIndexInMove++;

		// Calculate elapsed time
		let elapsedTime = 0;
		for (let i = 0; i < simulationState.currentMoveIndex; i++) {
			elapsedTime += simulationData.moves[i].time;
		}
		// Add partial time for current move
		if (simulationState.currentMoveIndex < simulationData.moves.length) {
			const progress = simulationState.currentPointIndexInMove / simulationState.currentMovePoints.length;
			elapsedTime += simulationData.moves[simulationState.currentMoveIndex].time * progress;
		}

		// Update UI displays
		const lineDisplay = document.getElementById('2d-step-display');
		if (lineDisplay) {
			lineDisplay.textContent = `${simulationState.currentGcodeLine} / ${simulationState.totalGcodeLines}`;
		}

		const simTimeElem = document.getElementById('2d-simulation-time');
		if (simTimeElem) {
			simTimeElem.textContent = formatTime(elapsedTime);
		}

		const feedRateDisplay = document.getElementById('2d-feed-rate-display');
		if (feedRateDisplay) {
			const move = simulationData.moves[simulationState.currentMoveIndex];
			feedRateDisplay.textContent = Math.round(move.feed || 0);
		}

		if (typeof updateStatusWithSimulation === 'function') {
			updateStatusWithSimulation(elapsedTime, simulationState.totalTime);
		}

		// Update progress slider
		const stepSlider = document.getElementById('simulation-step');
		if (stepSlider) {
			stepSlider.value = simulationState.currentGcodeLine;
		}

		// Update G-code viewer highlight
		if (typeof gcodeView !== 'undefined' && gcodeView) {
			gcodeView.setCurrentLine(simulationState.currentGcodeLine);
		}

		// Redraw with simulation
		redraw();

		// Schedule next point based on this point's time
		let delayMs = 1;
		if (point.timeForThisStep > 0) {
			// Time delay based on individual point's time and speed multiplier
			delayMs = (point.timeForThisStep * 1000) / simulationState.speed;
			delayMs = Math.max(1, delayMs);
		}

		setTimeout(() => {
			simulationState.animationFrame = requestAnimationFrame(runSmoothSimulation);
		}, delayMs);
	} else {
		// All points for current move are done, move to next move
		simulationState.lastPosition = { x: simulationData.moves[simulationState.currentMoveIndex].x, y: simulationData.moves[simulationState.currentMoveIndex].y, z: simulationData.moves[simulationState.currentMoveIndex].z, r: simulationData.moves[simulationState.currentMoveIndex].toolRadius };
		simulationState.currentMoveIndex++;
		simulationState.currentPointIndexInMove = 0;
		simulationState.currentMovePoints = null;

		// Schedule next move
		setTimeout(() => {
			simulationState.animationFrame = requestAnimationFrame(runSmoothSimulation);
		}, 1);
	}
}

function formatTime(seconds) {
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return minutes + ':' + (secs < 10 ? '0' : '') + secs;
}

function updateStatusWithSimulation(currentTime, totalTime) {
	const statusText = `Simulation: ${formatTime(currentTime)} / ${formatTime(totalTime)} | Tool: ${currentTool ? currentTool.name : 'None'}`;
	document.getElementById('status').innerHTML = `<span>${statusText}</span><span class="small">${typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}</span>`;
}

function drawTravelMoves() {
	if (!simulationState.travelMoves || simulationState.travelMoves.length === 0) return;
	ctx.save();
	ctx.strokeStyle = simulationStrokeColor;
	ctx.lineWidth = 1;
	ctx.setLineDash([5, 5]);
	for (let i = 0; i < simulationState.travelMoves.length; i++) {
		const move = simulationState.travelMoves[i];
		var from = worldToScreen(move.fromX, move.fromY);
		var to = worldToScreen(move.toX, move.toY);
		ctx.beginPath();
		ctx.moveTo(from.x, from.y);
		ctx.lineTo(to.x, to.y);
		ctx.stroke();
	}
	ctx.restore();
}

function drawMaterialRemoval() {
	if (materialRemovalPoints.length === 0) return;
	ctx.save();
	ctx.globalCompositeOperation = 'multiply';
	for (let i = 0; i < materialRemovalPoints.length; i++) {
		const point = materialRemovalPoints[i];
		var pt = worldToScreen(point.x, point.y);

		ctx.beginPath();
		ctx.arc(pt.x, pt.y, point.radius * zoomLevel, 0, 2 * Math.PI);
		if (point.isActualGcodePoint) {
			if (point.operation && point.operation.includes('Drill')) {
				ctx.fillStyle = simulationFillRapid;
			} else if (point.operation && point.operation.includes('VCarve')) {
				ctx.fillStyle = simulationFillRapid2;
			} else {
				ctx.fillStyle = simulationFillRapid3;
			}
		} else {
			if (point.operation && point.operation.includes('Drill')) {
				ctx.fillStyle = simulationFillCut;
			} else if (point.operation && point.operation.includes('VCarve')) {
				ctx.fillStyle = simulationFillCut2;
			} else {
				ctx.fillStyle = simulationFillCut3;
			}
		}
		ctx.fill();
	}
	ctx.restore();
}
