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
	if (operation === 'Pocket' || operation === 'Surfacing') {
		// Pocket/Surfacing: only stepover% of bit is engaged with fresh material
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
// Order: Surfacing (0), Drill (1), VCarve (2), Pocket (3), Profiles (4)
function getOperationPriority(operation) {
	if (operation === 'Surfacing') return 0;
	if (operation === 'Drill' || operation === 'HelicalDrill') return 1;
	if (operation === 'VCarve In' || operation === 'VCarve Out') return 2;
	if (operation === 'Pocket') return 3;
	// All profile operations (Inside, Outside, Center) come last
	return 4;
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

	// Tab zone extends from the bottom of the workpiece up by tabHeight
	// Tab surface is at depth: workpieceThickness - tabHeight from the top
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

// HELPER FUNCTION: Setup G-code profile with defaults
function _setupGcodeProfile() {
	return currentGcodeProfile || {
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
}

// HELPER FUNCTION: Return toolpaths in user-defined array order (no auto-sorting)
function _prepareAndSortToolpaths(allToolpaths) {
	return allToolpaths.slice();
}

// HELPER FUNCTION: Get spindle speed from first visible toolpath
function _getInitialSpindleSpeed(sortedToolpaths) {
	var defaultRPM = 18000;

	for (var i = 0; i < sortedToolpaths.length; i++) {
		if (sortedToolpaths[i].visible && sortedToolpaths[i].tool && sortedToolpaths[i].tool.rpm) {
			return sortedToolpaths[i].tool.rpm;
		}
	}

	return defaultRPM;
}

// HELPER FUNCTION: Generate G-code header
function _generateGcodeHeader(profile, spindleSpeed, useInches) {
	var output = "";

	// Add start G-code if provided
	if (profile.startGcode && profile.startGcode.trim() !== '') {
		output += profile.startGcode + '\n';
	}

	// Add spindle on command if provided
	if (profile.spindleOnGcode && profile.spindleOnGcode.trim() !== '') {
		output += applyGcodeTemplate(profile.spindleOnGcode, { s: spindleSpeed }) + '\n';
	}

	return output;
}

// HELPER FUNCTION: Generate tool change G-code
function _generateToolChangeGcode(tool, profile) {
	var output = "";

	if (profile.toolChangeGcode && profile.toolChangeGcode.trim() !== '') {
		output += profile.toolChangeGcode + '\n';
	}

	// Add spindle on command with new tool's RPM
	var toolRpm = tool.rpm || 18000;
	if (profile.spindleOnGcode && profile.spindleOnGcode.trim() !== '') {
		output += applyGcodeTemplate(profile.spindleOnGcode, { s: toolRpm }) + '\n';
	}

	return output;
}

// HELPER FUNCTION: Generate G-code footer
function _generateGcodeFooter(profile) {
	var output = "";

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

// HELPER FUNCTION: Process drill operations
function _generateDrillOperationGcode(toolpath, profile, useInches, settings) {
	var output = "";
	var { feed, zfeed, depth, toolStep, woodSpecies, safeHeight, zbacklash } = settings;
	var paths = toolpath.paths;

	for (var k = 0; k < paths.length; k++) {
		var path = paths[k].path;
		var comment = formatComment(toolpath.operation + ' ' + toolpath.id, profile);
		if (comment) output += comment + '\n';

		var z = safeHeight;
		var zCoordSafe = toGcodeUnitsZ(z, useInches);
		var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
		var feedZ = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;

		output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';

		z = 0;
		var left = depth;

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
				output += applyGcodeTemplate(profile.cutTemplate, { z: zCoord, f: feedZ }) + '\n';
				output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordPullUp, f: feedZ / 2 }) + '\n';
			}
		}

		// Retract to safe height after drilling
		output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';
	}

	return output;
}

