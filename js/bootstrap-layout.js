/**
 * Bootstrap-based UI Layout System
 * Replaces w2ui components with Bootstrap equivalents
 */

var mode = "Select";
var options = [];
var tools = [];
var currentTool = null;
var currentFileName = "none";

// Wood species database with cutting parameters
var woodSpeciesDatabase = {
    'Pine': { 
        color: '#F5DEB3', // Wheat
        density: 0.5,
        feedMultiplier: 1.2,
        speedMultiplier: 1.0
    },
    'Oak': { 
        color: '#DEB887', // Burlywood
        density: 0.75,
        feedMultiplier: 0.8,
        speedMultiplier: 0.9
    },
    'Maple': { 
        color: '#F0E68C', // Khaki
        density: 0.7,
        feedMultiplier: 0.9,
        speedMultiplier: 0.95
    },
    'Cherry': { 
        color: '#FFB6C1', // Light Pink
        density: 0.6,
        feedMultiplier: 1.0,
        speedMultiplier: 1.0
    },
    'Walnut': { 
        color: '#D2B48C', // Tan
        density: 0.65,
        feedMultiplier: 0.95,
        speedMultiplier: 0.95
    },
    'Birch': { 
        color: '#FFF8DC', // Cornsilk
        density: 0.68,
        feedMultiplier: 0.9,
        speedMultiplier: 0.95
    },
    'Poplar': { 
        color: '#e6f7c1', // patel green
        density: 0.45,
        feedMultiplier: 1.3,
        speedMultiplier: 1.1
    },
    'Cedar': { 
        color: '#f8d091', // Lavender
        density: 0.35,
        feedMultiplier: 1.4,
        speedMultiplier: 1.2
    },
    'Ash': { 
        color: '#FFFACD', // Lemon Chiffon
        density: 0.72,
        feedMultiplier: 0.85,
        speedMultiplier: 0.9
    },
    'Mahogany': { 
        color: '#f5c373', // Misty Rose
        density: 0.55,
        feedMultiplier: 1.1,
        speedMultiplier: 1.0
    }
};

// Load options from localStorage
function loadOptions() {
    var optionData = localStorage.getItem('options');
    if (optionData) {
        options = JSON.parse(optionData);
    } else {
        options = [
            { recid: 1, option: 'Grid', value: true, desc: 'Show Grid' },
            { recid: 2, option: 'Origin', value: true, desc: 'Show Origin' },
            { recid: 3, option: 'Inches', value: false, desc: 'Display Inches' },
            { recid: 4, option: 'safeHeight', value: 5, desc: 'Safe Height in mm' },
            { recid: 5, option: 'tolerance', value: 1, desc: 'Tool path tolerance' },
            { recid: 6, option: 'zbacklash', value: 0.1, desc: 'Back lash compensation in mm' },
            { recid: 7, option: 'workpieceWidth', value: 300, desc: 'Workpiece Width (mm)' },
            { recid: 8, option: 'workpieceLength', value: 200, desc: 'Workpiece Length (mm)' },
            { recid: 9, option: 'workpieceThickness', value: 19, desc: 'Workpiece Thickness (mm)' },
            { recid: 10, option: 'woodSpecies', value: 'Pine', desc: 'Wood Species' },
            { recid: 11, option: 'autoFeedRate', value: true, desc: 'Auto Calculate Feed Rates' },
            { recid: 12, option: 'showWorkpiece', value: true, desc: 'Show Workpiece' },
            { recid: 13, option: 'tableWidth', value: 2000, desc: 'Max cutting width in mm' },
            { recid: 14, option: 'tableLength', value: 4000, desc: 'Max cutting length in mm' },
            { recid: 15, option: 'showTooltips', value: true, desc: 'Tooltips enabled' }

        ];
    }
}

// Load tools from localStorage
function loadTools() {
    var toolData = localStorage.getItem('tools');
    if (toolData) {
        tools = JSON.parse(toolData);
    } else {
        tools = [{
            recid: 1,
            color: '9FC5E8',
            name: "6mm End Mill",
            direction: 'Climb',
            diameter: 6,
            feed: 600,
            zfeed: 200,
            angle: 0,
            bit: 'End Mill',
            depth: 1.5,
            step: 1,
            stepover: 25,
        }, {
            recid: 2,
            color: '6FA8DC',
            name: "6mm VBit",
            direction: 'Climb',
            diameter: 6,
            feed: 500,
            zfeed: 200,
            angle: 60,
            bit: 'VBit',
            depth: 6,
            step: 0,
            stepover: 25,
        }, {
            recid: 3,
            color: '3D85C6',
            name: "6mm Drill",
            direction: 'Conventional',
            diameter: 6,
            feed: 500,
            zfeed: 200,
            angle: 0,
            bit: 'Drill',
            depth: 6,
            step: 3,
            stepover: 0,
        }];
    }

    if (tools.length > 0) {
        currentTool = tools[0];
    }
    renderToolsTable();
}
// File input handlers
var fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.addEventListener('change', function (e) {
    var file = fileInput.files[0];
    currentFileName = file.name.split('.').shift();

    var reader = new FileReader();
    reader.onload = function (event) {
        parseSvgContent(event.target.result);
        center();
        redraw();
    };
    reader.readAsText(file);
    fileInput.value = "";
});

var fileOpen = document.createElement('input');
fileOpen.type = 'file';
fileOpen.addEventListener('change', function (e) {
    var file = fileOpen.files[0];
    currentFileName = file.name.split('.').shift();

    var reader = new FileReader();
    reader.onload = function (event) {
        loadProject(event.target.result);
    };
    reader.readAsText(file);
    fileOpen.value = "";
});

// Initialize layout
function initializeLayout() {
    loadOptions();
    createToolbar();
    createSidebar();
    createToolPanel();
    createModals();
    lucide.createIcons();
}

// Toolbar creation
function createToolbar() {
    const toolbar = document.getElementById('toolbar');
    toolbar.innerHTML = `
        <div class="d-flex align-items-center w-100">
            <div class="toolbar-section">
                <button type="button" class="btn btn-outline-primary btn-sm btn-toolbar" data-action="new" data-bs-toggle="tooltip" data-bs-placement="bottom" title="New Project">
                    <i data-lucide="file-plus"></i>New
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm btn-toolbar" data-action="open" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Open Project">
                    <i data-lucide="folder-open"></i>Open
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm btn-toolbar" data-action="save" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Save Project">
                    <i data-lucide="save"></i>Save
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm btn-toolbar" data-action="import" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Import SVG file">
                    <i data-lucide="import"></i>Import
                </button>
                <button type="button" class="btn btn-outline-success btn-sm btn-toolbar" data-action="gcode" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Generate G-code">
                    <i data-lucide="file-cog"></i>G-code
                </button>
            </div>
            <div class="toolbar-separator"></div>
            <div class="toolbar-section">
                <button type="button" class="btn btn-outline-secondary btn-sm btn-toolbar" data-action="undo" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Undo last action">
                    <i data-lucide="undo-2"></i>Undo
                </button>
            </div>
            <div class="ms-auto toolbar-section">
                <button type="button" class="btn btn-outline-info btn-sm btn-toolbar" data-action="options" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Application Options">
                    <i data-lucide="settings"></i>Options
                </button>
                <button type="button" class="btn btn-outline-info btn-sm btn-toolbar" data-action="help" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Help">
                    <i data-lucide="help-circle"></i>Help
                </button>
            </div>
        </div>
    `;

    // Add toolbar event handlers
    toolbar.addEventListener('click', function (e) {
        const button = e.target.closest('[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        switch (action) {
            case 'new':
                newProject();
                break;
            case 'open':
                fileOpen.click();
                break;
            case 'save':
                saveProject();
                break;
            case 'import':
                fileInput.click();
                break;
            case 'gcode':
                doGcode();
                break;
            case 'undo':
                doUndo();
                break;
            case 'options':
                showOptionsModal();
                break;
            case 'help':
                showHelpModal();
                break;
        }
    });
}

