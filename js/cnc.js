// --- Virtual coordinate system for zoom/pan ---
var zoomLevel = .5; // initial zoom
var panX = 0; // will be calculated dynamically by centerWorkpiece()
var panY = 0; // will be calculated dynamically by centerWorkpiece()
var origin = { x: 0, y: 0 }; // origin in virtual coordinates
const selectMgr = Select.getInstance();
window.selectMgr = selectMgr;

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
			let gridOffset = (getOption("gridSize") || 10) * viewScale;
			newPath.path = newPath.path.map(pt => ({
                x: pt.x + gridOffset,
                y: pt.y + gridOffset
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
		if (toolpaths[i].tool.recid == tool.recid)
			toolpaths[i].tool = tool;
	}
	refreshToolPathsDisplay();
	redraw();
}

function setVisibility(id, visible) {
	for (var i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i].id == id) {
			svgpaths[i].visible = visible;
			// Sync STL model visibility
			if (svgpaths[i].creationProperties && svgpaths[i].creationProperties.stlModelId) {
				var stlId = svgpaths[i].creationProperties.stlModelId;
				if (typeof window.updateSTLMeshVisibility3D === 'function') {
					window.updateSTLMeshVisibility3D(stlId, visible);
				}
				var stlModel = window.stlModels && window.stlModels.find(function(m) { return m.id === stlId; });
				if (stlModel) stlModel.visible = visible;
			}
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
			// If this svgpath references an STL model, clean it up
			if (svgpaths[i].creationProperties && svgpaths[i].creationProperties.stlModelId) {
				var stlId = svgpaths[i].creationProperties.stlModelId;
				if (typeof window.removeSTLMesh3D === 'function') window.removeSTLMesh3D(stlId);
				if (window.stlModels) {
					window.stlModels = window.stlModels.filter(function(m) { return m.id !== stlId; });
				}
			}
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

	// Clear transform box so handles don't linger after delete
	var transformOp = cncController && cncController.operationManager && cncController.operationManager.getOperation('Move');
	if (transformOp) {
		transformOp.transformBox = null;
	}

	redraw();
}

function addUndo(toolPathschanged = false, svgPathsChanged = false, originChanged = false, selectedIds = null) {

	if (toolPathschanged || svgPathsChanged || originChanged) {
		// Always capture current selection so undo/redo restores it
		var currentSelectedIds = selectedIds || selectMgr.selectedPaths().map(p => p.id);
		var project = {
			toolpaths: toolPathschanged ? toolpaths : null,
			svgpaths: svgPathsChanged ? svgpaths : null,
			origin: originChanged ? origin : null,
			selectedIds: currentSelectedIds.length > 0 ? currentSelectedIds : null
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
		origin: origin,
		selectedIds: selectMgr.selectedPaths().map(p => p.id)
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
		var addedTextGroups = {};
		for (var i in svgpaths) {
			var sp = svgpaths[i];
			if (sp.textGroupId && !addedTextGroups[sp.textGroupId]) {
				var groupPaths = svgpaths.filter(function(p) { return p.textGroupId === sp.textGroupId; });
				var text = (sp.creationProperties && sp.creationProperties.text) || sp.name;
				addTextGroup(sp.textGroupId, text, groupPaths);
				addedTextGroups[sp.textGroupId] = true;
			} else if (!sp.textGroupId) {
				addSvgPath(sp.id, sp.name);
			}
			svgpathId++;
		}
		// Re-select paths if the undo entry stored selected IDs
		if (project.selectedIds) {
			for (var i = 0; i < svgpaths.length; i++) {
				if (project.selectedIds.indexOf(svgpaths[i].id) >= 0) {
					selectMgr.selectPath(svgpaths[i]);
				}
			}
		}
	}
	// Clear PathEdit's cached original so corner operations work fresh after undo
	var editOp = cncController && cncController.operationManager && cncController.operationManager.getOperation('Edit');
	if (editOp) {
		editOp.originalPathBeforeRadius = null;
		editOp.originalPathBeforeRadiusId = null;
	}

	onPathsChanged(null);
}

function doRedo() {
	if (redoList.length == 0) return;

	// Save current state to undo list before redoing
	var currentProject = {
		toolpaths: toolpaths,
		svgpaths: svgpaths,
		origin: origin,
		selectedIds: selectMgr.selectedPaths().map(p => p.id)
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
		var addedTextGroups = {};
		for (var i in svgpaths) {
			var sp = svgpaths[i];
			if (sp.textGroupId && !addedTextGroups[sp.textGroupId]) {
				var groupPaths = svgpaths.filter(function(p) { return p.textGroupId === sp.textGroupId; });
				var text = (sp.creationProperties && sp.creationProperties.text) || sp.name;
				addTextGroup(sp.textGroupId, text, groupPaths);
				addedTextGroups[sp.textGroupId] = true;
			} else if (!sp.textGroupId) {
				addSvgPath(sp.id, sp.name);
			}
			svgpathId++;
		}
		// Re-select paths if the redo entry stored selected IDs
		if (project.selectedIds) {
			for (var i = 0; i < svgpaths.length; i++) {
				if (project.selectedIds.indexOf(svgpaths[i].id) >= 0) {
					selectMgr.selectPath(svgpaths[i]);
				}
			}
		}
	}
	onPathsChanged(null);
}

/**
 * Central function called after svgpaths have been modified (drag, transform, undo, redo, load).
 * Handles all side effects: STL sync, toolpath regeneration, transform handle refresh, redraw.
 * @param {string[]} [changedPathIds] - IDs of paths that changed. If null, skips toolpath regeneration.
 */
function onPathsChanged(changedPathIds) {
	// Regenerate toolpaths linked to changed paths
	if (changedPathIds && changedPathIds.length > 0 && typeof regenerateToolpathsForPaths === 'function') {
		regenerateToolpathsForPaths(changedPathIds);
	}
	// Sync STL models to match current svgpath positions
	if (typeof window.syncSTLModels === 'function') window.syncSTLModels();
	// Refresh transform handles if Move tool is active
	var currentOp = cncController.operationManager.getCurrentOperation();
	if (currentOp && currentOp.name === 'Move') {
		if (currentOp.hasSelectedPaths()) {
			currentOp.pivotCenter = null;
			currentOp.setupTransformBox();
			currentOp.recoverTotalsFromHistory();
		} else {
			currentOp.transformBox = null;
			currentOp.pivotCenter = null;
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
		gcodeProfile: currentGcodeProfile,  // Save the full post-processor profile
		stlModels: typeof window.saveSTLModels === 'function' ? window.saveSTLModels() : null
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
	var addedTextGroups = {};
	for (var i in svgpaths) {
		var sp = svgpaths[i];
		if (sp.textGroupId && !addedTextGroups[sp.textGroupId]) {
			var groupPaths = svgpaths.filter(function(p) { return p.textGroupId === sp.textGroupId; });
			var text = (sp.creationProperties && sp.creationProperties.text) || sp.name;
			addTextGroup(sp.textGroupId, text, groupPaths);
			addedTextGroups[sp.textGroupId] = true;
		} else if (!sp.textGroupId) {
			addSvgPath(sp.id, sp.name);
		}
		svgpathId++;
	}
	toolpathId = 1;
	for (var i in toolpaths) {
		toolpaths[i].id = 'T' + toolpathId;
		addToolPath('T' + toolpathId, toolpaths[i].operation + ' ' + toolpathId, toolpaths[i].operation, toolpaths[i].tool.name);
		toolpathId++;
	}

	// Restore STL models from saved data
	if (project.stlModels && typeof window.loadSTLModels === 'function') {
		window.loadSTLModels(project.stlModels);
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
	if (typeof window.clearSTLModels === 'function') window.clearSTLModels();
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
				var tpath = clipper.JS.Lighten(circles, getOption("tolerance") * viewScale);

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
				var tpath = clipper.JS.Lighten(circles, getOption("tolerance") * viewScale);

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

function doOffset() {
	cncController.setMode("Offset");
}

function doPattern() {
	cncController.setMode("Pattern");
}

function doDrill() {
	// If circular paths are preselected, create helical drill toolpaths directly
	var selected = selectMgr.selectedPaths();
	if (selected.length > 0) {
		var drillOp = cncController.operationManager.getOperation('Drill');
		if (drillOp) {
			for (var i = 0; i < selected.length; i++) {
				var circleInfo = drillOp.detectCircle(selected[i]);
				if (circleInfo) {
					makeHelicalHole(circleInfo, selected[i].id);
				}
			}
		}
		selectMgr.unselectAll();
	}

	// Enter drill mode — handles both path highlighting/helical drill
	// and empty-space peck drilling
	cncController.setMode("Drill");
	setMode("Select");
}

function doTabEditor() {
	cncController.setMode("Tabs");
}

// Liang-Barsky line clipping: clips segment p1-p2 to the axis-aligned rectangle.
// Returns [clippedP1, clippedP2] or null if the segment is entirely outside.
function clipLineToRect(p1, p2, xMin, yMin, xMax, yMax) {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const p = [-dx, dx, -dy, dy];
	const q = [p1.x - xMin, xMax - p1.x, p1.y - yMin, yMax - p1.y];
	let t0 = 0, t1 = 1;
	for (let i = 0; i < 4; i++) {
		if (Math.abs(p[i]) < 1e-10) {
			if (q[i] < 0) return null;
		} else {
			const t = q[i] / p[i];
			if (p[i] < 0) { t0 = Math.max(t0, t); }
			else { t1 = Math.min(t1, t); }
		}
	}
	if (t0 > t1) return null;
	return [
		{ x: p1.x + t0 * dx, y: p1.y + t0 * dy },
		{ x: p1.x + t1 * dx, y: p1.y + t1 * dy }
	];
}

function doSurfacing() {
	setMode("Surfacing");

	const wpWidth = getOption("workpieceWidth") * viewScale;
	const wpLength = getOption("workpieceLength") * viewScale;

	if (!wpWidth || !wpLength) {
		notify('Set up workpiece dimensions first');
		return;
	}

	const radius = toolRadius();
	const stepover = 2 * radius * currentTool.stepover / 100;
	const angle = window.currentToolpathProperties?.angle || 0;

	if (stepover <= 0) {
		notify('Invalid tool or stepover value');
		return;
	}

	const cx = wpWidth / 2;
	const cy = wpLength / 2;

	// Clip bounds: workpiece expanded by one tool radius so the cutter edge
	// reaches exactly to the workpiece boundary on all sides.
	const xMin = -radius, xMax = wpWidth + radius;
	const yMin = -radius, yMax = wpLength + radius;

	// Rotate the clip-region corners by -angle to get the bounding box in which
	// horizontal lines are generated, then rotate each line back by +angle.
	const clipCorners = [
		{ x: xMin, y: yMin }, { x: xMax, y: yMin },
		{ x: xMax, y: yMax }, { x: xMin, y: yMax }
	];
	const rotated = angle !== 0
		? clipCorners.map(p => rotatePoint(p, cx, cy, -angle * Math.PI / 180))
		: clipCorners;

	const minX = Math.min(...rotated.map(p => p.x));
	const maxX = Math.max(...rotated.map(p => p.x));
	const minY = Math.min(...rotated.map(p => p.y));
	const maxY = Math.max(...rotated.map(p => p.y));

	const paths = [];
	let lineIndex = 0;

	for (let y = minY; ; y += stepover) {
		const ly = Math.min(y, maxY);

		// Full-width line in the rotated frame
		let p1 = { x: minX, y: ly };
		let p2 = { x: maxX, y: ly };

		// Rotate back to world orientation
		if (angle !== 0) {
			const rad = angle * Math.PI / 180;
			p1 = rotatePoint(p1, cx, cy, rad);
			p2 = rotatePoint(p2, cx, cy, rad);
		}

		// Clip to workpiece + radius bounds so lines never extend past the stock
		const clipped = clipLineToRect(p1, p2, xMin, yMin, xMax, yMax);
		if (clipped) {
			// Zigzag: alternate direction each pass
			const tpath = lineIndex % 2 === 0 ? clipped : [clipped[1], clipped[0]];
			paths.push({ tpath: tpath });
			lineIndex++;
		}

		if (ly >= maxY) break;
	}

	if (paths.length === 0) {
		notify('Unable to generate surfacing paths');
		return;
	}

	pushToolPath(paths, 'Surfacing', 'Surfacing', null, null);
}

/**
 * Round concave corners of a polygon by offsetting outward then inward.
 * This ensures the CNC tool (with the given radius) can reach all internal corners.
 */
function roundConcaveCorners(path, radius) {
	if (radius <= 0) return path;
	var offset1 = new clipper.ClipperOffset(20, 0.25);
	offset1.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	var expanded = [];
	offset1.Execute(expanded, radius);
	if (expanded.length === 0) return path;

	var offset2 = new clipper.ClipperOffset(20, 0.25);
	offset2.AddPath(expanded[0], ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	var result = [];
	offset2.Execute(result, -radius);
	if (result.length === 0) return path;
	result[0].push(result[0][0]); // close path
	return result[0];
}

/**
 * Round convex corners of a polygon by offsetting inward then outward.
 * This ensures the male plug's external corners match the female socket's rounded internal corners.
 */
function roundConvexCorners(path, radius) {
	if (radius <= 0) return path;
	var offset1 = new clipper.ClipperOffset(20, 0.25);
	offset1.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	var shrunk = [];
	offset1.Execute(shrunk, -radius);
	if (shrunk.length === 0) return path;

	var offset2 = new clipper.ClipperOffset(20, 0.25);
	offset2.AddPath(shrunk[0], ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	var result = [];
	offset2.Execute(result, radius);
	if (result.length === 0) return path;
	result[0].push(result[0][0]); // close path
	return result[0];
}

/**
 * Compute total travel distance of a closed polygon path.
 */
function computePathPerimeter(path) {
	let len = 0;
	for (let i = 0; i < path.length - 1; i++) {
		let dx = path[i + 1].x - path[i].x;
		let dy = path[i + 1].y - path[i].y;
		len += Math.sqrt(dx * dx + dy * dy);
	}
	return len;
}

/**
 * Generate concentric contour passes by repeatedly offsetting inward.
 * Returns an array of closed paths (each already closed with first==last).
 * Array order: [0] = outermost ring, [n] = innermost ring.
 * Respects islands: uses ClipperJS difference to subtract island offsets.
 * Filters out degenerate fragments (< 3 points or near-zero area slivers).
 */
function generateConcentricContours(outerPath, islandPaths, stepover, pocketRadius) {
	let contours = [];   // flat list of contour paths
	let contourLevels = []; // parallel array: level index for each contour
	let currentOuters = [outerPath];
	let minArea = stepover * stepover * 0.1;
	let level = 0;

	while (currentOuters.length > 0) {
		let nextOuters = [];
		for (let outer of currentOuters) {
			contours.push(outer);
			contourLevels.push(level);
			let co = new clipper.ClipperOffset(20, 0.025);
			co.AddPath(outer, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
			let result = [];
			co.Execute(result, -stepover);

			// Subtract islands and collect valid fragments
			let validFragments = [];
			for (let r of result) {
				let remaining = [r];
				for (let island of islandPaths) {
					let clpr = new ClipperLib.Clipper();
					clpr.AddPaths(remaining, ClipperLib.PolyType.ptSubject, true);
					clpr.AddPath(island, ClipperLib.PolyType.ptClip, true);
					let diff = [];
					clpr.Execute(ClipperLib.ClipType.ctDifference, diff,
						ClipperLib.PolyFillType.pftEvenOdd,
						ClipperLib.PolyFillType.pftEvenOdd);
					remaining = diff;
				}
				for (let rem of remaining) {
					if (rem.length < 3) continue;
					let fragArea = Math.abs(ClipperLib.Clipper.Area(rem));
					if (fragArea < minArea) continue;
					rem.push(rem[0]); // close path
					validFragments.push(rem);
				}
			}

			// If the full stepover produced no valid children, check if there's
			// uncovered area in the center. The tool at this contour covers
			// pocketRadius inward; if shrinking by pocketRadius still leaves area,
			// add a fill pass at a reduced offset to cover the gap.
			if (validFragments.length === 0 && pocketRadius > 0 && stepover > pocketRadius) {
				let fillCo = new clipper.ClipperOffset(20, 0.025);
				fillCo.AddPath(outer, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
				let fillResult = [];
				fillCo.Execute(fillResult, -pocketRadius);
				for (let r of fillResult) {
					let remaining = [r];
					for (let island of islandPaths) {
						let clpr = new ClipperLib.Clipper();
						clpr.AddPaths(remaining, ClipperLib.PolyType.ptSubject, true);
						clpr.AddPath(island, ClipperLib.PolyType.ptClip, true);
						let diff = [];
						clpr.Execute(ClipperLib.ClipType.ctDifference, diff,
							ClipperLib.PolyFillType.pftEvenOdd,
							ClipperLib.PolyFillType.pftEvenOdd);
						remaining = diff;
					}
					for (let rem of remaining) {
						if (rem.length < 3) continue;
						let fragArea = Math.abs(ClipperLib.Clipper.Area(rem));
						if (fragArea < minArea) continue;
						rem.push(rem[0]);
						validFragments.push(rem);
					}
				}
			}

			nextOuters.push(...validFragments);
		}
		currentOuters = nextOuters;
		level++;
	}
	return { contours, contourLevels, levelCount: level };
}

/**
 * Compute total raster travel distance for a set of boundary paths.
 * Generates infill lines and sums all segment lengths.
 */
function computeRasterTravel(boundaries, stepover, pocketRadius, angle) {
	let groups = generateClipperInfill(boundaries, stepover, pocketRadius, angle);
	let totalTravel = 0;
	for (let group of groups) {
		for (let seg of group.paths) {
			if (seg.length >= 2) {
				let dx = seg[1].x - seg[0].x;
				let dy = seg[1].y - seg[0].y;
				totalTravel += Math.sqrt(dx * dx + dy * dy);
			}
		}
	}
	return totalTravel;
}

/**
 * Generate adaptive pocket toolpaths: uses concentric contours for narrow/irregular
 * regions near the boundary and switches to raster infill for large open interiors.
 *
 * Heuristic: at each candidate contour ring, compare the contour perimeter against
 * the actual raster travel distance for that ring's interior. Contours are kept while
 * they are shorter travel than the raster alternative. Once raster becomes shorter,
 * the remainder is filled with raster lines.
 *
 * Contours are emitted inside-to-outside so each pass only removes one stepover width.
 *
 * @param {number} finishingRadius - Radius of a finishing tool that will make a
 *   separate profile pass (world units). If >= pocketRadius the outermost contour
 *   is skipped. Pass 0 when there is no finishing pass.
 */
function generatePocketPaths(outerPath, islandPaths, pocketRadius, stepover, angle, direction, finishingRadius) {
	// First offset inward/outward by tool radius to get the machinable boundaries
	let outerOffset = offsetPath(outerPath, pocketRadius, false);
	if (outerOffset.length === 0) return [];
	let machinedOuter = outerOffset[0];

	let machinedIslands = [];
	for (let p of islandPaths) {
		let islandOffset = offsetPath(p, pocketRadius, true);
		if (islandOffset.length === 0) continue;
		machinedIslands.push(islandOffset[0]);
	}

	// Generate concentric contour rings from the machined boundary inward
	// Returns { contours, contourLevels, levelCount }
	let contourData = generateConcentricContours(machinedOuter, machinedIslands, stepover, pocketRadius);
	let allContours = contourData.contours;
	let contourLevels = contourData.contourLevels;
	let totalLevels = contourData.levelCount;

	// Decide where to switch from contour to raster by comparing travel distances
	// per LEVEL (not per fragment). Sum all fragment perimeters at each level.
	let switchLevel = totalLevels; // default: all contours, no raster

	for (let lvl = 1; lvl < totalLevels; lvl++) {
		// Sum perimeters of all fragments at this level
		let levelPerimeter = 0;
		for (let i = 0; i < allContours.length; i++) {
			if (contourLevels[i] === lvl) {
				levelPerimeter += computePathPerimeter(allContours[i]);
			}
		}
		if (levelPerimeter <= 0) continue;

		// Compute raster travel for this level's interior using machinedOuter
		// offset inward by lvl stepovers
		let rasterOuter = offsetPath(machinedOuter, lvl * stepover, false);
		if (rasterOuter.length === 0) continue;
		let rasterBoundaries = [rasterOuter[0]];
		for (let island of machinedIslands) {
			rasterBoundaries.push(island);
		}

		let rasterTravel = computeRasterTravel(rasterBoundaries, stepover, pocketRadius, angle);
		if (rasterTravel > 0 && rasterTravel < levelPerimeter) {
			switchLevel = lvl;
			break;
		}
	}

	// Build contour paths: inside-to-outside so each pass only cuts one stepover width.
	// Only skip outermost level (level 0) if the finishing tool is large enough to cover it
	// AND there are deeper levels or raster to actually clear the interior.
	let paths = [];
	let skipOutermost = (finishingRadius >= pocketRadius) && (totalLevels > 1 || switchLevel < totalLevels);
	let startLevel = skipOutermost ? 1 : 0;

	// Emit contour fragments for levels switchLevel-1 down to startLevel (inside-to-outside)
	for (let lvl = switchLevel - 1; lvl >= startLevel; lvl--) {
		for (let i = 0; i < allContours.length; i++) {
			if (contourLevels[i] !== lvl) continue;
			let contour = allContours[i].slice();
			if (direction == "climb") contour = reversePath(contour);
			paths.push({ tpath: contour, isContour: true, passStart: true });
		}
	}

	// Add island contours when outermost contour is not skipped
	if (!skipOutermost) {
		for (let island of machinedIslands) {
			let islandContour = island.slice();
			if (direction != "climb") islandContour = reversePath(islandContour);
			paths.push({ tpath: islandContour, isContour: true, passStart: true });
		}
	}

	// Generate raster infill for the remaining interior (from switchLevel inward).
	// Compute the raster boundary by offsetting machinedOuter inward by the number
	// of contour levels, so it covers exactly the area not handled by contour passes.
	if (switchLevel < totalLevels) {
		let rasterOffset = offsetPath(machinedOuter, (switchLevel - 1) * stepover, false);
		if (rasterOffset.length === 0) rasterOffset = [machinedOuter];
		let rasterBoundaries = [rasterOffset[0]];
		// Always include all islands — ClipperJS EvenOdd fill correctly excludes their interior
		for (let island of machinedIslands) {
			rasterBoundaries.push(island);
		}

		let tpaths = generateClipperInfill(rasterBoundaries, stepover, pocketRadius, angle);
		let chains = extractConnectivityChains(tpaths, stepover, angle);

		// Collect all island paths (both machined islands and the raster boundary contour
		// fragments that act as obstacles) for travel-move intersection testing.
		// This detects when a straight travel between chain segments would cross an
		// island — including open star points that protrude into the raster area.
		const obstacleIslands = machinedIslands.slice();
		// Also add the original (un-offset) island paths passed to this function,
		// since star points may protrude past the machined-island offset.
		for (let p of islandPaths) {
			obstacleIslands.push(p);
		}

		const infillPaths = [];
		for (let chain of chains) {
			// Split chain into sub-chains where travel between segments crosses an island
			let currentPath = [];
			let segCount = 0;
			for (let si = 0; si < chain.segments.length; si++) {
				let segment = chain.segments[si];
				if (currentPath.length > 0 && obstacleIslands.length > 0) {
					// Check if travel from end of current path to start of this segment crosses any island
					let lastPt = currentPath[currentPath.length - 1];
					let nextPt = segment[0];
					let crosses = false;
					for (let island of obstacleIslands) {
						if (lineIntersectsPath(lastPt, nextPt, island) > 0) {
							crosses = true;
							break;
						}
					}
					if (crosses) {
						// Flush current sub-chain as a separate path with a retract
						infillPaths.push({
							tpath: currentPath,
							isContour: false,
							isChain: true,
							passStart: true,
							sourceY: chain.startY,
							segmentCount: segCount
						});
						currentPath = [];
						segCount = 0;
					}
				}
				currentPath.push(...segment);
				segCount++;
			}
			if (currentPath.length > 0) {
				infillPaths.push({
					tpath: currentPath,
					isContour: false,
					isChain: true,
					passStart: true,
					sourceY: chain.startY,
					segmentCount: segCount
				});
			}
		}

		const optimizedChains = optimizeChainOrder(infillPaths);
		// Raster infill first (center), then contours (inside-to-outside toward boundary)
		// Optimize the combined list so contours start near where the previous path ended
		let result = optimizePathListOrder([...optimizedChains, ...paths]);
		return eliminateUnnecessaryRetracts(result, machinedIslands, islandPaths);
	}

	// Pure contour mode (no raster needed for small/narrow pockets)
	// Optimize contour order and start points for minimal travel
	let result = optimizePathListOrder(paths);
	return eliminateUnnecessaryRetracts(result, machinedIslands, islandPaths);
}

/**
 * Mark consecutive paths as passStart:false when the travel between them
 * doesn't cross any island, allowing direct feed instead of retract/plunge.
 */
function eliminateUnnecessaryRetracts(paths, machinedIslands, originalIslands) {
	if (paths.length <= 1) return paths;

	// Combine all island obstacles for intersection testing
	let obstacles = [];
	if (machinedIslands) obstacles.push(...machinedIslands);
	if (originalIslands) obstacles.push(...originalIslands);

	for (let i = 1; i < paths.length; i++) {
		if (!paths[i].passStart) continue;
		let prevPath = paths[i - 1].tpath;
		let currPath = paths[i].tpath;
		if (!prevPath || !currPath || prevPath.length === 0 || currPath.length === 0) continue;

		let endPt = prevPath[prevPath.length - 1];
		let startPt = currPath[0];

		// Check if travel crosses any island
		let crosses = false;
		for (let island of obstacles) {
			if (lineIntersectsPath(endPt, startPt, island) > 0) {
				crosses = true;
				break;
			}
		}

		if (!crosses) {
			paths[i] = { ...paths[i], passStart: false };
		}
	}

	return paths;
}

/**
 * Optimize the order of path groups using nearest-neighbor on group start points.
 * Each group's internal path order is preserved (already optimized per-shape).
 * Groups are reordered so the tool moves geographically between shapes.
 */
function optimizeGroupOrder(groups) {
	if (groups.length === 0) return [];
	if (groups.length === 1) return groups[0];
	// Build index with start point of each group
	let remaining = groups.map((g, i) => {
		let p = g[0].tpath[0];
		return { idx: i, x: p.x, y: p.y };
	});
	let ordered = [];
	// Start with group nearest to origin
	remaining.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
	let current = remaining.shift();
	ordered.push(...groups[current.idx]);
	while (remaining.length > 0) {
		// Find nearest group start to end of last path in current result
		let lastPath = ordered[ordered.length - 1].tpath;
		let endPt = lastPath[lastPath.length - 1];
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < remaining.length; i++) {
			let dx = remaining[i].x - endPt.x;
			let dy = remaining[i].y - endPt.y;
			let d = dx * dx + dy * dy;
			if (d < bestDist) { bestDist = d; bestIdx = i; }
		}
		current = remaining.splice(bestIdx, 1)[0];
		ordered.push(...groups[current.idx]);
	}
	return ordered;
}

function doInlay() {
	setMode("Inlay");
	if (selectMgr.noSelection()) {
		notify('Select a path for inlay');
		return;
	}

	const props = window.currentToolpathProperties;
	const inlayType = props?.inlayType || 'female';
	const clearanceMM = props?.clearance || 0.1;
	const clearance = clearanceMM * viewScale;
	const cutOut = props?.cutOut || false;

	// Get finishing tool
	const finishingToolId = props?.finishingToolId;
	const finishingTool = window.toolpathPropertiesManager.getToolById(finishingToolId);
	if (!finishingTool) {
		notify('Finishing tool not found', 'error');
		return;
	}

	const pocketingTool = { ...window.currentTool };
	const pocketRadius = pocketingTool.diameter / 2 * viewScale;
	const finishRadius = finishingTool.diameter / 2 * viewScale;
	const stepover = 2 * pocketRadius * pocketingTool.stepover / 100;
	const angle = props?.angle || 0;
	const direction = pocketingTool.direction || 'climb';

	// Get selected paths
	var inputPaths = [];
	var selected = selectMgr.selectedPaths();
	for (let svgpath of selected)
		inputPaths.push(svgpath.path);

	inputPaths = normalizeWindingOrder(inputPaths);
	const selectedSvgIds = selected.map(p => p.id);

	// Identify outer paths and islands.
	// An island is any path fully contained inside another selected path.
	let allOuters = [];
	let allIslands = [];
	for (let i = 0; i < inputPaths.length; i++) {
		let isIsland = false;
		for (let j = 0; j < inputPaths.length; j++) {
			if (i === j) continue;
			if (pathIn(inputPaths[j], inputPaths[i])) {
				isIsland = true;
				break;
			}
		}
		if (isIsland) allIslands.push(inputPaths[i]);
		else allOuters.push(inputPaths[i]);
	}

	if (allOuters.length === 0) {
		notify('Unable to determine outer boundary for inlay');
		return;
	}

	// Collect per-shape path groups so we can optimize the order of shapes
	// while keeping each shape's internally-optimized paths together.
	let pocketGroups = [];  // each entry: array of paths for one shape
	let profileGroups = []; // each entry: array of profile paths for one shape
	let cutOutGroups = [];  // each entry: array of cutout paths for one shape

	for (let outerPath of allOuters) {
		// Find islands contained in this specific outer path
		let islandPaths = allIslands.filter(isl => pathIn(outerPath, isl));

		if (inlayType === 'female') {
			// Female socket: pocket inside the path with rounded concave corners
			let roundedOuter = roundConcaveCorners(outerPath, finishRadius);
			let roundedIslands = islandPaths.map(p => roundConvexCorners(p, finishRadius));

			// Generate pocket with adaptive contour/raster; skip outermost contour only if finishing tool covers it
			let pocketPaths = generatePocketPaths(roundedOuter, roundedIslands, pocketRadius, stepover, angle, direction, finishRadius);
			if (pocketPaths.length > 0) pocketGroups.push(pocketPaths);

			// Generate finishing profile (inside the rounded path)
			let shapeProfPaths = [];
			let profileOffset = offsetPath(roundedOuter, finishRadius, false);
			if (profileOffset.length > 0) {
				let profileContour = profileOffset[0].slice();
				if (direction == "climb") profileContour = reversePath(profileContour);
				shapeProfPaths.push({ tpath: profileContour, isContour: true });
			}
			// Profile around islands (outside offset for islands)
			for (let island of roundedIslands) {
				let islandProfileOffset = offsetPath(island, finishRadius, true);
				if (islandProfileOffset.length > 0) {
					let islandContour = islandProfileOffset[0].slice();
					if (direction != "climb") islandContour = reversePath(islandContour);
					shapeProfPaths.push({ tpath: islandContour, isContour: true });
				}
			}
			if (shapeProfPaths.length > 0) profileGroups.push(shapeProfPaths);

		} else {
			// Male plug paths are collected per-shape here, then processed
			// together after the loop to create a shared outer boundary.
		}
	}

	// Male plug: process all shapes together with one shared outer boundary.
	// This keeps small parts (like letters) connected as a single piece.
	if (inlayType === 'male') {
		let expand = 2 * pocketingTool.diameter * viewScale;

		// Build clearance-adjusted shapes for all outers and islands
		let allClearanceOuters = [];
		let allClearanceIslands = [];

		for (let outerPath of allOuters) {
			let islandPaths = allIslands.filter(isl => pathIn(outerPath, isl));
			let roundedOuter = roundConvexCorners(outerPath, finishRadius);
			let roundedIslands = islandPaths.map(p => roundConcaveCorners(p, finishRadius));

			// Apply clearance: shrink the plug path
			let clearanceOuter = roundedOuter;
			if (clearance > 0) {
				let clearanceOffset = new clipper.ClipperOffset(20, 0.25);
				clearanceOffset.AddPath(roundedOuter, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
				let clearanceResult = [];
				clearanceOffset.Execute(clearanceResult, -clearance);
				if (clearanceResult.length > 0) {
					clearanceResult[0].push(clearanceResult[0][0]); // close
					clearanceOuter = clearanceResult[0];
				}
			}

			allClearanceOuters.push(clearanceOuter);

			// Expand islands by clearance
			for (let p of roundedIslands) {
				if (clearance <= 0) { allClearanceIslands.push(p); continue; }
				let co = new clipper.ClipperOffset(20, 0.25);
				co.AddPath(p, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
				let cr = [];
				co.Execute(cr, clearance);
				if (cr.length > 0) { cr[0].push(cr[0][0]); allClearanceIslands.push(cr[0]); }
				else allClearanceIslands.push(p);
			}
		}

		// Compute convex hull of all clearance shapes, then expand outward
		let allPts = [];
		for (let co of allClearanceOuters) {
			for (let pt of co) {
				allPts.push({ x: pt.x, y: pt.y });
			}
		}
		let hull = convexHull(allPts);
		let expanded = offsetPath(hull, expand, true);
		let outerBoundary = expanded[0];
		// Close the path
		if (outerBoundary.length > 0 &&
			(outerBoundary[0].x !== outerBoundary[outerBoundary.length - 1].x ||
			 outerBoundary[0].y !== outerBoundary[outerBoundary.length - 1].y)) {
			outerBoundary.push({ x: outerBoundary[0].x, y: outerBoundary[0].y });
		}

		// Generate pocket: convex hull is the boundary, all letter shapes are islands
		let pocketPaths = generatePocketPaths(outerBoundary, allClearanceOuters, pocketRadius, stepover, angle, direction, finishRadius);

		// Also pocket inside any design islands (holes like in O, A, B)
		for (let island of allClearanceIslands) {
			let islandPocket = generatePocketPaths(island, [], pocketRadius, stepover, angle, direction, finishRadius);
			pocketPaths.push(...islandPocket);
		}

		if (pocketPaths.length > 0) pocketGroups.push(pocketPaths);

		// Generate finishing profile around each letter shape (outside offset)
		let shapeProfPaths = [];
		for (let co of allClearanceOuters) {
			let profileOffset = offsetPath(co, finishRadius, true);
			if (profileOffset.length > 0) {
				let profileContour = profileOffset[0].slice();
				if (direction != "climb") profileContour = reversePath(profileContour);
				shapeProfPaths.push({ tpath: profileContour, isContour: true });
			}
		}
		// Profile inside design islands
		for (let island of allClearanceIslands) {
			let islandProfileOffset = offsetPath(island, finishRadius, false);
			if (islandProfileOffset.length > 0) {
				let islandContour = islandProfileOffset[0].slice();
				if (direction == "climb") islandContour = reversePath(islandContour);
				shapeProfPaths.push({ tpath: islandContour, isContour: true });
			}
		}
		if (shapeProfPaths.length > 0) profileGroups.push(shapeProfPaths);

		// Optional: cut out around the convex hull boundary
		if (cutOut) {
			let materialDepth = (typeof getOption === 'function' ? getOption('workpieceThickness') : null) || pocketingTool.depth;
			let cutOutOffset = offsetPath(outerBoundary, pocketRadius, false);
			if (cutOutOffset.length > 0) {
				let cutOutContour = cutOutOffset[0].slice();
				if (direction == "climb") cutOutContour = reversePath(cutOutContour);
				cutOutGroups.push([{ tpath: cutOutContour, isContour: true, cutOutDepth: materialDepth }]);
			}
		}
	}

	// Push accumulated toolpaths with optimized group ordering
	const depthMM = pocketingTool.depth;
	const typeName = inlayType === 'female' ? 'Socket' : 'Plug';

	let allPocketPaths = optimizeGroupOrder(pocketGroups);
	if (allPocketPaths.length > 0) {
		window.currentTool = { ...pocketingTool };
		pushToolPath(allPocketPaths, `Inlay ${typeName}`, 'Inlay', null, selectedSvgIds, `${depthMM}mm ${typeName}`);
	}

	let allProfilePaths = optimizeGroupOrder(profileGroups);
	if (allProfilePaths.length > 0) {
		window.currentTool = { ...finishingTool, depth: pocketingTool.depth, step: pocketingTool.step };
		pushToolPath(allProfilePaths, `Inlay ${typeName} Profile`, 'Inlay', null, selectedSvgIds, `${depthMM}mm ${typeName} Profile`);
	}

	let allCutOutPaths = optimizeGroupOrder(cutOutGroups);
	if (allCutOutPaths.length > 0) {
		let materialDepth = allCutOutPaths[0].cutOutDepth;
		let cleanCutOutPaths = allCutOutPaths.map(p => ({ tpath: p.tpath, isContour: p.isContour }));
		window.currentTool = { ...pocketingTool, depth: materialDepth };
		pushToolPath(cleanCutOutPaths, 'Inlay Plug Cutout', 'Inlay', null, selectedSvgIds, `${depthMM}mm Plug Cutout`);
	}

	// Restore pocketing tool (generateToolpathForSelection will restore the original)
	window.currentTool = pocketingTool;
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
	var angle = window.currentToolpathProperties?.angle || 0;
	var inputPaths = [];

	var selected = selectMgr.selectedPaths();
	for (let svgpath of selected)
		inputPaths.push(svgpath.path);

	inputPaths = normalizeWindingOrder(inputPaths);
	var direction = currentTool.direction || 'climb';
	const selectedSvgIds = selectMgr.selectedPaths().map(p => p.id);

	// Separate paths into outer boundaries and islands.
	// An island is any path fully contained inside another path.
	let outers = [];
	let islands = [];
	for (let i = 0; i < inputPaths.length; i++) {
		let isIsland = false;
		for (let j = 0; j < inputPaths.length; j++) {
			if (i === j) continue;
			if (pathIn(inputPaths[j], inputPaths[i])) {
				isIsland = true;
				break;
			}
		}
		if (isIsland) islands.push(inputPaths[i]);
		else outers.push(inputPaths[i]);
	}

	// Union overlapping outer paths
	let unionOuters = outers.length > 1 ? getUnionOfPaths(outers) : outers;

	// Generate pocket for each outer boundary with its contained islands
	let pocketGroups = [];
	for (let outerPath of unionOuters) {
		let containedIslands = islands.filter(isl => pathIn(outerPath, isl));
		let paths = generatePocketPaths(outerPath, containedIslands, radius, stepover, angle, direction, 0);
		if (paths.length > 0) pocketGroups.push(paths);
	}

	if (pocketGroups.length === 0) {
		notify('Unable to generate pocket paths');
		return;
	}

	// Order shape groups geographically, keeping each shape's paths together
	let allPaths = optimizeGroupOrder(pocketGroups);
	pushToolPath(allPaths, name, 'Pocket', null, selectedSvgIds);
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

	// Check table limits before saving - show Bootstrap confirm dialog if exceeded
	var limitWarning = checkTableLimits();
	if (limitWarning) {
		var proceed = await new Promise(function(resolve) {
			showConfirmModal({
				title: 'Machine Table Limits Exceeded',
				message: '<p>' + limitWarning + '</p><p>Do you want to save the G-code anyway?</p>',
				confirmText: 'Save Anyway',
				confirmClass: 'btn-warning',
				headerClass: 'bg-warning text-dark',
				onConfirm: function() { resolve(true); }
			});
			// If modal is dismissed without confirming, resolve false
			var modalEl = document.getElementById('confirmModal');
			modalEl.addEventListener('hidden.bs.modal', function() { resolve(false); }, { once: true });
		});
		if (!proceed) return;
	}

	window._skipTableLimitWarning = true;
	var text = toGcode();
	window._skipTableLimitWarning = false;

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


