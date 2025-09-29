// --- Virtual coordinate system for zoom/pan ---
var zoomLevel = .5; // initial zoom
var panX = 0; // will be calculated dynamically by centerWorkpiece()
var panY = 0; // will be calculated dynamically by centerWorkpiece()
var origin = { x: 0, y: 0 }; // origin in virtual coordinates

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
	var newZoom = Math.max(0.2, Math.min(50, zoomLevel * zoomFactor));
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



	console.log(`Centering workpiece: canvas(${canvasCenter.x}, ${canvasCenter.y}), workpiece(${workpieceWidth}, ${workpieceLength}), zoom(${zoomLevel}), pan(${panX.toFixed(1)}, ${panY.toFixed(1)})`);
}


//todo tab support
//pocket stops short of inner lines 
//support feed rates and tool dimension in inches as well as mm
//blocked paths need to be turned into travel moves
// order gcode by tool
// make norms for rect not good
// undo does not remove sidebar folder
// center of rick path generate 0 lenght tool paths
// support delete key
// make hole does not add svg path
// add finish pass to pockets
// close pen path if last point near first and smooth
// add poly tool
// allow edit pen path
// revamp undo/redo system can't undo move or delete
// first travel move missing



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
var MAX_UNDO = 50;


var lineColor = '#000000';
var selectColor = '#ff0000';
var highlightColor = '#00ff00';
var toolColor = '#0000ff';
var circleColor = '#0000ff';

var clipper = ClipperLib;
var scaleFactor = 4;
var offsetX = 0;
var offsetY = 0;
var selectBox = null;

var cncController = new CncController();

cncController.setupEventListeners();

//canvas.addEventListener('mousewheel', handleScroll, false);

// New mousewheel event for newZoom
canvas.addEventListener('mousewheel', function(evt) {
	var rect = canvas.getBoundingClientRect();
	var zoomX = evt.clientX - rect.left;
	var zoomY = evt.clientY - rect.top;
	var delta = evt.deltaY < 0 ? 1 : -1;
	newZoom(delta, zoomX, zoomY);
	evt.preventDefault();
}, { passive: false });

// Add window resize handler to re-center workpiece when viewport changes
window.addEventListener('resize', function() {
	// Debounce resize events to avoid excessive recalculations
	clearTimeout(window.resizeTimeout);
	window.resizeTimeout = setTimeout(function() {
		centerWorkpiece();
		redraw();
	}, 150);
});

function handleScroll(evt) {
	var mouse = normalizeEventCoords(canvas, evt);
	var zoomX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
	var zoomY = evt.offsetY || (evt.pageY - canvas.offsetTop);

	var delta = evt.wheelDelta ? evt.wheelDelta / 40 : evt.detail ? -evt.detail : 0;
	if (delta) zoom(delta, zoomX, zoomY);
	return evt.preventDefault() && false;
};



function unselectAll() {
	for (var i = 0; i < svgpaths.length; i++) {
		svgpaths[i].selected = false;

	}
	unselectSidebarNode(null);
}

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
		console.log('Paper.js initialized successfully');
		return true;
	} catch (error) {
		console.error('Failed to initialize Paper.js:', error);
		return false;
	}
}

