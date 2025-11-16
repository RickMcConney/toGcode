// --- Virtual coordinate system for zoom/pan ---
var zoomLevel = .5; // initial zoom
var panX = 0; // will be calculated dynamically by centerWorkpiece()
var panY = 0; // will be calculated dynamically by centerWorkpiece()
var origin = { x: 0, y: 0 }; // origin in virtual coordinates
const selectMgr = Select.getInstance();

// Debug visualization for tab markers
var debugTabMarkers = [];
var showDebugMarkers = false;

function worldToScreen(x, y) {
	return {
		x: (x * zoomLevel + panX),
		y: (y * zoomLevel + panY)
	};
}

function screenToWorld(x, y) {
	return {
		x: (x - panX) / zoomLevel,
		y: (y - panY) / zoomLevel
	};
}

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

//fix properties corruption
// support inches in tool properties panel
//todo tab support
//blocked paths need to be turned into travel moves
// make norms for rect not good
// center of rick path generate 0 lenght tool paths



var viewScale = 10;
var pixelsPerInch = 72; // 72 for illustrator 96 for inkscape
var svgscale = viewScale * 25.4 / pixelsPerInch;
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

// Calculate dynamic center based on viewport dimensions and coordinate system
function getCanvasCenter() {

	canvas.width = $('#canvas').parent()[0].clientWidth;
	canvas.height = $('#canvas').parent()[0].clientHeight;

	return {
		x: canvas.width / 2,
		y: canvas.height / 2
	};
}





var toolpathId = 1;
var svgpathId = 1;
var toolpaths = [];
var svgpaths = [];
var nearbypaths = [];
var norms = [];
var debug = [];
var vlocal = [];
var currentNorm = null;
var undoList = [];
var redoList = [];
var MAX_UNDO = 50;


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

// ============================================================================
// UNIT CONVERSION CONSTANTS & FUNCTIONS
// ============================================================================

var MM_PER_INCH = 25.4;

// Convert decimal inches to nearest fraction
// Returns {whole, numerator, denominator} or null if should show decimal
function decimalToFraction(decimal, maxDenominator) {
	maxDenominator = maxDenominator || 64;

	// Extract whole number part
	var whole = Math.floor(Math.abs(decimal));
	var fractional = Math.abs(decimal) - whole;

	// If very close to whole number, return it
	if (fractional < 0.001) {
		return { whole: whole * Math.sign(decimal || 1), numerator: 0, denominator: 1 };
	}

	// Try common woodworking denominators: 2, 4, 8, 16, 32, 64
	var denominators = [2, 4, 8, 16, 32, 64].filter(d => d <= maxDenominator);
	var bestDenom = 1;
	var bestNumer = 0;
	var bestError = 1;

	for (var i = 0; i < denominators.length; i++) {
		var denom = denominators[i];
		var numer = Math.round(fractional * denom);
		var error = Math.abs(fractional - numer / denom);

		if (error < bestError) {
			bestError = error;
			bestDenom = denom;
			bestNumer = numer;
		}
	}

	// If error is too large, return null to indicate decimal display
	if (bestError > 0.01) {
		return null;
	}

	// Simplify fraction
	var gcd = function (a, b) { return b ? gcd(b, a % b) : a; };
	var divisor = gcd(bestNumer, bestDenom);
	bestNumer /= divisor;
	bestDenom /= divisor;

	// If fraction equals 1 (numerator == denominator), add to whole number
	if (bestNumer === bestDenom) {
		return {
			whole: (whole + 1) * Math.sign(decimal || 1),
			numerator: 0,
			denominator: 1
		};
	}

	return {
		whole: whole * Math.sign(decimal || 1),
		numerator: bestNumer,
		denominator: bestDenom
	};
}

// Format a dimension in mm to display string (mm or inches with fractions)
function formatDimension(mm, showFractions) {

	var useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
	if (!useInches) {
		// Metric display
		return parseFloat(mm).toFixed(1)+' mm';
	}

	// Convert to inches
	var inches = mm / MM_PER_INCH;

	// For very small values, show decimal
	if (Math.abs(inches) < 0.01) {
		return inches.toFixed(3)+' in';
	}

	if (!showFractions) {
		// Decimal inches
		return inches.toFixed(3)+' in';
	}

	// Try to convert to fraction
	var frac = decimalToFraction(inches, 64);

	if (!frac) {
		// Couldn't convert to clean fraction, use decimal
		return inches.toFixed(3)+' in';
	}

	// Build fraction string
	var result = '';
	var sign = frac.whole < 0 || inches < 0 ? '-' : '';
	var absWhole = Math.abs(frac.whole);

	if (absWhole > 0) {
		result += sign + absWhole;
		if (frac.numerator > 0) {
			result += ' ';
		}
	} else if (frac.numerator > 0) {
		// No whole part, just fraction - include sign
		result = sign;
	}

	if (frac.numerator > 0) {
		result += frac.numerator + '/' + frac.denominator;
	}

	return result + ' in' || '0' + ' in';
}

// Parse user input dimension back to mm
function parseDimension(value) {
	if (!value) return 0;
	var isInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
	// Convert to string and trim
	value = String(value).trim();

	if(value.indexOf("m")>0) isInches = false;
	else if(value.indexOf("i")>0) isInches = true;

	if (!isInches) {
		// Parse as mm
		return parseFloat(value) || 0;
	}

	// Parse inches - could be decimal or fraction
	// Support formats: "3.5", "3 1/2", "1/4", "3-1/2"

	var whole = 0;
	var numerator = 0;
	var denominator = 1;

	// Check for fraction
	var fractionMatch = value.match(/(\d+)\s*\/\s*(\d+)/);
	if (fractionMatch) {
		numerator = parseInt(fractionMatch[1]);
		denominator = parseInt(fractionMatch[2]);

		// Check for whole number before fraction
		var wholeMatch = value.match(/^(-?\d+)\s+\d+\/\d+/);
		if (wholeMatch) {
			whole = parseInt(wholeMatch[1]);
		}
	} else {
		// Just a decimal or whole number
		whole = parseFloat(value) || 0;
	}

	// Combine and convert to mm
	var totalInches = Math.abs(whole) + (numerator / denominator);
	if (whole < 0 || value.trim().startsWith('-')) {
		totalInches = -totalInches;
	}

	return totalInches * MM_PER_INCH;
}

// Simple conversions
function mmToInches(mm) {
	return mm / MM_PER_INCH;
}

function inchesToMm(inches) {
	return inches * MM_PER_INCH;
}

var clipper = ClipperLib;
var scaleFactor = 4;
var offsetX = 0;
var offsetY = 0;
var selectBox = null;

var cncController = new CncController();

cncController.setupEventListeners();

//canvas.addEventListener('mousewheel', handleScroll, false);

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
//window.addEventListener('resize', function () {
	// Debounce resize events to avoid excessive recalculations
	//clearTimeout(window.resizeTimeout);
	//window.resizeTimeout = setTimeout(function () {
		//centerWorkpiece();
		//redraw();
	//}, 150);
//});

// Keyboard shortcuts
document.addEventListener('keydown', function (evt) {
	// Check if we're in an input field - if so, don't trigger shortcuts
	const tagName = evt.target.tagName.toLowerCase();
	if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
		return;
	}

	const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
	const cmdOrCtrl = isMac ? evt.metaKey : evt.ctrlKey;

	// Ctrl/Cmd + Z: Undo
	if (cmdOrCtrl && evt.key === 'v' && !evt.shiftKey) {
		evt.preventDefault();
		doPaste();
		return;
	}

	// Ctrl/Cmd + Z: Undo
	if (cmdOrCtrl && evt.key === 'z' && !evt.shiftKey) {
		evt.preventDefault();
		doUndo();
		return;
	}

	// Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
	if (cmdOrCtrl && (evt.key === 'y' || (evt.key === 'z' && evt.shiftKey))) {
		evt.preventDefault();
		doRedo();
		return;
	}

	// Ctrl/Cmd + S: Save project
	if (cmdOrCtrl && evt.key === 's') {
		evt.preventDefault();
		saveProject();
		return;
	}

	// Ctrl/Cmd + O: Open SVG (import)
	if (cmdOrCtrl && evt.key === 'o') {
		evt.preventDefault();
		// Trigger the import SVG action
		if (typeof fileInput !== 'undefined') {
			fileInput.click();
		}
		return;
	}

	// Delete key: Delete selected (but not when PathEdit or TabEditor tool is active)
	if (evt.key === 'Delete' || evt.key === 'Backspace') {
		// Check if PathEdit or TabEditor tool is active - if so, let them handle the delete
		if (typeof cncController !== 'undefined' &&
			cncController.operationManager &&
			cncController.operationManager.currentOperation &&
			(cncController.operationManager.currentOperation.name === 'Edit' ||
			 cncController.operationManager.currentOperation.name === 'Tabs')) {
			// Let PathEdit/TabEditor handle the delete key for deleting points/tabs
			return;
		}

		// Check if there are selected paths
		if (selectMgr.selectedPaths().length > 0) {
			evt.preventDefault();
			deleteSelected();
			return;
		}
	}
});

function handleScroll(evt) {
	var mouse = normalizeEventCoords(canvas, evt);
	var zoomX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
	var zoomY = evt.offsetY || (evt.pageY - canvas.offsetTop);

	var delta = evt.wheelDelta ? evt.wheelDelta / 40 : evt.detail ? -evt.detail : 0;
	if (delta) zoom(delta, zoomX, zoomY);
	return evt.preventDefault() && false;
};


function closestPath(pt, clear) {
	var min = 100;
	var svgpath = null;
	var possiblePath = [];


	for (var i = 0; i < svgpaths.length; i++) {
		if (!svgpaths[i].visible) continue;
		if (clear)
			svgpaths[i].highlight = false;
		var bbox = svgpaths[i].bbox;
		if (pointInBoundingBox(pt, bbox)) {
			possiblePath.push(svgpaths[i]);
		}
	}
	if (possiblePath.length == 1)
		svgpath = possiblePath[0];
	else {
		for (var i = 0; i < possiblePath.length; i++) {
			var path = possiblePath[i].path;
			for (var j = 0; j < path.length; j++) {
				var k = (j + 1) % path.length;
				var start = path[j];
				var end = path[k];
				var dist = distToSegmentSquared(pt, start, end);
				if (dist < min) {
					min = dist;
					svgpath = possiblePath[i];
				}
			}
		}
	}
	if (svgpath) {
		svgpath.highlight = true;
	}
	return svgpath;
}

function closestPoint(pt) {
	var min = 10000;
	var cx;
	var cy;

	var possiblePath = [];


	for (var i = 0; i < svgpaths.length; i++) {
		if (!svgpaths[i].visible) continue;
		svgpaths[i].highlight = false;
		var bbox = svgpaths[i].bbox;
		if (pointInBoundingBox(pt, bbox)) {
			possiblePath.push(svgpaths[i].path);
		}
	}

	for (var i = 0; i < possiblePath.length; i++) {

		var path = possiblePath[i];

		for (var j = 0; j < path.length; j++) {
			var k = (j + 1) % path.length;
			var midx = path[j].x + (path[k].x - path[j].x) / 2;
			var midy = path[j].y + (path[k].y - path[j].y) / 2;
			var dx = path[j].x - pt.x;
			var dy = path[j].y - pt.y;
			var dist = dx * dx + dy * dy;
			if (dist < min) {
				min = dist;
				cx = path[j].x;
				cy = path[j].y;
			}
			dx = midx - pt.x;
			dy = midy - pt.y;
			dist = dx * dx + dy * dy;
			if (dist < min) {
				min = dist;
				cx = midx;
				cy = midy;
			}
		}
	}
	return { x: cx, y: cy, dist: min };
}

function load() {
	fileInput.click();
}

// Initialize Paper.js for SVG parsing
function initPaperJS() {
	if (typeof paper === 'undefined') {
		console.error('Paper.js library not loaded');
		return false;
	}

	// Check if Paper.js is already set up
	if (paper.project) {
		return true;
	}

	// Set up Paper.js with the hidden canvas
	var canvas = document.getElementById('paper-canvas');

	if (!canvas) {
		console.error('Paper.js canvas not found');
		return false;
	}

	try {
		paper.setup(canvas);
		return true;
	} catch (error) {
		console.error('Failed to initialize Paper.js:', error);
		return false;
	}
}

// New robust SVG parsing using Paper.js library
function newParseSvgContent(data, name) {
	try {

		// Initialize Paper.js if needed
		if (!initPaperJS()) {
			console.warn('Paper.js initialization failed, falling back to old parser');
			return null;
		}

		// Paper.js is now properly initialized

		// Parse SVG using Paper.js
		if (data.indexOf("Adobe Illustrator") >= 0) {
			pixelsPerInch = 72;
		}
		else if (data.indexOf("woodgears.ca") >= 0) {
			pixelsPerInch = 254; // 100 pixels per mm
		}
		else {
			pixelsPerInch = 96;
		}
		svgscale = viewScale * 25.4 / pixelsPerInch;

		var svgDoc = new DOMParser().parseFromString(data, "image/svg+xml");
		var svgElement = svgDoc.documentElement;

		var paths = [];

		// Parse all path elements
		var pathElements = svgElement.getElementsByTagName('path');
		for (var i = 0; i < pathElements.length; i++) {
			var pathEl = pathElements[i];
			var d = pathEl.getAttribute('d');
			if (d) {
				try {

					var paperPath = new paper.CompoundPath(d);

					var children = paperPath.children;
					for (var j = 0; j < children.length; j++) {
						var child = children[j];
						var convertedPaths = newTransformFromPaperPath(child, "Path");
						paths = paths.concat(convertedPaths);
					}

				} catch (pathError) {
					console.error('Error creating Paper.js path:', pathError);
				}
			}
		}

		// Parse polygon elements
		var polygonElements = svgElement.getElementsByTagName('polygon');
		for (var i = 0; i < polygonElements.length; i++) {
			var polygonEl = polygonElements[i];
			var points = polygonEl.getAttribute('points');
			if (points) {
				try {

					var paperPolygon = new paper.Path();

					// Handle both comma-separated and space-separated coordinate formats
					var pointValues = points.trim().split(/[\s,]+/);
					for (var j = 0; j < pointValues.length; j += 2) {
						if (j + 1 < pointValues.length) {
							var rawX = parseFloat(pointValues[j]);
							var rawY = parseFloat(pointValues[j + 1]);

							if (j === 0) {
								paperPolygon.moveTo(rawX, rawY);
							} else {
								paperPolygon.lineTo(rawX, rawY);
							}
						}
					}
					paperPolygon.closePath();

					var convertedPaths = newTransformFromPaperPath(paperPolygon, "Poly");
					paths = paths.concat(convertedPaths);
				} catch (polygonError) {
					console.error('Error creating polygon:', polygonError);
				}
			}
		}

		// Parse polyline elements
		var polylineElements = svgElement.getElementsByTagName('polyline');
		for (var i = 0; i < polylineElements.length; i++) {
			var polylineEl = polylineElements[i];
			var points = polylineEl.getAttribute('points');
			if (points) {
				var paperPolyline = new paper.Path();

				// Handle both comma-separated and space-separated coordinate formats
				var pointValues = points.trim().split(/[\s,]+/);
				for (var j = 0; j < pointValues.length; j += 2) {
					if (j + 1 < pointValues.length) {
						var rawX = parseFloat(pointValues[j]);
						var rawY = parseFloat(pointValues[j + 1]);

						if (j === 0) {
							paperPolyline.moveTo(rawX, rawY);
						} else {
							paperPolyline.lineTo(rawX, rawY);
						}
					}
				}
				var convertedPaths = newTransformFromPaperPath(paperPolyline, "PolyLine");
				paths = paths.concat(convertedPaths);
			}
		}

		// Parse line elements
		var lineElements = svgElement.getElementsByTagName('line');
		for (var i = 0; i < lineElements.length; i++) {
			var lineEl = lineElements[i];
			var rawX1 = parseFloat(lineEl.getAttribute('x1'));
			var rawY1 = parseFloat(lineEl.getAttribute('y1'));
			var rawX2 = parseFloat(lineEl.getAttribute('x2'));
			var rawY2 = parseFloat(lineEl.getAttribute('y2'));

			var paperLine = new paper.Path();
			paperLine.moveTo(rawX1, rawY1);
			paperLine.lineTo(rawX2, rawY2);

			var convertedPaths = newTransformFromPaperPath(paperLine, "Line");
			paths = paths.concat(convertedPaths);
		}

		// Parse rect elements
		var rectElements = svgElement.getElementsByTagName('rect');
		for (var i = 0; i < rectElements.length; i++) {
			var rectEl = rectElements[i];
			var rawX = parseFloat(rectEl.getAttribute('x') || 0);
			var rawY = parseFloat(rectEl.getAttribute('y') || 0);
			var rawWidth = parseFloat(rectEl.getAttribute('width'));
			var rawHeight = parseFloat(rectEl.getAttribute('height'));

			var paperRect = new paper.Path.Rectangle(rawX, rawY, rawWidth, rawHeight);
			var convertedPaths = newTransformFromPaperPath(paperRect, "Rect");
			paths = paths.concat(convertedPaths);
		}

		// Parse circle elements
		var circleElements = svgElement.getElementsByTagName('circle');
		for (var i = 0; i < circleElements.length; i++) {
			var circleEl = circleElements[i];
			var rawCx = parseFloat(circleEl.getAttribute('cx') || 0);
			var rawCy = parseFloat(circleEl.getAttribute('cy') || 0);
			var radius = parseFloat(circleEl.getAttribute('r'));

			var paperCircle = new paper.Path.Circle(rawCx, rawCy, radius);
			var convertedPaths = newTransformFromPaperPath(paperCircle, "Circle");
			paths = paths.concat(convertedPaths);
		}

		// Parse ellipse elements
		var ellipseElements = svgElement.getElementsByTagName('ellipse');
		for (var i = 0; i < ellipseElements.length; i++) {
			var ellipseEl = ellipseElements[i];
			var rawCx = parseFloat(ellipseEl.getAttribute('cx') || 0);
			var rawCy = parseFloat(ellipseEl.getAttribute('cy') || 0);
			var radiusX = parseFloat(ellipseEl.getAttribute('rx'));
			var radiusY = parseFloat(ellipseEl.getAttribute('ry'));

			var elipse = { center: new paper.Point(rawCx, rawCy), radius: new paper.Size(radiusX, radiusY) };
			var paperEllipse = new paper.Path.Ellipse(elipse);
			var convertedPaths = newTransformFromPaperPath(paperEllipse, "Ellipse");
			paths = paths.concat(convertedPaths);
		}

		// Parse text elements (convert to paths)
		var textElements = svgElement.getElementsByTagName('text');
		for (var i = 0; i < textElements.length; i++) {
			var textEl = textElements[i];
			var rawX = parseFloat(textEl.getAttribute('x') || 0);
			var rawY = parseFloat(textEl.getAttribute('y') || 0);

			var textContent = textEl.textContent || textEl.text || '';

			if (textContent.trim()) {
				try {
					var paperText = new paper.PointText(rawX, rawY);
					paperText.content = textContent;
					paperText.fontSize = parseFloat(textEl.getAttribute('font-size') || 12);

					// Convert text to path
					var textPath = paperText.createPath();
					var convertedPaths = newTransformFromPaperPath(textPath, "Text");
					paths = paths.concat(convertedPaths);
				} catch (textError) {
					console.warn('Could not convert text element to path:', textError);
				}
			}
		}

		// Handle transforms on elements
		var allElements = svgElement.querySelectorAll('*');
		for (var i = 0; i < allElements.length; i++) {
			var element = allElements[i];
			var transform = element.getAttribute('transform');
			if (transform) {
				// Apply transform to the element's path if it exists
				// This is a simplified approach - in a full implementation,
				// you'd want to parse and apply the transform matrix
		}
		}
		addUndo(false, true, false);

		// Generate unique group ID for this SVG import
		const svgGroupId = 'svg-group-' + Date.now();
		const groupedPaths = [];

		for (var i = 0; i < paths.length; i++) {
			paths[i].geom = clipper.JS.Lighten(paths[i].geom, getOption("tolerance"));
			if (paths[i].geom.length > 0) {
				let pathName = paths[i].name + ' ' + svgpathId;
				let id = paths[i].name + svgpathId;
				const pathObj = {
					id: id,
					name: pathName,
					path: paths[i].geom,
					visible: true,
					bbox: boundingBox(paths[i].geom),
					svgGroupId: svgGroupId
				};
				svgpaths.push(pathObj);
				groupedPaths.push(pathObj);
				svgpathId++;
			}

		}

		// Add the SVG group to sidebar after all paths are created
		if (typeof addSvgGroup === 'function' && groupedPaths.length > 0) {
			addSvgGroup(svgGroupId, name, groupedPaths);
		}

		var bbox = boundingBoxPaths(svgpaths);


		return paths;

	} catch (error) {
		console.error('Error parsing SVG with Paper.js:', error);
		// Fallback to old method if Paper.js fails
		return null;
	}
}