// HELPER FUNCTION: Process helical drill operations
function _generateHelicalDrillOperationGcode(toolpath, profile, useInches, settings) {
	var output = "";
	var { feed, zfeed, depth, toolStep, safeHeight } = settings;
	var paths = toolpath.paths;

	var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
	var feedZ = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;
	// Use a blended feed rate for helical moves (simultaneous XY + Z)
	var helicalFeed = Math.min(feedXY, feedZ);
	var zCoordSafe = toGcodeUnitsZ(safeHeight, useInches);

	for (var k = 0; k < paths.length; k++) {
		var path = paths[k].tpath;
		if (!path || path.length === 0) continue;

		var comment = formatComment('HelicalDrill ' + toolpath.id, profile);
		if (comment) output += comment + '\n';

		// Rapid to safe height
		output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';

		// Rapid to start position
		var startP = toGcodeUnits(path[0].x, path[0].y, useInches);
		output += applyGcodeTemplate(profile.rapidTemplate, { x: startP.x, y: startP.y, f: feedXY }) + '\n';

		// Plunge to surface (z=0)
		output += applyGcodeTemplate(profile.cutTemplate, { z: toGcodeUnitsZ(0, useInches), f: feedZ }) + '\n';

		// Helical descent and final cleanup circle — all points have z values
		for (var j = 1; j < path.length; j++) {
			var p = toGcodeUnits(path[j].x, path[j].y, useInches);
			var zCoord = toGcodeUnitsZ(path[j].z, useInches);
			output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zCoord, f: helicalFeed }) + '\n';
		}

		// Retract to safe height
		output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';
	}

	return output;
}

// HELPER FUNCTION: Process V-carve operations
function _generateVcarveOperationGcode(toolpath, profile, useInches, settings) {
	var output = "";
	var { feed, zfeed, angle, woodSpecies, safeHeight, zbacklash } = settings;
	var paths = toolpath.paths;

	for (var k = 0; k < paths.length; k++) {
		var path = paths[k].tpath;
		var comment = formatComment(toolpath.operation + ' ' + toolpath.id, profile);
		if (comment) output += comment + '\n';

		var z = 0;
		var lastZ = z;
		var movingUp = false;
		var zCoordSafe = toGcodeUnitsZ(safeHeight, useInches);
		var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
		var feedZ = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;

		output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';

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
				var vcarveZFeed = calculateZFeedRate(toolpath.tool, woodSpecies, toolpath.operation) / 2;
				feedZ = useInches ? Math.round(vcarveZFeed / MM_PER_INCH * 100) / 100 : vcarveZFeed;
			} else {
				var vcarveZFeed = calculateZFeedRate(toolpath.tool, woodSpecies, toolpath.operation);
				feedZ = useInches ? Math.round(vcarveZFeed / MM_PER_INCH * 100) / 100 : vcarveZFeed;
			}

			if (j == 0) {
				// Move to first point at safe height, then plunge
				output += applyGcodeTemplate(profile.rapidTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
			}

			output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: cz, f: feedZ }) + '\n';
		}
	}

	return output;
}

// HELPER FUNCTION: Process surfacing operations
// Unlike pocket, surfacing stays at cut depth between passes — no safe-height retracts.
function _generateSurfacingOperationGcode(toolpath, profile, useInches, settings) {
	var output = "";
	var { feed, zfeed, depth, safeHeight } = settings;
	var paths = toolpath.paths;

	var comment = formatComment(toolpath.operation + ' ' + toolpath.id, profile);
	if (comment) output += comment + '\n';

	var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
	var feedZ  = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;
	var zCoord = toGcodeUnitsZ(-depth, useInches);

	var firstLine = true;
	for (var k = 0; k < paths.length; k++) {
		var path = paths[k].tpath;
		if (!path || path.length === 0) continue;

		var start = toGcodeUnits(path[0].x, path[0].y, useInches);

		if (firstLine) {
			// Initial retract, rapid to start XY, then plunge once
			output += applyGcodeTemplate(profile.rapidTemplate, { z: safeHeight, f: feedZ }) + '\n';
			output += applyGcodeTemplate(profile.rapidTemplate, { x: start.x, y: start.y, f: feedXY }) + '\n';
			output += applyGcodeTemplate(profile.cutTemplate, { z: zCoord, f: feedZ }) + '\n';
			firstLine = false;
		} else {
			// Stay at cut depth — feed move to start of next pass (not rapid, as the
			// workpiece may not be perfectly sized and the transition crosses the stock)
			output += applyGcodeTemplate(profile.cutTemplate, { x: start.x, y: start.y, f: feedXY }) + '\n';
		}

		// Cut across the pass
		for (var j = 1; j < path.length; j++) {
			var p = toGcodeUnits(path[j].x, path[j].y, useInches);
			output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
		}
	}

	return output;
}

