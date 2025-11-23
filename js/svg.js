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
function parseSvgContent(data, name) {
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