function newTransformFromPaperPath(paperPath, name) {
	var paths = [];

	try {
		// Check if the path is valid
		if (!paperPath) {
			console.warn('Paper.js path is null or undefined');
			return paths;
		}

		// Check if the path has segments property
		if (!paperPath.segments) {
			console.warn('Paper.js path has no segments property');
			return paths;
		}

		if (paperPath.segments.length === 0) {
			console.warn('Paper.js path has no segments');
			return paths;
		}

		// Try to flatten the path, but handle potential errors
		var flattenedPath = null;
		try {
			flattenedPath = paperPath.flatten(0.05);
		} catch (flattenError) {
			console.warn('Could not flatten path, using original:', flattenError);
			flattenedPath = paperPath;
		}

		// Ensure we have a valid flattened path
		if (!flattenedPath || !flattenedPath.segments) {
			//console.warn('Flattened path is invalid, using original path');
			flattenedPath = paperPath;
		}

		// Convert to our format
		var geom = [];
		var segments = paperPath.segments;

		for (var i = 0; i < segments.length; i++) {
			var segment = segments[i];
			if (segment && segment.point) {
				geom.push({
					x: segment.point.x * svgscale,
					y: segment.point.y * svgscale
				});
			}
		}

		// Close the path if it's closed and has segments
		if (flattenedPath.closed && segments.length > 0 && segments[0] && segments[0].point) {
			geom.push(geom[0]);
		}

		// Only add path if it has geometry
		if (geom.length > 1) {
			paths.push({
				geom: geom,
				name: name
			});
		} else if (geom.length === 1) {
			// Single point - create a small line segment
			var point = geom[0];
			geom.push({
				x: (point.x + 0.1) * svgscale,
				y: (point.y + 0.1) * svgscale
			});
			paths.push({
				geom: geom,
				name: "Point"
			});
		}

	} catch (error) {
		console.error('Error converting Paper.js path:', error);

		// Try to create a simple path from the original segments
		try {
			if (paperPath && paperPath.segments && paperPath.segments.length > 0) {
				var simpleGeom = [];
				for (var i = 0; i < paperPath.segments.length; i++) {
					var seg = paperPath.segments[i];
					if (seg && seg.point) {
						simpleGeom.push({
							x: seg.point.x * svgscale,
							y: seg.point.y * svgscale
						});
					}
				}
				if (simpleGeom.length > 0) {
					paths.push({
						geom: simpleGeom,
						name: "Seg"
					});
				}
			}
		} catch (fallbackError) {
			console.error('Fallback path conversion also failed:', fallbackError);
		}
	}

	return paths;
}

function boundingBoxPaths(paths) {
	var outterbbox = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity }
	for (var i = 0; i < paths.length; i++) {

		var bbox = paths[i].bbox;
		if (outterbbox.minx > bbox.minx) outterbbox.minx = bbox.minx;
		if (outterbbox.miny > bbox.miny) outterbbox.miny = bbox.miny;
		if (outterbbox.maxx < bbox.maxx) outterbbox.maxx = bbox.maxx;
		if (outterbbox.maxy < bbox.maxy) outterbbox.maxy = bbox.maxy;
	}
	return outterbbox;
}

function boundingBox(path) {
	var bbox = { minx: path[0].x, miny: path[0].y, maxx: path[0].x, maxy: path[0].y }
	for (var i = 0; i < path.length; i++) {
		if (bbox.minx > path[i].x) bbox.minx = path[i].x;
		if (bbox.miny > path[i].y) bbox.miny = path[i].y;
		if (bbox.maxx < path[i].x) bbox.maxx = path[i].x;
		if (bbox.maxy < path[i].y) bbox.maxy = path[i].y;
	}
	if (bbox.maxx - bbox.minx < 2) { bbox.maxx++; bbox.minx--; }
	if (bbox.maxy - bbox.miny < 2) { bbox.maxy++; bbox.miny--; }
	return bbox;
}

// Create a wrapper function that uses the new parsing by default
function parseSvgContent(data, name) {
	return newParseSvgContent(data, name);
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

function clear() {
	ctx.globalAlpha = 1;
	ctx.beginPath();
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = canvasBackgroundColor;
	ctx.fill();
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

function isClockwise(path) {
	var area = 0;
	for (var i = 0; i < path.length; i++) {
		j = (i + 1) % path.length;
		area += path[i].x * path[j].y;
		area -= path[j].x * path[i].y;
	}
	return (area < 0);
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

// Calculate feed rate based on tool and wood species
// Chip load lookup table (mm per tooth) for different wood species
const chipLoadTable = {
	'Pine': { base: 0.15, min: 0.10, max: 0.20 },
	'Oak': { base: 0.08, min: 0.05, max: 0.10 },
	'Maple': { base: 0.10, min: 0.08, max: 0.13 },
	'Cherry': { base: 0.12, min: 0.09, max: 0.15 },
	'Walnut': { base: 0.10, min: 0.07, max: 0.13 },
	'Birch': { base: 0.09, min: 0.07, max: 0.12 },
	'Poplar': { base: 0.16, min: 0.12, max: 0.22 },
	'Cedar': { base: 0.18, min: 0.14, max: 0.24 },
	'Ash': { base: 0.08, min: 0.06, max: 0.11 },
	'Mahogany': { base: 0.13, min: 0.10, max: 0.16 }
};

// Get chip load for a specific material and tool combination
function getChipLoad(woodSpecies, toolDiameter, toolType) {
	// Get material data, default to Oak if species not found
	const materialData = chipLoadTable[woodSpecies] || chipLoadTable['Oak'];
	let chipLoad = materialData.base;

	// Scale by tool diameter (larger tools can handle more chip load)
	// Using square root scaling to be conservative
	const diameterFactor = Math.sqrt(toolDiameter / 6.0); // 6mm reference diameter
	chipLoad *= diameterFactor;

	// Adjust for tool type
	if (toolType === 'VBit') {
		chipLoad *= 0.6; // V-bits are more fragile
	} else if (toolType === 'Drill') {
		chipLoad *= 0.5; // Drills have poor chip clearance
	}

	// Clamp to safe range for this material
	return Math.max(materialData.min, Math.min(materialData.max, chipLoad));
}

function calculateFeedRate(tool, woodSpecies, operation) {
	// Manual mode - return user-specified feed rate
	if (!getOption("autoFeedRate") || !tool) {
		return tool ? tool.feed : 600;
	}

	if (tool.step == undefined) tool.step = tool.depth || 1;
	// Get chip load for this material and tool
	const chipLoad = getChipLoad(woodSpecies, tool.diameter, tool.bit);

	// Get tool parameters with safe defaults
	const rpm = tool.rpm || 18000;
	const flutes = tool.flutes || 2;

	// Base feed rate calculation: Feed = RPM × Flutes × Chip Load
	let feedRate = rpm * flutes * chipLoad;

	// Adjust for depth of cut (deeper cuts need slower feeds)
	// Conservative approach: reduce feed by up to 50% for deep cuts
	const maxRecommendedDepth = tool.diameter; // Rule of thumb: max depth = tool diameter
	const depthRatio = Math.min(1.0, tool.step / maxRecommendedDepth);
	const depthFactor = Math.max(0.5, 1.0 - (depthRatio * 0.5));
	feedRate *= depthFactor;

	// Adjust for radial engagement based on operation type
	// Profile cuts (Inside, Outside, Center): 100% engagement (full side of bit cutting)
	// Pocket operations: engagement = stepover percentage (partial engagement)
	let radialEngagement;
	if (operation === 'Pocket') {
		// Pocket: only stepover% of bit is engaged with fresh material
		radialEngagement = tool.stepover / 100;
	} else {
		// Profile cuts: entire side of bit is cutting = 100% engagement
		radialEngagement = 1.0;
	}

	// Apply feed reduction based on radial engagement
	// Higher engagement = more material contact = need slower feed
	// Conservative: reduce by up to 50% for full engagement
	const engagementFactor = Math.max(0.5, 1.0 - (radialEngagement * 0.5));
	feedRate *= engagementFactor;

	// Apply wood species fine-tuning multiplier if available
	if (typeof woodSpeciesDatabase !== 'undefined') {
		const speciesData = woodSpeciesDatabase[woodSpecies];
		if (speciesData && speciesData.feedMultiplier) {
			feedRate *= speciesData.feedMultiplier;
		}
	}

	// Get user-configured limits from options
	const minFeed = getOption('minFeedRate') || 100;
	const maxFeed = getOption('maxFeedRate') || 3000;

	// Ensure reasonable bounds
	return Math.max(minFeed, Math.min(maxFeed, Math.round(feedRate)));
}

// Calculate Z feed rate (plunge rate)
function calculateZFeedRate(tool, woodSpecies, operation) {
	// Manual mode - return user-specified Z feed rate
	if (!getOption("autoFeedRate") || !tool) {
		return tool ? tool.zfeed : 200;
	}

	// Z feed is typically 25-35% of XY feed for wood
	const xyFeed = calculateFeedRate(tool, woodSpecies, operation);
	let zFeedRate = xyFeed * 0.3;

	// Additional reduction for deep plunges
	// Plunging is more aggressive than lateral cutting
	const diameter = tool.diameter;
	const step = tool.step || 1;

	if (step > diameter * 0.5) {
		// Deep plunge (more than 50% of diameter) - reduce further
		zFeedRate *= 0.7;
	}

	// Drills and V-bits need even slower plunge rates
	if (tool.bit === 'Drill') {
		zFeedRate *= 0.8; // Drills need slower plunge for chip evacuation
	} else if (tool.bit === 'VBit') {
		zFeedRate *= 0.75; // V-bits are fragile at the tip
	}

	// Get user-configured limits from options
	// Z feed max is typically lower than XY feed max
	const minFeed = getOption('minFeedRate') || 50;
	const maxFeed = Math.min(500, getOption('maxFeedRate') || 500);

	// Ensure reasonable bounds
	return Math.max(minFeed, Math.min(maxFeed, Math.round(zFeedRate)));
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

function getBack(len, x1, y1, x2, y2) {
	return x2 - (len * (x2 - x1) / (Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2))));
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

function toolChanged(tool) {
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].tool.id == tool.id)
			toolpaths[i].tool = tool;
	}
	redraw();
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

function subdividePath(path, size) {
	var points = [];
	for (var i = 0; i < path.length - 1; i++) {
		var j = (i + 1) % path.length;
		var point = path[i];
		var next = path[j];
		var x1 = point.x;
		var y1 = point.y;
		var x2 = next.x;
		var y2 = next.y;
		var dx = (x2 - x1);
		var dy = (y2 - y1);
		var len = Math.max(Math.abs(dx), Math.abs(dy));

		var count = Math.floor(len / size);
		if (count == 0)
			count = 2;
		if (count > 8)
			count = 8;


		dx = dx / count;
		dy = dy / count;


		for (var p = 0; p < count; p++) {
			points.push({ x: x1 + p * dx, y: y1 + p * dy });
		}
		points.push({ x: x2, y: y2 });
	}

	return points;
}

function makeNorms(subpath, path, cw, r, outside) {

	norms = [];

	for (var i = 0; i < subpath.length; i++) {
		var j = (i + 1) % subpath.length;
		var k = (i + subpath.length - 1) % subpath.length;
		var point = subpath[i];
		var next = subpath[j];
		var prev = subpath[k];
		var x1 = point.x;
		var y1 = point.y;
		var x2 = next.x;
		var y2 = next.y;
		var x3 = prev.x;
		var y3 = prev.y;
		var dx = x2 - x3;
		var dy = y2 - y3;

		var dnorm = Math.sqrt(dx * dx + dy * dy);


		if (dnorm != 0) {
			dx = dx / dnorm;
			dy = dy / dnorm;

			var t = dx;
			if (cw) {

				dx = dy;
				dy = -t;
			}
			else {
				dx = -dy;
				dy = t;
			}


			/*
			 * var nr = r; var pt = {x:x1+dx*nr,y:y1+dy*nr}; var count =
			 * lineIntersectsPath({x:x1+dx*0.1,y:y1+dy*0.1},pt,path);
			 * while(count > 0 && nr > 0.1) { nr = nr/2; pt =
			 * {x:x1+dx*nr,y:y1+dy*nr}; count =
			 * lineIntersectsPath({x:x1,y:y1},pt,path); }
			 */
			var pt = { x: x1 + dx * r, y: y1 + dy * r };
			if (!outside && pointInPolygon(pt, subpath)) {
				norms.push({ x1: x1, y1: y1, x2: pt.x, y2: pt.y, dx: dx, dy: dy });
			}
			else if (outside && !pointInPolygon(pt, subpath)) {
				norms.push({ x1: x1, y1: y1, x2: pt.x, y2: pt.y, dx: dx, dy: dy });
			}
		}
		else {
			}


	}


	return norms;
}

function sqr(x) {
	return x * x
}
function dist2(v, w) {
	return sqr(v.x - w.x) + sqr(v.y - w.y)
}

function distToSegmentSquared(p, v, w) {
	var l2 = dist2(v, w);

	if (l2 == 0) {
		return dist2(p, v);
	}


	var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;

	if (t < 0) return dist2(p, v);
	if (t > 1) return dist2(p, w);


	return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

function distanceToClosestPath(pt, path, r) {

	var rs = r * r;
	min = Infinity

	for (var i = 0; i < path.length - 1; i++) {
		var j = (i + 1) % path.length;
		var start = path[i];
		var end = path[j];
		var dist = distToSegmentSquared(pt, start, end);
		if (dist < min) min = dist;
	}
	return Math.sqrt(min);
}


function isPointInCircle(pt, path, r) {

	var rs = r * r;

	for (var i = 0; i < path.length - 1; i++) {
		var j = (i + 1) % path.length;
		var start = path[i];
		var end = path[j];
		var dist = distToSegmentSquared(pt, start, end);

		if (dist < rs) {
			var diff = rs - dist;
			if (diff > 0.01) {
				//debug.push({p:pt,s:start,e:end});
				//console.log("diff = "+(rs-dist));
				return Math.sqrt(dist);
			}
		}
	}
	return r;
}

function pointInBoundingBox(point, bbox) {
	return (point.x > bbox.minx && point.x < bbox.maxx && point.y > bbox.miny && point.y < bbox.maxy);
}

function nearbyPaths(svgpath, radius) {
	nearbypaths = [];
	var bbox = {};
	var d = 2 * radius;

	Object.assign(bbox, svgpath.bbox);
	bbox.minx -= d;
	bbox.maxx += d;
	bbox.miny -= d;
	bbox.maxy += d;

	var paths = [];
	for (var j = 0; j < svgpaths.length; j++) {
		if (svgpaths[j].visible) {
			var p1 = { x: svgpaths[j].bbox.minx, y: svgpaths[j].bbox.miny };
			var p2 = { x: svgpaths[j].bbox.minx, y: svgpaths[j].bbox.maxy };
			var p3 = { x: svgpaths[j].bbox.maxx, y: svgpaths[j].bbox.maxy };
			var p4 = { x: svgpaths[j].bbox.maxx, y: svgpaths[j].bbox.miny };
			if (pointInBoundingBox(p1, bbox) || pointInBoundingBox(p2, bbox) || pointInBoundingBox(p3, bbox) || pointInBoundingBox(p4, bbox))
				paths.push(svgpaths[j]);
		}
	}
	return paths;
}

function newbitFits(point, r) {
	let min = Infinity;
	for (var j = 0; j < nearbypaths.length; j++) {
		var path = nearbypaths[j].path;
		var dist = distanceToClosestPath(point, path, r);
		if (dist < min) min = dist;
	}
	if (Math.abs(min - r) > 0.01)
		return false;
	return true;
}

function bitFits(point, r) {
	for (var j = 0; j < nearbypaths.length; j++) {
		var path = nearbypaths[j].path;
		var dist = isPointInCircle(point, path, r);
		if (dist < r)
			return false;
	}
	return true;
}

function toLocal(norm, path) {
	local = [];

	var theta = Math.atan2(-norm.dy, norm.dx) - Math.PI / 2;
	//theta = Math.atan2(1,0)-Math.PI/2;
	var sinTheta = Math.sin(theta);
	var cosTheta = Math.cos(theta);

	for (var i = 0; i < path.length; i++) {
		var dx = path[i].x - norm.x1;
		var dy = path[i].y - norm.y1;



		var lx = cosTheta * dx - sinTheta * dy;
		var ly = sinTheta * dx + cosTheta * dy;
		local.push({ x: lx, y: ly });
	}
	//drawPath(local,'#ff0000',2);
	return local;
}

function bitFitsSubpath(point, r, subpath) {

	var dist = isPointInCircle(point, subpath, r);
	if (dist < r)
		return false;

	return true;
}




function bitFitsTool(point, r) {
	for (var j = 0; j < toolpaths.length; j++) {
		var paths = toolpaths[j].paths;
		for (var p = 0; p < paths.length; p++) {
			var path = paths[p].tpath;
			var dist = isPointInCircle(point, path, r);
			if (dist < r)
				return false;
		}
	}
	return true;
}

function checkLineIntersection(line1Start, line1End, line2Start, line2End) {
	// if the lines intersect, the result contains the x and y of the
	// intersection (treating the lines as infinite) and booleans for whether
	// line segment 1 or line segment 2 contain the point
	var denominator, a, b, numerator1, numerator2, result = {
		x: null,
		y: null,
		onLine1: false,
		onLine2: false
	};
	denominator = ((line2End.y - line2Start.y) * (line1End.x - line1Start.x)) - ((line2End.x - line2Start.x) * (line1End.y - line1Start.y));
	if (denominator == 0) {
		return result;
	}
	a = line1Start.y - line2Start.y;
	b = line1Start.x - line2Start.x;
	numerator1 = ((line2End.x - line2Start.x) * a) - ((line2End.y - line2Start.y) * b);
	numerator2 = ((line1End.x - line1Start.x) * a) - ((line1End.y - line1Start.y) * b);
	a = numerator1 / denominator;
	b = numerator2 / denominator;

	// if we cast these lines infinitely in both directions, they intersect
	// here:
	result.x = line1Start.x + (a * (line1End.x - line1Start.x));
	result.y = line1Start.y + (a * (line1End.y - line1Start.y));

	// if line1 is a segment and line2 is infinite, they intersect if:
	if (a > 0 && a < 1) {
		result.onLine1 = true;
	}
	// if line2 is a segment and line1 is infinite, they intersect if:
	if (b > 0 && b < 1) {
		result.onLine2 = true;
	}
	// if line1 and line2 are segments, they intersect if both of the above are
	// true
	return result;
}

function lineIntersectsPath(p0, p1, path) {
	count = 0;
	for (var i = 0, j = path.length - 2; i < path.length - 1; j = i++) {
		var p2 = { x: path[i].x, y: path[i].y };
		var p3 = { x: path[j].x, y: path[j].y };
		count += lineIntersects(p0, p1, p2, p3);
	}
	return count;
}

function lineIntersects(p0, p1, p2, p3) {

	var s1_x, s1_y, s2_x, s2_y;
	s1_x = p1.x - p0.x;
	s1_y = p1.y - p0.y;
	s2_x = p3.x - p2.x;
	s2_y = p3.y - p2.y;

	var s, t;
	s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
	t = (s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

	if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
		// Collision detected
		return 1;
	}

	return 0; // No collision
}

function pointInPolygon(point, path) {

	var x = point.x, y = point.y;

	var inside = false;
	for (var i = 0, j = path.length - 2; i < path.length - 1; j = i++) {
		var xi = path[i].x, yi = path[i].y;
		var xj = path[j].x, yj = path[j].y;

		var intersect = ((yi > y) != (yj > y))
			&& (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}

	return inside;
}

function bitPos(start, end) {
	var x1 = start.x;
	var x2 = end.x;
	var y1 = -start.y;
	var y2 = -end.y;
	var r = -1;

	if (Math.abs(x1 - x2) < 0.1) // vertical case
	{
		r = x1;
		if (r < y1 && r > y2)
			return r;
		else
			return -1;
	}
	else if (Math.abs(y1 - y2) < 0.1) // horizontal case
	{
		if (y1 > 0) {
			r = y1 / 2;
			if (x1 < 0 && x2 > 0)
				return r;
		}
		return -1;
	}
	else // general case
	{
		var m = (y2 - y1) / (x2 - x1);
		var b = y1 - (m * x1);
		var l = m + 1 / m;

		var A = 1 + m * m - 2 * m * l;
		var B = -2 * l * b;
		var C = -(b * b);
		var quad = B * B - 4 * A * C;
		if (quad > 0) {
			var Xp = (-B + Math.sqrt(quad)) / 2 * A;
			var Xn = (-B - Math.sqrt(quad)) / 2 * A;
			if (Math.min(x1, x2) <= Xp && Xp <= Math.max(x1, x2))
				return Math.abs(Xp * l + b);
			else if (Math.min(x1, x2) <= Xn && Xn <= Math.max(x1, x2))
				return Math.abs(Xn * l + b);
		}

		return r;

	}

}

function vbitRadius(tool) {
	if (tool.bit != "VBit") return tool.diameter / 2;
	var depth = tool.depth || 1;
	var angle = tool.angle * Math.PI / 180.0;
	var r = depth / Math.sin(angle / 2) / 2;
	if (r > tool.diameter / 2) r = tool.diameter / 2;

	return r;
}

function largestEmptyCircles(norms, startRadius, subpath) {
	var circles = [];

	for (var i = 0; i < norms.length; i++) {
		var n = norms[i];
		var inc = 0.1;
		var point = {};


		for (var r = startRadius; r > 0; r -= inc) {
			point.x = n.x1 + (n.dx * r);
			point.y = n.y1 + (n.dy * r);
			if (newbitFits(point, r) || r <= inc) {
				point.r = r;
				circles.push(point);
				drawCircle(point);
				break;
			}
		}


		/*
				for (var r = inc; r < startRadius; r += inc) {
					point.x = n.x1 + (n.dx * (r + inc));
					point.y = n.y1 + (n.dy * (r + inc));
					if (!bitFits(point, r) || r >= startRadius - 1) {
						point.r = r;
						circles.push(point);
						drawCircle(point);
						break;
					}
				}
				*/
	}

	if (circles.length > 0) {
		var first = circles[0];
		circles.push(first);
	}

	return circles;
}


function setVisibility(id, visible) {
	for (var i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i].id == id) {
			svgpaths[i].visible = visible;
		}
	}
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].id == id) {
			toolpaths[i].visible = visible;
		}
	}
	redraw();
}