// Sidebar creation
function createSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <!-- Tab Navigation -->
        <nav class="nav nav-tabs border-bottom" id="sidebar-tabs" role="tablist">
            <button class="nav-link active" id="draw-tools-tab" data-bs-toggle="tab" data-bs-target="#draw-tools" type="button" role="tab">
                <i data-lucide="pen-tool"></i> Draw Tools
            </button>
            <button class="nav-link" id="operations-tab" data-bs-toggle="tab" data-bs-target="#operations" type="button" role="tab">
                <i data-lucide="settings"></i> Operations
            </button>
        </nav>

        <!-- Tab Content -->
        <div class="tab-content h-100" id="sidebar-content">
            <!-- Draw Tools Tab -->
            <div class="tab-pane fade show active h-100" id="draw-tools" role="tabpanel">
                <div id="draw-tools-list" class="p-3">
                    <div class="sidebar-item" data-operation="Origin" data-bs-toggle="tooltip" data-bs-placement="right" title="Set the origin point">
                        <i data-lucide="crosshair"></i>Origin
                    </div>
                    <div class="sidebar-item" data-operation="Pan" data-bs-toggle="tooltip" data-bs-placement="right" title="Pan the view">
                        <i data-lucide="hand"></i>Pan
                    </div>
                    <div class="sidebar-item" data-operation="Move" data-bs-toggle="tooltip" data-bs-placement="right" title="Move selected objects">
                        <i data-lucide="move"></i>Move
                    </div>
                    <hr class="my-3">
                    <div class="sidebar-item" data-operation="Pen" data-bs-toggle="tooltip" data-bs-placement="right" title="Draw freehand lines">
                        <i data-lucide="pen-tool"></i>Pen
                    </div>
                    <div class="sidebar-item" data-operation="Polygon" data-bs-toggle="tooltip" data-bs-placement="right" title="Draw regular polygons">
                        <i data-lucide="pentagon"></i>Polygon
                    </div>
                    <div class="sidebar-item" data-operation="Text" data-bs-toggle="tooltip" data-bs-placement="right" title="Add text elements">
                        <i data-lucide="type"></i>Text
                    </div>

                    <!-- SVG Paths Section -->
                    <div class="sidebar-section mt-4">
                        <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#svg-paths-section">
                            <span>SVG Paths</span>
                            <i data-lucide="chevron-down"></i>
                        </div>
                        <div class="collapse show" id="svg-paths-section">
                            <!-- SVG paths will be added dynamically -->
                        </div>
                    </div>
                </div>

                <!-- Tool Properties Editor (hidden by default) -->
                <div id="tool-properties-editor" class="p-3" style="display: none;">
                    <div class="mb-3 pb-3 border-bottom">
                        <h6 class="mb-0" id="tool-properties-title">Tool Properties</h6>
                    </div>

                    <!-- Properties form will be injected here -->
                    <div id="tool-properties-form"></div>

                    <!-- Help section -->
                    <div class="mt-4">
                        <h6 class="text-muted mb-2">
                            <i data-lucide="help-circle"></i> How to use
                        </h6>
                        <div id="tool-help-content" class="small text-muted mb-3">
                            Select a tool to see instructions here.
                        </div>
                    </div>

                    <!-- Done button after help -->
                    <button type="button" class="btn btn-secondary w-100" id="done-button">
                        <i data-lucide="check"></i> Done
                    </button>
                </div>
            </div>

            <!-- Operations Tab -->
            <div class="tab-pane fade h-100" id="operations" role="tabpanel">
                <div id="operations-list" class="p-3">
                    <div class="sidebar-item" data-operation="Drill" data-bs-toggle="tooltip" data-bs-placement="right" title="Drill holes at selected points">
                        <i data-lucide="circle"></i>Drill
                    </div>
                    <div class="sidebar-item" data-operation="Inside" data-bs-toggle="tooltip" data-bs-placement="right" title="Cut inside the selected path">
                        <i data-lucide="circle-dot"></i>Inside
                    </div>
                    <div class="sidebar-item" data-operation="Center" data-bs-toggle="tooltip" data-bs-placement="right" title="Cut along the center line">
                        <i data-lucide="circle"></i>Center
                    </div>
                    <div class="sidebar-item" data-operation="Outside" data-bs-toggle="tooltip" data-bs-placement="right" title="Cut outside the selected path">
                        <i data-lucide="circle"></i>Outside
                    </div>
                    <div class="sidebar-item" data-operation="Pocket" data-bs-toggle="tooltip" data-bs-placement="right" title="Remove material inside the path">
                        <i data-lucide="target"></i>Pocket
                    </div>
                    <div class="sidebar-item" data-operation="Vcarve In" data-bs-toggle="tooltip" data-bs-placement="right" title="V-carve inside the path">
                        <i data-lucide="star"></i>V-Carve In
                    </div>

                    <!-- Tool Paths Section -->
                    <div class="sidebar-section mt-4">
                        <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#tool-paths-section">
                            <span>Tool Paths</span>
                            <i data-lucide="chevron-down"></i>
                        </div>
                        <div class="collapse show" id="tool-paths-section">
                            <!-- Tool paths will be added dynamically -->
                        </div>
                    </div>
                </div>

                <!-- Operation Properties Editor (hidden by default) -->
                <div id="operation-properties-editor" class="p-3" style="display: none;">
                    <div class="mb-3 pb-3 border-bottom">
                        <h6 class="mb-0" id="operation-properties-title">Operation Properties</h6>
                    </div>

                    <!-- Operation properties form will be injected here -->
                    <div id="operation-properties-form"></div>

                    <!-- Help section -->
                    <div class="mt-4">
                        <h6 class="text-muted mb-2">
                            <i data-lucide="help-circle"></i> How to use
                        </h6>
                        <div id="operation-help-content" class="small text-muted mb-3">
                            Select an operation to see instructions here.
                        </div>
                    </div>

                    <!-- Done button after help -->
                    <button type="button" class="btn btn-secondary w-100" id="operation-done-button">
                        <i data-lucide="check"></i> Done
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add sidebar event handlers
    sidebar.addEventListener('click', function (e) {
        const item = e.target.closest('.sidebar-item');
        const doneButton = e.target.closest('#done-button, #operation-done-button');

        // Handle Done button clicks
        if (doneButton) {
            showToolsList();
            return;
        }

        if (!item) return;

        const operation = item.dataset.operation;
        const pathId = item.dataset.pathId;

        if (operation) {
            // Check if this is a draw tool or operation
            const isDrawTool = ['Select', 'Origin', 'Pan', 'Move', 'Pen', 'Polygon', 'Text'].includes(operation);

            if (isDrawTool) {
                showToolPropertiesEditor(operation);
            } else {
                showOperationPropertiesEditor(operation);
            }

            handleOperationClick(operation);
        } else if (pathId) {
            handlePathClick(pathId);
        }

        // Update selection
        sidebar.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
        if (item) item.classList.add('selected');
    });

    // Context menu for paths
    sidebar.addEventListener('contextmenu', function (e) {
        const item = e.target.closest('.sidebar-item');
        if (!item || !item.dataset.pathId) return;

        e.preventDefault();
        showContextMenu(e, item.dataset.pathId);
    });

    // Add tab change event listeners to control bottom panel visibility
    const drawToolsTab = document.getElementById('draw-tools-tab');
    const operationsTab = document.getElementById('operations-tab');

    drawToolsTab.addEventListener('shown.bs.tab', function () {
        hideBottomPanel();
    });

    operationsTab.addEventListener('shown.bs.tab', function () {
        showBottomPanel();
    });

    // Initialize panel visibility based on current active tab
    const activeTab = document.querySelector('#sidebar-tabs .nav-link.active');
    if (activeTab && activeTab.id === 'operations-tab') {
        showBottomPanel();
    } else {
        hideBottomPanel();
    }
}

