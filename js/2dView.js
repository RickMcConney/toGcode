// ============================================================================
// COLOR PALETTE - All colors used throughout the application
// ============================================================================



// Canvas Drawing Colors
var lineColor = '#000000';              // SVG path stroke color (black)
var selectColor = '#ff0000';            // Selected path color (red)
var activeColor = '#ff00ff';        // Active elements (orange)
var highlightColor = '#00ff00';         // Highlighted elements (green)
var toolColor = '#0000ff';              // Toolpath color (blue)
var circleColor = '#0000ff';            // Circle/drill point color (blue)
var activeToolpathColor = '#ff00ff';    // Active toolpath being edited (magenta)
var canvasBackgroundColor = '#eee';    // Canvas background color
var pointFillColor = 'black';           // Point/marker fill color
var pointStrokeColor = '#888';          // Point/marker stroke color
var originMarkerColor = '#ff0000'         // Origin (0,0) marker color
var axisColor = '#666';           // Axis number labels color

// Grid and Workpiece Colors
var gridColor = '#888';                 // Grid lines (gray)
var gridLabelColorFill = 'black';       // Grid label text fill
var gridLabelColorStroke = 'white';     // Grid label text outline
var workpieceColor = '#F5DEB3';         // Workpiece surface color (wheat)
var workpieceBorderColor = '#888888';   // Workpiece border (gray)

// Debug and Visualization Colors
var normLineColor = '#0000ff';          // Normal line visualization (blue)
var debugCyanColor = '#00ffff';         // Debug cyan highlight

// Simulation Colors
var simulationStrokeColor = 'rgba(255, 0, 0, 0.7)';          // Simulation path stroke (red)
var simulationFillRapid = 'rgba(255, 0, 0, 0.4)';            // Rapid move visualization (red)
var simulationFillRapid2 = 'rgba(255, 100, 0, 0.4)';         // Rapid move alt (orange-red)
var simulationFillRapid3 = 'rgba(255, 0, 100, 0.4)';         // Rapid move alt (pink-red)
var simulationFillCut = 'rgba(139, 69, 19, 0.2)';            // Cutting move (brown)
var simulationFillCut2 = 'rgba(160, 82, 45, 0.2)';           // Cutting move alt (sienna)
var simulationFillCut3 = 'rgba(101, 67, 33, 0.2)';           // Cutting move alt (dark brown)

// Material/Wood Colors (used in bootstrap-layout.js)
var materialWheat = '#F5DEB3';          // Pine, Birch
var materialBurlywood = '#DEB887';      // Cedar
var materialKhaki = '#F0E68C';          // Poplar
var materialLightPink = '#FFB6C1';      // Cherry
var materialTan = '#D2B48C';            // Walnut
var materialCornsilk = '#FFF8DC';       // Maple
var materialPaleGreen = '#e6f7c1';      // Ash
var materialPeach = '#f8d091';          // Mahogany
var materialLemonChiffon = '#FFFACD';   // Spruce
var materialPaleOrange = '#f5c373';     // Oak

// Operation Tool Colors (used in PathEdit, Transform, Polygon, etc.)
var handleActiveColor = '#ff0000';      // Active/dragged handle (red)
var handleActiveStroke = '#ff0000';     // Active handle stroke (red)
var handleHoverColor = '#ffff00';       // Hovered handle (yellow)
var handleHoverStroke = '#ff8800';      // Hovered handle stroke (orange)
var handleNormalColor = 'white';        // Normal handle (white)
var handleNormalStroke = '#0000ff';     // Normal handle stroke (blue)
var insertPreviewColor = 'rgba(0, 255, 0, 0.5)';     // Insert point preview fill (green)
var insertPreviewStroke = '#00aa00';    // Insert point preview stroke (green)
var selectionBoxColor = 'blue';         // Selection box color
var penLineColor = '#000000';           // Pen tool line color
var penCloseLineColor = '#00AA00';      // Pen tool closing line (green)
var penFirstPointColor = '#00AA00';     // Pen tool first point (green)