// New robust SVG parsing using Paper.js library
function newParseSvgContent(data) {
	try {

		// Initialize Paper.js if needed
		if (!initPaperJS()) {
			console.warn('Paper.js initialization failed, falling back to old parser');
			return null;
		}

		// Paper.js is now properly initialized

		// Parse SVG using Paper.js
		if (data.indexOf("Adobe Illustrator") >= 0) {
			console.log("Adobe 72")
			pixelsPerInch = 72;
		}
		else if (data.indexOf("woodgears.ca") >= 0) {
			console.log("Woodgears 254")
			pixelsPerInch = 254; // 100 pixels per mm
		}
		else {
			console.log("Inkscape 92")
			pixelsPerInch = 96;
		}
		svgscale = viewScale * 25.4 / pixelsPerInch;

		var svgDoc = new DOMParser().parseFromString(data, "image/svg+xml");
		var svgElement = svgDoc.documentElement;

		// Handle viewBox and scaling
		var viewBox = svgElement.getAttribute('viewBox');
		var width = parseFloat(svgElement.getAttribute('width')) || 100;
		var height = parseFloat(svgElement.getAttribute('height')) || 100;

		// Parse viewBox if present
		var viewBoxCoords = null;
		if (viewBox) {
			var viewBoxParts = viewBox.split(/\s+/);
			if (viewBoxParts.length === 4) {
				viewBoxCoords = {
					x: parseFloat(viewBoxParts[0]),
					y: parseFloat(viewBoxParts[1]),
					width: parseFloat(viewBoxParts[2]),
					height: parseFloat(viewBoxParts[3])
				};
			}
		}

		// Create transformation function for coordinate system
		function transformCoordinates(x, y) {
			if (viewBoxCoords) {
				// Transform from viewBox coordinates to screen coordinates
				var scaleX = width / viewBoxCoords.width;
				var scaleY = height / viewBoxCoords.height;

				scaleX = 1;
				scaleY = 1;
				return {
					x: (x - viewBoxCoords.x) * scaleX * svgscale,
					y: (y - viewBoxCoords.y) * scaleY * svgscale
				};
			} else {
				return {
					x: x * svgscale,
					y: y * svgscale
				};
			}
		}

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
					console.log('Path data:', d);
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
							var transformed = transformCoordinates(rawX, rawY);
							if (j === 0) {
								paperPolygon.moveTo(transformed.x, transformed.y);
							} else {
								paperPolygon.lineTo(transformed.x, transformed.y);
							}
						}
					}
					paperPolygon.closePath();
					
					var convertedPaths = newTransformFromPaperPath(paperPolygon, "Poly");
					paths = paths.concat(convertedPaths);
				} catch (polygonError) {
					console.error('Error creating polygon:', polygonError);
					console.log('Points data:', points);
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
						var transformed = transformCoordinates(rawX, rawY);
						if (j === 0) {
							paperPolyline.moveTo(transformed.x, transformed.y);
						} else {
							paperPolyline.lineTo(transformed.x, transformed.y);
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
			var transformed1 = transformCoordinates(rawX1, rawY1);
			var transformed2 = transformCoordinates(rawX2, rawY2);

			var paperLine = new paper.Path();
			paperLine.moveTo(transformed1.x, transformed1.y);
			paperLine.lineTo(transformed2.x, transformed2.y);

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
			var transformed = transformCoordinates(rawX, rawY);
			var transformedSize = transformCoordinates(rawWidth, rawHeight);

			var paperRect = new paper.Path.Rectangle(transformed.x, transformed.y, transformedSize.x, transformedSize.y);
			var convertedPaths = newTransformFromPaperPath(paperRect, "Rect");
			paths = paths.concat(convertedPaths);
		}

		// Parse circle elements
		var circleElements = svgElement.getElementsByTagName('circle');
		for (var i = 0; i < circleElements.length; i++) {
			var circleEl = circleElements[i];
			var rawCx = parseFloat(circleEl.getAttribute('cx') || 0);
			var rawCy = parseFloat(circleEl.getAttribute('cy') || 0);
			var rawR = parseFloat(circleEl.getAttribute('r'));
			var transformed = transformCoordinates(rawCx, rawCy);
			var radius = rawR * svgscale; // Radius doesn't need viewBox transformation

			var paperCircle = new paper.Path.Circle(transformed.x, transformed.y, radius);
			var convertedPaths = newTransformFromPaperPath(paperCircle, "Circle");
			paths = paths.concat(convertedPaths);
		}

		// Parse ellipse elements
		var ellipseElements = svgElement.getElementsByTagName('ellipse');
		for (var i = 0; i < ellipseElements.length; i++) {
			var ellipseEl = ellipseElements[i];
			var rawCx = parseFloat(ellipseEl.getAttribute('cx') || 0);
			var rawCy = parseFloat(ellipseEl.getAttribute('cy') || 0);
			var rawRx = parseFloat(ellipseEl.getAttribute('rx'));
			var rawRy = parseFloat(ellipseEl.getAttribute('ry'));
			var transformed = transformCoordinates(rawCx, rawCy);
			var radiusX = rawRx * svgscale; // Radii don't need viewBox transformation
			var radiusY = rawRy * svgscale;

			var paperEllipse = new paper.Path.Ellipse(transformed.x, transformed.y, radiusX, radiusY);
			var convertedPaths = newTransformFromPaperPath(paperEllipse, "Ellipse");
			paths = paths.concat(convertedPaths);
		}

		// Parse text elements (convert to paths)
		var textElements = svgElement.getElementsByTagName('text');
		for (var i = 0; i < textElements.length; i++) {
			var textEl = textElements[i];
			var rawX = parseFloat(textEl.getAttribute('x') || 0);
			var rawY = parseFloat(textEl.getAttribute('y') || 0);
			var transformed = transformCoordinates(rawX, rawY);
			var textContent = textEl.textContent || textEl.text || '';

			if (textContent.trim()) {
				try {
					var paperText = new paper.PointText(transformed.x, transformed.y);
					paperText.content = textContent;
					paperText.fontSize = parseFloat(textEl.getAttribute('font-size') || 12) * svgscale;

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
				console.log('Transform found on element:', transform);
			}
		}
		addUndo(false, true, false);
		for (var i = 0; i < paths.length; i++) {
			paths[i].geom = clipper.JS.Lighten(paths[i].geom, getOption("tolerance"));
			if (paths[i].geom.length > 0) {
				let name = paths[i].name + ' ' + svgpathId;
				let id = paths[i].name + svgpathId;
				svgpaths.push({ id: id, name: name, path: paths[i].geom, visible: true, bbox: boundingBox(paths[i].geom) });
				addSvgPath(id, name);
				svgpathId++;
			}

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
			geom.push({
				x: segments[0].point.x * svgscale,
				y: segments[0].point.y * svgscale
			});
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
		console.log('Path object:', paperPath);

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
function parseSvgContent(data) {
	return newParseSvgContent(data);
}





function drawMarker(x, y) {
	ctx.beginPath();
	var pt = worldToScreen(x, y);
	ctx.rect(pt.x - 2, pt.y - 2, 4, 4);
	ctx.fillStyle = 'black';
	ctx.fill();
	ctx.strokeStyle = '#888';
	ctx.stroke();
}

function clear() {
	ctx.globalAlpha = 1;
	ctx.beginPath();
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'white';
	ctx.fill();
	ctx.strokeStyle = '#888';
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
		drawLine(norm, '#0000ff');
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
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color;
	ctx.stroke();


}



function drawPath(path, color, lineWidth) {
	ctx.beginPath();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	for (var j = 0; j < path.length; j++) {
		var pt = worldToScreen(path[j].x, path[j].y);
		if (j == 0) {
			ctx.moveTo(pt.x, pt.y);
		} else {
			ctx.lineTo(pt.x, pt.y);
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
		ctx.strokeStyle = '#00ffff';
		ctx.lineWidth = 1;
		ctx.stroke();
	}
}



// New drawGrid using virtual coordinates
function drawGrid() {
	ctx.beginPath();
	// Get workpiece dimensions
	const width = getOption("workpieceWidth")*viewScale;
	const length = getOption("workpieceLength")*viewScale;
	// Workpiece bounds in world coordinates

	var startX = 0;
	var startY = 0;
	var topLeft = worldToScreen(startX, startY);
	var bottomRight = worldToScreen(width, length);
	let o = worldToScreen(origin.x, origin.y);
	let gridSize = (typeof getOption !== 'undefined' && getOption("gridSize")) ? getOption("gridSize") : 10;
	let grid = gridSize*viewScale*zoomLevel;



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
	const width = getOption("workpieceWidth")*viewScale;
	const length = getOption("workpieceLength")*viewScale;
	// Workpiece bounds in world coordinates

	var startX = 0;
	var startY = 0;
	var topLeft = worldToScreen(startX, startY);
	var bottomRight = worldToScreen(startX + width, startY + length);
	let o = worldToScreen(origin.x, origin.y);
	let gridSize = (typeof getOption !== 'undefined' && getOption("gridSize")) ? getOption("gridSize") : 10;
	let grid = gridSize*viewScale*zoomLevel;

	let offsetx = 0;
	let offsety = 0;


	// Draw blue X axis only within workpiece bounds

	ctx.moveTo(offsetx+topLeft.x,offsety+o.y);
	ctx.lineTo(offsetx+bottomRight.x,offsety+o.y);
	ctx.moveTo(offsetx+o.x,offsety+topLeft.y);
	ctx.lineTo(offsetx+o.x,offsety+bottomRight.y);

	ctx.lineWidth = 1;
	ctx.strokeStyle = "#0000ff";
	ctx.stroke();

	// Draw axis numbers - use 10mm intervals if grid size is less than 10mm, otherwise use grid size
	ctx.fillStyle = "blue";
	ctx.font = "12px Arial";

	let numberInterval = gridSize < 10 ? 10 : gridSize;
	let numberGrid = numberInterval * viewScale * zoomLevel;

	// Draw Y axis labels (vertical positions)
	let label = 0;
	for (var y = o.y; y <= bottomRight.y; y += numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			ctx.fillText(-label, o.x + 2, y - 2);
		}
		label += numberInterval;
	}
	label = 0;
	for (var y = o.y; y >= topLeft.y; y -= numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			ctx.fillText(-label, o.x + 2, y - 2);
		}
		label -= numberInterval;
	}

	// Draw X axis labels (horizontal positions)
	label = 0;
	for (var x = o.x; x <= bottomRight.x; x += numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			ctx.fillText(label, x + 2, o.y - 2);
		}
		label += numberInterval;
	}
	label = 0;
	for (var x = o.x; x >= topLeft.x; x -= numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			ctx.fillText(label, x + 2, o.y - 2);
		}
		label -= numberInterval;
	}

	// Draw origin marker (0,0)
	ctx.fillStyle = "red";
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
	var woodColor = '#F5DEB3';
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
	ctx.strokeStyle = "#888888";
	ctx.lineWidth = 0.5;
	ctx.stroke();
}