// Properties Editor Control Functions
function showToolPropertiesEditor(operationName) {
    const toolsList = document.getElementById('draw-tools-list');
    const propertiesEditor = document.getElementById('tool-properties-editor');
    const title = document.getElementById('tool-properties-title');
    const form = document.getElementById('tool-properties-form');
    const helpContent = document.getElementById('tool-help-content');

    // Hide tools list and show properties editor
    toolsList.style.display = 'none';
    propertiesEditor.style.display = 'block';

    // Update title
    title.textContent = `${operationName} Tool`;

    // Get the operation instance and populate properties
    const operation = window.cncController?.operationManager?.getOperation(operationName);
    if (operation && typeof operation.getPropertiesHTML === 'function') {
        form.innerHTML = operation.getPropertiesHTML();

        // Add event listeners directly to input elements
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            function handleInputChange() {
                if (operation && typeof operation.updateFromProperties === 'function') {
                    // Collect form data manually
                    const allInputs = form.querySelectorAll('input, select, textarea');
                    const data = {};
                    allInputs.forEach(inp => {
                        if (inp.name) {
                            if (inp.type === 'checkbox') {
                                data[inp.name] = inp.checked;
                            } else {
                                data[inp.name] = inp.value;
                            }
                        }
                    });
                    operation.updateFromProperties(data);
                }
            }

            // Add both change and input events for real-time updates
            input.addEventListener('change', handleInputChange);
            input.addEventListener('input', handleInputChange);
        });
    } else {
        form.innerHTML = '<p class="text-muted">No properties available for this tool.</p>';
    }

    // Update help content
    if (operation && typeof operation.getHelpText === 'function') {
        helpContent.innerHTML = operation.getHelpText();
    } else {
        helpContent.innerHTML = `Click and drag to use the ${operationName} tool.`;
    }

    lucide.createIcons();
}

function showOperationPropertiesEditor(operationName) {
    const operationsList = document.getElementById('operations-list');
    const propertiesEditor = document.getElementById('operation-properties-editor');
    const title = document.getElementById('operation-properties-title');
    const form = document.getElementById('operation-properties-form');
    const helpContent = document.getElementById('operation-help-content');

    // Hide operations list and show properties editor
    operationsList.style.display = 'none';
    propertiesEditor.style.display = 'block';

    // Update title
    title.textContent = `${operationName} Operation`;

    // Get the operation instance and populate properties
    const operation = window.cncController?.operationManager?.getOperation(operationName);
    if (operation && typeof operation.getPropertiesHTML === 'function') {
        form.innerHTML = operation.getPropertiesHTML();

        // Add event listeners directly to input elements
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            function handleInputChange() {
                if (operation && typeof operation.updateFromProperties === 'function') {
                    // Collect form data manually
                    const allInputs = form.querySelectorAll('input, select, textarea');
                    const data = {};
                    allInputs.forEach(inp => {
                        if (inp.name) {
                            if (inp.type === 'checkbox') {
                                data[inp.name] = inp.checked;
                            } else {
                                data[inp.name] = inp.value;
                            }
                        }
                    });
                    operation.updateFromProperties(data);
                }
            }

            // Add both change and input events for real-time updates
            input.addEventListener('change', handleInputChange);
            input.addEventListener('input', handleInputChange);
        });
    } else {
        form.innerHTML = '<p class="text-muted">No properties available for this operation.</p>';
    }

    // Update help content
    if (operation && typeof operation.getHelpText === 'function') {
        helpContent.innerHTML = operation.getHelpText();
    } else {
        helpContent.innerHTML = `Select paths and apply the ${operationName} operation.`;
    }

    lucide.createIcons();
}

function showToolsList() {
    const activeTab = document.querySelector('#sidebar-tabs .nav-link.active');

    if (activeTab && activeTab.id === 'draw-tools-tab') {
        const toolsList = document.getElementById('draw-tools-list');
        const propertiesEditor = document.getElementById('tool-properties-editor');

        toolsList.style.display = 'block';
        propertiesEditor.style.display = 'none';
    } else if (activeTab && activeTab.id === 'operations-tab') {
        const operationsList = document.getElementById('operations-list');
        const propertiesEditor = document.getElementById('operation-properties-editor');

        operationsList.style.display = 'block';
        propertiesEditor.style.display = 'none';
    }

    // Clear selection
    document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));

    // Deselect all paths
    if (typeof unselectAll === 'function') {
        unselectAll();
    } else {
        // Fallback path deselection
        if (window.svgpaths) {
            window.svgpaths.forEach(path => {
                path.selected = false;
            });
        }
    }

    // Return to Select mode
    if (window.cncController) {
        window.cncController.setMode('Select');
        handleOperationClick('Select');
    }
}

// Apply or remove operation to/from a newly selected path when operation is active
function applyOperationToPath(operationName, path) {
    // Check if this path already has a toolpath for this operation
    const hasExistingOperation = checkIfPathHasOperation(path, operationName);

    if (hasExistingOperation) {
        // Remove the existing operation
        removeOperationFromPath(path, operationName);
    } else {
        // Apply the operation
        applyNewOperationToPath(operationName, path);
    }

    // Redraw to show the changes
    redraw();
}

// Check if a path already has a specific operation applied
function checkIfPathHasOperation(path, operationName) {
    // Check if there's a toolpath with matching svgId and operation
    return toolpaths.some(toolpath =>
        toolpath.svgId === path.id &&
        toolpath.operation &&
        toolpath.operation.toLowerCase() === operationName.toLowerCase()
    );
}

// Remove operation toolpaths for a specific path
function removeOperationFromPath(path, operationName) {
    // Find and remove toolpaths that match both the svgId and operation name
    for (let i = toolpaths.length - 1; i >= 0; i--) {
        const toolpath = toolpaths[i];
        if (toolpath.svgId === path.id &&
            toolpath.operation &&
            toolpath.operation.toLowerCase() === operationName.toLowerCase()) {

            // Remove from toolpaths array
            toolpaths.splice(i, 1);

            // Remove from sidebar if it exists
            if (typeof removeToolPath === 'function') {
                removeToolPath(toolpath.id);
            }
        }
    }
}

// Apply a new operation to a path
function applyNewOperationToPath(operationName, path) {
    // Map operation names to their corresponding functions
    const operationMap = {
        'Drill': () => doDrill(),
        'Inside': () => doInside(),
        'Center': () => doCenter(),
        'Outside': () => doOutside(),
        'Pocket': () => doPocket(),
        'Vcarve In': () => doVcarveIn()
    };

    // Execute the operation if it exists
    if (operationMap[operationName]) {
        // Store original selections
        const originalSelections = svgpaths.map(p => p.selected);

        // Deselect all paths except the current one
        svgpaths.forEach(p => p.selected = false);
        path.selected = true;

        // Apply the operation
        operationMap[operationName]();

        // Restore original selections (keep the path selected)
        path.selected = true;
    }
}