function doRemoveToolPath(id) {
	for (var i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i].id == id) {
			svgpaths.splice(i, 1);
			removeSvgPath(id);
			break;
		}
	}
	for (var i = toolpaths.length - 1; i >= 0; i--) {
		var toremove = [];
		if (toolpaths[i].id == id || toolpaths[i].tool.name == id) {
			toolpaths.splice(i, 1);
			removeToolPath(id);
		}
	}

	// Refresh the toolpath display to remove empty folders
	if (typeof refreshToolPathsDisplay === 'function') {
		refreshToolPathsDisplay();
	}

	redraw();
}

function deleteSelected() {
	// Get all selected paths and delete them
	const selectedPaths = selectMgr.selectedPaths();
	if (selectedPaths.length === 0) return;

	// Add undo point before deleting
	addUndo(false, true, false);

	// Delete each selected path
	selectedPaths.forEach(path => {
		doRemoveToolPath(path.id);
	});

	selectMgr.unselectAll();
	redraw();
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

function addUndo(toolPathschanged = false, svgPathsChanged = false, originChanged = false) {

	if (toolPathschanged || svgPathsChanged || originChanged) {
		var project = {
			toolpaths: toolPathschanged ? toolpaths : null,
			svgpaths: svgPathsChanged ? svgpaths : null,
			origin: originChanged ? origin : null
		};
		if (undoList.length < MAX_UNDO) {
			undoList.push(JSON.stringify(project));
		}
		else {
			undoList.shift();
			undoList.push(JSON.stringify(project));
		}
		// Clear redo list when a new action is performed
		redoList = [];
	}

}

function doPaste() {
	let paths = selectMgr.selectedPaths();

	if (paths.length === 0) {
		notify('Select a path to Paste');
		return;
	}
	else {
		selectMgr.unselectAll();
		addUndo(false, true, false);
		for (let i = 0; i < paths.length; i++) {
			let path = paths[i];
			let newPath = JSON.parse(JSON.stringify(path));
			newPath.id = 'S' + svgpathId;
			if(newPath.name.indexOf(' copy') == -1)
				newPath.name = newPath.name + ' copy';
			newPath.path = newPath.path.map(pt => ({
                x: pt.x + 0*viewScale,
                y: pt.y + 0*viewScale
            }));
            newPath.bbox = boundingBox(newPath.path);
			svgpaths.push(newPath);
			addSvgPath(newPath.id, newPath.name);
			svgpathId++;
			selectMgr.selectPath(newPath);
		}

	}
	doMove();
	redraw();
}

function doUndo() {
	if (undoList.length == 0) return;

	// Save current state to redo list before undoing
	var currentProject = {
		toolpaths: toolpaths,
		svgpaths: svgpaths,
		origin: origin
	};
	if (redoList.length < MAX_UNDO) {
		redoList.push(JSON.stringify(currentProject));
	} else {
		redoList.shift();
		redoList.push(JSON.stringify(currentProject));
	}

	var project = JSON.parse(undoList.pop());

	if (project.origin) origin = project.origin;
	if (project.toolpaths) {
		clearToolPaths();
		toolpaths = project.toolpaths;
		toolpathId = 1;
		for (var i in toolpaths) {
			toolpaths[i].id = 'T' + toolpathId;
			addToolPath('T' + toolpathId, toolpaths[i].operation + ' ' + toolpathId, toolpaths[i].operation, toolpaths[i].tool.name);
			toolpathId++;
		}
	}
	if (project.svgpaths) {
		clearSvgPaths();
		selectMgr.unselectAll();
		svgpaths = project.svgpaths;
		svgpathId = 1;
		for (var i in svgpaths) {
			addSvgPath(svgpaths[i].id, svgpaths[i].name);
			svgpathId++;
		}
	}
	redraw();
}

function doRedo() {
	if (redoList.length == 0) return;

	// Save current state to undo list before redoing
	var currentProject = {
		toolpaths: toolpaths,
		svgpaths: svgpaths,
		origin: origin
	};
	if (undoList.length < MAX_UNDO) {
		undoList.push(JSON.stringify(currentProject));
	} else {
		undoList.shift();
		undoList.push(JSON.stringify(currentProject));
	}

	var project = JSON.parse(redoList.pop());

	if (project.origin) origin = project.origin;
	if (project.toolpaths) {
		clearToolPaths();
		toolpaths = project.toolpaths;
		toolpathId = 1;
		for (var i in toolpaths) {
			toolpaths[i].id = 'T' + toolpathId;
			addToolPath('T' + toolpathId, toolpaths[i].operation + ' ' + toolpathId, toolpaths[i].operation, toolpaths[i].tool.name);
			toolpathId++;
		}
	}
	if (project.svgpaths) {
		clearSvgPaths();
		selectMgr.unselectAll();
		svgpaths = project.svgpaths;
		svgpathId = 1;
		for (var i in svgpaths) {
			addSvgPath(svgpaths[i].id, svgpaths[i].name);
			svgpathId++;
		}
	}
	redraw();
}


async function saveProject() {
	var project = {
		toolpaths: toolpaths,
		svgpaths: svgpaths,
		origin: origin,
		tools: tools,
		options: options,
		gcodeProfile: currentGcodeProfile  // Save the full post-processor profile
	};

	var json = JSON.stringify(project);

	// Use the File System Access API if available (modern browsers)
	if ('showSaveFilePicker' in window) {
		try {
			const fileHandle = await window.showSaveFilePicker({
				suggestedName: currentFileName + ".json",
				types: [{
					description: 'JSON files',
					accept: { 'application/json': ['.json'] }
				}]
			});
			const writable = await fileHandle.createWritable();
			await writable.write(json);
			await writable.close();
			notify('Project saved successfully');
			return;
		} catch (err) {
			if (err.name !== 'AbortError') {
				console.error('Error saving file:', err);
				// Continue to fallback method on error
			} else {
				// User cancelled the dialog
				return;
			}
		}
	}

	// Fallback: prompt for filename and use download method
	var filename = prompt("Enter filename for project save:", currentFileName + ".json");
	if (!filename) {
		return; // User cancelled
	}

	// Ensure .json extension
	if (!filename.endsWith('.json')) {
		filename += '.json';
	}

	var blob = new Blob([json], { type: "application/json" });
	var url = URL.createObjectURL(blob);
	var a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	notify('Project download started');
}

function loadProject(json) {

	newProject();

	var project = JSON.parse(json);
	origin = project.origin;
	toolpaths = project.toolpaths;
	svgpaths = project.svgpaths;

	// Restore tools and options if they exist in the project file
	if (project.tools) {
		tools = project.tools;
		// Update tools display if using Bootstrap layout
		if (typeof refreshToolsGrid === 'function') {
			refreshToolsGrid();
		}

	}

	if (project.options) {
		options = project.options;
		// Update options display if using Bootstrap layout
		if (typeof refreshOptionsDisplay === 'function') {
			refreshOptionsDisplay();
		}

	}

	// Restore G-code post-processor profile
	if (project.gcodeProfile) {
		// First, check if a profile with the same ID exists locally
		var existingProfile = gcodeProfiles.find(p => p.recid === project.gcodeProfile.recid);

		if (existingProfile) {
			// Use the local profile (allows local updates to be applied)
			currentGcodeProfile = existingProfile;
		} else {
			// Profile doesn't exist locally, so add the saved profile to the system
			gcodeProfiles.push(project.gcodeProfile);
			currentGcodeProfile = project.gcodeProfile;
			// Save the updated profiles to localStorage so it persists
			localStorage.setItem('gcodeProfiles', JSON.stringify(gcodeProfiles));
		}

		// Update the G-code profile selector UI to reflect the loaded profile
		if (typeof populateGcodeProfileSelector === 'function') {
			populateGcodeProfileSelector();
		}
	}

	svgpathId = 1;
	for (var i in svgpaths) {
		addSvgPath(svgpaths[i].id, svgpaths[i].name);
		svgpathId++;
	}
	toolpathId = 1;
	for (var i in toolpaths) {
		toolpaths[i].id = 'T' + toolpathId;
		addToolPath('T' + toolpathId, toolpaths[i].operation + ' ' + toolpathId, toolpaths[i].operation, toolpaths[i].tool.name);
		toolpathId++;
	}

	cncController.setMode("Select");
	redraw();
}

// Calculate origin coordinates based on position and workpiece dimensions
function calculateOriginFromPosition(position, width, length) {
	switch (position) {
		case 'top-left':
			return { x: 0, y: 0 };
		case 'top-center':
			return { x: width / 2, y: 0 };
		case 'top-right':
			return { x: width, y: 0 };
		case 'middle-left':
			return { x: 0, y: length / 2 };
		case 'middle-center':
			return { x: width / 2, y: length / 2 };
		case 'middle-right':
			return { x: width, y: length / 2 };
		case 'bottom-left':
			return { x: 0, y: length };
		case 'bottom-center':
			return { x: width / 2, y: length };
		case 'bottom-right':
			return { x: width, y: length };
		default:
			return { x: width / 2, y: length / 2 };
	}
}

function newProject() {



	toolpathId = 1;
	svgpathId = 1;
	toolpaths = [];
	svgpaths = [];
	norms = [];
	debug = [];
	vlocal = [];
	nearbypaths = [];
	undoList = [];
	clearToolPaths();
	clearSvgPaths();
	selectMgr.unselectAll();

	// Center the workpiece in the canvas viewport
	centerWorkpiece();
	cncController.setMode("Select");
	loadOptions();
	loadTools();
	const width = getOption("workpieceWidth") * viewScale;
	const length = getOption("workpieceLength") * viewScale;
	const originPosition = getOption("originPosition") || 'middle-center';

	// Calculate origin based on saved position preference
	const originCoords = calculateOriginFromPosition(originPosition, width, length);
	origin.x = originCoords.x;
	origin.y = originCoords.y;

	redraw();
}

function doSelect(id) {
	cncController.setMode("Select");

	for (var i = 0; i < svgpaths.length; i++) {

		if (svgpaths[i].id == id) {
			if (selectMgr.isSelected(svgpaths[i])) selectMgr.unselectPath(svgpaths[i]);
			else selectMgr.selectPath(svgpaths[i]);
			break;
		}
	}
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].id == id) {
			toolpaths[i].selected = !toolpaths[i].selected;
			break;
		}
	}
	redraw();
}