// Calculate feed rate based on tool and wood species
function calculateFeedRate(tool, woodSpecies) {
	if (!getOption("autoFeedRate") || !tool) {
		return tool ? tool.feed : 600; // Return original feed rate if auto calculation is disabled
	}

	// Get wood species data - check if database exists
	if (typeof woodSpeciesDatabase === 'undefined') {
		return tool.feed; // Fallback if database not available
	}

	var speciesData = woodSpeciesDatabase[woodSpecies];
	if (!speciesData) {
		return tool.feed; // Return original feed rate if species not found
	}

	// Base calculation factors
	var baseFeed = tool.feed;
	var toolDiameter = tool.diameter;
	var feedMultiplier = speciesData.feedMultiplier;

	// Adjust feed rate based on tool diameter (smaller tools need slower feeds)
	var diameterFactor = Math.max(0.5, Math.min(2.0, toolDiameter / 6.0)); // 6mm reference diameter

	// Adjust based on tool type
	var toolTypeFactor = 1.0;
	if (tool.bit === 'VBit') {
		toolTypeFactor = 0.7; // V-bits need slower feeds
	} else if (tool.bit === 'Drill') {
		toolTypeFactor = 0.6; // Drills need slower feeds for plunge
	}

	// Calculate final feed rate
	var calculatedFeed = baseFeed * feedMultiplier * diameterFactor * toolTypeFactor;

	// Ensure reasonable bounds (100-2000 mm/min)
	return Math.max(100, Math.min(2000, Math.round(calculatedFeed)));
}