// Path Properties Editor for editing existing paths
function showPathPropertiesEditor(path) {
    const toolsList = document.getElementById('draw-tools-list');
    const propertiesEditor = document.getElementById('tool-properties-editor');
    const title = document.getElementById('tool-properties-title');
    const form = document.getElementById('tool-properties-form');
    const helpContent = document.getElementById('tool-help-content');

    // Hide tools list and show properties editor
    toolsList.style.display = 'none';
    propertiesEditor.style.display = 'flex';
    propertiesEditor.style.flexDirection = 'column';

    // Update title
    title.textContent = `Edit ${path.creationTool} - ${path.name}`;

    // Create properties form based on the creation tool
    let propertiesHTML = '';
    if (path.creationTool === 'Text') {
        propertiesHTML = `
            <div class="mb-3">
                <label for="edit-text-input" class="form-label">Text</label>
                <textarea class="form-control"
                         id="edit-text-input"
                         name="text"
                         rows="3"
                         placeholder="Enter your text here...">${path.creationProperties.text}</textarea>
            </div>

            <div class="mb-3">
                <label for="edit-font-select" class="form-label">Font</label>
                <select class="form-select" id="edit-font-select" name="font">
                    <option value="fonts/ReliefSingleLineCAD-Regular.ttf" ${path.creationProperties.font === 'fonts/ReliefSingleLineCAD-Regular.ttf' ? 'selected' : ''}>Relief Single Line</option>
                    <option value="fonts/Roboto-Regular.ttf" ${path.creationProperties.font === 'fonts/Roboto-Regular.ttf' ? 'selected' : ''}>Roboto</option>
                    <option value="fonts/EduNSWACTCursive-VariableFont_wght.ttf" ${path.creationProperties.font === 'fonts/EduNSWACTCursive-VariableFont_wght.ttf' ? 'selected' : ''}>Edu Cursive</option>
                    <option value="fonts/AVHersheySimplexLight.ttf" ${path.creationProperties.font === 'fonts/AVHersheySimplexLight.ttf' ? 'selected' : ''}>AV Hershey Simplex Light</option>
                    <option value="fonts/AVHersheyComplexHeavy.ttf" ${path.creationProperties.font === 'fonts/AVHersheyComplexHeavy.ttf' ? 'selected' : ''}>AV Hershey Complex Heavy</option>
                </select>
            </div>

            <div class="mb-3">
                <label for="edit-font-size" class="form-label">Font Size: <span id="edit-font-size-value">${path.creationProperties.fontSize}</span>mm</label>
                <input type="range"
                       class="form-range"
                       id="edit-font-size"
                       name="fontSize"
                       min="5"
                       max="100"
                       step="1"
                       value="${path.creationProperties.fontSize}"
                       oninput="document.getElementById('edit-font-size-value').textContent = this.value">
            </div>

            <div class="alert alert-info">
                <i data-lucide="info"></i>
                Position: (${toMM(path.creationProperties.position.x, path.creationProperties.position.y).x.toFixed(2)}, ${toMM(path.creationProperties.position.x, path.creationProperties.position.y).y.toFixed(2)}) mm
            </div>
        `;
    } else if (path.creationTool === 'Polygon') {
        propertiesHTML = `
            <div class="mb-3">
                <label for="edit-polygon-sides" class="form-label">Number of Sides</label>
                <input type="number"
                       class="form-control"
                       id="edit-polygon-sides"
                       name="sides"
                       min="3"
                       max="20"
                       value="${path.creationProperties.sides}">
            </div>

            <div class="mb-3">
                <label for="edit-polygon-radius" class="form-label">Radius: <span id="edit-polygon-radius-value">${path.creationProperties.radius.toFixed(1)}</span>mm</label>
                <input type="range"
                       class="form-range"
                       id="edit-polygon-radius"
                       name="radius"
                       min="1"
                       max="50"
                       step="0.1"
                       value="${path.creationProperties.radius}"
                       oninput="document.getElementById('edit-polygon-radius-value').textContent = this.value">
            </div>

            <div class="alert alert-info">
                <i data-lucide="info"></i>
                Center: (${toMM(path.creationProperties.center.x, path.creationProperties.center.y).x.toFixed(2)}, ${toMM(path.creationProperties.center.x, path.creationProperties.center.y).y.toFixed(2)}) mm
            </div>
        `;
    }

    form.innerHTML = propertiesHTML;

    // Add event listeners directly to input elements for path editing
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        function handlePathEditChange() {
            updateExistingPath(path, form);
        }

        // Add both change and input events for real-time updates
        input.addEventListener('change', handlePathEditChange);
        input.addEventListener('input', handlePathEditChange);
    });

    // Update help content
    helpContent.innerHTML = `
        <div class="help-step">
            <div class="help-text">Editing existing ${path.creationTool.toLowerCase()}. Changes will update the path in real-time.</div>
        </div>
    `;

    lucide.createIcons();
}

// Function to update an existing path with new properties
function updateExistingPath(path, form) {
    // Collect form data manually since we're not using a proper form element
    const inputs = form.querySelectorAll('input, select, textarea');
    const data = {};
    inputs.forEach(input => {
        if (input.name) {
            if (input.type === 'checkbox') {
                data[input.name] = input.checked;
            } else {
                data[input.name] = input.value;
            }
        }
    });

    if (path.creationTool === 'Polygon') {
        // For polygons, update the existing path in place without creating new ones
        updatePolygonInPlace(path, data);
    } else if (path.creationTool === 'Text') {
        // For text, we need to recreate all character paths
        updateTextInPlace(path, data);
    }

    redraw();
}

// Update polygon path in place without creating new paths
function updatePolygonInPlace(path, data) {
    const newSides = parseInt(data.sides);
    const newRadius = parseFloat(data.radius);

    // Generate new points for the polygon
    const center = path.creationProperties.center;
    const points = [];
    const angle = 360 / newSides;

    for (let i = 0; i < newSides; i++) {
        const thisAngle = angle * i * (Math.PI / 180);
        const x = center.x + (newRadius * viewScale) * Math.cos(thisAngle);
        const y = center.y + (newRadius * viewScale) * Math.sin(thisAngle);
        points.push({x: x, y: y});
    }
    points.push(points[0]); // Close the polygon

    // Update the existing path object
    path.path = points;
    path.bbox = boundingBox(points);
    path.creationProperties.sides = newSides;
    path.creationProperties.radius = newRadius;

    // Keep the same name and ID - don't create new paths
}

// Update text paths in place
function updateTextInPlace(path, data) {
    // Find all paths that belong to this text creation
    const relatedPaths = svgpaths.filter(p =>
        p.creationTool === 'Text' &&
        p.creationProperties &&
        p.creationProperties.position.x === path.creationProperties.position.x &&
        p.creationProperties.position.y === path.creationProperties.position.y
    );

    // Check if only font size changed (same text and font) - we can update in place
    const originalText = path.creationProperties.text;
    const originalFont = path.creationProperties.font;
    const sameTextAndFont = (data.text === originalText && data.font === originalFont);

    if (sameTextAndFont && relatedPaths.length > 0) {
        // Just update font size in place without recreating paths
        updateTextSizeInPlace(relatedPaths, data);
        redraw();
    } else {
        // Text or font changed, need to recreate paths
        if (typeof opentype !== 'undefined') {
            opentype.load(data.font, (err, font) => {
                if (!err && font) {
                    updateTextPathsInPlace(relatedPaths, font, data);
                    redraw();
                }
            });
        }
    }
}