// HELPER FUNCTION: Process 3D profile operations
// Each raster line has per-point Z values (in mm) for surface-following cuts.
function _generate3dProfileOperationGcode(toolpath, profile, useInches, settings) {
	var output = "";
	var { feed, zfeed, safeHeight } = settings;
	var paths = toolpath.paths;

	var comment = formatComment(toolpath.operation + ' ' + toolpath.id, profile);
	if (comment) output += comment + '\n';

	var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
	var feedZ  = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;
	var zCoordSafe = toGcodeUnitsZ(safeHeight, useInches);
	var lastEndX = null, lastEndY = null, lastEndZ = null;
	// Threshold for skipping retract: if next start is within this distance (mm)
	// of the last end point, feed directly instead of retract-rapid-plunge
	var nearThreshold = useInches ? 2.0 / MM_PER_INCH : 2.0; // 2mm

	for (var k = 0; k < paths.length; k++) {
		var path = paths[k].tpath;
		if (!path || path.length === 0) continue;

		var start = toGcodeUnits(path[0].x, path[0].y, useInches);
		var startZ = toGcodeUnitsZ(path[0].z, useInches);
		var isPassStart = paths[k].passStart || (lastEndX === null);

		if (isPassStart) {
			// Check if the next start point is near the last end point at same Z
			var isNear = false;
			if (lastEndX !== null) {
				var dx = start.x - lastEndX;
				var dy = start.y - lastEndY;
				var dist = Math.sqrt(dx * dx + dy * dy);
				var dz = Math.abs(startZ - lastEndZ);
				isNear = dist < nearThreshold && dz < 0.01;
			}

			if (isNear) {
				// Close enough — feed directly without retract
				output += applyGcodeTemplate(profile.cutTemplate, { x: start.x, y: start.y, z: startZ, f: feedXY }) + '\n';
			} else {
				// Far away — retract to safe height and rapid to start
				output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ }) + '\n';
				output += applyGcodeTemplate(profile.rapidTemplate, { x: start.x, y: start.y, f: feedXY }) + '\n';
				output += applyGcodeTemplate(profile.cutTemplate, { z: startZ, f: feedZ }) + '\n';
			}
		} else {
			// Continuous — feed directly to start of next segment
			output += applyGcodeTemplate(profile.cutTemplate, { x: start.x, y: start.y, z: startZ, f: feedXY }) + '\n';
		}

		// Feed along raster line with varying Z.
		// Simplify: skip intermediate points where Z isn't changing (flat sections).
		// We buffer the previous point and only emit it when the Z slope changes.
		var prevP = start;
		var prevZ = startZ;
		var pendingP = null;
		var pendingZ = null;

		for (var j = 1; j < path.length; j++) {
			var p = toGcodeUnits(path[j].x, path[j].y, useInches);
			var pz = toGcodeUnitsZ(path[j].z, useInches);

			if (pendingP !== null) {
				// Check if prev→pending→current are colinear in both XY direction AND Z
				// Only skip if all three points are on the same straight line in 3D
				var dz1 = pendingZ - prevZ;
				var dz2 = pz - pendingZ;
				var dx1 = pendingP.x - prevP.x, dy1 = pendingP.y - prevP.y;
				var dx2 = p.x - pendingP.x, dy2 = p.y - pendingP.y;
				// Cross product magnitude: if ~0, points are colinear in XY
				var cross = Math.abs(dx1 * dy2 - dy1 * dx2);
				if (cross < 0.005 && Math.abs(dz1 - dz2) < 0.005) {
					// Colinear in 3D — skip the pending point, extend the segment
					pendingP = p;
					pendingZ = pz;
					continue;
				}
				// Direction changed — emit the pending point
				output += applyGcodeTemplate(profile.cutTemplate, { x: pendingP.x, y: pendingP.y, z: pendingZ, f: feedXY }) + '\n';
				prevP = pendingP;
				prevZ = pendingZ;
			}

			pendingP = p;
			pendingZ = pz;
		}

		// Emit the last pending point
		if (pendingP !== null) {
			output += applyGcodeTemplate(profile.cutTemplate, { x: pendingP.x, y: pendingP.y, z: pendingZ, f: feedXY }) + '\n';
			lastEndX = pendingP.x;
			lastEndY = pendingP.y;
			lastEndZ = pendingZ;
		}
	}

	return output;
}

