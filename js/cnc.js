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
// allow save & load of project
// revamp undo/redo system can't undo move or delete

var viewScale = 10;
var pixelsPerInch = 72; // 72 for illustrator 96 for inkscape
var svgscale = viewScale * 25.4 / pixelsPerInch;
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var origin = { x: 800, y: 300 };

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


var lineColor = '#000000';
var selectColor = '#ff0000';
var highlightColor = '#00ff00';
var toolColor = '#0000ff';
var circleColor = '#0000ff';

var clipper = ClipperLib;
var scaleFactor = 1;
var offsetX = 0;
var offsetY = 0;
var selectBox = null;

var cncController = new CncController();

cncController.setupEventListeners();

canvas.addEventListener('mousewheel', handleScroll, false);

newProject();

function normalizeEventCoords(target, e) {

	if (!e) { e = self.event; }
	var x = 0;
	var y = 0;
	var rect = canvas.getBoundingClientRect();

	x = (e.clientX - rect.left) / (rect.right - rect.left) * canvas.width;
	y = (e.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height;


	return { x: (x - target.offsetLeft - offsetX) / scaleFactor, y: (y - target.offsetTop - offsetY) / scaleFactor };
}

function handleScroll(evt) {
	var mouse = normalizeEventCoords(canvas, evt);
	var zoomX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
	var zoomY = evt.offsetY || (evt.pageY - canvas.offsetTop);

	var delta = evt.wheelDelta ? evt.wheelDelta / 40 : evt.detail ? -evt.detail : 0;
	if (delta) zoom(delta, zoomX, zoomY);
	return evt.preventDefault() && false;
};

function zoom(clicks, zoomX, zoomY) {

	var oldScale = scaleFactor;
	if (clicks > 0 && scaleFactor < 50) scaleFactor += 0.1;
	else if (clicks < 0 && scaleFactor > 0.2) scaleFactor -= 0.1;

	var zx = zoomX - offsetX;
	var zy = zoomY - offsetY;


	var px = zx / oldScale;
	var py = zy / oldScale;


	var nx = zx / scaleFactor;
	var ny = zy / scaleFactor;

	var dx = nx - px;
	var dy = ny - py;


	offsetX += dx * scaleFactor;
	offsetY += dy * scaleFactor;

	redraw();

}

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
				console.log(scaleX, scaleY);
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
					console.log('Creating polygon from points:', points.substring(0, 50) + '...');
					var paperPolygon = new paper.Path();
					var pointPairs = points.trim().split(/\s+/);
					for (var j = 0; j < pointPairs.length; j++) {
						var coords = pointPairs[j].split(',');
						if (coords.length >= 2) {
							var rawX = parseFloat(coords[0]);
							var rawY = parseFloat(coords[1]);
							var transformed = transformCoordinates(rawX, rawY);
							if (j === 0) {
								paperPolygon.moveTo(transformed.x, transformed.y);
							} else {
								paperPolygon.lineTo(transformed.x, transformed.y);
							}
						}
					}
					paperPolygon.closePath();
					console.log('Polygon created:', paperPolygon);
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
				var pointPairs = points.trim().split(/\s+/);
				for (var j = 0; j < pointPairs.length; j++) {
					var coords = pointPairs[j].split(',');
					if (coords.length >= 2) {
						var rawX = parseFloat(coords[0]);
						var rawY = parseFloat(coords[1]);
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
	var outterbbox = { minx: 2000, miny: 2000, maxx: 0, maxy: 0 }
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
	ctx.rect(x - 2, y - 2, 4, 4);
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

	ctx.moveTo(norm.x1, norm.y1);

	ctx.lineTo(norm.x2, norm.y2);
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

		var point = path[j];
		if (j == 0) {
			//drawMarker(point.x,point.y);
			ctx.moveTo(point.x, point.y);

		}
		else {
			ctx.lineTo(point.x, point.y);
			//drawMarker(point.x,point.y);
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

		var point = path[j];
		if (j == 0) {
			//drawMarker(point.x, point.y);
			ctx.moveTo(point.x, point.y);

		}
		else {
			//drawMarker(point.x, point.y);
			ctx.lineTo(point.x, point.y);
		}

	}
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color;
	ctx.stroke();


}

function drawDebug() {
	for (var i = 0; i < debug.length; i++) {

		ctx.beginPath();

		ctx.moveTo(debug[i].p.x, debug[i].p.y);

		ctx.lineTo(debug[i].s.x, debug[i].s.y);

		ctx.moveTo(debug[i].p.x, debug[i].p.y);

		ctx.lineTo(debug[i].e.x, debug[i].e.y);
		ctx.strokeStyle = '#00ffff';
		ctx.lineWidth = 1;
		ctx.stroke();
	}
}

function drawGrid() {
	ctx.beginPath();
	for (var y = -2000; y <= 2000; y += 10 * viewScale) {
		ctx.moveTo(-2000 + origin.x, y + origin.y);
		ctx.lineTo(2000 + origin.x, y + origin.y);

		ctx.moveTo(y + origin.x, -2000 + origin.y);
		ctx.lineTo(y + origin.x, 2000 + origin.y);
	}

	ctx.lineWidth = 0.5;
	ctx.strokeStyle = lineColor;
	ctx.stroke();

	ctx.fillStyle = "blue";
	for (var y = -2000; y <= 2000; y += 10 * viewScale) {

		ctx.fillText((y / viewScale), y + origin.x + 2, origin.y - 2);
		ctx.fillText((-y / viewScale), origin.x + 2, y + origin.y - 2);
	}

}

function drawOrigin() {
	ctx.beginPath();

	ctx.moveTo(-2000 + origin.x, origin.y);
	ctx.lineTo(2000 + origin.x, origin.y);

	ctx.moveTo(origin.x, -2000 + origin.y);
	ctx.lineTo(origin.x, 2000 + origin.y);


	ctx.lineWidth = 1;
	ctx.strokeStyle = "#0000ff";
	ctx.stroke();
}

function redraw() {
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	clear();
	ctx.setTransform(scaleFactor, 0, 0, scaleFactor, offsetX, offsetY);
	if (getOption("Grid"))
		drawGrid();
	if (getOption("Origin"))
		drawOrigin();
	drawSvgPaths();
	drawToolPaths();

	cncController.draw();

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
				setIcon(id, 'fa fa-circle-o');
			else
				setIcon(id, 'fa fa-eye-slash');
		}
	}
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].id == id) {
			toolpaths[i].visible = visible;
			if (visible)
				setIcon(id, 'fa fa-circle-o');
			else
				setIcon(id, 'fa fa-eye-slash');
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

	var w = $('#canvas').parent()[0].clientWidth;
	var h = $('#canvas').parent()[0].clientHeight;


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

	offsetX = (2000 - w) / 2;
	offsetY = (2000 - h) / 2;

	$('#canvas').parent()[0].scrollTop = offsetY;
	$('#canvas').parent()[0].scrollLeft = offsetX;
	origin.x = 800;
	origin.y = 300;
}