// Calculate Z feed rate (plunge rate)
function calculateZFeedRate(tool, woodSpecies) {
	if (!getOption("autoFeedRate") || !tool) {
		return tool ? tool.zfeed : 200;
	}

	// Check if database exists
	if (typeof woodSpeciesDatabase === 'undefined') {
		return tool.zfeed; // Fallback if database not available
	}

	var speciesData = woodSpeciesDatabase[woodSpecies];
	if (!speciesData) {
		return tool.zfeed;
	}

	// Z feed is typically 20-40% of XY feed for wood
	var calculatedXYFeed = calculateFeedRate(tool, woodSpecies);
	var zFeedRate = calculatedXYFeed * 0.3;

	// Ensure reasonable bounds (50-500 mm/min)
	return Math.max(50, Math.min(500, Math.round(zFeedRate)));
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
	ctx.beginPath();
	ctx.arc(circle.x, circle.y, circle.r, 0, 2 * Math.PI);
	ctx.strokeStyle = circleColor;
	ctx.lineWidth = 0.1;
	ctx.stroke();
}

function drawCircles(circles, color) {
	for (var i = 0; i < circles.length; i++) {
		var circle = circles[i];
		ctx.beginPath();
		ctx.arc(circle.x, circle.y, circle.r || circle.radius, 0, 2 * Math.PI);
		if (i < circles.length - 1)
			canvasDrawArrow(ctx, circle.x, circle.y, circles[i + 1].x, circles[i + 1].y);

		ctx.strokeStyle = color;
		ctx.lineWidth = 0.5;
		ctx.stroke();
	}



}

function fillCircles(circles, color) {
	for (var i = 0; i < circles.length; i++) {
		var circle = circles[i];
		ctx.beginPath();
		ctx.arc(circle.x, circle.y, circle.r, 0, 2 * Math.PI);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.strokeStyle = color;
		ctx.lineWidth = 0.1;
		ctx.stroke();
	}

}

function drawBoundingBox(bbox) {
	ctx.beginPath();
	ctx.moveTo(bbox.minx, bbox.miny);
	ctx.lineTo(bbox.minx, bbox.maxy);
	ctx.lineTo(bbox.maxx, bbox.maxy);
	ctx.lineTo(bbox.maxx, bbox.miny);
	ctx.lineTo(bbox.minx, bbox.miny);
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
			svgpath = svgpaths[i];
			var bbox = svgpath.bbox;
			// drawBoundingBox(bbox);
			// drawNearby();


			if (svgpath.highlight)
				drawSvgPath(svgpath, highlightColor, 3);
			if (svgpath.selected)
				drawSvgPath(svgpath, selectColor, 3);


			if (!svgpath.selected || svgpath.highlight)
				drawSvgPath(svgpath, lineColor, 0.5);
		}
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
			for (var p = 0; p < paths.length; p++) {
				raw = false;
				var path = paths[p].tpath;
				if (raw)
					path = paths[p].path;
				var tpath = paths[p].tpath;
				var operation = toolpaths[i].operation;

				if (operation == "Drill")
					if (toolpaths[i].selected)
						fillCircles(path, '#' + toolpaths[i].tool.color);
					else
						drawCircles(path, '#' + toolpaths[i].tool.color);
				if (tpath) {
					if (toolpaths[i].selected) {
						drawCircles(path, '#' + toolpaths[i].tool.color);
						drawPath(tpath, '#' + toolpaths[i].tool.color, 3);
					}
					else
						drawPath(tpath, '#' + toolpaths[i].tool.color, 2);
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
			console.log("dnorm = 0");
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

function largestEmptyCircles(norms, startRadius, subpath) {
	var circles = [];

	for (var i = 0; i < norms.length; i++) {
		var n = norms[i];
		var inc = 0.1;
		var point = {};
		for (var r = inc; r < startRadius; r += inc) {
			point.x = n.x1 + (n.dx * (r + inc));
			point.y = n.y1 + (n.dy * (r + inc));
			if (!bitFits(point, r) || r >= startRadius - 1) {
				point.r = r;
				circles.push(point);
				break;
			}
		}
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
			if (visible)
				setHidden(id, false);
			else
				setHidden(id, true);
		}
	}
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].id == id) {
			toolpaths[i].visible = visible;
			if (visible)
				setHidden(id, false);
			else
				setHidden(id, true);
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


		console.log("width " + boxWidth + " height " + boxHeight);

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
	}

}