// Debug visualization for tab markers
var debugTabMarkers = [];
var showDebugMarkers = false;

var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

// New mousewheel event for newZoom
canvas.addEventListener('mousewheel', function (evt) {
	var rect = canvas.getBoundingClientRect();
	var zoomX = evt.clientX - rect.left;
	var zoomY = evt.clientY - rect.top;
	var delta = evt.deltaY < 0 ? 1 : -1;
	newZoom(delta, zoomX, zoomY);
	evt.preventDefault();
}, { passive: false });

// Add window resize handler to re-center workpiece when viewport changes
window.addEventListener('resize', function () {
	// Debounce resize events to avoid excessive recalculations
	clearTimeout(window.resizeTimeout);
	window.resizeTimeout = setTimeout(function () {
		centerWorkpiece();
		redraw();
	}, 150);
});


// Function to handle zooming in and out, centered on given screen coordinates
function newZoom(delta, centerX, centerY) {
	// centerX, centerY are screen coordinates where zoom is centered
	// Compute world coordinate under mouse before zoom
	var world = screenToWorld(centerX, centerY);
	// Update zoom level multiplicatively
	var zoomFactor = (delta > 0) ? 1.1 : 1 / 1.1;
	var newZoom = Math.max(0.05, Math.min(50, zoomLevel * zoomFactor));
	// Adjust pan so the world coordinate stays under the mouse
	panX = centerX - world.x * newZoom;
	panY = centerY - world.y * newZoom;
	zoomLevel = newZoom;
	redraw();
	// keep mouse position stable
	var world = screenToWorld(centerX, centerY);
	panX = centerX - world.x * zoomLevel;
	panY = centerY - world.y * zoomLevel;

	// Update properties panel if Pan tool is currently active
	if (typeof cncController !== 'undefined' &&
		cncController.operationManager &&
		cncController.operationManager.currentOperation &&
		cncController.operationManager.currentOperation.name === 'Pan' &&
		typeof cncController.operationManager.currentOperation.updatePropertiesPanel === 'function') {
		cncController.operationManager.currentOperation.updatePropertiesPanel();
	}

	redraw();
}

// Function to automatically center the workpiece in the canvas viewport
function centerWorkpiece() {
	// Get canvas dimensions
	const canvasCenter = getCanvasCenter();

	// Get workpiece dimensions from options
	const workpieceWidth = getOption("workpieceWidth") * viewScale;
	const workpieceLength = getOption("workpieceLength") * viewScale;

	// Calculate pan values to center the workpiece
	// The workpiece center should appear at the canvas center
	// Using transform: screenX = worldX * zoomLevel + panX
	// To center: canvasCenter.x = (workpieceWidth/2) * zoomLevel + panX
	// Therefore: panX = canvasCenter.x - (workpieceWidth/2) * zoomLevel
	panX = canvasCenter.x - (workpieceWidth / 2) * zoomLevel;
	panY = canvasCenter.y - (workpieceLength / 2) * zoomLevel;

}

// Calculate dynamic center based on viewport dimensions and coordinate system
function getCanvasCenter() {

	canvas.width = $('#canvas').parent()[0].clientWidth;
	canvas.height = $('#canvas').parent()[0].clientHeight;

	return {
		x: canvas.width / 2,
		y: canvas.height / 2
	};
}

function center() {

	//var w = $('#canvas').parent()[0].clientWidth;
	//var h = $('#canvas').parent()[0].clientHeight;

	const w = canvas.getBoundingClientRect().width;
	const h = canvas.getBoundingClientRect().height;

	var boxWidth = w;
	var boxHeight = h;

	scaleFactor = 1;

	if (svgpaths && svgpaths.length > 0) {
		bbox = boundingBoxPaths(svgpaths);
		boxWidth = Math.round(bbox.maxx + bbox.minx);
		boxHeight = Math.round(bbox.maxy + bbox.miny);
		if (boxWidth > boxHeight)
			scaleFactor = w / boxWidth;
		else
			scaleFactor = h / boxHeight;
	}

	offsetX = 0;
	offsetY = 0;
}


