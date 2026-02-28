// --- Virtual coordinate system for zoom/pan ---
var zoomLevel = .5; // initial zoom
var panX = 0; // will be calculated dynamically by centerWorkpiece()
var panY = 0; // will be calculated dynamically by centerWorkpiece()
var origin = { x: 0, y: 0 }; // origin in virtual coordinates
const selectMgr = Select.getInstance();

var viewScale = 10;
var pixelsPerInch = 72; // 72 for illustrator 96 for inkscape
var svgscale = viewScale * 25.4 / pixelsPerInch;


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


var scaleFactor = 4;
var offsetX = 0;
var offsetY = 0;
var selectBox = null;

var cncController = new CncController();

cncController.setupEventListeners();

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

function toolChanged(tool) {
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].tool.id == tool.id)
			toolpaths[i].tool = tool;
	}
	redraw();
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
	if (typeof updatePathVisibilityIcon === 'function') {
		updatePathVisibilityIcon(id, visible);
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

function newProject() {
	// Stop any running simulations
	if (typeof stopSimulation2D === 'function') {
		stopSimulation2D();
	}
	if (typeof stopSimulation3D === 'function') {
		stopSimulation3D();
	}

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
	var radius = vbitRadius(currentTool) * viewScale;
	var numLoops = Math.max(1, Math.floor(currentTool.numLoops || 1));
	var overCutWorld = (currentTool.overCut || 0) * viewScale;
	var name = 'Outside';

	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i];
		var srcPath = svgpath.path;

		// Generate loops from outermost (roughing) to innermost (finishing pass at design line)
		for (var loop = numLoops - 1; loop >= 0; loop--) {
			var offsetAmount = radius + overCutWorld + loop * radius;
			if (offsetAmount <= 0) continue;

			var offsetPaths = offsetPath(srcPath, offsetAmount, true);

			for (var p = 0; p < offsetPaths.length; p++) {
				var opath = offsetPaths[p];
				var subpath = subdividePath(opath, 2);
				var circles = checkPath(subpath, radius - 1);
				var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));

				if (currentTool.direction != "climb") {
					paths.push({ path: reversePath(circles), tpath: reversePath(tpath) });
				} else {
					paths.push({ path: circles, tpath: tpath });
				}
			}
		}
		pushToolPath(paths, name, 'Profile', svgpath.id);
	}
}

function reversePath(path) {
	return path.slice().reverse();
}

function doInside() {
	if (selectMgr.noSelection()) {
		notify('Select a path to Profile');
		return;
	}
	setMode("Inside");

	var radius = vbitRadius(currentTool) * viewScale;
	var numLoops = Math.max(1, Math.floor(currentTool.numLoops || 1));
	var overCutWorld = (currentTool.overCut || 0) * viewScale;
	var name = 'Inside';

	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i];
		var srcPath = svgpath.path;

		// Generate loops from most inward (roughing) to design edge (finishing pass)
		for (var loop = numLoops - 1; loop >= 0; loop--) {
			var offsetAmount = radius + overCutWorld + loop * radius;
			if (offsetAmount <= 0) continue;

			var offsetPaths = offsetPath(srcPath, offsetAmount, false);

			for (var p = 0; p < offsetPaths.length; p++) {
				var opath = offsetPaths[p];
				var subpath = subdividePath(opath, 2);
				var circles = checkPath(subpath, radius - 1);
				var tpath = clipper.JS.Lighten(circles, getOption("tolerance"));

				if (currentTool.direction == "climb") {
					paths.push({ path: reversePath(circles), tpath: reversePath(tpath) });
				} else {
					paths.push({ path: circles, tpath: tpath });
				}
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
	var radius = vbitRadius(currentTool) * viewScale;
	var numLoops = Math.max(1, Math.floor(currentTool.numLoops || 1));
	var overCutWorld = (currentTool.overCut || 0) * viewScale;
	var name = 'Center';

	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i];
		var srcPath = svgpath.path;

		// Distribute loops evenly around the center path, shifted by overCut
		// k=0 is the most inward, k=numLoops-1 is the most outward
		for (var k = 0; k < numLoops; k++) {
			var centerOffset = overCutWorld + (k - (numLoops - 1) / 2.0) * radius;

			var loopPath, circles, tpath;

			if (Math.abs(centerOffset) < 0.001) {
				loopPath = srcPath;
			} else {
				var outward = centerOffset > 0;
				var offsetResult = offsetPath(srcPath, Math.abs(centerOffset), outward);
				loopPath = offsetResult.length > 0 ? offsetResult[0] : srcPath;
			}

			circles = addCircles(loopPath, radius);
			tpath = loopPath;

			if (currentTool.direction != "climb") {
				paths.push({ path: reversePath(circles), tpath: reversePath(tpath) });
			} else {
				paths.push({ path: circles, tpath: tpath });
			}
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

function doPocket() {
	setMode("Pocket");
	if (selectMgr.noSelection()) {
		notify('Select a path to pocket');
		return;
	}

	var radius = toolRadius();
	var stepover = 2 * radius * currentTool.stepover / 100;
	var name = 'Pocket';
	var angle = window.currentToolpathProperties?.angle || 0;  // Get infill angle, default to 0° (horizontal)
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

	let tpaths = generateClipperInfill(offsetPaths, stepover, radius, angle);

	// Extract connectivity chains - groups segments that can be cut together without crossing islands
	let chains = extractConnectivityChains(tpaths, stepover, angle);

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
	computeWithMedialAxis(false, 'VCarve In');
}

function doVcarveIn() {
	if (selectMgr.noSelection()) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve In");
	computeVcarve(false, 'VCarve In');
}

function doVcarveOut() {
	if (selectMgr.noSelection()) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve Out");
	computeVcarve(true, 'VCarve Out');
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

function _gcodeNameComment(name) {
	var profile = (typeof currentGcodeProfile !== 'undefined' && currentGcodeProfile) ? currentGcodeProfile : {};
	var commentChar = profile.commentChar || ';';
	var closingChar = commentChar === '(' ? ')' : '';
	return commentChar + name + closingChar + '\n';
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
			const projectName = fileHandle.name.replace(/\.[^.]+$/, '');
			const writable = await fileHandle.createWritable();
			await writable.write(_gcodeNameComment(projectName) + text);
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

	const projectName = filename.replace(/\.[^.]+$/, '');
	saveString(_gcodeNameComment(projectName) + text, filename);
	notify('G-code download started');
}