function doUndo() {
	if (undoList.length == 0) return;
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
		options: options
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

	// Center the workpiece in the canvas viewport
	centerWorkpiece();
	cncController.setMode("Select");
	loadOptions();
	loadTools();
	const width = getOption("workpieceWidth")*viewScale;
	const length = getOption("workpieceLength")*viewScale;
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
			svgpaths[i].selected = !svgpaths[i].selected;
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


function pushToolPath(paths, name, svgId) {
	addUndo(true, false, false);
	toolpaths.push({ id: "T" + toolpathId, paths: paths, visible: true, operation: name, tool: { ...currentTool }, svgId: svgId });
	addToolPath('T' + toolpathId, name + ' ' + toolpathId, name, currentTool.name);
	toolpathId++;

	redraw();
}

function doOutside() {
	if (currentTool.bit != 'End Mill') {
		notify('Select End Mill to Profile');
		return;
	}
	if (getSelectedPath() == null) {
		notify('Select a path to Profile');
		return;
	}

	setMode("Outside");
	var radius = toolRadius();
	var name = 'Outside';

	for (var i = 0; i < svgpaths.length; i++) {
		var paths = [];
		var svgpath = svgpaths[i].path;
		if (!svgpaths[i].selected || !svgpaths[i].visible) continue;

		nearbypaths = nearbyPaths(svgpaths[i], radius);

		var offsetPaths = offsetPath(svgpath, radius, true);

		for (var p = 0; p < offsetPaths.length; p++) {
			var path = offsetPaths[p];
			var subpath = subdividePath(path, 2);
			var circles = checkPath(subpath, radius - 1);

			//var tpath1 = clipper.Clipper.SimplifyPolygon(circles,ClipperLib.PolyFillType.pftNonZero);   
			var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));

			//var tpath2 = window.simplify(circles,0.1,true);
			if (currentTool.direction != "Climb") {
				var rcircles = reversePath(circles);
				var rtpath = reversePath(tpath);
				paths.push({ path: rcircles, tpath: rtpath });
			}
			else {
				paths.push({ path: circles, tpath: tpath });
			}

		}
		pushToolPath(paths, name, svgpaths[i].id);
	}
	unselectAll();
}

function reversePath(path) {
	var reverse = [];
	for (i = path.length - 1; i >= 0; i--)
		reverse.push(path[i]);
	return reverse;
}

function doInside() {

	if (currentTool.bit != 'End Mill') {
		notify('Select End Mill to Profile');
		return;
	}
	if (getSelectedPath() == null) {
		notify('Select a path to Profile');
		return;
	}
	setMode("Inside");

	var radius = toolRadius();
	var name = 'Inside';

	for (var i = 0; i < svgpaths.length; i++) {
		var paths = [];
		if (!svgpaths[i].selected || !svgpaths[i].visible) continue;

		nearbypaths = nearbyPaths(svgpaths[i], 0);

		var svgpath = svgpaths[i].path;

		var offsetPaths = offsetPath(svgpath, radius, false);

		for (var p = 0; p < offsetPaths.length; p++) {
			var path = offsetPaths[p];
			var subpath = subdividePath(path, 2);
			var circles = checkPath(subpath, radius - 1);
			//var tpath = window.simplify(circles,0.1,true);
			var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));
			if (currentTool.direction == "Climb") {
				var rcircles = reversePath(circles);
				var rtpath = reversePath(tpath);
				paths.push({ path: rcircles, tpath: rtpath });
			}
			else {
				paths.push({ path: circles, tpath: tpath });
			}
		}
		pushToolPath(paths, name, svgpaths[i].id);
	}
	unselectAll();
}

function doCenter() {
	if (currentTool.bit != 'End Mill' && currentTool.bit != 'VBit') {
		notify('Select End Mill or VBit for center cut');
		return;
	}
	if (getSelectedPath() == null) {
		notify('Select a path to Vcarve');
		return;
	}

	setMode("Center");
	var radius = toolRadius();
	var name = 'Center';

	for (var i = 0; i < svgpaths.length; i++) {
		var paths = [];
		var path = svgpaths[i].path;
		if (!svgpaths[i].selected || !svgpaths[i].visible) continue;
		var subpath = subdividePath(path, 2);
		var circles = addCircles(subpath, radius);
		var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));
		//if(svgpaths[i].id.indexOf("Line") >=0 )
		tpath.pop(); // remove last point if not a closed path

		if (currentTool.direction != "Climb") {
			var rcircles = reversePath(circles);
			var rtpath = reversePath(tpath);
			paths.push({ path: rcircles, tpath: rtpath });
		}
		else {
			paths.push({ path: circles, tpath: tpath });
		}

		pushToolPath(paths, name, svgpaths[i].id);
	}
	unselectAll();

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

function doPen() {
	cncController.setMode("Pen");
	unselectAll();
}

function doPolygon() {
	cncController.setMode("Polygon");
	unselectAll();
}

function doText() {
	cncController.setMode("Text");
	unselectAll();
}

function doDrill() {
	if (currentTool.bit != 'Drill') {
		notify('Select Drill to drill');
		return;
	}
	cncController.setMode("Drill");
}