function addUndo(toolPathschanged=false, svgPathsChanged=false, originChanged=false) {

	if (toolPathschanged || svgPathsChanged || originChanged) {
		var project = {
			toolpaths: toolPathschanged ? toolpaths : null,
			svgpaths: svgPathsChanged ? svgpaths : null,
			origin: originChanged ? origin : null
		};
		if (undoList.length < 20) {
			undoList.push(JSON.stringify(project));
		}
		else{
			undoList.shift();
			undoList.push(JSON.stringify(project));
		}
	}

}

function doUndo() {
	if(undoList.length == 0) return;
	var project = JSON.parse(undoList.pop());

	if (project.origin) origin = project.origin;
	if (project.toolpaths) {
	    clearToolPaths();
		toolpaths = project.toolpaths;
		toolpathId = 1;
		for (var i in toolpaths) {
			addToolPath('' + toolpathId, toolpaths[i].operation + ' ' + toolpathId, toolpaths[i].operation, toolpaths[i].tool.name);
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


function saveProject() {
	var project = {
		toolpaths: toolpaths,
		svgpaths: svgpaths,
		origin: origin
	};

}

function saveProject() {
	var project = {
		toolpaths: toolpaths,
		svgpaths: svgpaths,
		origin: origin
	};
	var json = JSON.stringify(project);
	var blob = new Blob([json], { type: "application/json" });
	var url = URL.createObjectURL(blob);
	var a = document.createElement("a");
	a.href = url;
	a.download = "project.json";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

function loadProject(json) {

	newProject();

	var project = JSON.parse(json);
	origin = project.origin;
	toolpaths = project.toolpaths;
	svgpaths = project.svgpaths;

	svgpathId = 1;
	for (var i in svgpaths) {
		addSvgPath(svgpaths[i].id, svgpaths[i].name);
		svgpathId++;
	}
	toolpathId = 1;
	for (var i in toolpaths) {
		addToolPath('' + toolpathId, toolpaths[i].operation + ' ' + toolpathId, toolpaths[i].operation, toolpaths[i].tool.name);
	}

	cncController.setMode("Select");
	redraw();
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
	center();
	cncController.setMode("Select");

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


function pushToolPath(paths, name) {
	addUndo(true, false, false);
	toolpaths.push({ id: toolpathId, paths: paths, visible: true, operation: name, tool: { ...currentTool } });
	addToolPath('' + toolpathId, name + ' ' + toolpathId, name, currentTool.name);
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
		pushToolPath(paths, name);
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
		pushToolPath(paths, name);
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

		pushToolPath(paths, name);
	}
	unselectAll();

}

function doOrigin() {
	cncController.setMode("Origin");
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

	pushToolPath(paths, name);

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
		pushToolPath(paths, name);
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

function medialAxis(name, path, holes) {
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


	var tpath = [];
	/*	
		for(var i in path)
		{
		   var p = path[i];		
		   min = Number.MAX_VALUE;
		   for(var j in circles)
		   {
			   var c = circles[j];
			   var dist = (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y);
			   if(dist < min) {
				   min = dist;
				   index = j;
			   }
		   }
		   tpath.push(circles[index]);
	
		}
		*/
	//tpath = clipper.JS.Lighten(circles, getOption("tolerance"));
	tpath = circles;
	var paths = [];
	paths.push({ path: tpath, tpath: circles });

	pushToolPath(paths, name);


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
		medialAxis(name, path, holes);
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

		medialAxis(name, path);
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

		pushToolPath(paths, name);

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

function doGcode() {
	if (toolpaths.length == 0) {
		notify('No toolpaths to export');
		return;
	}
	var text = toGcode();
	saveString(text, currentFileName + '.gcode')
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

function toGcode() {
	var output = "G21\n"; // mm

	for (var i = 0; i < toolpaths.length; i++) {
		var visible = toolpaths[i].visible;
		if (visible) {
			var name = toolpaths[i].id;
			var operation = toolpaths[i].operation;
			var toolStep = toolpaths[i].tool.step;
			var bit = toolpaths[i].tool.bit;
			var radius = toolpaths[i].tool.diameter / 2;
			var depth = toolpaths[i].tool.depth;
			var feed = toolpaths[i].tool.feed;
			var zfeed = toolpaths[i].tool.zfeed;
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
							zfeed = toolpaths[i].tool.zfeed / 2;
						}
						else {
							zfeed = toolpaths[i].tool.zfeed;
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