// Update text size without recreating paths (faster for size-only changes)
function updateTextSizeInPlace(textPaths, data) {
    const newFontSize = parseFloat(data.fontSize);
    const oldFontSize = textPaths[0].creationProperties.fontSize;
    const scaleFactor = newFontSize / oldFontSize;

    // Update each path by scaling the points
    textPaths.forEach(textPath => {
        const centerX = textPath.creationProperties.position.x;
        const centerY = textPath.creationProperties.position.y;

        // Scale all points relative to the text origin
        textPath.path = textPath.path.map(point => ({
            x: centerX + (point.x - centerX) * scaleFactor,
            y: centerY + (point.y - centerY) * scaleFactor
        }));

        // Update bounding box
        textPath.bbox = boundingBox(textPath.path);

        // Update stored properties
        textPath.creationProperties.fontSize = newFontSize;
    });
}

// Update existing text paths without creating new ones
function updateTextPathsInPlace(textPaths, font, data) {
    const text = data.text;
    const fontSize = parseFloat(data.fontSize);
    const fontname = data.font;

    if (!textPaths.length) return;

    // Get position from the first path
    const position = textPaths[0].creationProperties.position;
    const x = position.x;
    const y = position.y;

    // Store original path IDs and names to preserve them
    const originalPaths = textPaths.map(p => ({
        id: p.id,
        name: p.name,
        selected: p.selected
    }));

    // Remove existing text paths from sidebar and array
    textPaths.forEach(textPath => {
        const pathIndex = svgpaths.findIndex(p => p.id === textPath.id);
        if (pathIndex !== -1) {
            removeSvgPath(textPath.id);
            svgpaths.splice(pathIndex, 1);
        }
    });

    // Create new text paths using the same logic as the original text tool
    let currentX = x;
    let fontSizeScaled = Math.round(4 * fontSize * svgscale);
    let pathIdCounter = 0; // Track which original ID to reuse

    const chars = text.split('');
    chars.forEach((char, index) => {
        var fontPath = font.getPath(char, currentX, y, fontSizeScaled);

        // Track separate subpaths
        var currentPathData = [];
        var allPaths = [];
        var lastX = currentX;
        var lastY = y;
        var firstPoint = null;

        fontPath.commands.forEach(function (cmd) {
            switch (cmd.type) {
                case 'M': // Move - Start new subpath
                    if (currentPathData.length > 0) {
                        if (currentPathData.length >= 2) {
                            allPaths.push([...currentPathData]);
                        }
                    }
                    currentPathData = [];
                    firstPoint = { x: cmd.x, y: cmd.y };
                    if (fontname.indexOf("SingleLine") == -1) {
                        currentPathData.push({ x: cmd.x, y: cmd.y });
                    }
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'L': // Line
                    currentPathData.push({ x: cmd.x, y: cmd.y });
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'C': // Curve
                    var steps = 10;
                    for (var i = 0; i <= steps; i++) {
                        var t = i / steps;
                        var tx = Math.pow(1 - t, 3) * lastX +
                            3 * Math.pow(1 - t, 2) * t * cmd.x1 +
                            3 * (1 - t) * Math.pow(t, 2) * cmd.x2 +
                            Math.pow(t, 3) * cmd.x;
                        var ty = Math.pow(1 - t, 3) * lastY +
                            3 * Math.pow(1 - t, 2) * t * cmd.y1 +
                            3 * (1 - t) * Math.pow(t, 2) * cmd.y2 +
                            Math.pow(t, 3) * cmd.y;
                        currentPathData.push({ x: tx, y: ty });
                    }
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'Q': // Quadratic curve
                    var steps = 10;
                    for (var i = 0; i <= steps; i++) {
                        var t = i / steps;
                        var tx = Math.pow(1 - t, 2) * lastX +
                            2 * (1 - t) * t * cmd.x1 +
                            Math.pow(t, 2) * cmd.x;
                        var ty = Math.pow(1 - t, 2) * lastY +
                            2 * (1 - t) * t * cmd.y1 +
                            Math.pow(t, 2) * cmd.y;
                        currentPathData.push({ x: tx, y: ty });
                    }
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'Z': // Close path
                    if (firstPoint && currentPathData.length > 0) {
                        currentPathData.push({x: firstPoint.x, y: firstPoint.y});
                    }
                    break;
            }
        });

        // Add the last subpath if it exists
        if (currentPathData.length >= 2) {
            allPaths.push(currentPathData);
        }

        // Create separate SVG path for each subpath
        allPaths.forEach((pathData, pathIndex) => {
            pathData = clipper.JS.Lighten(pathData, getOption("tolerance"));
            if (pathData.length > 0) {
                var pathType = pathIndex === 0 ? 'outer' : 'inner';

                // Reuse original ID and name if available, otherwise create new
                var pathId, pathName, isSelected;
                if (pathIdCounter < originalPaths.length) {
                    pathId = originalPaths[pathIdCounter].id;
                    pathName = originalPaths[pathIdCounter].name;
                    isSelected = originalPaths[pathIdCounter].selected;
                } else {
                    // If we need more paths than before, create new ones
                    pathId = 'Text' + svgpathId;
                    pathName = 'Text_' + char + '_' + pathType + '_' + svgpathId;
                    isSelected = false;
                    svgpathId++;
                }

                var svgPath = {
                    id: pathId,
                    type: 'path',
                    name: pathName,
                    selected: isSelected,
                    visible: true,
                    path: pathData,
                    bbox: boundingBox(pathData),
                    // Store creation properties for editing
                    creationTool: 'Text',
                    creationProperties: {
                        text: text,
                        font: fontname,
                        fontSize: fontSize,
                        position: { x: x, y: y },
                        character: char,
                        pathType: pathType
                    }
                };

                svgpaths.push(svgPath);
                addSvgPath(svgPath.id, svgPath.name);
                pathIdCounter++;
            }
        });

        // Move to next character position
        currentX += font.getAdvanceWidth(char, fontSizeScaled);
    });
}

// Tool panel creation
function createToolPanel() {
    const toolPanel = document.getElementById('tool-panel');
    toolPanel.innerHTML = `
        <div class="tool-controls">
            <div class="d-flex gap-2 mb-3 align-items-center flex-wrap">
                <button type="button" class="btn btn-outline-success btn-sm" id="add-tool">
                    <i data-lucide="plus"></i> Add Tool
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" id="delete-tool" disabled>
                    <i data-lucide="trash-2"></i> Delete
                </button>
                <div class="border-start ps-3 d-flex gap-2 align-items-center">
                    <button type="button" class="btn btn-outline-primary btn-sm" id="start-simulation">
                        <i data-lucide="play"></i>
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="pause-simulation" disabled>
                        <i data-lucide="pause"></i>
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="stop-simulation" disabled>
                        <i data-lucide="octagon-x"></i>
                    </button>
                    <div class="d-flex align-items-center gap-1">
                        <span class="small">Speed:</span>
                        <input type="range" class="form-range form-range-sm" id="simulation-speed" min="1" max="10" step="0.5" value="1" style="width: 60px;">
                        <span id="speed-display" class="small">1x</span>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                        <span class="small">Step:</span>
                        <input type="range" class="form-range form-range-sm" id="simulation-step" min="0" max="100" step="1" value="0" style="width: 240px;" disabled>
                        <span id="step-display" class="small">0/0</span>
                    </div>
                    <div class="small text-muted">
                        <span id="simulation-time">0:00</span>/<span id="total-time">0:00</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="table-responsive">
            <table class="table table-sm tool-table" id="tool-table">
                <thead>
                    <tr>
                        <th><i data-lucide="palette" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Set tool color"></i> Color</th>
                        <th><i data-lucide="tag" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Tool name"></i> Name</th>
                        <th><i data-lucide="wrench" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Tool"></i> Tool</th>
                        <th><i data-lucide="rotate-cw" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Direction"></i> Direction</th>
                        <th><i data-lucide="diameter" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Diameter (mm)"></i>Diameter (mm)</th>
                        <th><i data-lucide="move" data-bs-toggle="tooltip" data-bs-placement="bottom" title="XY Feed"></i> XY Feed</th>
                        <th><i data-lucide="arrow-down" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Z Feed"></i> Z Feed</th>
                        <th><i data-lucide="triangle" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Angle"></i> Angle</th>
                        <th><i data-lucide="arrow-down-to-line" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Depth"></i> Depth</th>
                        <th><i data-lucide="layers" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Step"></i> Step</th>
                        <th><i data-lucide="percent" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Step %"></i> Step %</th>
                    </tr>
                </thead>
                <tbody id="tool-table-body">
                </tbody>
            </table>
        </div>
    `;

    // Add tool control event handlers
    document.getElementById('add-tool').addEventListener('click', addTool);
    document.getElementById('delete-tool').addEventListener('click', deleteTool);

    // Add simulation control event handlers
    document.getElementById('start-simulation').addEventListener('click', startSimulation);
    document.getElementById('pause-simulation').addEventListener('click', pauseSimulation);
    document.getElementById('stop-simulation').addEventListener('click', stopSimulation);
    
    // Simulation speed control
    document.getElementById('simulation-speed').addEventListener('input', function(e) {
        const speed = parseFloat(e.target.value);
        document.getElementById('speed-display').textContent = speed + 'x';
        if (typeof updateSimulationSpeed === 'function') {
            updateSimulationSpeed(speed);
        }
    });

    // Simulation step control
    document.getElementById('simulation-step').addEventListener('input', function(e) {
        const step = parseInt(e.target.value);
        if (typeof setSimulationStep === 'function') {
            setSimulationStep(step);
        }
    });

    // Render tools table
    renderToolsTable();
}