function makeHole(pt) {
	if (currentTool.bit != 'Drill') {
		notify('Select Drill to drill');
		return;
	}
	var name = 'Drill';

	var radius = toolRadius();
	var paths = [];
	paths.push({ tpath: [{ x: pt.x, y: pt.y, r: radius }], path: [{ x: pt.x, y: pt.y, r: radius }] });

	pushToolPath(paths, name, null);

}

function doPocket() {
	setMode("Pocket");
	if (currentTool.bit != 'End Mill') {
		notify('Select End Mill to Pocket');
		return;
	}
	if (getSelectedPath() == null) {
		notify('Select a path to pocket');
		return;
	}

	var radius = toolRadius();
	var stepover = 2 * radius * currentTool.stepover / 100;
	var name = 'Pocket';

	for (var i = 0; i < svgpaths.length; i++) {
		var paths = [];

		var path = svgpaths[i].path;
		if (!svgpaths[i].selected || !svgpaths[i].visible) continue;

		nearbypaths = nearbyPaths(svgpaths[i], radius);

		var offsetPaths = offsetPath(path, radius, false);
		while (offsetPaths.length > 0) {

			var path = offsetPaths.pop();
			var subpath = subdividePath(path, 2);
			var circles = checkPath(subpath, radius - 1);

			var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));

			if (tpath.length > 0) {
				if (currentTool.direction == "Climb") {
					var rcircles = reversePath(circles);
					var rtpath = reversePath(tpath);
					paths.push({ path: rcircles, tpath: rtpath });
				}
				else {
					paths.push({ path: circles, tpath: tpath });
				}


				var innerPaths = offsetPath(tpath, stepover, false);

				if (innerPaths.length == 0)
					innerPaths = offsetPath(tpath, stepover / 2, false);

				if (innerPaths.length == 0)
					innerPaths = offsetPath(tpath, stepover / 4, false);

				for (var j = 0; j < innerPaths.length; j++)
					offsetPaths.push(innerPaths[j]);
			}


		}
		pushToolPath(paths, name, svgpaths[i].id);
	}
	unselectAll();

}

function doVcarveIn() {
	if (currentTool.bit != 'VBit') {
		notify('Select VBit to VCarve');
		//w2alert('Select VBit to VCarve');
		return;
	}
	if (getSelectedPath() == null) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve In");
	compute(false, 'VCarve In');
	unselectAll();
}

function doVcarveOut() {
	if (currentTool.bit != 'VBit') {
		notify('Select VBit to VCarve');
		return;
	}
	if (getSelectedPath() == null) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve Out");
	compute(true, 'VCarve Out');
	unselectAll();
}
function getSelectedPath() {
	var path = [];
	for (var i = 0; i < svgpaths.length; i++)
		if (svgpaths[i].selected && svgpaths[i].visible)
			return svgpaths[i].path;
	return null;
}

function medialAxis(name, path, holes, svgId) {
	// todo need to find a way to traverse the medial axis.


	let descritize_threshold = 1e-1;
	//let descritize_method = 2;
	let descritize_method = 2;
	let filtering_angle = 3 * Math.PI / 4;
	let pointpoint_segmentation_threshold = -1;
	let number_usage = 0;
	let debug_flags = {
		no_parabola: false,
		show_sites: false
	};
	let intermediate_debug_data = null;


	var segments = JSPoly.construct_medial_axis(path, holes, descritize_threshold, descritize_method, filtering_angle, pointpoint_segmentation_threshold, number_usage, debug_flags, intermediate_debug_data);
	var circles = [];
	for (seg in segments) {
		seg = segments[seg];
		var p = { x: seg.point0.x, y: seg.point0.y, r: seg.point0.radius };
		//if (pointInPolygon(p, path))
		circles.push(p);
		var p1 = { x: seg.point1.x, y: seg.point1.y, r: seg.point1.radius };
		//if (pointInPolygon(p1, path))
		circles.push(p1);
	}
	circles = clipper.JS.Lighten(circles, getOption("tolerance"));

	var tpath = findBestPath(segments).toolpath;
	var paths = [{ path: circles, tpath: tpath }];
	pushToolPath(paths, name, svgId);
}
function compute(outside, name) {
	var selected = [];
	var paths = [];
	for (var i = 0; i < svgpaths.length; i++) {

		var path = svgpaths[i].path;
		if (svgpaths[i].selected)
			selected.push(svgpaths[i]);
	}

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
	var radius = toolRadius();

	for (var i = 0; i < svgpaths.length; i++) {
		var paths = [];
		var path = svgpaths[i].path;



		if (!svgpaths[i].selected || !svgpaths[i].visible) continue;

		medialAxis(name, path, [], svgpaths[i].id);
		continue;

		var r = radius;

		if (outside)
			nearbypaths = nearbyPaths(svgpaths[i], radius);
		else
			nearbypaths = nearbyPaths(svgpaths[i], 1);

		var cw = isClockwise(path);
		if (outside) cw = !cw;


		var subpath = subdividePath(path, 2); // max path length

		norms = makeNorms(subpath, path, cw, 1, outside);

		var circles = largestEmptyCircles(norms, r, subpath);
		//var tpath = simplify(circles,2,true);
		var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));

		if (outside) {
			if (currentTool.direction != "Climb") {
				var rcircles = reversePath(circles);
				var rtpath = reversePath(tpath);
				paths.push({ path: rcircles, tpath: rtpath });
			}
			else {
				paths.push({ path: circles, tpath: tpath });
			}
		}
		else {
			if (currentTool.direction == "Climb") {
				var rcircles = reversePath(circles);
				var rtpath = reversePath(tpath);
				paths.push({ path: rcircles, tpath: rtpath });
			}
			else {
				paths.push({ path: circles, tpath: tpath });
			}
		}

		pushToolPath(paths, name, svgpaths[i].id);

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
	return radius / Math.tan(angle / 2);
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