function clear() {
	ctx.globalAlpha = 1;
	ctx.beginPath();
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = canvasBackgroundColor;
	ctx.fill();
}

function drawMarker(x, y) {
	ctx.beginPath();
	var pt = worldToScreen(x, y);
	ctx.rect(pt.x - 2, pt.y - 2, 4, 4);
	ctx.fillStyle = pointFillColor;
	ctx.fill();
	ctx.strokeStyle = pointStrokeColor;
	ctx.stroke();
}

function drawLine(norm, color) {
	ctx.beginPath();
	var p1 = worldToScreen(norm.x1, norm.y1);
	var p2 = worldToScreen(norm.x2, norm.y2);
	ctx.moveTo(p1.x, p1.y);
	ctx.lineTo(p2.x, p2.y);
	ctx.strokeStyle = color;
	ctx.lineWidth = 0.1;
	ctx.stroke();
}


function drawNorms(norms) {
	for (var i = 0; i < norms.length; i++) {
		var norm = norms[i];
		drawLine(norm, normLineColor);
	}
}


function drawSvgPath(svgpath, color, lineWidth) {
	ctx.beginPath();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	var path = svgpath.path;
	for (var j = 0; j < path.length; j++) {
		var pt = worldToScreen(path[j].x, path[j].y);
		if (j == 0) {
			ctx.moveTo(pt.x, pt.y);
		} else {
			ctx.lineTo(pt.x, pt.y);
		}
	}
	// Close the path if marked as closed
	if (false && svgpath.closed) {
		ctx.closePath();
	}
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color;
	ctx.stroke();

	// Draw tabs if they exist on this path
	if (svgpath.creationProperties && svgpath.creationProperties.tabs && svgpath.creationProperties.tabs.length > 0) {
		drawPathTabs(svgpath);
	}
}

function drawPathTabs(svgpath) {
	if (!svgpath.creationProperties || !svgpath.creationProperties.tabs) return;

	const tabs = svgpath.creationProperties.tabs;
	const tabLength = svgpath.creationProperties.tabLength || 5;
	const tabHeight = svgpath.creationProperties.tabHeight || 2;

	ctx.save();

	for (let i = 0; i < tabs.length; i++) {
		const tab = tabs[i];
		const screenCenter = worldToScreen(tab.x, tab.y);

		// Convert MM to world units then to screen units
		const tabLengthScreen = tabLength * viewScale * zoomLevel;
		const tabHeightScreen = tabHeight * viewScale * zoomLevel;

		// Save and transform for rotation
		ctx.save();
		ctx.translate(screenCenter.x, screenCenter.y);
		// Rotate to align with segment direction (tab.angle is now the segment angle directly)
		ctx.rotate(tab.angle);

		// Draw tab rectangle with color based on convexity
		// Now: width (x-axis) = length along path, height (y-axis) = height perpendicular to path
		ctx.fillStyle = tab.isConvex ? 'rgba(100, 150, 255, 0.5)' : 'rgba(255, 150, 100, 0.5)';
		ctx.fillRect(-tabLengthScreen / 2, -tabHeightScreen / 2, tabLengthScreen, tabHeightScreen);

		// Draw outline
		ctx.strokeStyle = tab.isConvex ? '#0080ff' : '#ff8050';
		ctx.lineWidth = 1.5;
		ctx.strokeRect(-tabLengthScreen / 2, -tabHeightScreen / 2, tabLengthScreen, tabHeightScreen);

		ctx.restore();
	}

	ctx.restore();
}

/**
 * DEBUG VISUALIZATION: Draw tab bounding boxes on the canvas
 * Shows exactly what the tab detection algorithm sees
 */