// HELPER FUNCTION: Find a point along a path at a given distance from the start (world units)
function getPointAlongPath(path, distance) {
	if (path.length < 2) return path[0];
	var remaining = distance;
	for (var i = 1; i < path.length; i++) {
		var dx = path[i].x - path[i - 1].x;
		var dy = path[i].y - path[i - 1].y;
		var segLen = Math.sqrt(dx * dx + dy * dy);
		if (segLen > 0 && remaining <= segLen) {
			var t = remaining / segLen;
			return { x: path[i - 1].x + dx * t, y: path[i - 1].y + dy * t };
		}
		remaining -= segLen;
	}
	// Path shorter than distance - return last reachable point
	return path[path.length - 1];
}

// HELPER FUNCTION: Generate ramp-in G-code sequence
// Instead of plunging straight down, ramps in along the path direction:
// 1. Rapid to a point offset 2x tool diameter along the path from start
// 2. Plunge to previous pass depth (one stepdown shallower)
// 3. Cut back to path start while ramping down to current depth
function generateRampIn(path, toolDiameter, currentZ, stepdown, safeHeight, profile, useInches, feedXY, feedZ) {
	var output = '';
	var rampDistWorld = 2 * toolDiameter * viewScale; // world units
	var safeZCoord = toGcodeUnitsZ(safeHeight, useInches);

	// Previous pass depth (one stepdown shallower, capped at surface)
	var prevZ = (stepdown > 0) ? Math.min(0, currentZ + stepdown) : 0;
	var prevZCoord = toGcodeUnitsZ(prevZ, useInches);
	var currentZCoord = toGcodeUnitsZ(currentZ, useInches);

	// Find the ramp point and which segment index it lands on
	var rampSegIdx = 0;
	var remaining = rampDistWorld;
	var rampPt = path[0];
	for (var i = 1; i < path.length; i++) {
		var dx = path[i].x - path[i - 1].x;
		var dy = path[i].y - path[i - 1].y;
		var segLen = Math.sqrt(dx * dx + dy * dy);
		if (segLen > 0 && remaining <= segLen) {
			var t = remaining / segLen;
			rampPt = { x: path[i - 1].x + dx * t, y: path[i - 1].y + dy * t };
			rampSegIdx = i;
			break;
		}
		remaining -= segLen;
		rampSegIdx = i;
		rampPt = path[i];
	}

	var rampCoord = toGcodeUnits(rampPt.x, rampPt.y, useInches);

	// Retract to safe height
	output += applyGcodeTemplate(profile.rapidTemplate, { z: safeZCoord, f: feedZ }) + '\n';
	// Rapid to ramp start point (offset along path)
	output += applyGcodeTemplate(profile.rapidTemplate, { x: rampCoord.x, y: rampCoord.y, f: feedXY }) + '\n';
	// Plunge to previous pass depth
	output += applyGcodeTemplate(profile.cutTemplate, { z: prevZCoord, f: feedZ }) + '\n';

	// Ramp back to path start following the path segments in reverse,
	// interpolating Z from prevZ to currentZ along the way.
	var totalRampDist = 0;
	if (rampSegIdx > 0) {
		var dx0 = rampPt.x - path[rampSegIdx - 1].x;
		var dy0 = rampPt.y - path[rampSegIdx - 1].y;
		totalRampDist += Math.sqrt(dx0 * dx0 + dy0 * dy0);
	}
	for (var i = rampSegIdx - 1; i >= 1; i--) {
		var dxs = path[i].x - path[i - 1].x;
		var dys = path[i].y - path[i - 1].y;
		totalRampDist += Math.sqrt(dxs * dxs + dys * dys);
	}

	var zRange = currentZ - prevZ; // negative (going deeper)
	var distSoFar = 0;

	// Walk back through path points from rampSegIdx-1 to 0
	if (rampSegIdx > 0) {
		var dx1 = rampPt.x - path[rampSegIdx - 1].x;
		var dy1 = rampPt.y - path[rampSegIdx - 1].y;
		distSoFar += Math.sqrt(dx1 * dx1 + dy1 * dy1);
		var frac = totalRampDist > 0 ? distSoFar / totalRampDist : 1;
		var interpZ = prevZ + zRange * frac;
		var pc = toGcodeUnits(path[rampSegIdx - 1].x, path[rampSegIdx - 1].y, useInches);
		output += applyGcodeTemplate(profile.cutTemplate, { x: pc.x, y: pc.y, z: toGcodeUnitsZ(interpZ, useInches), f: feedXY }) + '\n';
	}

	for (var i = rampSegIdx - 2; i >= 0; i--) {
		var dxs = path[i + 1].x - path[i].x;
		var dys = path[i + 1].y - path[i].y;
		distSoFar += Math.sqrt(dxs * dxs + dys * dys);
		var frac = totalRampDist > 0 ? distSoFar / totalRampDist : 1;
		var interpZ = prevZ + zRange * frac;
		var pc = toGcodeUnits(path[i].x, path[i].y, useInches);
		output += applyGcodeTemplate(profile.cutTemplate, { x: pc.x, y: pc.y, z: toGcodeUnitsZ(interpZ, useInches), f: feedXY }) + '\n';
	}

	// Ensure we end exactly at path start at full depth
	var startCoord = toGcodeUnits(path[0].x, path[0].y, useInches);
	output += applyGcodeTemplate(profile.cutTemplate, { x: startCoord.x, y: startCoord.y, z: currentZCoord, f: feedXY }) + '\n';

	return output;
}

