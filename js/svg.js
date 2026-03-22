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
function parseSvgPointsElements(svgElement, tagName, label, closePath) {
	var results = [];
	var elements = svgElement.getElementsByTagName(tagName);
	for (var i = 0; i < elements.length; i++) {
		var points = elements[i].getAttribute('points');
		if (!points) continue;
		try {
			var paperPath = new paper.Path();
			var pointValues = points.trim().split(/[\s,]+/);
			for (var j = 0; j < pointValues.length; j += 2) {
				if (j + 1 < pointValues.length) {
					var rawX = parseFloat(pointValues[j]);
					var rawY = parseFloat(pointValues[j + 1]);
					if (j === 0) {
						paperPath.moveTo(rawX, rawY);
					} else {
						paperPath.lineTo(rawX, rawY);
					}
				}
			}
			if (closePath) paperPath.closePath();
			var convertedPaths = newTransformFromPaperPath(paperPath, label);
			results = results.concat(convertedPaths);
		} catch (e) {
			console.error('Error creating ' + tagName + ':', e);
		}
	}
	return results;
}

function parseSvgPathElements(svgElement) {
	var paths = [];
	var pathElements = svgElement.getElementsByTagName('path');
	for (var i = 0; i < pathElements.length; i++) {
		var d = pathElements[i].getAttribute('d');
		if (!d) continue;
		try {
			var paperPath = new paper.CompoundPath(d);
			var children = paperPath.children;
			if (children && children.length > 0) {
				for (var j = 0; j < children.length; j++) {
					paths = paths.concat(newTransformFromPaperPath(children[j], "Path"));
				}
			} else if (paperPath.segments && paperPath.segments.length > 0) {
				paths = paths.concat(newTransformFromPaperPath(paperPath, "Path"));
			} else {
				var simplePath = new paper.Path(d);
				if (simplePath.segments && simplePath.segments.length > 0) {
					paths = paths.concat(newTransformFromPaperPath(simplePath, "Path"));
				}
			}
		} catch (pathError) {
			console.error('Error creating Paper.js path:', pathError);
		}
	}
	return paths;
}

function parseSvgLineElements(svgElement) {
	var paths = [];
	var lineElements = svgElement.getElementsByTagName('line');
	for (var i = 0; i < lineElements.length; i++) {
		var lineEl = lineElements[i];
		var paperLine = new paper.Path();
		paperLine.moveTo(parseFloat(lineEl.getAttribute('x1')), parseFloat(lineEl.getAttribute('y1')));
		paperLine.lineTo(parseFloat(lineEl.getAttribute('x2')), parseFloat(lineEl.getAttribute('y2')));
		paths = paths.concat(newTransformFromPaperPath(paperLine, "Line"));
	}
	return paths;
}

function parseSvgRectElements(svgElement) {
	var paths = [];
	var rectElements = svgElement.getElementsByTagName('rect');
	for (var i = 0; i < rectElements.length; i++) {
		var rectEl = rectElements[i];
		var paperRect = new paper.Path.Rectangle(
			parseFloat(rectEl.getAttribute('x') || 0), parseFloat(rectEl.getAttribute('y') || 0),
			parseFloat(rectEl.getAttribute('width')), parseFloat(rectEl.getAttribute('height'))
		);
		paths = paths.concat(newTransformFromPaperPath(paperRect, "Rect"));
	}
	return paths;
}

function parseSvgCircleElements(svgElement) {
	var paths = [];
	var circleElements = svgElement.getElementsByTagName('circle');
	for (var i = 0; i < circleElements.length; i++) {
		var circleEl = circleElements[i];
		var paperCircle = new paper.Path.Circle(
			parseFloat(circleEl.getAttribute('cx') || 0), parseFloat(circleEl.getAttribute('cy') || 0),
			parseFloat(circleEl.getAttribute('r'))
		);
		paths = paths.concat(newTransformFromPaperPath(paperCircle, "Circle"));
	}
	return paths;
}

function parseSvgEllipseElements(svgElement) {
	var paths = [];
	var ellipseElements = svgElement.getElementsByTagName('ellipse');
	for (var i = 0; i < ellipseElements.length; i++) {
		var ellipseEl = ellipseElements[i];
		var rawCx = parseFloat(ellipseEl.getAttribute('cx') || 0);
		var rawCy = parseFloat(ellipseEl.getAttribute('cy') || 0);
		var radiusX = parseFloat(ellipseEl.getAttribute('rx'));
		var radiusY = parseFloat(ellipseEl.getAttribute('ry'));
		var paperEllipse = new paper.Path.Ellipse({
			center: new paper.Point(rawCx, rawCy),
			radius: new paper.Size(radiusX, radiusY)
		});
		paths = paths.concat(newTransformFromPaperPath(paperEllipse, "Ellipse"));
	}
	return paths;
}

function parseSvgTextElements(svgElement) {
	var paths = [];
	var textElements = svgElement.getElementsByTagName('text');
	for (var i = 0; i < textElements.length; i++) {
		var textEl = textElements[i];
		var textContent = textEl.textContent || textEl.text || '';
		if (!textContent.trim()) continue;
		try {
			var paperText = new paper.PointText(
				parseFloat(textEl.getAttribute('x') || 0),
				parseFloat(textEl.getAttribute('y') || 0)
			);
			paperText.content = textContent;
			paperText.fontSize = parseFloat(textEl.getAttribute('font-size') || 12);
			var textPath = paperText.createPath();
			paths = paths.concat(newTransformFromPaperPath(textPath, "Text"));
		} catch (textError) {
			console.warn('Could not convert text element to path:', textError);
		}
	}
	return paths;
}