function drawTabBoundingBoxes() {
	// Get all tabs from all SVG paths
	const allTabs = [];
	for (let pathIdx = 0; pathIdx < svgpaths.length; pathIdx++) {
		const path = svgpaths[pathIdx];
		if (path.creationProperties && path.creationProperties.tabs) {
			const tabLength = path.creationProperties.tabLength || 0;
			for (let tabIdx = 0; tabIdx < path.creationProperties.tabs.length; tabIdx++) {
				const tab = path.creationProperties.tabs[tabIdx];
				allTabs.push({
					tab: tab,
					tabLength: tabLength,
					pathName: path.name,
					pathIdx: pathIdx,
					tabIdx: tabIdx
				});
			}
		}
	}

	if (allTabs.length === 0) return; // No tabs to draw

	ctx.save();

	// Get tool radius for box width calculation
	// Get the first visible tool to get the radius
	let toolRadius = 3; // Default fallback
	for (let i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].visible && toolpaths[i].tool && toolpaths[i].tool.diameter) {
			toolRadius = toolpaths[i].tool.diameter / 2;
			break;
		}
	}

	// Calculate box width - 2 × tool radius on each side
	const boxWidth = 4 * toolRadius * viewScale; // Convert MM to world units

	for (let i = 0; i < allTabs.length; i++) {
		const { tab, tabLength, pathName, tabIdx } = allTabs[i];
		const tabLengthWorld = tabLength * viewScale;

		// Convert tab center to screen coordinates
		const centerScreen = worldToScreen(tab.x, tab.y);

		// Save context for rotation
		ctx.save();
		ctx.translate(centerScreen.x, centerScreen.y);

		// Rotate to segment direction (tab.angle is now the segment angle directly)
		ctx.rotate(tab.angle);

		// Draw the bounding box
		const boxLengthScreen = tabLengthWorld * zoomLevel;
		const boxWidthScreen = boxWidth * zoomLevel;

		// Draw box fill with transparency
		ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
		ctx.fillRect(-boxLengthScreen / 2, -boxWidthScreen / 2, boxLengthScreen, boxWidthScreen);

		// Draw cyan SIDE edges (long edges parallel to path direction)
		ctx.strokeStyle = '#00FFFF';
		ctx.lineWidth = 2;
		// Top side
		ctx.beginPath();
		ctx.moveTo(-boxLengthScreen / 2, boxWidthScreen / 2);
		ctx.lineTo(boxLengthScreen / 2, boxWidthScreen / 2);
		ctx.stroke();
		// Bottom side
		ctx.beginPath();
		ctx.moveTo(-boxLengthScreen / 2, -boxWidthScreen / 2);
		ctx.lineTo(boxLengthScreen / 2, -boxWidthScreen / 2);
		ctx.stroke();

		// Draw RED END edges (short edges perpendicular to path direction)
		ctx.strokeStyle = '#FF0000';
		ctx.lineWidth = 3;
		// Left end
		ctx.beginPath();
		ctx.moveTo(-boxLengthScreen / 2, -boxWidthScreen / 2);
		ctx.lineTo(-boxLengthScreen / 2, boxWidthScreen / 2);
		ctx.stroke();
		// Right end
		ctx.beginPath();
		ctx.moveTo(boxLengthScreen / 2, -boxWidthScreen / 2);
		ctx.lineTo(boxLengthScreen / 2, boxWidthScreen / 2);
		ctx.stroke();

		// Draw angle indicator (line showing the angle)
		ctx.strokeStyle = '#00FF00';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(boxLengthScreen / 2, 0);
		ctx.stroke();

		ctx.restore();

		// Draw tab center point
		const dotRadius = 4 / zoomLevel;
		ctx.fillStyle = '#FF00FF';
		ctx.beginPath();
		ctx.arc(centerScreen.x, centerScreen.y, dotRadius, 0, Math.PI * 2);
		ctx.fill();

		// Draw tab label
		ctx.fillStyle = '#FFFF00';
		ctx.font = `${12 / zoomLevel}px Arial`;
		ctx.fillText(`T${tabIdx}`, centerScreen.x + 10, centerScreen.y - 10);
	}

	// Draw debug markers if enabled
	if (showDebugMarkers && debugTabMarkers.length > 0) {
		ctx.save();

		for (let mIdx = 0; mIdx < debugTabMarkers.length; mIdx++) {
			const marker = debugTabMarkers[mIdx];
			const markerScreen = worldToScreen(marker.x, marker.y);

			// Draw colored circle for marker
			if (marker.type === 'lift') {
				ctx.fillStyle = '#FF0000';  // Red for lift
				ctx.strokeStyle = '#FF0000';
			} else if (marker.type === 'lower') {
				ctx.fillStyle = '#00FF00';  // Green for lower
				ctx.strokeStyle = '#00FF00';
			}

			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(markerScreen.x, markerScreen.y, 8, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();

			// Draw label
			ctx.fillStyle = '#FFFF00';
			ctx.font = `${12 / zoomLevel}px Arial`;
			ctx.fillText(`M${mIdx}`, markerScreen.x + 12, markerScreen.y - 5);
			ctx.font = `${10 / zoomLevel}px Arial`;
			ctx.fillText(`seg${marker.segmentIndex}`, markerScreen.x + 12, markerScreen.y + 10);
		}

		ctx.restore();
	}

	ctx.restore();
}