function offsetPath(svgpath, radius, outside) {
	var offset = new clipper.ClipperOffset(20, 0.025);
	offset.AddPath(svgpath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
	var sol = [];
	if (outside)
		offset.Execute(sol, radius);
	else
		offset.Execute(sol, -radius);

	for (var i = 0; i < sol.length; i++) {
		sol[i].push(sol[i][0]); // close path
	}
	return sol;
}

function offset(path, r, outside) {
	var offsetPath = [];
	var cw = isClockwise(path);
	if (!outside) cw = !cw;

	for (var i = 0; i < path.length - 1; i++) {
		var j = (i + 1) % (path.length - 1);
		var k = (i + 2) % (path.length - 1);
		var pi = path[i];
		var pj = path[j];
		var pk = path[k];

		var dx = pi.x - pj.x;
		var dy = pi.y - pj.y;

		var dx2 = pj.x - pk.x;
		var dy2 = pj.y - pk.y;

		var dnorm = Math.sqrt(dx * dx + dy * dy);
		var dnorm2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);


		if (dnorm != 0 && dnorm2 != 0) {
			dx = dx / dnorm;
			dy = dy / dnorm;

			dx2 = dx2 / dnorm2;
			dy2 = dy2 / dnorm2;

			var t = dx;
			var t2 = dx2;
			if (cw) {
				dx = dy;
				dy = -t;
				dx2 = dy2;
				dy2 = -t2;
			}
			else {
				dx = -dy;
				dy = t;
				dx2 = -dy2;
				dy2 = t2;
			}

			var p1 = { x: pi.x + dx * r, y: pi.y + dy * r };
			var p2 = { x: pj.x + dx * r, y: pj.y + dy * r };
			var p3 = { x: pj.x + dx2 * r, y: pj.y + dy2 * r };
			var p4 = { x: pk.x + dx2 * r, y: pk.y + dy2 * r };

			if (p2.x == p3.x && p2.y == p3.y) {
				offsetPath.push(p2);
			}
			else {
				var point = checkLineIntersection(p1, p2, p3, p4);
				offsetPath.push(point);
			}
		}
	}
	if (offsetPath.length > 0) {
		var first = offsetPath[0];
		offsetPath.push(first);
	}


	return offsetPath;
}

function checkPath(path, r) {
	circles = [];
	for (var i = 0; i < path.length; i++) {
		var point = path[i];
		if (bitFits(point, r)) {
			point.r = r;
			circles.push(point);
		}
	}
	if (circles.length > 0) {
		var first = circles[0];
		circles.push(first);
	}
	return circles;
}

function checkPathTool(path, r, stepover) {
	circles = [];
	for (var i = 0; i < path.length; i++) {
		var point = path[i];
		if (bitFits(point, stepover)) {
			point.r = r;
			circles.push(point);
		}
	}
	if (circles.length > 0) {
		var first = circles[0];
		circles.push(first);
	}
	return circles;
}

function addCircles(path, r) {
	circles = [];
	for (var i = 0; i < path.length; i++) {
		var point = path[i];
		point.r = r;
		circles.push(point);
	}

	return circles;
}


function pushToolPath(paths, name, operation, svgId = null, svgIds = null) {
	addUndo(true, false, false);

	// Create toolpath object with tool data
	const toolpathData = {
		id: "T" + toolpathId,
		paths: paths,
		visible: true,
		operation: operation,
		name: name,
		tool: { ...currentTool },
		svgId: svgId || (svgIds && svgIds.length > 0 ? svgIds[0] : null),  // Backward compatibility
		svgIds: svgIds  // Store array of all source SVG path IDs for multi-path operations
	};

	// If toolpath properties were set (from the new properties panel), store them
	if (window.currentToolpathProperties) {
		toolpathData.toolpathProperties = { ...window.currentToolpathProperties };
	}

	toolpaths.push(toolpathData);
	addToolPath('T' + toolpathId, name + ' ' + toolpathId, name, currentTool.name);
	toolpathId++;

	redraw();
}
function doProfile() {
	if (currentTool.inside == "inside")
		doInside();
	else if (currentTool.inside == "outside")
		doOutside();
	else
		doCenter();
}
function doOutside() {
	if (selectMgr.noSelection()) {
		notify('Select a path to Profile');
		return;
	}

	setMode("Outside");
	var radius = toolRadius();
	var name = 'Outside';

	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i];
		var path = svgpath.path;

		var offsetPaths = offsetPath(path, radius, true);

		for (var p = 0; p < offsetPaths.length; p++) {
			var path = offsetPaths[p];
			var subpath = subdividePath(path, 2);
			var circles = checkPath(subpath, radius - 1);

			//var tpath1 = clipper.Clipper.SimplifyPolygon(circles,ClipperLib.PolyFillType.pftNonZero);   
			var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));

			//var tpath2 = window.simplify(circles,0.1,true);
			if (currentTool.direction != "climb") {
				var rcircles = reversePath(circles);
				var rtpath = reversePath(tpath);
				paths.push({ path: rcircles, tpath: rtpath });
			}
			else {
				paths.push({ path: circles, tpath: tpath });
			}

		}
		pushToolPath(paths, name, 'Profile', svgpath.id);
	}
}

function reversePath(path) {
	var reverse = [];
	for (i = path.length - 1; i >= 0; i--)
		reverse.push(path[i]);
	return reverse;
}

function doInside() {
	if (selectMgr.noSelection()) {
		notify('Select a path to Profile');
		return;
	}
	setMode("Inside");

	var radius = toolRadius();
	var name = 'Inside';
	
	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i];
		var path = svgpath.path;

		var offsetPaths = offsetPath(path, radius, false);

		for (var p = 0; p < offsetPaths.length; p++) {
			var path = offsetPaths[p];
			var subpath = subdividePath(path, 2);
			var circles = checkPath(subpath, radius - 1);
			//var tpath = window.simplify(circles,0.1,true);
			var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));
			if (currentTool.direction == "climb") {
				var rcircles = reversePath(circles);
				var rtpath = reversePath(tpath);
				paths.push({ path: rcircles, tpath: rtpath });
			}
			else {
				paths.push({ path: circles, tpath: tpath });
			}
		}
		pushToolPath(paths, name, 'Profile', svgpath.id);
	}
}

function doCenter() {
	if (selectMgr.noSelection()) {
		notify('Select a path to center cut');
		return;
	}

	setMode("Center");
	var radius = toolRadius();
	var name = 'Center';

	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i];
		var path = svgpath.path;
		//var subpath = subdividePath(path, 2);
		var circles = addCircles(path, radius);
		var tpath = path;
		//var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));
		//if(svgpaths[i].id.indexOf("Line") >=0 )
		//tpath.pop(); // remove last point if not a closed path

		if (currentTool.direction != "climb") {
			var rcircles = reversePath(circles);
			var rtpath = reversePath(tpath);
			paths.push({ path: rcircles, tpath: rtpath });
		}
		else {
			paths.push({ path: circles, tpath: tpath });
		}

		pushToolPath(paths, name, 'Profile', svgpath.id);
	}

}

function doOrigin() {
	cncController.setMode("Origin");
}

function doWorkpiece() {
	cncController.setMode("Workpiece");
}

function doPan() {
	cncController.setMode("Pan");
}

function doMove() {
	cncController.setMode("Move");
}

function doEditPoints() {
	cncController.setMode("Edit");
}

function doBoolean() {
	cncController.setMode("Boolean");
}

function doGemini() {
	cncController.setMode("Gemini");
}

function doPen() {
	cncController.setMode("Pen");
	selectMgr.unselectAll();
}


function doShape() {
	cncController.setMode("Shape");
	selectMgr.unselectAll();
}

function doText() {
	cncController.setMode("Text");
	//selectMgr.unselectAll();
}

function doDrill() {
	cncController.setMode("Drill");
	setMode("Select");
}

function doTabEditor() {
	cncController.setMode("Tabs");
}

function makeHole(pt) {
	var name = 'Drill';

	// Check if we should read from properties panel
	if (window.toolpathPropertiesManager && window.toolpathPropertiesManager.hasOperation('Drill')) {
		// Try to collect form data from the properties panel
		try {
			const data = window.toolpathPropertiesManager.collectFormData();
			// Save drill properties to localStorage for persistence between sessions
			window.toolpathPropertiesManager.updateDefaults('Drill', data);
			const selectedTool = window.toolpathPropertiesManager.getToolById(data.toolId);

			if (selectedTool) {
				// Temporarily set current tool and properties
				const originalTool = window.currentTool;
				window.currentTool = {
					...selectedTool,
					depth: data.depth || selectedTool.depth,
					step: data.step || selectedTool.step
				};

				// Store properties for pushToolPath
				window.currentToolpathProperties = { ...data };

				var radius = toolRadius();
				var paths = [];
				paths.push({ tpath: [{ x: pt.x, y: pt.y, r: radius }], path: [{ x: pt.x, y: pt.y, r: radius }] });

				// Track toolpath count before creation
				const beforeCount = toolpaths.length;

				pushToolPath(paths, name, 'Drill', null);

				// Mark the newly created drill path as active
				if (toolpaths.length > beforeCount && typeof setActiveToolpaths === 'function') {
					const newToolpath = toolpaths[toolpaths.length - 1];
					setActiveToolpaths([newToolpath]);
				}

				// Restore original tool and clear properties
				window.currentTool = originalTool;
				window.currentToolpathProperties = null;
				return;
			}
		} catch (e) {
			// If properties panel not available or form incomplete, fall through to default
		}
	}

	// Fallback to default behavior (using currentTool directly)
	var radius = toolRadius();
	var paths = [];
	paths.push({ tpath: [{ x: pt.x, y: pt.y, r: radius }], path: [{ x: pt.x, y: pt.y, r: radius }] });

	// Track toolpath count before creation
	const beforeCount = toolpaths.length;

	pushToolPath(paths, name, 'Drill', null);

	// Mark the newly created drill path as active
	if (toolpaths.length > beforeCount && typeof setActiveToolpaths === 'function') {
		const newToolpath = toolpaths[toolpaths.length - 1];
		setActiveToolpaths([newToolpath]);
	}
}

/**
 * Calculates the signed area of a path
 * Used to determine winding order (clockwise vs counter-clockwise)
 * @param {Array} path - Array of {x, y} points
 * @returns {number} Signed area - positive for counter-clockwise, negative for clockwise
 */
function getSignedArea(path) {
	if (!path || path.length < 3) return 0;

	let area = 0;
	for (let i = 0; i < path.length - 1; i++) {
		area += (path[i+1].x - path[i].x) * (path[i+1].y + path[i].y);
	}
	return area;
}

/**
 * Normalizes winding order of paths to counter-clockwise
 * Ensures consistent behavior regardless of how paths are drawn by user
 * @param {Array} inputPaths - Array of paths (each path is array of {x, y} points)
 * @returns {Array} All paths normalized to counter-clockwise winding order
 */
function normalizeWindingOrder(inputPaths) {
	if (!inputPaths || inputPaths.length === 0) return inputPaths;

	// Single path - normalize to counter-clockwise
	if (inputPaths.length === 1) {
		const signedArea = getSignedArea(inputPaths[0]);
		if (signedArea < 0) {
			// Clockwise - reverse to counter-clockwise
			return [reversePath(inputPaths[0])];
		}
		return inputPaths;
	}

	// Multiple paths - identify outer (largest) vs inner (islands)
	const pathsWithArea = inputPaths.map((path, idx) => ({
		path: path,
		area: Math.abs(getSignedArea(path)),
		signedArea: getSignedArea(path),
		isClockwise: getSignedArea(path) < 0,
		index: idx
	}));

	// Largest area path is the outer boundary
	const outerPathData = pathsWithArea.reduce((max, p) =>
		p.area > max.area ? p : max
	);

	// Inner paths are islands/holes
	const innerPathsData = pathsWithArea.filter(p => p.index !== outerPathData.index);

	// Normalize winding - all paths to counter-clockwise
	const normalized = [];

	// Outer path should be counter-clockwise
	if (outerPathData.isClockwise) {
		normalized.push(reversePath(outerPathData.path));
	} else {
		normalized.push(outerPathData.path);
	}

	// Inner paths (islands) should also be counter-clockwise
	for (let i = 0; i < innerPathsData.length; i++) {
		const innerData = innerPathsData[i];
		if (innerData.isClockwise) {
			// Clockwise - reverse to counter-clockwise
			normalized.push(reversePath(innerData.path));
		} else {
			// Already counter-clockwise - use as-is
			normalized.push(innerData.path);
		}
	}

	return normalized;
}

function generateClipperInfill(inputPaths, stepOverDistance, radius) {
	// Normalize winding order to ensure consistent behavior regardless of user draw direction
	const normalizedPaths = normalizeWindingOrder(inputPaths);

	const clipper = new ClipperLib.Clipper();
	// Determine the bounding box to generate infill lines
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	normalizedPaths.flat().forEach(point => {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	});

	// Track the Y values and indices of the infill lines we generate
	const sourceLines = [];
	const subjectLines = [];
	let lineIndex = 0;

	// Generate a set of parallel lines that span the bounding box
	for (let y = minY + radius; y <= (maxY - radius); y += stepOverDistance) {
		// A single line segment to be clipped
		const line = [{ x: minX, y: y }, { x: maxX, y: y }];
		subjectLines.push(line);
		sourceLines.push({ index: lineIndex, y: y });
		lineIndex++;
	}

	//const line = [{ x: minX, y: maxY-radius }, { x: maxX, y: maxY-radius }];
	//subjectLines.push(line);

	// Add the boundary paths as the clip subject.
	// The last parameter is `true` because boundaries are closed polygons.
	// clipper.AddPaths() can handle multiple paths, including those for holes.
	clipper.AddPaths(normalizedPaths, ClipperLib.PolyType.ptClip, true);

	// Add the infill lines as the subject to be clipped.
	// The last parameter is `false` because they are open polylines.
	clipper.AddPaths(subjectLines, ClipperLib.PolyType.ptSubject, false);

	// Create a container for the result

	const solutionPolyTree = new ClipperLib.PolyTree();

	// Execute the intersection operation
	clipper.Execute(
		ClipperLib.ClipType.ctIntersection, // The clipping operation (intersect)
		solutionPolyTree,
		ClipperLib.PolyFillType.pftEvenOdd, // Filling rule
		ClipperLib.PolyFillType.pftEvenOdd
	);

	const finalPaths = ClipperLib.Clipper.PolyTreeToPaths(solutionPolyTree);
	const validPaths = [];

	for (let i = finalPaths.length - 1; i >= 0; i--) {
		let p = finalPaths[i];
		p[0].x -= (radius);
		p[1].x += (radius);

		if (!(p[0].x < p[1].x)) {
			validPaths.unshift(p);
		}
	}

	// Group paths by their Y coordinate proximity
	// All paths with similar Y values belong to the same source infill line
	const tolerance = stepOverDistance * 0.2;  // Tolerance for Y clustering
	const pathsWithY = validPaths.map((path, idx) => ({
		idx: idx,
		path: path,
		y: path.length > 0 ? (path[0].y + path[path.length - 1].y) / 2 : 0
	}));

	// Sort by Y coordinate
	pathsWithY.sort((a, b) => a.y - b.y);

	// Cluster paths by Y proximity
	const groups = [];
	const usedIndices = new Set();

	for (let i = 0; i < pathsWithY.length; i++) {
		if (usedIndices.has(i)) continue;

		const groupPaths = [pathsWithY[i].path];
		usedIndices.add(i);
		const groupY = pathsWithY[i].y;

		// Find all subsequent paths with similar Y values
		for (let j = i + 1; j < pathsWithY.length; j++) {
			if (usedIndices.has(j)) continue;
			if (Math.abs(pathsWithY[j].y - groupY) <= tolerance) {
				groupPaths.push(pathsWithY[j].path);
				usedIndices.add(j);
			} else {
				// Since sorted by Y, no more matches will be found
				break;
			}
		}

		// Add group if it has paths
		if (groupPaths.length > 0) {
			groups.push({
				sourceLineY: groupY,
				paths: groupPaths
			});
		}
	}

	// Return grouped structure instead of flat array
	return groups;
}

