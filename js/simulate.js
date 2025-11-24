// Global simulation variables
var simulationData = null;
var simulationState = {
	isRunning: false,
	isPaused: false,
	currentStep: 0,
	currentAnimationStep: 0,
	animationFrame: null,
	speed: 1.0,
	startTime: 0,
	totalTime: 0,
	travelMoves: [],
	lastPosition: null
};
var materialRemovalPoints = [];
var allMaterialPoints = []; // Pre-computed all material removal points
var allTravelMoves = []; // Pre-computed all travel moves

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

// Pre-compute all material removal points for smooth animation
function preComputeAllMaterialPoints(simulationData) {
	allMaterialPoints = [];
	allTravelMoves = [];
	let lastPosition = null;

	for (let i = 0; i < simulationData.moves.length; i++) {
		const move = simulationData.moves[i];

		// Convert G-code coordinates to canvas coordinates
		const canvasX = move.x * viewScale + origin.x;
		const canvasY = origin.y - move.y * viewScale;
		const canvasRadius = move.toolRadius * viewScale;

		// Handle interpolation if we have a previous position and this is a cutting move
		if (lastPosition && move.isCutting) {
			const lastCanvasX = lastPosition.x * viewScale + origin.x;
			const lastCanvasY = origin.y - lastPosition.y * viewScale;
			const lastCanvasRadius = lastPosition.r * viewScale;

			const dist = Math.sqrt((lastCanvasX - canvasX) * (lastCanvasX - canvasX) + (lastCanvasY - canvasY) * (lastCanvasY - canvasY));

			// Calculate steps based on feed rate - slower moves get more points (denser/darker)
			// Base step calculation on distance, but adjust by inverse of time (which reflects feed rate)
			let baseSteps = Math.ceil(dist / 5); // Base density

			// Calculate feed rate factor - slower moves (more time) get more density
			// Normalize against a reference feed rate to get a multiplier
			const referenceFeedTime = dist / 1000 * 60; // Time for 1000mm/min feed rate
			const feedRateMultiplier = Math.max(0.2, Math.min(5, move.time / referenceFeedTime)); // Clamp between 0.2x and 5x density

			const steps = Math.max(1, Math.ceil(baseSteps * feedRateMultiplier));

			// Calculate time per step for this move
			const timePerStep = move.time / steps;

			for (let j = 1; j <= steps; j++) {
				const t = j / steps;
				const interpX = lastCanvasX + (canvasX - lastCanvasX) * t;
				const interpY = lastCanvasY + (canvasY - lastCanvasY) * t;
				const interpRadius = lastCanvasRadius + (canvasRadius - lastCanvasRadius) * t;

				allMaterialPoints.push({
					x: interpX,
					y: interpY,
					radius: interpRadius,
					operation: move.operation,
					moveIndex: i,
					stepIndex: j,
					totalSteps: steps,
					timeForThisStep: timePerStep, // Time in seconds for this animation step
					moveType: move.type,
					isRapid: move.type === 'rapid',
					feedRateMultiplier: feedRateMultiplier, // Store for debugging
					isActualGcodePoint: (j === steps) // Only the last interpolated point is the actual G-code endpoint
				});
			}
		} else if (move.isCutting) {
			// Single point cutting (like drilling)
			allMaterialPoints.push({
				x: canvasX,
				y: canvasY,
				radius: canvasRadius,
				operation: move.operation,
				moveIndex: i,
				stepIndex: 1,
				totalSteps: 1,
				timeForThisStep: move.time, // Full move time for single point
				moveType: move.type,
				isRapid: move.type === 'rapid',
				isActualGcodePoint: true // Single points are always actual G-code points
			});
		}

		// Handle travel moves (Z positive)
		if (!move.isCutting && lastPosition) {
			const lastCanvasX = lastPosition.x * viewScale + origin.x;
			const lastCanvasY = origin.y - lastPosition.y * viewScale;

			allTravelMoves.push({
				fromX: lastCanvasX,
				fromY: lastCanvasY,
				toX: canvasX,
				toY: canvasY,
				moveIndex: i,
				timeForThisMove: move.time,
				moveType: move.type
			});
		}

		// Update last position
		lastPosition = { x: move.x, y: move.y, z: move.z, r: move.toolRadius };
	}
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

	// Pre-compute all material removal points for smooth animation
	preComputeAllMaterialPoints(simulationData);

	simulationState.isRunning = true;
	simulationState.isPaused = false;
	simulationState.currentStep = 0;
	simulationState.currentAnimationStep = 0;
	simulationState.startTime = Date.now();
	simulationState.totalTime = simulationData.totalTime;
	simulationState.totalGcodeLines = simulationData.totalGcodeLines || 0;  // Store total line count
	materialRemovalPoints = [];
	simulationState.travelMoves = [];
	simulationState.lastPosition = null;

	// Update UI
	const startBtn = document.getElementById('start-simulation');
	if (startBtn) startBtn.disabled = true;
	const pauseBtn = document.getElementById('pause-simulation');
	if (pauseBtn) pauseBtn.disabled = false;
	const stopBtn = document.getElementById('stop-simulation');
	if (stopBtn) stopBtn.disabled = false;

	const totalTimeDisplay = document.getElementById('2d-total-time');
	if (totalTimeDisplay) totalTimeDisplay.textContent = formatTime(simulationData.totalTime);

	// Setup step slider - note: 2D simulation step slider removed, display only shows line numbers
	const stepSlider = document.getElementById('simulation-step');
	if (stepSlider) {
		stepSlider.max = allMaterialPoints.length;
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
	simulationState.currentStep = 0;
	simulationState.currentAnimationStep = 0;
	simulationState.lastPosition = null;
	materialRemovalPoints = [];
	simulationState.travelMoves = [];
	allMaterialPoints = [];
	allTravelMoves = [];

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

// Function to set simulation step via slider control
function setSimulationStep(step, skipViewerUpdate) {
	if (!simulationData || allMaterialPoints.length === 0) {
		return;
	}

	// Clamp step value
	step = Math.max(0, Math.min(step, allMaterialPoints.length));

	// Update animation step
	simulationState.currentAnimationStep = step;

	// Rebuild materialRemovalPoints up to current step
	materialRemovalPoints = [];
	for (let i = 0; i < step; i++) {
		materialRemovalPoints.push(allMaterialPoints[i]);
	}

	// Update travel moves up to current step
	if (step > 0 && step <= allMaterialPoints.length) {
		const currentPoint = allMaterialPoints[step - 1];
		simulationState.travelMoves = allTravelMoves.filter(move =>
			move.moveIndex <= currentPoint.moveIndex
		);
	} else {
		simulationState.travelMoves = [];
	}

	// Calculate elapsed time based on step position
	let elapsedTime = 0;
	if (step > 0 && step <= allMaterialPoints.length) {
		const currentPoint = allMaterialPoints[step - 1];
		const progress = currentPoint.stepIndex / currentPoint.totalSteps;
		for (let i = 0; i < currentPoint.moveIndex; i++) {
			elapsedTime += simulationData.moves[i].time;
		}
		// Add partial time for current move
		if (currentPoint.moveIndex < simulationData.moves.length) {
			elapsedTime += simulationData.moves[currentPoint.moveIndex].time * progress;
		}
	}

	// Update UI
	const stepSimTimeElem = document.getElementById('2d-simulation-time');
	if (stepSimTimeElem) stepSimTimeElem.textContent = formatTime(elapsedTime);
	if (typeof updateStatusWithSimulation === 'function') {
		updateStatusWithSimulation(elapsedTime, simulationState.totalTime);
	}

	// Update feed rate display
	let currentFeedRate = 0;
	if (step > 0 && step <= allMaterialPoints.length) {
		const currentPoint = allMaterialPoints[step - 1];
		if (currentPoint.moveIndex < simulationData.moves.length) {
			const currentMove = simulationData.moves[currentPoint.moveIndex];
			currentFeedRate = currentMove.feed || 0;
		}
	}
	const feedRateDisplay = document.getElementById('2d-feed-rate-display');
	if (feedRateDisplay) {
		feedRateDisplay.textContent = Math.round(currentFeedRate);
	}

	// Update G-code viewer highlight when progress slider moves
	if (!skipViewerUpdate) {
		let currentGcodeLine = 0;
		if (step > 0 && step <= allMaterialPoints.length) {
			const currentPoint = allMaterialPoints[step - 1];
			if (currentPoint.moveIndex < simulationData.moves.length) {
				const currentMove = simulationData.moves[currentPoint.moveIndex];
				currentGcodeLine = currentMove.gcodeLineNumber || 0;
			}
		}
		if (typeof gcodeView !== 'undefined' && gcodeView && currentGcodeLine >= 0) {
			gcodeView.setCurrentLine(currentGcodeLine);
		}
	}

	// Redraw with current simulation state
	redraw();
}



// New smooth simulation that draws each pre-computed point with pause
function runSmoothSimulation() {
	if (!simulationState.isRunning || simulationState.isPaused) {
		return;
	}

	// Add the current point to materialRemovalPoints for rendering
	if (simulationState.currentAnimationStep < allMaterialPoints.length) {
		const currentPoint = allMaterialPoints[simulationState.currentAnimationStep];
		materialRemovalPoints.push(currentPoint);

		// Update travel moves up to this point's moveIndex
		simulationState.travelMoves = allTravelMoves.filter(move =>
			move.moveIndex <= currentPoint.moveIndex
		);
	}

	// Move to next animation step
	simulationState.currentAnimationStep++;

	// Calculate elapsed time based on animation step progress (after increment)
	let elapsedTime = 0;
	if (simulationState.currentAnimationStep <= allMaterialPoints.length) {
		if (simulationState.currentAnimationStep >= allMaterialPoints.length) {
			// Animation complete - show full total time
			elapsedTime = simulationState.totalTime;
		} else {
			// Calculate time up to current step
			const currentPoint = allMaterialPoints[simulationState.currentAnimationStep];
			const progress = currentPoint.stepIndex / currentPoint.totalSteps;
			for (let i = 0; i < currentPoint.moveIndex; i++) {
				elapsedTime += simulationData.moves[i].time;
			}
			// Add partial time for current move
			if (currentPoint.moveIndex < simulationData.moves.length) {
				elapsedTime += simulationData.moves[currentPoint.moveIndex].time * progress;
			}
		}
	}

	// Update UI
	const simTimeElem = document.getElementById('2d-simulation-time');
	if (simTimeElem) simTimeElem.textContent = formatTime(elapsedTime);
	const totalTimeElem = document.getElementById('2d-total-time');
	if (totalTimeElem) totalTimeElem.textContent = formatTime(simulationState.totalTime);
	if (typeof updateStatusWithSimulation === 'function') {
		updateStatusWithSimulation(elapsedTime, simulationState.totalTime);
	}

	// Update G-code line display
	const lineDisplay = document.getElementById('2d-step-display');
	if (lineDisplay) {
		let currentGcodeLine = 0;

		// Get the current G-code line from the current animation step
		if (simulationState.currentAnimationStep > 0 && simulationState.currentAnimationStep <= allMaterialPoints.length) {
			const currentPoint = allMaterialPoints[simulationState.currentAnimationStep - 1];
			if (currentPoint.moveIndex < simulationData.moves.length) {
				const currentMove = simulationData.moves[currentPoint.moveIndex];
				currentGcodeLine = currentMove.gcodeLineNumber || 0;
			}
		}

		lineDisplay.textContent = `${currentGcodeLine} / ${simulationState.totalGcodeLines}`;

		// Update G-code viewer highlight during playback
		if (typeof gcodeView !== 'undefined' && gcodeView && currentGcodeLine >= 0) {
			gcodeView.setCurrentLine(currentGcodeLine);
		}
	}

	// Update feed rate and tool display
	let currentFeedRate = 0;
	if (simulationState.currentAnimationStep > 0 && simulationState.currentAnimationStep <= allMaterialPoints.length) {
		const currentPoint = allMaterialPoints[simulationState.currentAnimationStep - 1];
		if (currentPoint.moveIndex < simulationData.moves.length) {
			const currentMove = simulationData.moves[currentPoint.moveIndex];
			currentFeedRate = currentMove.feed || 0;

			// Update tool information based on current move's tool
			// This allows tool changes to be displayed during animation
			if (currentMove.tool) {
				currentTool = { name: currentMove.tool };
				if (currentMove.toolDiameter) {
					currentTool.name += ` (${currentMove.toolDiameter}mm)`;
				}
			}
		}
	}
	const feedRateDisplay = document.getElementById('2d-feed-rate-display');
	if (feedRateDisplay) {
		feedRateDisplay.textContent = Math.round(currentFeedRate);
	}

	// Redraw with simulation
	redraw();

	// Check if animation is complete after processing and incrementing
	if (simulationState.currentAnimationStep >= allMaterialPoints.length) {
		pauseSimulation();
		return;
	}

	// Use fixed timing for all animation steps - the visual feed rate effect comes from point density
	// At 1x speed, the total animation should take the same time as actual G-code execution
	let realTimeDelayMs = 0;
	if (allMaterialPoints.length > 0 && simulationState.totalTime > 0) {
		// Fixed time per animation step in milliseconds at 1x speed
		const timePerStep = (simulationState.totalTime * 1000) / allMaterialPoints.length;
		// Apply speed multiplier (higher speed = shorter delay)
		realTimeDelayMs = timePerStep / simulationState.speed;
		// Ensure minimum responsiveness
		realTimeDelayMs = Math.max(1, realTimeDelayMs);
	} else {
		// Fallback to fast animation if no timing data
		realTimeDelayMs = 10;
	}

	setTimeout(() => {
		simulationState.animationFrame = requestAnimationFrame(runSmoothSimulation);
	}, realTimeDelayMs);
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