function drawPath(path, color, lineWidth, isMultiSegment) {
	ctx.beginPath();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	if (isMultiSegment) {
		// Pair-based iteration for multi-segment paths (infill lines with gaps)
		// Treats path as pairs of points (segment start, segment end)
		// moveTo(p1), lineTo(p2), moveTo(p3), lineTo(p4)...
		// Gaps between segments appear automatically
		for (let i = 0; i < path.length; i += 2) {
			var pt = worldToScreen(path[i].x, path[i].y);
			ctx.moveTo(pt.x, pt.y);
			if (i + 1 < path.length) {
				var pt2 = worldToScreen(path[i + 1].x, path[i + 1].y);
				ctx.lineTo(pt2.x, pt2.y);
			}
		}
	} else {
		// Sequential iteration for regular paths (contours, profiles, etc.)
		for (var j = 0; j < path.length; j++) {
			var pt = worldToScreen(path[j].x, path[j].y);
			if (j == 0) {
				ctx.moveTo(pt.x, pt.y);
			} else {
				ctx.lineTo(pt.x, pt.y);
			}
		}
	}

	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color;
	ctx.stroke();
}



function drawDebug() {
	for (var i = 0; i < debug.length; i++) {
		ctx.beginPath();
		var p = worldToScreen(debug[i].p.x, debug[i].p.y);
		var s = worldToScreen(debug[i].s.x, debug[i].s.y);
		ctx.moveTo(p.x, p.y);
		ctx.lineTo(s.x, s.y);
		ctx.moveTo(p.x, p.y);
		var e = worldToScreen(debug[i].e.x, debug[i].e.y);
		ctx.lineTo(e.x, e.y);
		ctx.strokeStyle = debugCyanColor;
		ctx.lineWidth = 1;
		ctx.stroke();
	}
}



// New drawGrid using virtual coordinates
function drawGrid() {
	ctx.beginPath();
	// Get workpiece dimensions
	const width = getOption("workpieceWidth") * viewScale;
	const length = getOption("workpieceLength") * viewScale;
	// Workpiece bounds in world coordinates

	var startX = 0;
	var startY = 0;
	var topLeft = worldToScreen(startX, startY);
	var bottomRight = worldToScreen(width, length);
	let o = worldToScreen(origin.x, origin.y);
	let gridSize = (typeof getOption !== 'undefined' && getOption("gridSize")) ? getOption("gridSize") : 10;
	let grid = gridSize * viewScale * zoomLevel;



	// Draw horizontal grid lines (covering negative and positive Y)
	for (var y = o.y; y <= bottomRight.y; y += grid) {
		ctx.moveTo(topLeft.x, y);
		ctx.lineTo(bottomRight.x, y);
	}
	for (var y = o.y; y >= topLeft.y; y -= grid) {
		ctx.moveTo(topLeft.x, y);
		ctx.lineTo(bottomRight.x, y);
	}
	// Draw vertical grid lines (covering negative and positive X)
	for (var x = o.x; x <= bottomRight.x; x += grid) {
		ctx.moveTo(x, topLeft.y);
		ctx.lineTo(x, bottomRight.y);
	}
	for (var x = o.x; x >= topLeft.x; x -= grid) {
		ctx.moveTo(x, topLeft.y);
		ctx.lineTo(x, bottomRight.y);
	}
	ctx.lineWidth = 0.25;
	ctx.strokeStyle = lineColor;
	ctx.stroke();

}