/**
 * Extracts connectivity chains from grouped infill paths
 * Groups segments by continuity across Y-levels with endpoint-based zigzag matching
 * Segments form a chain by tracking the last cutting endpoint and matching new segments to it
 * Automatically reverses segments to maintain continuous zigzag pattern
 * @param {Array} infillGroups - Array of groups from generateClipperInfill() (sorted by Y)
 * @param {number} stepover - Stepover distance
 * @returns {Array} Array of chains, each containing segments from one X-region
 */
function extractConnectivityChains(infillGroups, stepover) {
	if (infillGroups.length === 0) return [];

	const tolerance = stepover * 2;  // Tolerance for endpoint matching (accounts for Y-distance between segments)
	const openChains = [];  // Chains still being built
	const closedChains = [];  // Finalized chains
	let previousWasSingleSegment = false;  // Track single-segment continuity

	// Process Y-groups in order (already sorted by Y from generateClipperInfill)
	for (let groupIdx = 0; groupIdx < infillGroups.length; groupIdx++) {
		const group = infillGroups[groupIdx];
		const sourceY = group.sourceLineY;

		// Extract all segments from this Y-group
		const segments = [];
		for (let path of group.paths) {
			// Each path is one segment (one side of an island or continuous region)
			segments.push({ path: path });
		}

		// Sort segments by X position (left to right) for consistent ordering
		segments.sort((a, b) => {
			const aMinX = Math.min(a.path[0].x, a.path[a.path.length - 1].x);
			const bMinX = Math.min(b.path[0].x, b.path[b.path.length - 1].x);
			return aMinX - bMinX;
		});

		// Check if this Y-level has only one segment (no islands)
		const isSingleSegment = segments.length === 1;

		// Mark which open chains got updated this iteration
		for (let chain of openChains) {
			chain.wasUpdated = false;
		}

		// Match segments to open chains based on endpoint proximity
		for (let segment of segments) {
			// Special case: if both previous and current Y-levels have single segments,
			// force continuity (no islands at either level, must be continuous)
			if (isSingleSegment && previousWasSingleSegment && openChains.length > 0) {
				// Force segment into existing chain(s)
				// If there's only one open chain, add to it
				// If multiple chains, add to first one (they should have been closed if truly separate)
				const chain = openChains[0];

				const segStart = segment.path[0];
				const segEnd = segment.path[segment.path.length - 1];
				const lastEndpoint = chain.lastEndpoint;

				// Still determine if reversal is needed for smooth continuation
				const distToStart = Math.hypot(
					segStart.x - lastEndpoint.x,
					segStart.y - lastEndpoint.y
				);
				const distToEnd = Math.hypot(
					segEnd.x - lastEndpoint.x,
					segEnd.y - lastEndpoint.y
				);

				let addedSegment = segment.path;
				let newEndpoint;

				if (distToEnd < distToStart) {
					// End point is closer - reverse for continuity
					addedSegment = reversePath(segment.path);
					newEndpoint = addedSegment[0];
				} else {
					// Start point is closer - use as-is
					newEndpoint = segment.path[segment.path.length - 1];
				}

				chain.segments.push(addedSegment);
				chain.lastEndpoint = newEndpoint;
				chain.wasUpdated = true;
			} else {
				// Normal tolerance-based matching for multi-segment or first segment
				const segStart = segment.path[0];
				const segEnd = segment.path[segment.path.length - 1];
				let bestChain = null;
				let bestDistance = Infinity;
				let shouldReverse = false;

				// Find open chain with closest matching endpoint
				for (let chain of openChains) {
					const lastEndpoint = chain.lastEndpoint;

					// Calculate distance from last endpoint to this segment's start point
					const distToStart = Math.hypot(
						segStart.x - lastEndpoint.x,
						segStart.y - lastEndpoint.y
					);

					// Calculate distance from last endpoint to this segment's end point
					const distToEnd = Math.hypot(
						segEnd.x - lastEndpoint.x,
						segEnd.y - lastEndpoint.y
					);

					// Use whichever endpoint is closer
					let closestDist, reverse;
					if (distToStart < distToEnd) {
						// Start point is closer - cut forward
						closestDist = distToStart;
						reverse = false;
					} else {
						// End point is closer - cut backward (reverse)
						closestDist = distToEnd;
						reverse = true;
					}

					// Update best match if this is within tolerance and closest
					if (closestDist < tolerance && closestDist < bestDistance) {
						bestChain = chain;
						bestDistance = closestDist;
						shouldReverse = reverse;
					}
				}

				// Add segment to best matching chain or create new chain
				if (bestChain) {
					let addedSegment = segment.path;
					let newEndpoint;

					if (shouldReverse) {
						// Reverse the segment for continuity
						addedSegment = reversePath(segment.path);
						newEndpoint = addedSegment[0];  // First point of reversed segment
					} else {
						// Use segment as-is
						newEndpoint = segment.path[segment.path.length - 1];  // Last point
					}

					bestChain.segments.push(addedSegment);
					bestChain.lastEndpoint = newEndpoint;  // Update endpoint for next match
					bestChain.wasUpdated = true;
				} else {
					// Create new chain
					openChains.push({
						segments: [segment.path],
						lastEndpoint: segment.path[segment.path.length - 1],  // End at last point
						wasUpdated: true,
						startY: sourceY
					});
				}
			}
		}

		// Update tracking for next iteration
		previousWasSingleSegment = isSingleSegment;

		// Close chains that didn't get a segment this iteration
		const remainingChains = [];
		for (let chain of openChains) {
			if (chain.wasUpdated) {
				chain.endY = sourceY;
				remainingChains.push(chain);
			} else {
				// Chain didn't get a segment - it's complete, can't continue without lifting
				closedChains.push(chain);
			}
		}
		openChains.length = 0;
		openChains.push(...remainingChains);
	}

	// Finalize any remaining open chains
	for (let chain of openChains) {
		closedChains.push(chain);
	}

	// Convert chains to final format
	return closedChains.map(chain => ({
		segments: chain.segments,
		startY: chain.startY,
		endY: chain.endY
	}));
}

/**
 * Optimizes the order of infill chains using nearest-neighbor algorithm
 * Chains are reordered to minimize tool travel distance between chains
 * Parallel lines (chains) can be cut in either direction
 * @param {Array} chains - Array of chain path objects
 * @returns {Array} Reordered chains with minimal travel distance
 */
function optimizeChainOrder(chains) {
	if (chains.length <= 1) return chains;

	const optimized = [];
	const remaining = chains.slice();

	// Start with first chain
	let current = remaining.shift();
	optimized.push(current);
	let currentEnd = getPathEndPoint(current.tpath);

	// Nearest neighbor: repeatedly find closest uncut chain
	while (remaining.length > 0) {
		let nearestIdx = 0;
		let nearestDist = Infinity;
		let shouldReverse = false;

		// Find nearest chain endpoint
		for (let i = 0; i < remaining.length; i++) {
			const chainPath = remaining[i].tpath;
			const chainStart = getPathStartPoint(chainPath);
			const chainEnd = getPathEndPoint(chainPath);

			// Distance to start of this chain
			const distToStart = distance(currentEnd, chainStart);
			if (distToStart < nearestDist) {
				nearestDist = distToStart;
				nearestIdx = i;
				shouldReverse = false;
			}

			// Distance to end of this chain (can reverse for parallel infill lines)
			const distToEnd = distance(currentEnd, chainEnd);
			if (distToEnd < nearestDist) {
				nearestDist = distToEnd;
				nearestIdx = i;
				shouldReverse = true;
			}
		}

		// Move nearest chain to optimized list
		current = remaining.splice(nearestIdx, 1)[0];

		if (shouldReverse) {
			current = { ...current, tpath: reversePath(current.tpath) };
		}

		optimized.push(current);
		currentEnd = getPathEndPoint(current.tpath);
	}

	return optimized;
}

function optimizePocketInfillOrder(paths) {
	// Separate contour and infill paths
	const contours = paths.filter(p => p.isContour);
	const infill = paths.filter(p => !p.isContour);

	// Alternate infill direction: reverse every other line
	const optimizedInfill = infill.map((line, index) => {
		if (index % 2 === 1) {
			// Reverse entire path (including all segments if multi-segment)
			return { ...line, tpath: reversePath(line.tpath) };
		}
		return line;
	});

	// Reassemble: infill first, contour last
	// Clear the original array and repopulate it
	paths.length = 0;
	paths.push(...optimizedInfill, ...contours);
}

function reversePath(path) {
	return path.slice().reverse();
}

function detectMultiSegment(path) {
	// Detect if path has gaps (islands) by checking for large jumps
	const totalLength = calculatePathLength(path);
	const pointCount = path.length;
	const avgSegmentLength = totalLength / Math.max(pointCount - 1, 1);

	for (let i = 0; i < path.length - 1; i++) {
		const segmentLength = Math.hypot(
			path[i+1].x - path[i].x,
			path[i+1].y - path[i].y
		);
		if (segmentLength > avgSegmentLength * 2) {
			return true;  // Large gap detected
		}
	}
	return false;
}

function calculatePathLength(path) {
	let length = 0;
	for (let i = 0; i < path.length - 1; i++) {
		length += Math.hypot(
			path[i+1].x - path[i].x,
			path[i+1].y - path[i].y
		);
	}
	return length;
}

function getUnionOfPaths(inputPaths) {

	// Create a Clipper instance
	const clipper = new ClipperLib.Clipper();

	// Add all paths to the Clipper object as subjects.
	clipper.AddPaths(inputPaths, ClipperLib.PolyType.ptSubject, true);

	// Create a container for the result
	const solutionPaths = new ClipperLib.Paths();

	// Execute the union operation
	clipper.Execute(
		ClipperLib.ClipType.ctUnion, // Perform a union operation
		solutionPaths,
		ClipperLib.PolyFillType.pftNonZero,
		ClipperLib.PolyFillType.pftNonZero
	);

	// Scale the result back down
	return solutionPaths;
}

function doPocket() {
	setMode("Pocket");
	if (selectMgr.noSelection()) {
		notify('Select a path to pocket');
		return;
	}

	var radius = toolRadius();
	var stepover = 2 * radius * currentTool.stepover / 100;
	var name = 'Pocket';
	var inputPaths = [];

	var selected =  selectMgr.selectedPaths();
	for(let svgpath of selected)
		inputPaths.push(svgpath.path);

	// Normalize ALL input paths to ensure consistent winding order
	// This makes island detection work correctly regardless of how user drew the paths
	inputPaths = normalizeWindingOrder(inputPaths);

	var paths = [];
	var offsetPaths = [];

	// Use the original normalized outer path (first/largest) for containment testing
	// This ensures pathIn() works with consistent winding order
	let outerPathForTest = inputPaths[0];

	// Get the union for offsetting operations
	let outerPath = getUnionOfPaths(inputPaths)[0];

	let tpath = offsetPath(outerPath, radius, false);
	offsetPaths.push(tpath[0]);

	// Apply doInside() direction logic to outer contour
	// For conventional: no reverse (clockwise)
	// For climb: reverse (counter-clockwise)
	if (currentTool.direction == "climb") {
		tpath[0] = reversePath(tpath[0]);
	}
	paths.push({ tpath: tpath[0], isContour: true });

	for (p of inputPaths) {
		if (pathIn(outerPathForTest, p)) {
			let tpath = offsetPath(p, radius, true);

			// Apply doOutside() direction logic to hole contours
			// For conventional: reverse (counter-clockwise)
			// For climb: no reverse (clockwise)
			if (currentTool.direction != "climb") {
				tpath[0] = reversePath(tpath[0]);
			}

			paths.push({ tpath: tpath[0], isContour: true });
			offsetPaths.push(tpath[0]);
		}
	}

	let tpaths = generateClipperInfill(offsetPaths, stepover, radius);

	// Extract connectivity chains - groups segments that can be cut together without crossing islands
	let chains = extractConnectivityChains(tpaths, stepover);

	// Convert chains to path objects for processing
	// Each chain represents a contiguous set of segments from the same Y-line that don't cross islands
	const infillPaths = [];
	for (let chain of chains) {
		// Flatten all segments in this chain into a single path
		const combinedPath = [];
		for (let segment of chain.segments) {
			combinedPath.push(...segment);
		}

		infillPaths.push({
			tpath: combinedPath,
			isContour: false,
			isChain: true,
			sourceY: chain.startY,
			segmentCount: chain.segments.length
		});
	}

	// Apply nearest-neighbor optimization to order chains
	const optimizedChains = optimizeChainOrder(infillPaths);

	// Separate contours that were added earlier
	const contours = paths.filter(p => p.isContour);

	// Reassemble: optimized chains first, then contours last
	paths.length = 0;
	paths.push(...optimizedChains);
	paths.push(...contours);

	// Collect all selected SVG path IDs for multi-path tracking
	const selectedSvgIds = selectMgr.selectedPaths().map(p => p.id);
	pushToolPath(paths, name, 'Pocket', null, selectedSvgIds);
}
function olddoPocket() {
	setMode("Pocket");
	if (selectMgr.noSelection()) {
		notify('Select a path to pocket');
		return;
	}

	var radius = toolRadius();
	var stepover = 2 * radius * currentTool.stepover / 100;
	var finishingStepover = radius * 0.20; // 10% of diameter (20% of radius) for finishing pass
	var name = 'Pocket';

	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i].path;

		nearbypaths = nearbyPaths(svgpaths[i], radius);

		var offsetPaths = offsetPath(svgpath, radius, false);
		var isFirstOffset = true; // Track if this is the first offset from the outer wall

		while (offsetPaths.length > 0) {

			var path = offsetPaths.pop();
			var subpath = subdividePath(path, 2);
			var circles = checkPath(subpath, radius - 1);

			var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));

			if (tpath.length > 0) {
				// Calculate bounding box to check if path is too small
				var bbox = boundingBox(tpath);
				var diagonal = Math.sqrt(
					Math.pow(bbox.maxx - bbox.minx, 2) +
					Math.pow(bbox.maxy - bbox.miny, 2)
				);

				var isPlunge = diagonal < (2 * radius * 0.8); // 80% of diameter threshold
				var plungePoint = null;

				if (isPlunge) {
					// Calculate centroid
					plungePoint = {
						x: (bbox.minx + bbox.maxx) / 2,
						y: (bbox.miny + bbox.maxy) / 2
					};
				}

				if (currentTool.direction == "climb") {
					var rcircles = reversePath(circles);
					var rtpath = reversePath(tpath);
					paths.push({
						path: rcircles,
						tpath: rtpath,
						isPlunge: isPlunge,
						plungePoint: plungePoint
					});
				}
				else {
					paths.push({
						path: circles,
						tpath: tpath,
						isPlunge: isPlunge,
						plungePoint: plungePoint
					});
				}

				// Use finishing stepover for first interior offset, then normal stepover
				var currentStepover = isFirstOffset ? finishingStepover : stepover;
				isFirstOffset = false;

				var innerPaths = offsetPath(tpath, currentStepover, false);

				if (innerPaths.length == 0)
					innerPaths = offsetPath(tpath, currentStepover / 2, false);

				if (innerPaths.length == 0)
					innerPaths = offsetPath(tpath, currentStepover / 4, false);

				for (var j = 0; j < innerPaths.length; j++)
					offsetPaths.push(innerPaths[j]);
			}


		}
		pushToolPath(paths, name, 'Pocket', svgpath.id);
	}
	selectMgr.unselectAll();

}
function doVcarve() {
	if (currentTool.inside == 'inside') {
		doVcarveIn();
	} else if (currentTool.inside == 'outside') {
		doVcarveOut();
	}
	else {
		doVcarveCenter();
	}
}
function doVcarveCenter() {
	if (selectMgr.noSelection()) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve In");
	compute(false, 'VCarve In');
}

function doVcarveIn() {
	if (selectMgr.noSelection()) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve In");
	oldcompute(false, 'VCarve In');
}

function doVcarveOut() {
	if (selectMgr.noSelection()) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve Out");
	oldcompute(true, 'VCarve Out');
}