function toGcode() {
	var output = "G0 G54 G17 G21 G90 G94\n"; // reset to known state

	for (var i = 0; i < toolpaths.length; i++) {
		var visible = toolpaths[i].visible;
		if (visible) {
			var name = toolpaths[i].id;
			var operation = toolpaths[i].operation;
			var toolStep = toolpaths[i].tool.step;
			var bit = toolpaths[i].tool.bit;
			var radius = toolpaths[i].tool.diameter / 2;
			var depth = toolpaths[i].tool.depth;
			var woodSpecies = getOption("woodSpecies");
			var feed = calculateFeedRate(toolpaths[i].tool, woodSpecies);
			var zfeed = calculateZFeedRate(toolpaths[i].tool, woodSpecies);
			var angle = toolpaths[i].tool.angle;

			var paths = toolpaths[i].paths;
			var zbacklash = getOption("zbacklash");
			var safeHeight = getOption("safeHeight") + zbacklash;

			for (var k = 0; k < paths.length; k++) {
				var path = paths[k].tpath;

				output += '(' + operation + ' ' + name + ')\n';

				var z = safeHeight;
				var lastZ = z;
				var movingUp = false;

				output += 'G0 Z' + z + ' F' + (zfeed / 2) + '\n';

				if (operation == 'Drill') {
					z = 0;
					var left = depth;
					var pass = 0;
					path = paths[k].path;
					for (var j = 0; j < path.length; j++) {
						var p = toMM(path[j].x, path[j].y);
						output += 'G0 X' + p.x + ' Y' + p.y + ' F' + feed + '\n';

						while (left > 0) {
							left -= toolStep;
							if (left < 0 || toolStep <= 0) left = 0;

							z = left - depth;
							output += 'G0 Z' + z + 'F' + zfeed + '\n';
							output += 'G0 Z' + (z + toolStep + zbacklash) + 'F' + zfeed + '\n'; // pull up to																// clear chip					
						}
					}
				}
				else if (operation == 'VCarve In' || operation == 'VCarve Out') {
					z = 0;

					for (var j = 0; j < path.length; j++) {

						var p = toMM(path[j].x, path[j].y);
						var cz = toolDepth(angle, path[j].r);
						var cz = -toMMZ(cz);

						if (movingUp == false && lastZ < cz) movingUp = true;
						else movingUp = false;

						lastZ = cz;

						if (movingUp) {
							cz += zbacklash;
							cz = Math.round((cz + 0.00001) * 100) / 100;
							zfeed = calculateZFeedRate(toolpaths[i].tool, woodSpecies) / 2;
						}
						else {
							zfeed = calculateZFeedRate(toolpaths[i].tool, woodSpecies);
						}


						if (j == 0) {
							output += 'G1 X' + p.x + ' Y' + p.y + ' F' + feed + '\n';
						}

						output += 'G1 X' + p.x + ' Y' + p.y + ' Z' + cz + ' F' + zfeed + '\n';
					}

				}
				else // path profile or pocket
				{
					z = 0;

					if (bit == 'VBit') {
						depth = toolDepth(angle, radius);
					}
					var left = depth;
					var pass = 0;
					while (path.length && left > 0) {
						for (var j = 0; j < path.length; j++) {
							var p = toMM(path[j].x, path[j].y);

							if (j == 0) {
								pass++;
								left -= toolStep;
								if (left < 0 || toolStep <= 0) left = 0;

								z = left - depth;
								output += '(pass ' + pass + ')\n';

								output += 'G0 X' + p.x + ' Y' + p.y + ' F' + feed + '\n';
								output += 'G0 Z' + z + ' F' + zfeed + '\n';
							}
							else {
								output += 'G1 X' + p.x + ' Y' + p.y + ' F' + feed + '\n';
							}
						}
					}
				}
			}
		}
	}
	output += 'G0 Z' + safeHeight + ' F' + (zfeed / 2) + '\n';
	return output;
}