// HELPER FUNCTION: Process pocket operations
function _generatePocketOperationGcode(toolpath, profile, useInches, settings) {
	var output = "";
	var { feed, zfeed, depth, toolStep, woodSpecies, safeHeight } = settings;
	var paths = toolpath.paths;

	var comment = formatComment(toolpath.operation + ' ' + toolpath.id, profile);
	if (comment) output += comment + '\n';

	var z = safeHeight;
	output += applyGcodeTemplate(profile.rapidTemplate, { z: z, f: zfeed / 2 }) + '\n';

	var left = depth;
	var pass = 0;
	var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
	var feedZ = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;

	// Loop through depth passes
	while (left > 0) {
		pass++;
		left -= toolStep;
		if (left < 0 || toolStep <= 0) left = 0;

		z = left - depth;
		var passComment = formatComment('pass ' + pass, profile);
		if (passComment) output += passComment + '\n';

		var zCoord = toGcodeUnitsZ(z, useInches);
		var lastPathEnd = null;
		var nearThresholdWorld = 2.0 * viewScale; // 2mm in world units

		// Process all paths in order (already geographically optimized).
		// Raster and contour paths are interleaved so each region completes
		// before the tool moves to the next, minimizing long rapids.
		for (var k = 0; k < paths.length; k++) {
			var pathObj = paths[k];
			var path = pathObj.tpath;
			if (!path || path.length === 0) continue;

			// Check if we can skip the retract:
			// 1. passStart === false means upstream analysis confirmed no island crossing
			// 2. Otherwise, skip if previous path ended near this one's start (< 2mm)
			var skipRetract = false;
			if (pathObj.passStart === false) {
				skipRetract = true;
			} else if (lastPathEnd !== null) {
				var dx = path[0].x - lastPathEnd.x;
				var dy = path[0].y - lastPathEnd.y;
				var dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < nearThresholdWorld) {
					skipRetract = true;
				}
			}

			if (skipRetract) {
				// Feed directly to start of next path at cutting depth
				var startP = toGcodeUnits(path[0].x, path[0].y, useInches);
				output += applyGcodeTemplate(profile.cutTemplate, { x: startP.x, y: startP.y, z: zCoord, f: feedXY }) + '\n';
			} else {
				// Full ramp-in with retract
				output += generateRampIn(path, toolpath.tool.diameter, z, toolStep, safeHeight, profile, useInches, feedXY, feedZ);
			}

			// Cut entire path
			for (var j = 1; j < path.length; j++) {
				var p = toGcodeUnits(path[j].x, path[j].y, useInches);
				output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, f: feedXY }) + '\n';
			}

			lastPathEnd = path[path.length - 1];
		}
	}

	return output;
}