function medialAxis(name, path, holes, svgId) {

	let descritize_threshold = 1e-1;
	let descritize_method = 2;
	let filtering_angle = 3 * Math.PI / 4;
	let pointpoint_segmentation_threshold = -1;
	let number_usage = 0;
	let debug_flags = {
		no_parabola: false,
		show_sites: false
	};
	let intermediate_debug_data = null;

	maxRadius = vbitRadius(currentTool) * viewScale;

	var segments = JSPoly.construct_medial_axis(path, holes, descritize_threshold, descritize_method, filtering_angle, pointpoint_segmentation_threshold, number_usage, debug_flags, intermediate_debug_data);
	var circles = [];
	for (seg in segments) {
		seg = segments[seg];
		var p = { x: seg.point0.x, y: seg.point0.y, r: Math.min(seg.point0.radius, maxRadius) };
		//if (pointInPolygon(p, path))
		circles.push(p);
		var p1 = { x: seg.point1.x, y: seg.point1.y, r: Math.min(seg.point1.radius, maxRadius) };
		//if (pointInPolygon(p1, path))
		circles.push(p1);
	}
	circles = clipper.JS.Lighten(circles, getOption("tolerance"));

	var tpath = findBestPath(segments).toolpath;

	// Add interpolation points at radius transitions for better visualization
	var tpathWithTransitions = [];
	for (let i = 0; i < tpath.length; i++) {
		var currentRadius = tpath[i].r;

		tpathWithTransitions.push(tpath[i]);

		// Check for transition to next point
		if (i < tpath.length - 1) {
			var nextRadius = tpath[i + 1].r;

			// If transitioning from at-max-radius to below-max-radius
			if (currentRadius >= maxRadius - 0.01 && nextRadius < maxRadius - 0.01) {
				// Calculate interpolation factor where radius drops below maxRadius
				var t = (maxRadius - currentRadius) / (nextRadius - currentRadius);
				if (t > 0 && t < 1) {
					// Insert transition point at the boundary
					var transitionPoint = {
						x: tpath[i].x + t * (tpath[i + 1].x - tpath[i].x),
						y: tpath[i].y + t * (tpath[i + 1].y - tpath[i].y),
						r: maxRadius
					};
					tpathWithTransitions.push(transitionPoint);
				}
			}
			// If transitioning from below-max-radius to at-max-radius (reverse direction)
			else if (currentRadius < maxRadius - 0.01 && nextRadius >= maxRadius - 0.01) {
				// Calculate interpolation factor where radius rises above maxRadius
				var t = (maxRadius - currentRadius) / (nextRadius - currentRadius);
				if (t > 0 && t < 1) {
					// Insert transition point at the boundary
					var transitionPoint = {
						x: tpath[i].x + t * (tpath[i + 1].x - tpath[i].x),
						y: tpath[i].y + t * (tpath[i + 1].y - tpath[i].y),
						r: maxRadius
					};
					tpathWithTransitions.push(transitionPoint);
				}
			}
		}
	}
	tpath = tpathWithTransitions;

	// Now clamp all radii to maxRadius
	for (p of tpath) {
		p.r = Math.min(p.r, maxRadius)
	}
	var paths = [{ path: circles, tpath: tpath }];
	pushToolPath(paths, name, 'VCarve', svgId);
}

function compute(outside, name) {
	var selected = selectMgr.selectedPaths();
	var paths = [];

	for (var i in selected) {
		if (selected[i].hole) continue;
		var holes = []
		var path = selected[i].path;
		for (var j in selected) {
			if (i != j) {
				if (pathIn(path, selected[j].path)) {
					holes.push(selected[j].path);
					selected[j].hole = true;
				}
			}
		}
		medialAxis(name, path, holes, selected[i].id);
	}

}

function pathIn(outer, inner) {
	for (var i in inner) {
		var p = inner[i];
		if (!pointInPolygon(p, outer))
			return false;
	}
	return true;
}

function oldcompute(outside, name) {
	var radius = vbitRadius(currentTool) * viewScale;

	for (var i = 0; i < svgpaths.length; i++) {
		var paths = [];
		var path = svgpaths[i].path;



		if (!selectMgr.isSelected(svgpaths[i]) || !svgpaths[i].visible) continue;

		//medialAxis(name, path, [], svgpaths[i].id);
		//continue;

		var r = radius;

		if (outside)
			nearbypaths = nearbyPaths(svgpaths[i], radius);
		else
			nearbypaths = nearbyPaths(svgpaths[i], 1);

		var cw = isClockwise(path);
		if (outside) cw = !cw;


		var subpath = subdividePath(path, 2); // max path length
	

		norms = makeNorms(subpath, path, cw, 1, outside);
		drawNorms(norms)

		var circles = largestEmptyCircles(norms, r, subpath);
		//var tpath = simplify(circles,2,true);
		var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));

		if (outside) {
			if (currentTool.direction != "climb") {
				var rcircles = reversePath(circles);
				var rtpath = reversePath(tpath);
				paths.push({ path: rcircles, tpath: rtpath });
			}
			else {
				paths.push({ path: circles, tpath: tpath });
			}
		}
		else {
			if (currentTool.direction == "climb") {
				var rcircles = reversePath(circles);
				var rtpath = reversePath(tpath);
				paths.push({ path: rcircles, tpath: rtpath });
			}
			else {
				paths.push({ path: circles, tpath: tpath });
			}
		}

		pushToolPath(paths, name, 'VCarve', svgpaths[i].id);

	}

}


var link = document.createElement('a');
link.style.display = 'none';
document.body.appendChild(link); // Firefox workaround, see #6594

function save(blob, filename) {

	link.href = URL.createObjectURL(blob);
	link.download = filename || 'data.json';
	link.click();
}

function saveString(text, filename) {

	save(new Blob([text], { type: 'text/plain' }), filename);

}

async function doGcode() {
	if (toolpaths.length == 0) {
		notify('No toolpaths to export');
		return;
	}

	var text = toGcode();

	// Use the File System Access API if available (modern browsers)
	if ('showSaveFilePicker' in window) {
		try {
			const fileHandle = await window.showSaveFilePicker({
				suggestedName: currentFileName + ".gcode",
				types: [{
					description: 'G-code files',
					accept: { 'text/plain': ['.gcode', '.nc', '.tap'] }
				}]
			});
			const writable = await fileHandle.createWritable();
			await writable.write(text);
			await writable.close();
			notify('G-code saved successfully');
			return;
		} catch (err) {
			if (err.name !== 'AbortError') {
				console.error('Error saving file:', err);
				// Continue to fallback method on error
			} else {
				// User cancelled the dialog
				return;
			}
		}
	}

	// Fallback: prompt for filename and use download method
	var filename = prompt("Enter filename for G-code export:", currentFileName + ".gcode");
	if (!filename) {
		return; // User cancelled
	}

	// Ensure .gcode extension
	if (!filename.endsWith('.gcode')) {
		filename += '.gcode';
	}

	saveString(text, filename);
	notify('G-code download started');
}

function toolRadius() {

	return currentTool.diameter / 2 * viewScale;
}

function toolDepth(degrees, radius) {
	var angle = degrees * Math.PI / 180;
	return toMMZ(radius / Math.tan(angle / 2));
}

function toMM(x, y) {
	var cx = (x - origin.x) / viewScale;
	var cy = (origin.y - y) / viewScale;
	return {
		x: Math.round((cx + 0.00001) * 100) / 100,
		y: Math.round((cy + 0.00001) * 100) / 100
	};
}

function toMMZ(z) {
	var cz = z / viewScale;
	return Math.round((cz + 0.00001) * 100) / 100;
}

// Convert coordinates to G-code units (mm or inches based on profile setting)
function toGcodeUnits(x, y, useInches) {
	var mm = toMM(x, y);
	if (!useInches) {
		return mm;
	}
	// Convert to inches and round to 4 decimal places
	return {
		x: Math.round(mm.x / MM_PER_INCH * 10000) / 10000,
		y: Math.round(mm.y / MM_PER_INCH * 10000) / 10000
	};
}

// Convert Z coordinate to G-code units (mm or inches based on profile setting)
function toGcodeUnitsZ(z, useInches) {
	//var mm = toMMZ(z);
	var mm = z;
	if (!useInches) {
		return mm;
	}
	// Convert to inches and round to 4 decimal places
	return Math.round(mm / MM_PER_INCH * 10000) / 10000;
}

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

// Apply G-code template with selective parameter substitution
// Template example: "G0 X Y Z F"
// Params: { x: 10.5, y: 20.3, f: 600 }
// Output: "G0 X10.5 Y20.3 F600" (Z omitted since not provided)
//
// Supported placeholders: X, Y, Z, F, S
// - X, Y, Z are coordinate placeholders (replaced with params.x, params.y, params.z)
// - F is the feedrate placeholder (replaced with params.f)
// - S is the spindle speed placeholder (replaced with params.s)
//
// Enhanced template features:
// - Axis inversion: "G0 -X Y -Z" negates X and Z values
// - Axis swapping: "G0 Y X Z" swaps X and Y coordinates
// - Spindle speed: "M3 S" outputs spindle speed when params.s is provided
function applyGcodeTemplate(template, params) {
	if (!template) return '';

	var output = template;

	// Parse template to detect axis inversions and swapping
	var axisMap = {};
	var inversions = {};

	// Detect negation and axis mapping
	// Match patterns like "-X", "X", "-Y", "Y", "-Z", "Z"
	var xMatch = template.match(/(-?)X\b/);
	var yMatch = template.match(/(-?)Y\b/);
	var zMatch = template.match(/(-?)Z\b/);

	// Determine if axes are swapped by their positions in the template
	var axisPositions = [];
	if (xMatch) {
		axisPositions.push({ axis: 'X', pos: xMatch.index, inverted: xMatch[1] === '-' });
	}
	if (yMatch) {
		axisPositions.push({ axis: 'Y', pos: yMatch.index, inverted: yMatch[1] === '-' });
	}
	if (zMatch) {
		axisPositions.push({ axis: 'Z', pos: zMatch.index, inverted: zMatch[1] === '-' });
	}

	// Sort by position to determine the mapping
	axisPositions.sort((a, b) => a.pos - b.pos);

	// Create mapping: template axis -> value to use
	// For example, if template is "G0 Y X Z", then:
	// - First position is Y, should get X value (params.x)
	// - Second position is X, should get Y value (params.y)
	var valueOrder = ['x', 'y', 'z'];
	axisPositions.forEach((item, idx) => {
		if (idx < valueOrder.length) {
			axisMap[item.axis] = valueOrder[idx];
			inversions[item.axis] = item.inverted;
		}
	});

	// Process X parameter with potential swapping and inversion
	if (xMatch) {
		var xValue = params[axisMap['X'] || 'x'];
		if (xValue !== undefined && xValue !== null) {
			if (inversions['X']) xValue = -xValue;
			output = output.replace(/-?X\b/, 'X' + xValue);
		} else {
			// Remove X if not provided
			output = output.replace(/-?X\b/, '').trim();
		}
	}

	// Process Y parameter with potential swapping and inversion
	if (yMatch) {
		var yValue = params[axisMap['Y'] || 'y'];
		if (yValue !== undefined && yValue !== null) {
			if (inversions['Y']) yValue = -yValue;
			output = output.replace(/-?Y\b/, 'Y' + yValue);
		} else {
			// Remove Y if not provided
			output = output.replace(/-?Y\b/, '').trim();
		}
	}

	// Process Z parameter with potential swapping and inversion
	if (zMatch) {
		var zValue = params[axisMap['Z'] || 'z'];
		if (zValue !== undefined && zValue !== null) {
			if (inversions['Z']) zValue = -zValue;
			output = output.replace(/-?Z\b/, 'Z' + zValue);
		} else {
			// Remove Z if not provided
			output = output.replace(/-?Z\b/, '').trim();
		}
	}

	// Process F parameter
	if (params.f !== undefined && params.f !== null) {
		output = output.replace(/\bF\b/g, 'F' + params.f);
	} else {
		// Remove F if not provided
		output = output.replace(/\bF\b/g, '').trim();
	}

	// Process S parameter (spindle speed)
	if (params.s !== undefined && params.s !== null) {
		output = output.replace(/\bS\b/g, 'S' + params.s);
	} else {
		// Remove S if not provided
		output = output.replace(/\bS\b/g, '').trim();
	}

	// Clean up multiple spaces
	output = output.replace(/\s+/g, ' ').trim();

	return output;
}

// Format a comment using the current profile's comment character
function formatComment(text, profile) {
	if (!profile || !profile.commentsEnabled) return '';

	var commentChar = profile.commentChar || '(';
	var closingChar = commentChar === '(' ? ')' : '';

	return commentChar + text + closingChar;
}

// Get operation priority for sorting (lower number = earlier in sequence)
// Order: Drill (1), VCarve (2), Pocket (3), Profiles (4)
function getOperationPriority(operation) {
	if (operation === 'Drill') return 1;
	if (operation === 'VCarve In' || operation === 'VCarve Out') return 2;
	if (operation === 'Pocket') return 3;
	// All profile operations (Inside, Outside, Center) come last
	return 4;
}