// Lighten, center on workpiece, and register parsed SVG paths
function importParsedPaths(paths, name) {
	addUndo(false, true, false);

	const svgGroupId = 'svg-group-' + Date.now();
	const groupedPaths = [];

	// Lighten paths
	for (var i = 0; i < paths.length; i++) {
		var lightened = clipper.JS.Lighten(paths[i].geom, getOption("tolerance") * viewScale);
		paths[i].geom = (Array.isArray(lightened) && lightened.length > 0) ? lightened : [];
	}

	// Calculate bounding box of all imported paths to center them on workpiece
	var importedBbox = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
	for (var i = 0; i < paths.length; i++) {
		if (paths[i].geom && paths[i].geom.length > 0 && paths[i].geom[0] && typeof paths[i].geom[0].x === 'number') {
			var pathBbox = boundingBox(paths[i].geom);
			if (importedBbox.minx > pathBbox.minx) importedBbox.minx = pathBbox.minx;
			if (importedBbox.miny > pathBbox.miny) importedBbox.miny = pathBbox.miny;
			if (importedBbox.maxx < pathBbox.maxx) importedBbox.maxx = pathBbox.maxx;
			if (importedBbox.maxy < pathBbox.maxy) importedBbox.maxy = pathBbox.maxy;
		}
	}

	// Calculate offset to center paths on workpiece
	var offsetX = 0;
	var offsetY = 0;
	if (importedBbox.minx !== Infinity) {
		var importedCenterX = (importedBbox.minx + importedBbox.maxx) / 2;
		var importedCenterY = (importedBbox.miny + importedBbox.maxy) / 2;
		var workpieceCenterX = (getOption("workpieceWidth") * viewScale) / 2;
		var workpieceCenterY = (getOption("workpieceLength") * viewScale) / 2;
		offsetX = workpieceCenterX - importedCenterX;
		offsetY = workpieceCenterY - importedCenterY;
	}

	// Apply offset to center paths and create path objects
	for (var i = 0; i < paths.length; i++) {
		if (paths[i].geom && paths[i].geom.length > 0 && paths[i].geom[0] && typeof paths[i].geom[0].x === 'number') {
			var geom = paths[i].geom;
			var len = geom.length;
			var isClosed = len > 1 && geom[len - 1].x === geom[0].x && geom[len - 1].y === geom[0].y;
			var stopAt = isClosed ? len - 1 : len;
			for (var j = 0; j < stopAt; j++) {
				geom[j].x += offsetX;
				geom[j].y += offsetY;
			}
			if (isClosed) {
				geom[len - 1].x = geom[0].x;
				geom[len - 1].y = geom[0].y;
			}

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

	if (typeof addSvgGroup === 'function' && groupedPaths.length > 0) {
		addSvgGroup(svgGroupId, name, groupedPaths);
	}
}

function parseSvgContent(data, name) {
	try {
		if (!initPaperJS()) {
			console.warn('Paper.js initialization failed, falling back to old parser');
			return null;
		}

		if (paper.project) {
			paper.project.clear();
		}

		// Detect DPI based on SVG source
		if (data.indexOf("Adobe Illustrator") >= 0) {
			pixelsPerInch = 72;
		} else if (data.indexOf("woodgears.ca") >= 0) {
			pixelsPerInch = 254;
		} else if (data.indexOf("tinkercad") >= 0) {
			pixelsPerInch = 25.4;
		} else {
			pixelsPerInch = 96;
		}
		svgscale = viewScale * 25.4 / pixelsPerInch;

		var svgElement = new DOMParser().parseFromString(data, "image/svg+xml").documentElement;

		// Parse all SVG element types
		var paths = [];
		paths = paths.concat(parseSvgPathElements(svgElement));
		paths = paths.concat(parseSvgPointsElements(svgElement, 'polygon', 'Poly', true));
		paths = paths.concat(parseSvgPointsElements(svgElement, 'polyline', 'PolyLine', false));
		paths = paths.concat(parseSvgLineElements(svgElement));
		paths = paths.concat(parseSvgRectElements(svgElement));
		paths = paths.concat(parseSvgCircleElements(svgElement));
		paths = paths.concat(parseSvgEllipseElements(svgElement));
		paths = paths.concat(parseSvgTextElements(svgElement));

		importParsedPaths(paths, name);

		return paths;
	} catch (error) {
		console.error('Error parsing SVG with Paper.js:', error);
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
			// Push a copy of the first point, not a reference to it
			geom.push({ x: geom[0].x, y: geom[0].y });
		}

		// Only add path if it has geometry
		if (geom.length > 1) {
			paths.push({
				geom: geom,
				name: name
			});
		} else if (geom.length === 1) {
			// Single point - create a small line segment
			// Note: point.x and point.y are already scaled
			var point = geom[0];
			geom.push({
				x: point.x + 0.1,
				y: point.y + 0.1
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