// HELPER FUNCTION: Process profile operations (inside, outside, center cuts)
function _generateProfileOperationGcode(toolpath, profile, useInches, settings) {
	var output = "";
	var { feed, zfeed, depth, toolStep, radius, angle, woodSpecies, safeHeight, zbacklash } = settings;
	var paths = toolpath.paths;

	for (var k = 0; k < paths.length; k++) {
		var path = paths[k].tpath;

		var comment = formatComment(toolpath.operation + ' ' + toolpath.id, profile);
		if (comment) output += comment + '\n';

		var z = 0;
		var feedXY = useInches ? Math.round(feed / MM_PER_INCH * 100) / 100 : feed;
		var feedZ = useInches ? Math.round(zfeed / MM_PER_INCH * 100) / 100 : zfeed;
		var zCoordSafe = toGcodeUnitsZ(safeHeight, useInches);

		output += applyGcodeTemplate(profile.rapidTemplate, { z: zCoordSafe, f: feedZ / 2 }) + '\n';

		var left = depth;
		var pass = 0;
		var isFirstPass = true;

		// Get tabs from source SVG path for tab avoidance
		var svgPath = null;
		var tabs = [];
		var toolRadiusWorld = radius * viewScale;
		var workpieceThickness = getOption("workpieceThickness");

		if (toolpath.svgId) {
			for (var spIdx = 0; spIdx < svgpaths.length; spIdx++) {
				if (svgpaths[spIdx].id === toolpath.svgId) {
					svgPath = svgpaths[spIdx];
					break;
				}
			}
		}

		if (svgPath && svgPath.creationProperties && svgPath.creationProperties.tabs) {
			tabs = svgPath.creationProperties.tabs;
		}

		// Pre-calculate tab markers
		const tabLengthMM = svgPath && svgPath.creationProperties ? (svgPath.creationProperties.tabLength || 0) : 0;
		const tabHeightMM = svgPath && svgPath.creationProperties ? (svgPath.creationProperties.tabHeight || 0) : 0;
		const markers = (tabs.length > 0) ? calculateTabMarkers(path, tabs, tabLengthMM, toolRadiusWorld, viewScale) : [];
		const augmentedPath = (markers.length > 0) ? augmentToolpathWithMarkers(path, markers) : path;

		while (augmentedPath.length && left > 0) {
			var currentlyLifted = false;
			var firstMarkerPos = null;
			var startedLifted = false;

			for (var j = 0; j < augmentedPath.length; j++) {
				var pt = augmentedPath[j];
				var p = toGcodeUnits(pt.x, pt.y, useInches);

				if (j == 0) {
					pass++;
					left -= toolStep;
					if (left < 0 || toolStep <= 0) left = 0;

					z = left - depth;
					var passComment = formatComment('pass ' + pass, profile);
					if (passComment) output += passComment + '\n';

					// Calculate tab lift amount
					var tabLift = getTabLiftAmount(z, tabs, workpieceThickness, tabHeightMM);

					// Find first marker in augmented path
					let firstMarkerIndex = -1;
					for (let mIdx = 1; mIdx < augmentedPath.length; mIdx++) {
						if (augmentedPath[mIdx].marker) {
							firstMarkerIndex = mIdx;
							firstMarkerPos = augmentedPath[mIdx];
							break;
						}
					}

					// Determine if tab is blocking path start
					let distToFirstMarker = Infinity;
					if (firstMarkerPos) {
						const pt0 = augmentedPath[0];
						const dx = firstMarkerPos.x - pt0.x;
						const dy = firstMarkerPos.y - pt0.y;
						distToFirstMarker = Math.sqrt(dx * dx + dy * dy);
					}

					const tabBlocksStart = (distToFirstMarker <= 2 * toolRadiusWorld);

					// Determine target plunge depth based on whether tab blocks start
					var targetZ;
					if (tabBlocksStart && tabLift > 0) {
						targetZ = z + tabLift;
						currentlyLifted = true;
						startedLifted = true;
					} else {
						targetZ = z;
						currentlyLifted = false;
						startedLifted = false;
					}

					// Ramp-in: retract, move to offset point, plunge to previous depth, ramp to current depth
					output += generateRampIn(augmentedPath, toolpath.tool.diameter, targetZ, toolStep, safeHeight, profile, useInches, feed, zfeed);
					isFirstPass = false;
				}
				else {
					// Process augmented path point with possible marker
					if (pt.marker) {
						var tabLift = getTabLiftAmount(z, tabs, workpieceThickness, tabHeightMM);

						if (pt.marker === 'lift') {
							var zNormalCoord = toGcodeUnitsZ(z, useInches);
							output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zNormalCoord, f: feed }) + '\n';
							var zLiftedCoord = toGcodeUnitsZ(z + tabLift, useInches);
							output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zLiftedCoord, f: feed }) + '\n';
							currentlyLifted = true;
						}
						else if (pt.marker === 'lower') {
							var zLiftedCoord = toGcodeUnitsZ(z + tabLift, useInches);
							output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zLiftedCoord, f: feed }) + '\n';
							var zNormalCoord = toGcodeUnitsZ(z, useInches);
							output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zNormalCoord, f: feed }) + '\n';
							currentlyLifted = false;
						}
					}
					else {
						// Regular path point
						if (currentlyLifted) {
							var tabLift = getTabLiftAmount(z, tabs, workpieceThickness, tabHeightMM);
							var zLiftedCoord = toGcodeUnitsZ(z + tabLift, useInches);
							output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zLiftedCoord, f: feed }) + '\n';
						}
						else {
							var zNormalCoord = toGcodeUnitsZ(z, useInches);
							output += applyGcodeTemplate(profile.cutTemplate, { x: p.x, y: p.y, z: zNormalCoord, f: feed }) + '\n';
						}
					}
				}
			}

			// If we started lifted due to tab at path start, cut remaining material at end of pass
			if (startedLifted && firstMarkerPos) {
				var cleanupZCoord = toGcodeUnitsZ(z, useInches);
				var markerCoord = toGcodeUnits(firstMarkerPos.x, firstMarkerPos.y, useInches);
				output += applyGcodeTemplate(profile.cutTemplate, { x: markerCoord.x, y: markerCoord.y, z: cleanupZCoord, f: feed }) + '\n';
			}
		}
	}

	return output;
}