function drawOrigin() {
	ctx.beginPath();
	// Get workpiece dimensions
	const width = getOption("workpieceWidth") * viewScale;
	const length = getOption("workpieceLength") * viewScale;
	// Workpiece bounds in world coordinates

	var startX = 0;
	var startY = 0;
	var topLeft = worldToScreen(startX, startY);
	var bottomRight = worldToScreen(startX + width, startY + length);
	let o = worldToScreen(origin.x, origin.y);
	let gridSize = (typeof getOption !== 'undefined' && getOption("gridSize")) ? getOption("gridSize") : 10;
	let grid = gridSize * viewScale * zoomLevel;

	let offsetx = 0;
	let offsety = 0;


	// Draw blue X axis only within workpiece bounds

	ctx.moveTo(offsetx + topLeft.x, offsety + o.y);
	ctx.lineTo(offsetx + bottomRight.x, offsety + o.y);
	ctx.moveTo(offsetx + o.x, offsety + topLeft.y);
	ctx.lineTo(offsetx + o.x, offsety + bottomRight.y);

	ctx.lineWidth = 1;
	ctx.strokeStyle = axisColor;
	ctx.stroke();

	// Draw axis numbers - determine interval based on units
	ctx.fillStyle = axisColor;
	ctx.font = "12px Arial";

	var useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
	var numberInterval, numberGrid;

	if (useInches) {
		// Use 1 inch intervals, or fractions for small grids
		var inchSize = MM_PER_INCH * viewScale * zoomLevel;
		if (inchSize >= 30) {
			numberInterval = MM_PER_INCH; // 1 inch
		} else if (inchSize >= 15) {
			numberInterval = MM_PER_INCH / 2; // 1/2 inch
		} else {
			numberInterval = MM_PER_INCH / 4; // 1/4 inch
		}
		numberGrid = numberInterval * viewScale * zoomLevel;
	} else {
		// Metric - use 10mm intervals if grid size is less than 10mm, otherwise use grid size
		numberInterval = gridSize < 10 ? 10 : gridSize;
		numberGrid = numberInterval * viewScale * zoomLevel;
	}

	// Draw Y axis labels (vertical positions)
	var label = 0;
	for (var y = o.y; y <= bottomRight.y; y += numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = useInches ? formatDimension(-label, true) : -label;
			ctx.fillText(labelText, o.x + 2, y - 2);
		}
		label += numberInterval;
	}
	label = 0;
	for (var y = o.y; y >= topLeft.y; y -= numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = useInches ? formatDimension(-label, true) : -label;
			ctx.fillText(labelText, o.x + 2, y - 2);
		}
		label -= numberInterval;
	}

	// Draw X axis labels (horizontal positions)
	label = 0;
	for (var x = o.x; x <= bottomRight.x; x += numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = useInches ? formatDimension(label, true) : label;
			ctx.fillText(labelText, x + 2, o.y - 2);
		}
		label += numberInterval;
	}
	label = 0;
	for (var x = o.x; x >= topLeft.x; x -= numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = useInches ? formatDimension(label, true) : label;
			ctx.fillText(labelText, x + 2, o.y - 2);
		}
		label -= numberInterval;
	}

	// Draw origin marker (0,0)
	ctx.fillStyle = originMarkerColor;
	ctx.fillText("0", o.x + 2, o.y - 2);
}