// Helper function: Calculate distance between two points
function distance(p1, p2) {
	return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Helper function: Get start point of a path
function getPathStartPoint(pathObj) {
	// Handle different path structures
	if (pathObj.paths && pathObj.paths.length > 0) {
		var first = pathObj.paths[0].tpath[0];
		return { x: first.x, y: first.y };
	}

	return { x: 0, y: 0 };
}

// Helper function: Get end point of a path
function getPathEndPoint(pathObj) {
	// Get last point of path

	if (pathObj.paths && pathObj.paths.length > 0) {
		let len = pathObj.paths[0].tpath.length;
		len = len > 1 ? len - 1 : 0;
		var last = pathObj.paths[0].tpath[len];
		return { x: last.x, y: last.y };
	}
	return { x: 0, y: 0 };
}

// Helper function: Check if path is a straight line (only 2 points)
function isStraightLine(pathObj) {
	// A straight line has exactly 2 points (start and end)
	var pathData = pathObj.path || pathObj.tpath;

	if (!pathData) return false;

	// Check if path has exactly 2 points
	return pathData.length === 2;
}

// Helper function: Reverse path data
function reversePathData(pathObj) {
	// Create a copy and reverse the path points
	var reversed = JSON.parse(JSON.stringify(pathObj));

	if (reversed.path && reversed.path.length > 0) {
		reversed.path = reversed.path.slice().reverse();
	}
	if (reversed.tpath && reversed.tpath.length > 0) {
		reversed.tpath = reversed.tpath.slice().reverse();
	}

	return reversed;
}

// Optimize path order using nearest neighbor algorithm with bidirectional consideration
// Only reverses straight lines (2 points) to preserve clockwise/counter-clockwise direction
function optimizePathOrder(paths) {

	if (paths.length <= 1) {
		return paths; // Return original order for Pocket or single path
	}

	var optimized = [];
	var remaining = paths.slice();

	// Start with first path
	var current = remaining.shift();
	optimized.push(current);

	// Track current end point
	var currentEnd = getPathEndPoint(current);

	// Nearest neighbor with bidirectional consideration for straight lines only
	while (remaining.length > 0) {
		var nearestIdx = 0;
		var nearestDist = Infinity;
		var shouldReverse = false;

		// Find nearest path
		for (var i = 0; i < remaining.length; i++) {
			var pathStart = getPathStartPoint(remaining[i]);
			var distToStart = distance(currentEnd, pathStart);

			if (distToStart < nearestDist) {
				nearestDist = distToStart;
				nearestIdx = i;
				shouldReverse = false;
			}

			// Check if this is a straight line (only 2 points)
			// Straight lines can be cut in either direction
			if (isStraightLine(remaining[i])) {
				var pathEnd = getPathEndPoint(remaining[i]);
				var distToEnd = distance(currentEnd, pathEnd);

				if (distToEnd < nearestDist) {
					nearestDist = distToEnd;
					nearestIdx = i;
					shouldReverse = true;
				}
			}
		}

		// Get the nearest path
		current = remaining.splice(nearestIdx, 1)[0];

		// Reverse path if it's a straight line and that's optimal
		if (shouldReverse) {
			current = reversePathData(current);
		}

		optimized.push(current);
		currentEnd = getPathEndPoint(current);
	}

	return optimized;
}

// Sort toolpaths by operation priority to ensure safe machining order
function getSortedToolpaths(toolpaths) {
	// Create a copy to avoid modifying the original array
	var sorted = toolpaths.slice();

	sorted.sort(function (a, b) {
		var priorityA = getOperationPriority(a.operation);
		var priorityB = getOperationPriority(b.operation);

		// If same priority, maintain original order
		if (priorityA === priorityB) {
			return 0;
		}

		return priorityA - priorityB;
	});

	return sorted;
}

// Tab avoidance helper functions for G-code generation
function getTabLiftAmount(z, tabs, workpieceThickness, tabHeight) {
	if (!tabs || tabs.length === 0) return 0;
	if (!tabHeight || tabHeight <= 0) return 0;

	// z is negative (below surface)
	// Calculate cut depth from surface
	const cutDepth = Math.abs(z);

	// Tab zone extends from bottom (workpieceThickness) up to (workpieceThickness - tabHeight)
	// Tab surface is at depth: workpieceThickness - tabHeight
	const tabSurfaceDepth = workpieceThickness - tabHeight;

	// If cutting depth reaches or exceeds tab surface, we need to lift
	// Lift only to just above the tab surface (don't go all the way to z=0)
	if (cutDepth >= tabSurfaceDepth) {
		// Lift amount brings us from -cutDepth to -tabSurfaceDepth
		// Which is: liftAmount = cutDepth - tabSurfaceDepth
		const liftAmount = cutDepth - tabSurfaceDepth;
		return liftAmount;
	}

	return 0;
}

function interpolatePointOnSegment(p1, p2, distanceFraction) {
	// distanceFraction: 0-1, where 0 is at p1 and 1 is at p2
	return {
		x: p1.x + distanceFraction * (p2.x - p1.x),
		y: p1.y + distanceFraction * (p2.y - p1.y)
	};
}

function intersectSegmentWithRedEnds(p1, p2, tab, tabLength, toolRadius, viewScale) {
	// Find intersections between a segment and the RED ENDS of a tab box
	// RED ENDS are the perpendicular faces at ±(tabLength/2) along the tab direction
	//
	// Returns array of {distance: t, type: 'enter'/'exit'} where t is position along segment
	// distance = 0 at p1, distance = 1 at p2

	const intersections = [];
	const isTab0 = Math.abs(tab.angle - 2.0943951022854153) < 0.01; // Detect Tab 0 by angle

	// Convert tab length to world units
	const tabLengthWorld = tabLength * viewScale;
	const halfTabLength = tabLengthWorld / 2;
	const boxWidthWorld = 4 * toolRadius;
	const halfBoxWidth = boxWidthWorld / 2;

	// Direction vector along the path (tab angle)
	const dirX = Math.cos(tab.angle);
	const dirY = Math.sin(tab.angle);

	// Perpendicular vector (90 degrees counterclockwise from direction)
	const perpX = -Math.sin(tab.angle);
	const perpY = Math.cos(tab.angle);

	// Project tab center onto direction vector
	const tabCenterAlongDir = tab.x * dirX + tab.y * dirY;

	// Define the two red end positions along the direction vector
	const leftEndPos = tabCenterAlongDir - halfTabLength;
	const rightEndPos = tabCenterAlongDir + halfTabLength;

	// Project segment endpoints onto direction and perpendicular vectors
	// RELATIVE to the tab center
	const p1RelX = p1.x - tab.x;
	const p1RelY = p1.y - tab.y;
	const p1AlongDir = tabCenterAlongDir + (p1RelX * dirX + p1RelY * dirY);
	const p1PerpDist = p1RelX * perpX + p1RelY * perpY;

	const p2RelX = p2.x - tab.x;
	const p2RelY = p2.y - tab.y;
	const p2AlongDir = tabCenterAlongDir + (p2RelX * dirX + p2RelY * dirY);
	const p2PerpDist = p2RelX * perpX + p2RelY * perpY;

	// CHECK FOR FULL-SEGMENT CONTAINMENT FIRST
	// If entire segment is inside the tab zone, don't create spurious markers
	// Check both endpoints and midpoint to determine if fully contained
	const midAlongDir = (p1AlongDir + p2AlongDir) / 2;
	const midPerpDist = (p1PerpDist + p2PerpDist) / 2;

	const p1Inside = p1AlongDir >= leftEndPos && p1AlongDir <= rightEndPos && Math.abs(p1PerpDist) <= halfBoxWidth;
	const p2Inside = p2AlongDir >= leftEndPos && p2AlongDir <= rightEndPos && Math.abs(p2PerpDist) <= halfBoxWidth;
	const midInside = midAlongDir >= leftEndPos && midAlongDir <= rightEndPos && Math.abs(midPerpDist) <= halfBoxWidth;

	if (p1Inside && p2Inside && midInside) {
		// Entire segment is fully contained within tab zone
		// Return special marker so calculateTabMarkers can skip creating redundant markers
		return [
			{ distance: 0, type: 'fullSegment', isFullSegment: true }
		];
	}

	// Check if segment is parallel to direction
	const alongDiff = p2AlongDir - p1AlongDir;
	const isParallel = Math.abs(alongDiff) < 1e-10;

	if (isParallel) {
		// Segment is parallel to the tab direction - can't cross red ends
		return []; // No intersection possible
	}

	// Segment is NOT parallel - find intersections with red end planes

	// Check intersection with LEFT red end (at leftEndPos)
	const tLeft = (leftEndPos - p1AlongDir) / alongDiff;
	if (tLeft >= 0 && tLeft <= 1) {
		// Intersection point exists on segment, check if within perpendicular bounds
		const intersectPerpDist = p1PerpDist + tLeft * (p2PerpDist - p1PerpDist);
		if (Math.abs(intersectPerpDist) <= halfBoxWidth) {
			intersections.push({
				distance: tLeft,
				type: 'enter',
				perpDist: intersectPerpDist
			});
		}
	}

	// Check intersection with RIGHT red end (at rightEndPos)
	const tRight = (rightEndPos - p1AlongDir) / alongDiff;
	if (tRight >= 0 && tRight <= 1) {
		// Intersection point exists on segment, check if within perpendicular bounds
		const intersectPerpDist = p1PerpDist + tRight * (p2PerpDist - p1PerpDist);
		if (Math.abs(intersectPerpDist) <= halfBoxWidth) {
			intersections.push({
				distance: tRight,
				type: 'exit',
				perpDist: intersectPerpDist
			});
		}
	}

	// Sort by distance along segment
	intersections.sort((a, b) => a.distance - b.distance);

	// Cleanup - remove perpDist from return (was just for calculation)
	return intersections.map(int => ({
		distance: int.distance,
		type: int.type,
		isFullSegment: int.isFullSegment || false
	}));
}


function findTabIntersectionsOnSegment(p1, p2, tabs, toolRadius, tabLength) {
	// Find where segment from p1 to p2 intersects tab zones using oriented bounding boxes
	//
	// Approach: For each tab, create an oriented bounding box that extends:
	// - Along tab.angle: tabLength (the actual tab length)
	// - Perpendicular: accounts for tool radius AND path offset mismatch
	//
	// The key insight: tabs are marked on the original path, but cutting happens on an
	// offset path (for inside/outside operations). The detection box must account for this!
	//
	// Returns array of {distance, type, tabIndex} sorted by distance
	// distance: 0-1 fraction along segment from p1 to p2

	if (!tabs || tabs.length === 0) {
		return [];
	}

	const intersections = [];

	for (let tabIdx = 0; tabIdx < tabs.length; tabIdx++) {
		const tab = tabs[tabIdx];

		// Find intersections with this tab's RED ENDS
		const boxIntersections = intersectSegmentWithRedEnds(p1, p2, tab, tabLength, toolRadius, viewScale);

		// Add intersections to results with tab index
		for (let i = 0; i < boxIntersections.length; i++) {
			intersections.push({
				distance: boxIntersections[i].distance,
				type: boxIntersections[i].type,
				tabIndex: tabIdx,
				isFullSegment: boxIntersections[i].isFullSegment || false
			});
		}
	}

	// Sort by distance along segment
	intersections.sort((a, b) => a.distance - b.distance);


	return intersections;
}

function walkSegments(toolpath, startSegIdx, startT, distanceNeeded, forward = true) {
	// Walk through segments in specified direction accumulating distance
	// forward = true: walk forward through segments
	// forward = false: walk backward through segments
	// Returns {segmentIndex, t} where the target distance is reached
	// Handles multi-segment offset when marker crosses segment boundaries

	let remainingDist = distanceNeeded;
	let currentSegIdx = startSegIdx;
	let currentT = startT;

	// Start by consuming remaining distance in current segment
	const p1_start = toolpath[currentSegIdx];
	const p2_start = toolpath[currentSegIdx + 1];
	const startSegDx = p2_start.x - p1_start.x;
	const startSegDy = p2_start.y - p1_start.y;
	const startSegLen = Math.sqrt(startSegDx * startSegDx + startSegDy * startSegDy);

	const distInCurrentSegment = forward ? (1 - currentT) * startSegLen : currentT * startSegLen;

	if (distInCurrentSegment >= remainingDist) {
		// Offset fits within current segment
		if (forward) {
			currentT += (remainingDist / startSegLen);
			return { segmentIndex: currentSegIdx, t: Math.min(1, currentT) };
		} else {
			currentT -= (remainingDist / startSegLen);
			return { segmentIndex: currentSegIdx, t: Math.max(0, currentT) };
		}
	}

	// Not enough space in current segment, move to next/previous segments
	remainingDist -= distInCurrentSegment;
	if (forward) {
		currentSegIdx++;
		currentT = 0;
	} else {
		currentSegIdx--;
		currentT = 1;
	}

	// Walk through subsequent/previous segments (with wraparound for closed paths)
	let segmentsWalked = 0;
	const maxSegments = toolpath.length - 1; // Maximum segments before stopping

	while (remainingDist > 0 && segmentsWalked < maxSegments) {
		// Handle wraparound
		if (forward) {
			if (currentSegIdx >= toolpath.length - 1) {
				currentSegIdx = 0; // Wrap to first segment
				currentT = 0;
			}
		} else {
			if (currentSegIdx < 0) {
				currentSegIdx = toolpath.length - 2; // Wrap to last segment
				currentT = 1;
			}
		}

		const p1 = toolpath[currentSegIdx];
		const p2 = toolpath[currentSegIdx + 1];
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const segLen = Math.sqrt(dx * dx + dy * dy);

		if (segLen >= remainingDist) {
			// Offset ends in this segment
			if (forward) {
				currentT = remainingDist / segLen;
			} else {
				currentT = 1 - (remainingDist / segLen);
			}
			return { segmentIndex: currentSegIdx, t: currentT };
		}

		// Use entire segment, continue to next/previous
		remainingDist -= segLen;
		if (forward) {
			currentSegIdx++;
		} else {
			currentSegIdx--;
		}
		segmentsWalked++;
	}

	// Reached maximum segments or accumulated distance - return current position
	if (segmentsWalked >= maxSegments) {
		const wrapIdx = forward ?
			(currentSegIdx >= toolpath.length - 1 ? 0 : currentSegIdx) :
			(currentSegIdx < 0 ? toolpath.length - 2 : currentSegIdx);
		return { segmentIndex: wrapIdx, t: currentT };
	}

	return { segmentIndex: currentSegIdx, t: currentT };
}

function isPathCounterClockwise(toolpath) {
	// Detect path direction using signed area (shoelace formula)
	// Returns true for counter-clockwise, false for clockwise
	// Positive area = counter-clockwise, negative = clockwise

	if (!toolpath || toolpath.length < 3) return false;

	let signedArea = 0;
	for (let i = 0; i < toolpath.length; i++) {
		const p1 = toolpath[i];
		const p2 = toolpath[(i + 1) % toolpath.length];
		signedArea += (p2.x - p1.x) * (p2.y + p1.y);
	}

	return signedArea > 0;
}

function calculateTabMarkers(toolpath, tabs, tabLength, toolRadius, viewScale) {
	// Calculate all tab lift/lower markers with tool radius offset
	// Returns array of {x, y, type: 'lift'|'lower', segmentIndex, t}
	// Handles multi-segment offsets when tabs are near segment boundaries
	// Handles bidirectional path traversal (clockwise and counter-clockwise)

	if (!tabs || tabs.length === 0 || !toolpath || toolpath.length < 2) return [];

	const markers = [];

	// Detect path direction: true = counter-clockwise (inside cuts), false = clockwise (outside cuts)
	const isCounterClockwise = isPathCounterClockwise(toolpath);

	// For each segment in toolpath
	for (let segIdx = 0; segIdx < toolpath.length - 1; segIdx++) {
		const p1 = toolpath[segIdx];
		const p2 = toolpath[segIdx + 1];

		// Find intersections with tab red ends on this segment
		const intersections = findTabIntersectionsOnSegment(p1, p2, tabs, toolRadius, tabLength);

		if (intersections.length > 0) {
			// Check if this is a fully-contained segment (shouldn't create markers)
			const isFullSegment = intersections.some(int => int.isFullSegment);

			if (isFullSegment) {
				// Segment is entirely inside tab zone - skip marker creation
				// The persistent lifted state will handle traversal
				continue;
			}

			// Flip entry/exit types for counter-clockwise paths (inside cuts)
			// For counter-clockwise traversal, entry and exit are reversed
			if (isCounterClockwise) {
				for (let int of intersections) {
					if (int.type === 'enter') {
						int.type = 'exit';
					} else if (int.type === 'exit') {
						int.type = 'enter';
					}
				}
			}

			// Process intersections - handle both pairs and single intersections
			for (let intIdx = 0; intIdx < intersections.length; intIdx++) {
				const currentInt = intersections[intIdx];
				const nextInt = intersections[intIdx + 1];

				if (currentInt.type === 'enter') {
					// Check if followed by exit
					if (nextInt && nextInt.type === 'exit') {
						// Paired entry/exit - create both markers
						const liftMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, false);
						const liftPt = interpolatePointOnSegment(toolpath[liftMarker.segmentIndex], toolpath[liftMarker.segmentIndex + 1], liftMarker.t);
						markers.push({
							x: liftPt.x,
							y: liftPt.y,
							type: 'lift',
							segmentIndex: liftMarker.segmentIndex,
							t: liftMarker.t
						});

						const lowerMarker = walkSegments(toolpath, segIdx, nextInt.distance, toolRadius, true);
						const lowerPt = interpolatePointOnSegment(toolpath[lowerMarker.segmentIndex], toolpath[lowerMarker.segmentIndex + 1], lowerMarker.t);
						markers.push({
							x: lowerPt.x,
							y: lowerPt.y,
							type: 'lower',
							segmentIndex: lowerMarker.segmentIndex,
							t: lowerMarker.t
						});

						intIdx++; // Skip the next intersection since we processed it
					} else {
						// Single entry (exit is on a later segment) - create only lift marker
						const liftMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, false);
						const liftPt = interpolatePointOnSegment(toolpath[liftMarker.segmentIndex], toolpath[liftMarker.segmentIndex + 1], liftMarker.t);
						markers.push({
							x: liftPt.x,
							y: liftPt.y,
							type: 'lift',
							segmentIndex: liftMarker.segmentIndex,
							t: liftMarker.t
						});
					}
				} else if (currentInt.type === 'exit') {
					// Single exit (entry was on a previous segment) - create only lower marker
					const lowerMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, true);
					const lowerPt = interpolatePointOnSegment(toolpath[lowerMarker.segmentIndex], toolpath[lowerMarker.segmentIndex + 1], lowerMarker.t);
					markers.push({
						x: lowerPt.x,
						y: lowerPt.y,
						type: 'lower',
						segmentIndex: lowerMarker.segmentIndex,
						t: lowerMarker.t
					});
				}
			}
		}
	}

	return markers;
}

function augmentToolpathWithMarkers(toolpath, markers) {
	// Create augmented toolpath by inserting marker points
	// Splits segments where markers occur
	// Returns new array: original points with markers inserted at appropriate positions

	if (markers.length === 0) return toolpath.slice();

	const augmentedPath = [];

	// For each segment
	for (let segIdx = 0; segIdx < toolpath.length; segIdx++) {
		const point = toolpath[segIdx];

		// Add the current point
		augmentedPath.push(point);

		// If not the last point, check for markers on this segment
		if (segIdx < toolpath.length - 1) {
			// Find all markers for this segment, sorted by t value
			const segmentMarkers = markers
				.filter(m => m.segmentIndex === segIdx)
				.sort((a, b) => a.t - b.t);

			// Add all markers for this segment
			for (const marker of segmentMarkers) {
				augmentedPath.push({
					x: marker.x,
					y: marker.y,
					marker: marker.type  // 'lift' or 'lower'
				});
			}
		}
	}

	return augmentedPath;
}