// Render tools table
function renderToolsTable() {
    const tbody = document.getElementById('tool-table-body');
    tbody.innerHTML = '';

    tools.forEach((tool, index) => {
        const row = createToolRow(tool, index);
        tbody.appendChild(row);
    });

    if (tools.length > 0 && !currentTool) {
        selectTool(0);
    }
}

function createToolRow(tool, index) {
    const row = document.createElement('tr');
    row.dataset.toolIndex = index;
    row.dataset.recid = tool.recid;

    row.innerHTML = `
        <td>
            <div class="color-cell" style="background-color: #${tool.color};" 
                 data-field="color" data-bs-toggle="tooltip" title="Click to change color"></div>
        </td>
        <td><input type="text" value="${tool.name}" data-field="name" class="form-control-plaintext"></td>
        <td>
            <select data-field="bit" class="form-select form-select-sm">
                <option value="End Mill" ${tool.bit === 'End Mill' ? 'selected' : ''}>End Mill</option>
                <option value="Drill" ${tool.bit === 'Drill' ? 'selected' : ''}>Drill</option>
                <option value="VBit" ${tool.bit === 'VBit' ? 'selected' : ''}>VBit</option>
            </select>
        </td>
        <td>
            <select data-field="direction" class="form-select form-select-sm">
                <option value="Climb" ${tool.direction === 'Climb' ? 'selected' : ''}>Climb</option>
                <option value="Conventional" ${tool.direction === 'Conventional' ? 'selected' : ''}>Conventional</option>
            </select>
        </td>
        <td><input type="number" value="${tool.diameter}" data-field="diameter" min="1" max="25" step="0.1"></td>
        <td><input type="number" value="${tool.feed}" data-field="feed" min="10" max="1000" step="10"></td>
        <td><input type="number" value="${tool.zfeed}" data-field="zfeed" min="10" max="1000" step="10"></td>
        <td><input type="number" value="${tool.angle}" data-field="angle" min="0" max="90" step="5"></td>
        <td><input type="number" value="${tool.depth}" data-field="depth" min="0" max="25" step="0.1"></td>
        <td><input type="number" value="${tool.step}" data-field="step" min="0.5" max="5" step="0.1"></td>
        <td><input type="number" value="${tool.stepover}" data-field="stepover" min="5" max="100" step="5"></td>
    `;

    // Add event handlers for row selection and editing
    row.addEventListener('click', () => selectTool(index));

    // Add change handlers for inline editing
    row.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', (e) => updateTool(index, e.target.dataset.field, e.target.value));
    });

    // Color picker handler
    const colorCell = row.querySelector('.color-cell');
    colorCell.addEventListener('click', () => openColorPicker(index));

    return row;
}

function selectTool(index) {
    // Remove previous selection
    document.querySelectorAll('#tool-table-body tr.selected').forEach(row => {
        row.classList.remove('selected');
    });

    // Select new tool
    const row = document.querySelector(`#tool-table-body tr[data-tool-index="${index}"]`);
    if (row) {
        row.classList.add('selected');
        currentTool = tools[index];
        setMode(null);

        // Enable/disable buttons
        document.getElementById('delete-tool').disabled = false;

    }
}

function updateTool(index, field, value) {
    if (tools[index]) {
        // Convert numeric fields
        if (['diameter', 'feed', 'zfeed', 'angle', 'depth', 'step', 'stepover'].includes(field)) {
            value = parseFloat(value);
        }

        tools[index][field] = value;
        localStorage.setItem('tools', JSON.stringify(tools));

        if (currentTool && currentTool.recid === tools[index].recid) {
            currentTool = tools[index];
            toolChanged(currentTool);
            setMode(null);
        }
    }
}

function addTool() {
    const newTool = {
        recid: freeToolId(),
        color: currentTool ? currentTool.color : '9FC5E8',
        name: (currentTool ? currentTool.name : "New Tool") + " copy",
        direction: currentTool ? currentTool.direction : 'Climb',
        diameter: currentTool ? currentTool.diameter : 6,
        feed: currentTool ? currentTool.feed : 600,
        zfeed: currentTool ? currentTool.zfeed : 200,
        angle: currentTool ? currentTool.angle : 0,
        bit: currentTool ? currentTool.bit : 'End Mill',
        depth: currentTool ? currentTool.depth : 1.5,
        step: currentTool ? currentTool.step : 1,
        stepover: currentTool ? currentTool.stepover : 25,
    };

    tools.push(newTool);
    localStorage.setItem('tools', JSON.stringify(tools));
    renderToolsTable();
    selectTool(tools.length - 1);
}

function deleteTool() {
    const selectedIndex = getCurrentToolIndex();
    if (selectedIndex >= 0 && tools.length > 1) {
        tools.splice(selectedIndex, 1);
        localStorage.setItem('tools', JSON.stringify(tools));
        renderToolsTable();

        // Select a different tool
        if (selectedIndex >= tools.length) {
            selectTool(tools.length - 1);
        } else {
            selectTool(selectedIndex);
        }
    }
}



function getCurrentToolIndex() {
    const selectedRow = document.querySelector('#tool-table-body tr.selected');
    return selectedRow ? parseInt(selectedRow.dataset.toolIndex) : -1;
}

function openColorPicker(index) {
    // Create a temporary color input
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#' + tools[index].color;

    colorInput.addEventListener('change', function () {
        const newColor = this.value.substring(1); // Remove #
        updateTool(index, 'color', newColor);

        // Update the color cell
        const colorCell = document.querySelector(`tr[data-tool-index="${index}"] .color-cell`);
        if (colorCell) {
            colorCell.style.backgroundColor = this.value;
        }
    });

    colorInput.click();
}