// Check if toolpath coordinates exceed machine table limits
// Returns warning message string if limits exceeded, null otherwise
function checkTableLimits(tpaths) {
	var tableWidth = getOption("tableWidth");
	var tableDepth = getOption("tableDepth");
	var tableHeight = getOption("tableHeight");
	if (!tableWidth && !tableDepth && !tableHeight) return null;
	var list = tpaths || toolpaths;
	var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	var maxDepth = 0;
	for (var t = 0; t < list.length; t++) {
		if (!list[t].visible || !list[t].paths) continue;
		if (list[t].tool && list[t].tool.depth > maxDepth) {
			maxDepth = list[t].tool.depth;
		}
		for (var p = 0; p < list[t].paths.length; p++) {
			var path = list[t].paths[p].path;
			if (!path) continue;
			for (var pt = 0; pt < path.length; pt++) {
				var mm = toMM(path[pt].x, path[pt].y);
				if (mm.x < minX) minX = mm.x;
				if (mm.x > maxX) maxX = mm.x;
				if (mm.y < minY) minY = mm.y;
				if (mm.y > maxY) maxY = mm.y;
			}
		}
	}
	if (minX === Infinity) return null;
	var originPos = getOption("originPosition") || 'middle-center';
	var limitMinX, limitMaxX, limitMinY, limitMaxY;
	if (originPos.includes('left')) { limitMinX = 0; limitMaxX = tableWidth; }
	else if (originPos.includes('right')) { limitMinX = -tableWidth; limitMaxX = 0; }
	else { limitMinX = -tableWidth / 2; limitMaxX = tableWidth / 2; }
	if (originPos.includes('bottom')) { limitMinY = 0; limitMaxY = tableDepth; }
	else if (originPos.includes('top')) { limitMinY = -tableDepth; limitMaxY = 0; }
	else { limitMinY = -tableDepth / 2; limitMaxY = tableDepth / 2; }
	var exceeds = [];
	if (tableWidth && (minX < limitMinX || maxX > limitMaxX))
		exceeds.push('X (' + Math.round(minX) + ' to ' + Math.round(maxX) + 'mm, limit ' + Math.round(limitMinX) + ' to ' + Math.round(limitMaxX) + 'mm)');
	if (tableDepth && (minY < limitMinY || maxY > limitMaxY))
		exceeds.push('Y (' + Math.round(minY) + ' to ' + Math.round(maxY) + 'mm, limit ' + Math.round(limitMinY) + ' to ' + Math.round(limitMaxY) + 'mm)');
	// Z range: from -maxDepth (deepest cut) to safeHeight + zbacklash (retract)
	if (tableHeight) {
		var safeHeight = getOption("safeHeight") + getOption("zbacklash");
		var zRange = maxDepth + safeHeight;
		if (zRange > tableHeight)
			exceeds.push('Z range (' + Math.round(zRange) + 'mm from -' + Math.round(maxDepth) + ' to +' + Math.round(safeHeight) + 'mm, limit ' + tableHeight + 'mm)');
	}
	if (exceeds.length > 0) {
		return 'G-code exceeds machine table limits: ' + exceeds.join(', ');
	}
	return null;
}