function toGcode() {
	// Get current G-code profile
	var profile = currentGcodeProfile || {
		startGcode: 'G0 G54 G17 G21 G90 G94',
		endGcode: 'M5\nG0 Z5',
		toolChangeGcode: 'M5\nG0 Z5\n(Tool Change)\nM0',
		rapidTemplate: 'G0 X Y Z F',
		cutTemplate: 'G1 X Y Z F',
		spindleOnGcode: 'M3 S',
		spindleOffGcode: 'M5',
		commentChar: '(',
		commentsEnabled: true,
		gcodeUnits: 'mm'
	};

	// Check if G-code should be output in inches
	var useInches = profile.gcodeUnits === 'inches';

	var output = "";

	// Add start G-code if provided
	if (profile.startGcode && profile.startGcode.trim() !== '') {
		output += profile.startGcode + '\n';
	}

	// Sort toolpaths by operation priority for safe machining order
	// Order: Drill -> VCarve -> Pocket -> Profiles
	var sortedByOperation = getSortedToolpaths(toolpaths);

	var drillPaths = [];
	for (var i = 0; i < sortedByOperation.length; i++) {

		var operation = sortedByOperation[i].operation;
		if (operation == 'Drill')
			drillPaths.push(sortedByOperation[i])
	}
	drillPaths = optimizePathOrder(drillPaths);

	//todo finish optimization for profile paths with same tool
	var sortedToolpaths = [];

	for (path of drillPaths) {
		sortedToolpaths.push(path);
	}
	for (var i = 0; i < sortedByOperation.length; i++) {

		var operation = sortedByOperation[i].operation;
		if (operation != 'Drill')
			sortedToolpaths.push(sortedByOperation[i])
	}

	// Get spindle speed from first visible toolpath, or use default
	var spindleSpeed = 18000; // Default RPM
	for (var i = 0; i < sortedToolpaths.length; i++) {
		if (sortedToolpaths[i].visible && sortedToolpaths[i].tool && sortedToolpaths[i].tool.rpm) {
			spindleSpeed = sortedToolpaths[i].tool.rpm;
			break;
		}
	}

	// Add spindle on command if provided
	if (profile.spindleOnGcode && profile.spindleOnGcode.trim() !== '') {
		output += applyGcodeTemplate(profile.spindleOnGcode, { s: spindleSpeed }) + '\n';
	}

	var lastToolId = null;

	for (var i = 0; i < sortedToolpaths.length; i++) {
		var visible = sortedToolpaths[i].visible;
		if (visible) {
			var name = sortedToolpaths[i].id;
			var operation = sortedToolpaths[i].operation;
			var toolStep = sortedToolpaths[i].tool.step || 0;
			var bit = sortedToolpaths[i].tool.bit;
			var radius = sortedToolpaths[i].tool.diameter / 2;
			var depth = sortedToolpaths[i].tool.depth;
			var woodSpecies = getOption("woodSpecies");
			var feed = calculateFeedRate(sortedToolpaths[i].tool, woodSpecies, operation);
			var zfeed = calculateZFeedRate(sortedToolpaths[i].tool, woodSpecies, operation);
			var angle = sortedToolpaths[i].tool.angle;

			var paths = sortedToolpaths[i].paths;
			var zbacklash = getOption("zbacklash");
			var safeHeight = getOption("safeHeight") + zbacklash;

			// Check for tool change
			var currentToolId = sortedToolpaths[i].tool.recid;
			if (lastToolId !== null && lastToolId !== currentToolId) {
				// Insert tool change G-code
				if (profile.toolChangeGcode && profile.toolChangeGcode.trim() !== '') {
					output += profile.toolChangeGcode + '\n';
				}
				// Add spindle on command with new tool's RPM
				var toolRpm = sortedToolpaths[i].tool.rpm || 18000;
				if (profile.spindleOnGcode && profile.spindleOnGcode.trim() !== '') {
					output += applyGcodeTemplate(profile.spindleOnGcode, { s: toolRpm }) + '\n';
				}
			}
			lastToolId = currentToolId;

			// Add tool information comment for 3D visualization
			var toolInfo = 'Tool: ID=' + currentToolId +
				' Type=' + (sortedToolpaths[i].tool.bit || 'End Mill') +
				' Diameter=' + sortedToolpaths[i].tool.diameter +
				' Angle=' + (sortedToolpaths[i].tool.angle || 0) +
				' StepDown=' + toolStep;
			var toolComment = formatComment(toolInfo, profile);
			if (toolComment) output += toolComment + '\n';

			// Handle pocket operations differently - complete each layer before going deeper
			if (operation == 'Pocket') {
				var comment = formatComment(operation + ' ' + name, profile);
				if (comment) output += comment + '\n';

				var z = safeHeight;
				output += applyGcodeTemplate(profile.rapidTemplate, { z: z, f: zfeed / 2 }) + '\n';

				var left = depth;
				var pass = 0;

				// Loop through depth passes
				while (left > 0) {
					pass++;
					left -= toolStep;
					if (left < 0 || toolStep <= 0) left = 0;

					z = left - depth;
					var passComment = formatComment('pass ' + pass, profile);
					if (passComment) output += passComment + '\n';

					// Convert feed rates based on profile units
					var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
					var feedZ = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;
					var zCoord = toGcodeUnitsZ(z, useInches);

					var firstInfillInPass = true;

					// Process INFILL chains first
					// Chains are now atomic units - no gaps within a chain, only rapids between chains
					for (var k = 0; k < paths.length; k++) {
						var pathObj = paths[k];
						if (pathObj.isContour) continue;  // Skip contours for now

						var path = pathObj.tpath;

						if (path.length > 0) {
							if (firstInfillInPass) {
								// First infill chain of this pass: retract to safe height, rapid to start, plunge
								var p = toGcodeUnits(path[0].x, path[0].y, useInches);
								output += applyGcodeTemplate(profile.rapidTemplate, { z: safeHeight, f: feedZ }) + '\n';
								output += applyGcodeTemplate(profile.rapidTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
								output += applyGcodeTemplate(profile.cutTemplate, { z: zCoord, f: feedZ }) + '\n';
								firstInfillInPass = false;
							} else {
								// Subsequent infill chains: retract and rapid to chain start
								// (Chains are separated by islands, so we need to rapid over them)
								var p = toGcodeUnits(path[0].x, path[0].y, useInches);
								output += applyGcodeTemplate(profile.rapidTemplate, { z: safeHeight, f: feedZ }) + '\n';
								output += applyGcodeTemplate(profile.rapidTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
								output += applyGcodeTemplate(profile.cutTemplate, { z: zCoord, f: feedZ }) + '\n';
							}

							// Cut entire chain - no gap detection needed since chains are atomic
							// All points in a chain are connected without crossing islands
							for (var j = 1; j < path.length; j++) {
								var p = toGcodeUnits(path[j].x, path[j].y, useInches);
								// Normal cutting move - all moves within a chain are continuous
								output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
							}
						}
					}

					// Process CONTOUR lines last (finishing operation)
					for (var k = 0; k < paths.length; k++) {
						var pathObj = paths[k];
						if (!pathObj.isContour) continue;  // Only process contours

						var path = pathObj.tpath;

						if (path.length > 0) {
							// Every contour gets full retract/rapid/plunge treatment
							var p = toGcodeUnits(path[0].x, path[0].y, useInches);
							output += applyGcodeTemplate(profile.rapidTemplate, { z: safeHeight, f: feedZ }) + '\n';
							output += applyGcodeTemplate(profile.rapidTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
							output += applyGcodeTemplate(profile.cutTemplate, { z: zCoord, f: feedZ }) + '\n';

							// Cut entire contour path
							for (var j = 1; j < path.length; j++) {
								var p = toGcodeUnits(path[j].x, path[j].y, useInches);
								output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
							}
						}
					}
				}
			}
			else // Non-pocket operations (Drill, VCarve, profiles)
			{
				for (var k = 0; k < paths.length; k++) {
					var path = paths[k].tpath;

					var comment = formatComment(operation + ' ' + name, profile);
					if (comment) output += comment + '\n';

					var z = safeHeight;
					var lastZ = z;
					var movingUp = false;

					// Convert units for this section
					var zCoordSafe = toGcodeUnitsZ(z, useInches);
					var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
					var feedZ = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;

					output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';

					if (operation == 'Drill') {
						z = 0;
						var left = depth;
						var pass = 0;
						path = paths[k].path;
						for (var j = 0; j < path.length; j++) {
							// Retract to safe height before moving to next hole
							if (j > 0) {
								output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';
							}

							// Move to hole position at safe height
							var p = toGcodeUnits(path[j].x, path[j].y, useInches);
							output += applyGcodeTemplate(profile.rapidTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';

							// Reset left for this hole
							left = depth;

							while (left > 0) {
								left -= toolStep;
								if (left < 0 || toolStep <= 0) left = 0;

								z = left - depth;
								var zCoord = toGcodeUnitsZ(z, useInches);
								var zCoordPullUp = toGcodeUnitsZ(z + toolStep + zbacklash, useInches);
								output += applyGcodeTemplate(profile.cutTemplate, { z: zCoord, f: feedZ }) + '\n';  // Use G1 for cutting move
								output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordPullUp, f: feedZ / 2 }) + '\n'; // pull up to clear chip at rapid
							}
						}

						// Retract to safe height after drilling hole is complete
						output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';
					}
					else if (operation == 'VCarve In' || operation == 'VCarve Out' || operation == 'VCarve') {
						z = 0;

						for (var j = 0; j < path.length; j++) {

							var p = toGcodeUnits(path[j].x, path[j].y, useInches);
							var cz = toolDepth(angle, path[j].r);
							cz = -toGcodeUnitsZ(cz, useInches);

							if (movingUp == false && lastZ < cz) movingUp = true;
							else movingUp = false;

							lastZ = cz;

							if (movingUp) {
								cz += (useInches ? zbacklash / MM_PER_INCH : zbacklash);
								cz = Math.round((cz + 0.00001) * 10000) / 10000;
								var vcarveZFeed = calculateZFeedRate(sortedToolpaths[i].tool, woodSpecies, operation) / 2;
								feedZ = useInches ? Math.round(vcarveZFeed / MM_PER_INCH * 100) / 100 : vcarveZFeed;
							}
							else {
								var vcarveZFeed = calculateZFeedRate(sortedToolpaths[i].tool, woodSpecies, operation);
								feedZ = useInches ? Math.round(vcarveZFeed / MM_PER_INCH * 100) / 100 : vcarveZFeed;
							}


							if (j == 0) {
								// Move to first point at safe height, then plunge
								output += applyGcodeTemplate(profile.rapidTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
							}

							output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: cz, f: feedZ }) + '\n';
						}

					}
					else // path profile
					{
						z = 0;

						//if (bit == 'VBit') {
						//	let maxRadius = vbitRadius(sortedToolpaths[i].tool);
						//	depth = toolDepth(angle, maxRadius);
						//}
						var left = depth;
						var pass = 0;
						var isFirstPass = true;

						// Get tabs from source SVG path for tab avoidance
						var svgPath = null;
						var tabs = [];
						var toolRadiusWorld = radius * viewScale; // Convert MM radius to world units
						var workpieceThickness = getOption("workpieceThickness");

						if (sortedToolpaths[i].svgId) {
							for (var spIdx = 0; spIdx < svgpaths.length; spIdx++) {
								if (svgpaths[spIdx].id === sortedToolpaths[i].svgId) {
									svgPath = svgpaths[spIdx];
									break;
								}
							}
						}

						if (svgPath && svgPath.creationProperties && svgPath.creationProperties.tabs) {
							tabs = svgPath.creationProperties.tabs;
						}

						// Pre-calculate tab markers with tool radius offset included
						const tabLengthMM = svgPath && svgPath.creationProperties ? (svgPath.creationProperties.tabLength || 0) : 0;
						const tabHeightMM = svgPath && svgPath.creationProperties ? (svgPath.creationProperties.tabHeight || 0) : 0;
						const markers = (tabs.length > 0) ? calculateTabMarkers(path, tabs, tabLengthMM, toolRadiusWorld, viewScale) : [];

						const augmentedPath = (markers.length > 0) ? augmentToolpathWithMarkers(path, markers) : path;

						while (augmentedPath.length && left > 0) {
							var currentlyLifted = false;  // Persistent state across segments
							var firstMarkerPos = null;    // Track first marker for cleanup
							var startedLifted = false;    // Track if we started lifted

							for (var j = 0; j < augmentedPath.length; j++) {
								var pt = augmentedPath[j];
								var p = toMM(pt.x, pt.y);

								if (j == 0) {
									pass++;
									left -= toolStep;
									if (left < 0 || toolStep <= 0) left = 0;

									z = left - depth;
									var passComment = formatComment('pass ' + pass, profile);
									if (passComment) output += passComment + '\n';

									// Calculate tab lift amount for this depth
									var tabLift = getTabLiftAmount(z, tabs, workpieceThickness, tabHeightMM);

									// Find first marker in augmented path to detect if tab blocks path start
									let firstMarkerIndex = -1;
									for (let mIdx = 1; mIdx < augmentedPath.length; mIdx++) {
										if (augmentedPath[mIdx].marker) {
											firstMarkerIndex = mIdx;
											firstMarkerPos = augmentedPath[mIdx];
											break;
										}
									}

									// Determine if tab is blocking path start
									// If first marker is closer than 2*toolRadius from start, tab is in the way
									let distToFirstMarker = Infinity;
									if (firstMarkerPos) {
										const pt0 = augmentedPath[0];
										const dx = firstMarkerPos.x - pt0.x;
										const dy = firstMarkerPos.y - pt0.y;
										distToFirstMarker = Math.sqrt(dx * dx + dy * dy);
									}

									const tabBlocksStart = (distToFirstMarker <= 2 * toolRadiusWorld);

									var safeZCoord = toGcodeUnitsZ(safeHeight, useInches);

									if (isFirstPass) {
										// FIRST PASS: Retract to safe height, rapid to start XY position
										output += applyGcodeTemplate(profile.rapidTemplate, { z: safeZCoord, f: zfeed / 2 }) + '\n';
										output += applyGcodeTemplate(profile.rapidTemplate, { x: p.x, y: p.y, f: feed }) + '\n';
										isFirstPass = false;
									}
									// MIDDLE PASSES: Already at correct XY from end of previous pass (closed path)
									// No retract or XY movement needed - just plunge to new depth below

									// Determine plunge depth based on whether tab blocks start at this new depth
									var startZCoord;
									if (tabBlocksStart && tabLift > 0) {
										// Plunge to lifted height to clear tab at start
										startZCoord = toGcodeUnitsZ(z + tabLift, useInches);
										currentlyLifted = true;
										startedLifted = true;
									} else {
										// Plunge to full cutting depth
										startZCoord = toGcodeUnitsZ(z, useInches);
										currentlyLifted = false;
										startedLifted = false;
									}

									// Plunge Z with cutting feed (G1, not rapid G0)
									output += applyGcodeTemplate(profile.cutTemplate, { z: startZCoord, f: zfeed }) + '\n';

									// Cutting move to first point
									output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: startZCoord, f: feed }) + '\n';
								}
								else {
									// Process augmented path point with possible marker
									if (pt.marker) {
										// This point is a marker (lift or lower)
										var tabLift = getTabLiftAmount(z, tabs, workpieceThickness, tabHeightMM);

										if (pt.marker === 'lift') {
											// First: Cut to marker position at normal depth
											var zNormalCoord = toGcodeUnitsZ(z, useInches);
											output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zNormalCoord, f: feed }) + '\n';

											// Then: Lift at marker position (cutting move, in case tool radius cuts top of material)
											var zLiftedCoord = toGcodeUnitsZ(z + tabLift, useInches);
											output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zLiftedCoord, f: feed }) + '\n';

											// Mark as lifted - maintains state across subsequent segments
											currentlyLifted = true;
										}
										else if (pt.marker === 'lower') {
											// First: Move to marker position at lifted height (cutting move to cut top of material over tabs)
											var zLiftedCoord = toGcodeUnitsZ(z + tabLift, useInches);
											output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zLiftedCoord, f: feed }) + '\n';

											// Then: Lower back to cutting depth at this position (cutting move)
											var zNormalCoord = toGcodeUnitsZ(z, useInches);
											output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zNormalCoord, f: feed }) + '\n';

											// No longer lifted
											currentlyLifted = false;
										}
									}
									else {
										// Regular path point
										if (currentlyLifted) {
											// Continue at lifted height (cutting move to cut top of material over tabs) - maintain lifted state
											var tabLift = getTabLiftAmount(z, tabs, workpieceThickness, tabHeightMM);
											var zLiftedCoord = toGcodeUnitsZ(z + tabLift, useInches);
											output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zLiftedCoord, f: feed }) + '\n';
										}
										else {
											// Normal cutting move (not lifted)
											var zNormalCoord = toGcodeUnitsZ(z, useInches);
											output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zNormalCoord, f: feed }) + '\n';
										}
									}
								}
							}

							// If we started lifted due to tab at path start, cut remaining material at end of pass
							if (startedLifted && firstMarkerPos) {
								// Move back toward the first marker position to cut skipped material at path start
								var cleanupZCoord = toGcodeUnitsZ(z, useInches);
								var markerMM = toMM(firstMarkerPos.x, firstMarkerPos.y);
								output += applyGcodeTemplate(profile.cutTemplate, { x: markerMM.x, y: markerMM.y, z: cleanupZCoord, f: feed }) + '\n';
							}
						}
					}
				}
			}

			// Retract to safe height after finishing shape (before moving to next shape)
			output += applyGcodeTemplate(profile.rapidTemplate, { z: safeHeight, f: zfeed / 2 }) + '\n';
		}
	}

	// Add final retract to safe height
	output += applyGcodeTemplate(profile.rapidTemplate, { z: safeHeight, f: zfeed / 2 }) + '\n';

	// Add spindle off command if provided
	if (profile.spindleOffGcode && profile.spindleOffGcode.trim() !== '') {
		output += profile.spindleOffGcode + '\n';
	}

	// Add end G-code if provided
	if (profile.endGcode && profile.endGcode.trim() !== '') {
		output += profile.endGcode + '\n';
	}

	return output;
}

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
	document.getElementById('start-simulation').disabled = true;
	document.getElementById('pause-simulation').disabled = false;
	document.getElementById('stop-simulation').disabled = false;
	document.getElementById('2d-total-time').textContent = formatTime(simulationData.totalTime);

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

	if (simulationState.isPaused) {
		pauseBtn.innerHTML = '<i data-lucide="play"></i> Resume';
		cancelAnimationFrame(simulationState.animationFrame);
	} else {
		pauseBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
		runSmoothSimulation();
	}
	lucide.createIcons();
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
	document.getElementById('start-simulation').innerHTML = '<i data-lucide="Play"></i> Play';
	document.getElementById('start-simulation').disabled = false;
	document.getElementById('pause-simulation').disabled = true;
	document.getElementById('stop-simulation').disabled = true;
	document.getElementById('pause-simulation').innerHTML = '<i data-lucide="pause"></i> Pause';
	document.getElementById('2d-simulation-time').textContent = '0:00';
	lucide.createIcons();

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
function setSimulationStep(step) {
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
	document.getElementById('2d-simulation-time').textContent = formatTime(elapsedTime);
	updateStatusWithSimulation(elapsedTime, simulationState.totalTime);

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
	document.getElementById('2d-simulation-time').textContent = formatTime(elapsedTime);
	document.getElementById('2d-total-time').textContent = formatTime(simulationState.totalTime);
	updateStatusWithSimulation(elapsedTime, simulationState.totalTime);

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