// Modal creation
function createModals() {
    const body = document.body;

    // Options modal
    const optionsModal = document.createElement('div');
    optionsModal.innerHTML = `
        <div class="modal fade" id="optionsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Options</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="table-responsive">
                            <table class="table options-table" id="options-table">
                                <thead>
                                    <tr>
                                        <th>Option</th>
                                        <th>Description</th>
                                        <th>Value</th>
                                    </tr>
                                </thead>
                                <tbody id="options-table-body">
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary" id="save-options">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(optionsModal);

    // Help modal
    const helpModal = document.createElement('div');
    helpModal.innerHTML = `
        <div class="modal fade" id="helpModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Help</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>Import an SVG file</p>
                        <p>Select a tool</p>
                        <p>Select a Path</p>
                        <p>Perform an Operation</p>
                        <p>Save the gcode</p>
                        <hr>
                        <p class="text-muted">&copy; 2025 Rick McConney</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(helpModal);

    // Add options modal event handlers
    document.getElementById('save-options').addEventListener('click', saveOptions);
}

function showOptionsModal() {
    renderOptionsTable();
    const modal = new bootstrap.Modal(document.getElementById('optionsModal'));
    modal.show();
}

function showHelpModal() {
    const modal = new bootstrap.Modal(document.getElementById('helpModal'));
    modal.show();
}

function renderOptionsTable() {
    const tbody = document.getElementById('options-table-body');
    tbody.innerHTML = '';

    options.forEach((option, index) => {
        const row = document.createElement('tr');
        let inputHtml = '';
        
        if (typeof option.value === 'boolean') {
            inputHtml = `<div class="form-check">
                         <input type="checkbox" class="form-check-input" ${option.value ? 'checked' : ''} 
                                data-option-index="${index}">
                       </div>`;
        } else if (option.option === 'woodSpecies') {
            // Create dropdown for wood species
            const speciesOptions = Object.keys(woodSpeciesDatabase).map(species => 
                `<option value="${species}" ${option.value === species ? 'selected' : ''}>${species}</option>`
            ).join('');
            inputHtml = `<select class="form-select" data-option-index="${index}">
                           ${speciesOptions}
                         </select>`;
        } else {
            inputHtml = `<input type="number" class="form-control" value="${option.value}" 
                              data-option-index="${index}" step="0.1">`;
        }
        
        row.innerHTML = `
            <td><strong>${option.option}</strong></td>
            <td>${option.desc}</td>
            <td>${inputHtml}</td>
        `;
        tbody.appendChild(row);
    });

    // Add change handlers
    tbody.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.optionIndex);
            let value;
            if (input.type === 'checkbox') {
                value = input.checked;
            } else if (input.tagName === 'SELECT') {
                value = input.value;
            } else {
                value = parseFloat(input.value);
            }
            options[index].value = value;
            toggleTooltips(getOption('showTooltips'));
            redraw();
        });
    });
}

function saveOptions() {
    localStorage.setItem('options', JSON.stringify(options));
    const modal = bootstrap.Modal.getInstance(document.getElementById('optionsModal'));
    modal.hide();
    redraw();
}

// Function to refresh options display when loaded from project
function refreshOptionsDisplay() {
    // Options are stored in global options variable and accessed directly by the modal
    // No need to refresh anything here as the options modal reads from the global variable
    // when it's opened
}

// Function to refresh tools display when loaded from project
function refreshToolsGrid() {
    // Re-render the tools table to reflect loaded tools
    renderToolsTable();

    // Update currentTool if it exists in the loaded tools
    if (tools.length > 0) {
        currentTool = tools[0]; // Default to first tool
    }
}

// Operation handlers
function handleOperationClick(operation) {
    // addUndo() will be called by individual operation functions as needed

    switch (operation) {
        // Drawing/Interaction Tools
        case 'Select':
            doSelect(operation);
            break;
        case 'Origin':
            doOrigin();
            break;
        case 'Pan':
            doPan();
            break;
        case 'Move':
            doMove();
            break;
        case 'Pen':
            doPen();
            break;
        case 'Polygon':
            doPolygon();
            break;
        case 'Text':
            doText();
            break;
        case 'Drill':
            doDrill();
            break;
        // Machining Operations
        case 'Inside':
            doInside();
            break;
        case 'Center':
            doCenter();
            break;
        case 'Outside':
            doOutside();
            break;
        case 'Pocket':
            doPocket();
            break;
        case 'Vcarve In':
            doVcarveIn();
            break;
        case 'Vcarve Out':
            doVcarveOut();
            break;
        default:
            doSelect(operation);
            break;
    }
}

function handlePathClick(pathId) {
    doSelect(pathId);

    // Check if this path has creation properties for editing
    const path = svgpaths.find(p => p.id === pathId);
    if (path && path.creationTool && path.creationProperties) {
        // Only show properties editor if this is a draw tool that supports editing
        if (path.creationTool === 'Text' || path.creationTool === 'Polygon') {
            // Always switch to Draw Tools tab when editing from paths list
            const drawToolsTab = document.getElementById('draw-tools-tab');
            const drawToolsPane = document.getElementById('draw-tools');

            // Switch to draw tools tab
            document.querySelectorAll('#sidebar-tabs .nav-link').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

            drawToolsTab.classList.add('active');
            drawToolsPane.classList.add('show', 'active');

            // Show properties editor for this path
            showPathPropertiesEditor(path);
        }
    }
}

// Context menu
function showContextMenu(event, pathId) {
    // Remove existing context menu
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu show context-menu';
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.style.zIndex = '9999';

    menu.innerHTML = `
        <button class="dropdown-item" data-action="show" data-path-id="${pathId}">
            <i data-lucide="eye"></i> Show
        </button>
        <button class="dropdown-item" data-action="hide" data-path-id="${pathId}">
            <i data-lucide="eye-off"></i> Hide
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item text-danger" data-action="delete" data-path-id="${pathId}">
            <i data-lucide="trash-2"></i> Delete
        </button>
    `;

    document.body.appendChild(menu);

    // Add event handlers
    menu.addEventListener('click', function (e) {
        const button = e.target.closest('[data-action]');
        if (button) {
            const action = button.dataset.action;
            const pathId = button.dataset.pathId;

            switch (action) {
                case 'show':
                    setVisibility(pathId, true);
                    break;
                case 'hide':
                    setVisibility(pathId, false);
                    break;
                case 'delete':
                    doRemoveToolPath(pathId);
                    break;
            }
        }
        menu.remove();
    });

    // Remove menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 0);

    lucide.createIcons();
}

function setHidden(id, hidden) {


}
// Sidebar management functions (maintaining compatibility with existing code)
function addSvgPath(id, name) {
    const section = document.getElementById('svg-paths-section');
    const item = document.createElement('div');
    item.className = 'sidebar-item';
    item.dataset.pathId = id;
    item.innerHTML = `
        <i data-lucide="${getPathIcon(name)}"></i>${name}
    `;
    section.appendChild(item);
    lucide.createIcons();
}

function addToolPath(id, name, operation, toolName) {
    const section = document.getElementById('tool-paths-section');

    // Find or create tool group
    let toolGroup = section.querySelector(`[data-tool-name="${toolName}"]`);
    if (!toolGroup) {
        toolGroup = document.createElement('div');
        toolGroup.className = 'ms-3';
        toolGroup.dataset.toolName = toolName;
        toolGroup.innerHTML = `
            <div class="sidebar-item fw-bold">
                <i data-lucide="folder"></i>${toolName}
            </div>
        `;
        section.appendChild(toolGroup);
    }

    // Add tool path item
    const item = document.createElement('div');
    item.className = 'sidebar-item ms-4';
    item.dataset.pathId = id;
    item.innerHTML = `
        <i data-lucide="${getOperationIcon(operation)}"></i>${name}
    `;
    toolGroup.appendChild(item);
    lucide.createIcons();
}

function removeSvgPath(id) {
    const item = document.querySelector(`#svg-paths-section [data-path-id="${id}"]`);
    if (item) item.remove();
}