// Parse G-code into simulation moves
function parseGcodeForSimulation(gcode) {
	var moves = [];
	var totalTime = 0;
	var currentPos = { x: 0, y: 0, z: 5 }; // Start at safe height
	var currentFeed = 600;
	var currentTool = null;
	var lines = gcode.split('\n');
	const zbacklash = getOption("zbacklash");

	// Find current tool info from comments
	var currentOperation = '';
	var currentToolDiameter = 6; // Default

	for (var i = 0; i < lines.length; i++) {
		var line = lines[i].trim();
		if (line === '' || line.startsWith(';')) continue;

		// Parse operation comments
		if (line.startsWith('(') && line.endsWith(')')) {
			var comment = line.substring(1, line.length - 1);
			currentOperation = comment;

			// Try to extract tool info from operation
			for (var j = 0; j < toolpaths.length; j++) {
				if (toolpaths[j].visible && comment.includes(toolpaths[j].id)) {
					currentTool = toolpaths[j].tool;
					currentToolDiameter = currentTool.diameter;
					break;
				}
			}
			continue;
		}

		var newPos = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
		var newFeed = currentFeed;
		var moveType = 'rapid'; // G0

		// Parse G-code commands
		var parts = line.split(' ');
		for (var j = 0; j < parts.length; j++) {
			var part = parts[j];
			if (part.startsWith('G')) {
				var gcode = parseInt(part.substring(1));
				if (gcode === 0) moveType = 'rapid';
				else if (gcode === 1) moveType = 'feed';
			} else if (part.startsWith('X')) {
				newPos.x = parseFloat(part.substring(1));
			} else if (part.startsWith('Y')) {
				newPos.y = parseFloat(part.substring(1));
			} else if (part.startsWith('Z')) {
				newPos.z = parseFloat(part.substring(1));
			} else if (part.startsWith('F')) {
				newFeed = parseFloat(part.substring(1));
			}
		}

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
			if (currentOperation.includes('VCarve') && currentTool && currentTool.angle > 0) {
				if (newPos.z > zbacklash) toolRadius = 0; // Clamp to 0 max
				else toolRadius = Math.abs(newPos.z) * Math.tan((currentTool.angle * Math.PI / 180) / 2);
			}

			moves.push({
				type: moveType,
				x: newPos.x,
				y: newPos.y,
				z: newPos.z,
				toolRadius: toolRadius,
				operation: currentOperation,
				time: moveTime,
				isCutting: newPos.z <= zbacklash,
				tool: currentTool
			});

			totalTime += moveTime;
		}

		currentPos = newPos;
		currentFeed = newFeed;
	}

	return {
		moves: moves,
		totalTime: totalTime
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
	materialRemovalPoints = [];
	simulationState.travelMoves = [];
	simulationState.lastPosition = null;

	// Update UI
	document.getElementById('start-simulation').disabled = true;
	document.getElementById('pause-simulation').disabled = false;
	document.getElementById('stop-simulation').disabled = false;
	document.getElementById('total-time').textContent = formatTime(simulationData.totalTime);

	// Setup step slider
	const stepSlider = document.getElementById('simulation-step');
	stepSlider.max = allMaterialPoints.length;
	stepSlider.value = 0;
	stepSlider.disabled = false;
	document.getElementById('step-display').textContent = `0/${allMaterialPoints.length}`;

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

	// Reset step slider
	const stepSlider = document.getElementById('simulation-step');
	stepSlider.max = 100;
	stepSlider.value = 0;
	stepSlider.disabled = true;
	document.getElementById('step-display').textContent = '0/0';

	// Update UI
	document.getElementById('start-simulation').innerHTML = '<i data-lucide="Play"></i> Play';
	document.getElementById('start-simulation').disabled = false;
	document.getElementById('pause-simulation').disabled = true;
	document.getElementById('stop-simulation').disabled = true;
	document.getElementById('pause-simulation').innerHTML = '<i data-lucide="pause"></i> Pause';
	document.getElementById('simulation-time').textContent = '0:00';
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
	document.getElementById('simulation-time').textContent = formatTime(elapsedTime);
	updateStatusWithSimulation(elapsedTime, simulationState.totalTime);
	document.getElementById('step-display').textContent = `${step}/${allMaterialPoints.length}`;

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
	document.getElementById('simulation-time').textContent = formatTime(elapsedTime);
	updateStatusWithSimulation(elapsedTime, simulationState.totalTime);

	// Update step slider to show current position
	const stepSlider = document.getElementById('simulation-step');
	stepSlider.value = simulationState.currentAnimationStep;
	document.getElementById('step-display').textContent = `${simulationState.currentAnimationStep}/${allMaterialPoints.length}`;

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
	document.getElementById('status').innerHTML = `<span>${statusText}</span>`;
}




function drawTravelMoves() {
	if (!simulationState.travelMoves || simulationState.travelMoves.length === 0) return;
	ctx.save();
	ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
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
				ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
			} else if (point.operation && point.operation.includes('VCarve')) {
				ctx.fillStyle = 'rgba(255, 100, 0, 0.4)';
			} else {
				ctx.fillStyle = 'rgba(255, 0, 100, 0.4)';
			}
		} else {
			if (point.operation && point.operation.includes('Drill')) {
				ctx.fillStyle = 'rgba(139, 69, 19, 0.2)';
			} else if (point.operation && point.operation.includes('VCarve')) {
				ctx.fillStyle = 'rgba(160, 82, 45, 0.2)';
			} else {
				ctx.fillStyle = 'rgba(101, 67, 33, 0.2)';
			}
		}
		ctx.fill();
	}
	ctx.restore();
}
