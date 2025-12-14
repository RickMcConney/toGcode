var clipper = ClipperLib;

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
	var toolRadius = tool.diameter / 2;
	var depth = tool.depth || 1;

	// Ball Nose: spherical profile - effective radius at depth
	if (tool.bit === "Ball Nose") {
		// For a sphere: r = sqrt(d * (2R - d)) where R is ball radius, d is depth
		if (depth <= 0) {
			return 0;  // No cutting at surface level
		}
		// Only valid if d <= R (within spherical part)
		if (depth <= toolRadius) {
			var r = Math.sqrt(depth * (2 * toolRadius - depth));
			return r;
		}
		// If depth > radius, we're past the equator - use max radius
		return toolRadius;
	}

	// V-Bit: conical profile - radius at depth
	if (tool.bit === "VBit") {
		var angle = tool.angle * Math.PI / 180.0;
		var r = depth * Math.tan(angle / 2);
		// Cap at maximum diameter
		if (r > toolRadius) r = toolRadius;
		return r;
	}

	// End Mill and other tools: constant radius
	return toolRadius;
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

function generateClipperInfill(inputPaths, stepOverDistance, radius, angle = 0) {
	// Normalize winding order to ensure consistent behavior regardless of user draw direction
	let normalizedPaths = normalizeWindingOrder(inputPaths);

	// Calculate center point for rotation
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	normalizedPaths.flat().forEach(point => {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	});
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;

	// If angle is not 0, rotate input boundaries by -angle for horizontal infill generation
	if (angle !== 0) {
		const angleRad = -angle * Math.PI / 180;
		normalizedPaths = normalizedPaths.map(path =>
			path.map(point => rotatePoint(point, centerX, centerY, angleRad))
		);
	}

	const clipper = new ClipperLib.Clipper();
	// Determine the bounding box to generate infill lines (for rotated paths if angle != 0)
	minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
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

	// If angle is not 0, rotate all result paths back by +angle to original orientation
	if (angle !== 0) {
		const angleRad = angle * Math.PI / 180;
		for (let group of groups) {
			for (let path of group.paths) {
				for (let point of path) {
					const rotated = rotatePoint(point, centerX, centerY, angleRad);
					point.x = rotated.x;
					point.y = rotated.y;
				}
			}
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
 * @param {Array} infillGroups - Array of groups from generateClipperInfill() (sorted by Y, paths already rotated)
 * @param {number} stepover - Stepover distance
 * @param {number} angle - Infill angle (paths already rotated back to original orientation by generateClipperInfill)
 * @returns {Array} Array of chains, each containing segments from one X-region
 */
function extractConnectivityChains(infillGroups, stepover, angle = 0) {
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

function detectMultiSegment(path) {
	// Detect if path has gaps (islands) by checking for large jumps
	const totalLength = calculatePathLength(path);
	const pointCount = path.length;
	const avgSegmentLength = totalLength / Math.max(pointCount - 1, 1);

	for (let i = 0; i < path.length - 1; i++) {
		const segmentLength = Math.hypot(
			path[i + 1].x - path[i].x,
			path[i + 1].y - path[i].y
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
			path[i + 1].x - path[i].x,
			path[i + 1].y - path[i].y
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

function medialAxis(name, path, holes, svgId, holeSvgIds) {

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

	// Collect all SVG IDs: outer path + all holes
	var allSvgIds = [svgId];
	if (holeSvgIds && holeSvgIds.length > 0) {
		allSvgIds = allSvgIds.concat(holeSvgIds);
	}

	pushToolPath(paths, name, 'VCarve', svgId, allSvgIds);
}

function computeWithMedialAxis(outside, name) {
	var selected = selectMgr.selectedPaths();
	var paths = [];

	for (var i in selected) {
		if (selected[i].hole) continue;
		var holes = []
		var holeSvgIds = []
		var path = selected[i].path;
		for (var j in selected) {
			if (i != j) {
				if (pathIn(path, selected[j].path)) {
					holes.push(selected[j].path);
					holeSvgIds.push(selected[j].id);
					selected[j].hole = true;
				}
			}
		}
		medialAxis(name, path, holes, selected[i].id, holeSvgIds);
	}

}

function computeVcarve(outside, name) {
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