function redraw() {


	// The context is reset when the size changes, so get a fresh one.
	//const ctx = canvas.getContext('2d');

	//ctx.setTransform(1, 0, 0, 1, 0, 0);
	clear();

	//ctx.setTransform(scaleFactor, 0, 0, scaleFactor, offsetX, offsetY);
	if (getOption("showWorkpiece"))
		drawWorkpiece();
	// Hide grid during simulation for clearer visualization
	if (getOption("showGrid") && !simulationState.isRunning)
		drawGrid();
	if (getOption("showOrigin"))
		drawOrigin();
	drawSvgPaths();
	drawToolPaths();

	// DEBUG: Draw tab bounding boxes for visualization
	//drawTabBoundingBoxes();

	// Draw material removal and travel moves during simulation
	if (simulationState.isRunning) {
		if (materialRemovalPoints.length > 0) {
			drawMaterialRemoval();
		}
		drawTravelMoves();
	}

	cncController.draw();

}

function drawWorkpiece() {
	var width = getOption("workpieceWidth") * viewScale;
	var length = getOption("workpieceLength") * viewScale;
	var woodSpecies = getOption("woodSpecies");
	var woodColor = workpieceColor;
	if (typeof woodSpeciesDatabase !== 'undefined' && woodSpeciesDatabase[woodSpecies]) {
		woodColor = woodSpeciesDatabase[woodSpecies].color;
	}
	var startX = 0;
	var startY = 0;
	var topLeft = worldToScreen(startX, startY);
	var bottomRight = worldToScreen(width, length);
	ctx.beginPath();
	ctx.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
	ctx.fillStyle = woodColor;
	ctx.fill();
	ctx.strokeStyle = workpieceBorderColor;
	ctx.lineWidth = 0.5;
	ctx.stroke();
}

function getBack(len, x1, y1, x2, y2) {
	return x2 - (len * (x2 - x1) / (Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2))));
}

function canvasDrawArrow(context, fromx, fromy, tox, toy) {
	var headlen = 10.0;
	var back = 4.0;
	var angle1 = Math.PI / 7.0;
	var angle2 = Math.atan2(toy - fromy, tox - fromx);
	var diff1 = angle2 - angle1;
	var diff2 = angle2 + angle1;
	var xx = getBack(back, fromx, fromy, tox, toy);
	var yy = getBack(back, fromy, fromx, toy, tox);

	context.moveTo(fromx, fromy);
	context.lineTo(tox, toy);

	context.moveTo(xx, yy);
	context.lineTo(xx - headlen * Math.cos(diff1), yy - headlen * Math.sin(diff1));

	context.moveTo(xx, yy);
	context.lineTo(xx - headlen * Math.cos(diff2), yy - headlen * Math.sin(diff2));
}

function drawCircle(circle) {
	var pt = worldToScreen(circle.x, circle.y);
	var r = circle.r * zoomLevel;
	ctx.beginPath();
	ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
	ctx.strokeStyle = circleColor;
	ctx.lineWidth = 0.1;
	ctx.stroke();
}

function drawCircles(circles, color) {
	for (var i = 0; i < circles.length; i++) {
		var circle = circles[i];
		var pt = worldToScreen(circle.x, circle.y);
		var r = (circle.r || circle.radius) * zoomLevel;
		ctx.beginPath();
		ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
		if (i < circles.length - 1) {
			var nextPt = worldToScreen(circles[i + 1].x, circles[i + 1].y);
			canvasDrawArrow(ctx, pt.x, pt.y, nextPt.x, nextPt.y);
		}

		ctx.strokeStyle = color;
		ctx.lineWidth = 0.5;
		ctx.stroke();
	}



}