// MAIN FUNCTION: Generate G-code output for all toolpaths
function toGcode() {
	// 1. SETUP AND VALIDATION
	var profile = _setupGcodeProfile();
	var useInches = profile.gcodeUnits === 'inches';
	var sortedToolpaths = _prepareAndSortToolpaths(toolpaths);
	var spindleSpeed = _getInitialSpindleSpeed(sortedToolpaths);

	var output = "";

	// Check if any toolpath coordinates exceed machine table limits
	if (!window._skipTableLimitWarning) {
		var tableLimitWarning = checkTableLimits(sortedToolpaths);
		if (tableLimitWarning) {
			notify(tableLimitWarning, 'warning');
		}
	}

	// 2. GENERATE HEADER
	output += _generateGcodeHeader(profile, spindleSpeed, useInches);

	// 3. PROCESS EACH TOOLPATH
	var lastToolId = null;
	var safeHeight = getOption("safeHeight") + getOption("zbacklash");

	for (var i = 0; i < sortedToolpaths.length; i++) {
		var toolpath = sortedToolpaths[i];
		if (!toolpath.visible) continue;

		// Extract toolpath settings for helper functions
		var settings = {
			feed: calculateFeedRate(toolpath.tool, getOption("woodSpecies"), toolpath.operation),
			zfeed: calculateZFeedRate(toolpath.tool, getOption("woodSpecies"), toolpath.operation),
			depth: toolpath.tool.depth,
			toolStep: toolpath.tool.step || 0,
			radius: toolpath.tool.diameter / 2,
			angle: toolpath.tool.angle,
			woodSpecies: getOption("woodSpecies"),
			safeHeight: safeHeight,
			zbacklash: getOption("zbacklash")
		};

		// Check for tool change
		var currentToolId = toolpath.tool.recid;
		if (lastToolId !== null && lastToolId !== currentToolId) {
			output += _generateToolChangeGcode(toolpath.tool, profile);
		}
		lastToolId = currentToolId;

		// Add tool information comment
		var toolInfo = 'Tool: ID=' + currentToolId +
			' Type=' + (toolpath.tool.bit || 'End Mill') +
			' Diameter=' + toolpath.tool.diameter +
			' Angle=' + (toolpath.tool.angle || 0) +
			' StepDown=' + settings.toolStep;
		var toolComment = formatComment(toolInfo, profile);
		if (toolComment) output += toolComment + '\n';

		// 4. DISPATCH TO OPERATION-SPECIFIC G-CODE GENERATOR
		// Inlay pocketing toolpaths (Socket, Plug) use the pocket generator for depth stepping;
		// Inlay V-carve profiles use the V-carve generator (per-point variable Z depth);
		// Inlay finishing profiles and cutouts use the profile generator.
		var isInlayVcarve = (toolpath.operation === 'Inlay') && toolpath.name.includes('VCarve');
		var isInlayPocket = (toolpath.operation === 'Inlay') &&
			(toolpath.name === 'Inlay Socket' || toolpath.name === 'Inlay Plug');
		if (isInlayVcarve) {
			output += _generateVcarveOperationGcode(toolpath, profile, useInches, settings);
		} else if (toolpath.operation === 'Pocket' || isInlayPocket) {
			output += _generatePocketOperationGcode(toolpath, profile, useInches, settings);
		} else if (toolpath.operation === 'Surfacing') {
			output += _generateSurfacingOperationGcode(toolpath, profile, useInches, settings);
		}
		else if (toolpath.operation === 'HelicalDrill') {
			output += _generateHelicalDrillOperationGcode(toolpath, profile, useInches, settings);
		}
		else if (toolpath.operation === 'Drill') {
			output += _generateDrillOperationGcode(toolpath, profile, useInches, settings);
		}
		else if (toolpath.operation === 'VCarve' || toolpath.operation === 'VCarve In' || toolpath.operation === 'VCarve Out') {
			output += _generateVcarveOperationGcode(toolpath, profile, useInches, settings);
		}
		else if (toolpath.operation === '3dProfile') {
			output += _generate3dProfileOperationGcode(toolpath, profile, useInches, settings);
		}
		else {
			// Profile operations (Inside, Outside, Center, etc.)
			output += _generateProfileOperationGcode(toolpath, profile, useInches, settings);
		}

		// Retract to safe height after finishing operation
		output += applyGcodeTemplate(profile.rapidTemplate, { z: safeHeight, f: settings.zfeed / 2 }) + '\n';
	}

	// 5. GENERATE FOOTER
	output += _generateGcodeFooter(profile);

	// Remove trailing newline to avoid blank lines at end of G-code
	return output.trimEnd();
}