function removeToolPath(id) {
    const item = document.querySelector(`#tool-paths-section [data-path-id="${id}"]`);
    if (item) item.remove();
}

function clearSvgPaths() {
    document.getElementById('svg-paths-section').innerHTML = '';
}

function clearToolPaths() {
    document.getElementById('tool-paths-section').innerHTML = '';
}

function selectSidebarNode(id) {
    setTimeout(() => {
        const item = document.querySelector(`[data-path-id="${id}"]`);
        if (item) {
            document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 100);
}

function unselectSidebarNode(id) {
    if (id) {
        const item = document.querySelector(`[data-path-id="${id}"]`);
        if (item) item.classList.remove('selected');
    } else {
        document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
    }
}

// Compatibility function for operation manager
function addOperation(name, icon) {
    // Operations are already added statically in createSidebar()
    // This function is kept for compatibility with OperationManager
    //console.log(`Operation ${name} with icon ${icon} registered`);
}

// Compatibility function for CncController
function addSidebarOperations() {
    // Operations are already added statically in createSidebar()
    // This function is kept for compatibility
    //console.log('Sidebar operations already initialized');
}

// Helper functions
function getPathIcon(name) {
    if (name.includes('Circle')) return 'circle';
    if (name.includes('Rect')) return 'square';
    if (name.includes('Line')) return 'minus';
    if (name.includes('Text')) return 'type';
    if (name.includes('Poly')) return 'pentagon';
    return 'route';
}

function getOperationIcon(operation) {
    switch (operation) {
        case 'Outside': return 'circle';
        case 'Inside': return 'circle-dot';
        case 'Center': return 'circle';
        case 'Pocket': return 'target';
        case 'VCarve In': return 'star';
        case 'VCarve Out': return 'star';
        case 'Drill': return 'circle';
        default: return 'circle';
    }
}

function getOption(name) {
    const option = options.find(opt => opt.option === name);
    return option ? option.value : false;
}

function freeToolId() {
    let id = 1;
    while (tools.find(tool => tool.recid === id)) {
        id++;
    }
    return id;
}

function setMode(m) {
    if (m != null) mode = m;
    document.getElementById('status').textContent = `Tool: ${currentTool ? currentTool.name : 'None'} [${mode}]`;
}

// Compatibility object for grid operations  
window.grid = {
    status: function (text) {
        // Update status bar with tool information
        document.getElementById('status').textContent = `Tool: ${text} [${mode}]`;
    },
    get records() {
        return tools;
    }
};

// Toast notification system
function notify(message, type = 'error') {
    // Create toast container if it doesn't exist
    let canvas = document.getElementById('canvas');
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed top-50 start-50 translate-middle p-3';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast align-items-center text-bg-${type === 'error' ? 'danger' : 'primary'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                <i data-lucide="${type === 'error' ? 'alert-circle' : 'info'}"></i>
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;

    toastContainer.appendChild(toast);
    lucide.createIcons();

    // Show toast
    const bsToast = new bootstrap.Toast(toast, {
        autohide: true,
        delay: 3000
    });
    bsToast.show();

    // Clean up after toast is hidden
    toast.addEventListener('hidden.bs.toast', function () {
        toast.remove();
    });
}

// Compatibility functions for existing w2ui code
function w2alert(message, title = 'Alert') {
    notify(message, 'info');
}

function w2popup() {
    // This object provides compatibility with existing w2popup calls
    return {
        open: function (config) {
            // For now, just create a simple modal
            const modalId = 'dynamic-modal-' + Date.now();
            const modal = document.createElement('div');
            modal.innerHTML = `
                <div class="modal fade" id="${modalId}" tabindex="-1">
                    <div class="modal-dialog" style="width: ${config.width || 600}px;">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">${config.title || 'Dialog'}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                ${config.body || ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const bsModal = new bootstrap.Modal(document.getElementById(modalId));
            bsModal.show();

            // Execute onOpen callback if provided
            if (config.onOpen) {
                const event = { complete: Promise.resolve() };
                config.onOpen(event);
            }

            // Clean up when modal is closed
            modal.addEventListener('hidden.bs.modal', function () {
                modal.remove();
            });

            return {
                close: function () {
                    bsModal.hide();
                }
            };
        },
        close: function () {
            // Close any open modals
            const openModals = document.querySelectorAll('.modal.show');
            openModals.forEach(modal => {
                bootstrap.Modal.getInstance(modal)?.hide();
            });
        }
    };
}

// Make w2popup available globally for compatibility
window.w2popup = w2popup();

// Bottom panel visibility control functions
function showBottomPanel() {
    const toolPanelContainer = document.querySelector('.tool-panel-container');
    const bottomResize = document.getElementById('bottom-resize');
    if (toolPanelContainer) {
        toolPanelContainer.style.display = 'block';
    }
    if (bottomResize) {
        bottomResize.style.display = 'block';
    }
}

function hideBottomPanel() {
    const toolPanelContainer = document.querySelector('.tool-panel-container');
    const bottomResize = document.getElementById('bottom-resize');
    if (toolPanelContainer) {
        toolPanelContainer.style.display = 'none';
    }
    if (bottomResize) {
        bottomResize.style.display = 'none';
    }
}

// Resize functionality
function initializeResizeHandles() {
    const sidebarResize = document.getElementById('sidebar-resize');
    const bottomResize = document.getElementById('bottom-resize');
    const sidebar = document.getElementById('sidebar');
    const toolPanelContainer = document.querySelector('.tool-panel-container');

    // Sidebar horizontal resize
    if (sidebarResize && sidebar) {
        let isResizingSidebar = false;
        let startX = 0;
        let startWidth = 0;

        sidebarResize.addEventListener('mousedown', function(e) {
            isResizingSidebar = true;
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);
            sidebarResize.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', function(e) {
            if (!isResizingSidebar) return;

            const newWidth = startWidth + (e.clientX - startX);
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.5;

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                sidebar.style.width = newWidth + 'px';
            }
        });

        document.addEventListener('mouseup', function() {
            if (isResizingSidebar) {
                isResizingSidebar = false;
                sidebarResize.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Update canvas center after sidebar resize
                if (typeof updateCanvasCenter === 'function') {
                    updateCanvasCenter();
                    if (typeof redraw === 'function') {
                        redraw();
                    }
                }
            }
        });
    }

    // Bottom panel vertical resize
    if (bottomResize && toolPanelContainer) {
        let isResizingBottom = false;
        let startY = 0;
        let startHeight = 0;

        bottomResize.addEventListener('mousedown', function(e) {
            isResizingBottom = true;
            startY = e.clientY;
            startHeight = parseInt(window.getComputedStyle(toolPanelContainer).height, 10);
            bottomResize.classList.add('dragging');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', function(e) {
            if (!isResizingBottom) return;

            const newHeight = startHeight - (e.clientY - startY);
            const minHeight = 150;
            const maxHeight = window.innerHeight * 0.6;

            if (newHeight >= minHeight && newHeight <= maxHeight) {
                toolPanelContainer.style.height = newHeight + 'px';
            }
        });

        document.addEventListener('mouseup', function() {
            if (isResizingBottom) {
                isResizingBottom = false;
                bottomResize.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Update canvas center after bottom panel resize
                if (typeof updateCanvasCenter === 'function') {
                    updateCanvasCenter();
                    if (typeof redraw === 'function') {
                        redraw();
                    }
                }
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeLayout();
    initializeResizeHandles();
    newProject();
    toggleTooltips(getOption('showTooltips'));
});

function toggleTooltips(on)
{
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
      if (on) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
      } else {
        
        bootstrap.Tooltip.getInstance(tooltipTriggerEl)?.dispose();
        return null;
      }
    });
}