function fillCircles(circles, color) {
	for (var i = 0; i < circles.length; i++) {
		var circle = circles[i];
		var pt = worldToScreen(circle.x, circle.y);
		var r = circle.r * zoomLevel;
		ctx.beginPath();
		ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.strokeStyle = color;
		ctx.lineWidth = 0.1;
		ctx.stroke();
	}

}

function drawBoundingBox(bbox) {
	var pt1 = worldToScreen(bbox.minx, bbox.miny);
	var pt2 = worldToScreen(bbox.minx, bbox.maxy);
	var pt3 = worldToScreen(bbox.maxx, bbox.maxy);
	var pt4 = worldToScreen(bbox.maxx, bbox.miny);
	ctx.beginPath();
	ctx.moveTo(pt1.x, pt1.y);
	ctx.lineTo(pt2.x, pt2.y);
	ctx.lineTo(pt3.x, pt3.y);
	ctx.lineTo(pt4.x, pt4.y);
	ctx.lineTo(pt1.x, pt1.y);
	ctx.lineWidth = 0.1;
	ctx.strokeStyle = lineColor;
	ctx.stroke();
}

function drawNearby() {
	for (var i = 0; i < nearbypaths.length; i++) {
		drawSvgPath(nearbypaths[i], selectColor, 1);
	}
}

function drawSvgPaths() {
	for (var i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i].visible) {
			let path = svgpaths[i];
			if (!selectMgr.isSelected(path))
			{
				if (path.highlight)
					drawSvgPath(path, highlightColor, 3);
				else 	
					drawSvgPath(path, lineColor, 0.5);
			}
		}
	}

	let selectedPaths = selectMgr.selectedPaths();
	for(let i = 0;i<selectedPaths.length;i++)
	{
		let path = selectedPaths[i];

		if(i == selectedPaths.length-1)
			drawSvgPath(path, activeColor, 3);
		else
			drawSvgPath(path, selectColor, 3);		
	}
}

function drawToolPaths() {
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].visible) {
			var paths = toolpaths[i].paths;
			// Determine color: active > selected > normal
			var isActive = toolpaths[i].active;
			var color = isActive ? activeToolpathColor : ('#' + toolpaths[i].tool.color);
			var lineWidth = isActive ? 4 : (toolpaths[i].selected ? 3 : 2);

			for (var p = 0; p < paths.length; p++) {
				raw = false;
				var path = paths[p].tpath;
				if (raw)
					path = paths[p].path;
				var tpath = paths[p].tpath;
				var operation = toolpaths[i].operation;
				var isMultiSegment = paths[p].isMultiSegment || false;

				if (operation == "Drill")
					if (toolpaths[i].selected || isActive)
						fillCircles(path, color);
					else
						drawCircles(path, color);

				// Check if this is a plunge point
				if (paths[p].isPlunge && paths[p].plungePoint) {
					// Draw plunge point as a filled circle with cross
					var plungePoint = paths[p].plungePoint;
					var screenPoint = worldToScreen(plungePoint.x, plungePoint.y);
					var size = 8 * zoomLevel; // Size of the plunge marker, scaled with zoom

					ctx.save();
					// Draw filled circle
					ctx.beginPath();
					ctx.arc(screenPoint.x, screenPoint.y, size, 0, 2 * Math.PI);
					ctx.fillStyle = color;
					ctx.globalAlpha = 0.5;
					ctx.fill();

					// Draw cross
					ctx.globalAlpha = 1.0;
					ctx.strokeStyle = color;
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.moveTo(screenPoint.x - size, screenPoint.y);
					ctx.lineTo(screenPoint.x + size, screenPoint.y);
					ctx.moveTo(screenPoint.x, screenPoint.y - size);
					ctx.lineTo(screenPoint.x, screenPoint.y + size);
					ctx.stroke();
					ctx.restore();
				}
				else if (tpath) {
					// Normal path drawing
					var isMultiSegment = paths[p].isMultiSegment || false;
				drawPath(tpath, color, lineWidth, isMultiSegment);
				}
			}
		}
	}

}
