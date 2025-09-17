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
        <div class="p-3">
            <div class="sidebar-section">
                <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#tools-section">
                    <span>Tools</span>
                    <i data-lucide="chevron-down"></i>
                </div>
                <div class="collapse show" id="tools-section">
                    <div class="sidebar-item" data-operation="Select" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Select paths">
                        <i data-lucide="mouse-pointer"></i>Select
                    </div>
                    <div class="sidebar-item" data-operation="Origin" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Set the origin point">
                        <i data-lucide="crosshair"></i>Origin
                    </div>
                    <div class="sidebar-item" data-operation="Pan" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Pan the view">
                        <i data-lucide="hand"></i>Pan
                    </div>
                    <div class="sidebar-item" data-operation="Move" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Move the selected object">
                        <i data-lucide="move"></i>Move
                    </div>
                    <div class="sidebar-item" data-operation="Pen" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Draw freehand lines">
                        <i data-lucide="pen-tool"></i>Pen
                    </div>
                    <div class="sidebar-item" data-operation="Polygon" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Draw a polygon">
                        <i data-lucide="pentagon"></i>Polygon
                    </div>
                    <div class="sidebar-item" data-operation="Text" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Add text">
                        <i data-lucide="type"></i>Text
                    </div>

                </div>
            </div>
            
            <div class="sidebar-section">
                <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#operations-section">
                    <span>Operations</span>
                    <i data-lucide="chevron-down"></i>
                </div>
                <div class="collapse show" id="operations-section">
                    <div class="sidebar-item" data-operation="Drill" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Drill a hole">
                        <i data-lucide="circle"></i>Drill
                    </div>
                    <div class="sidebar-item" data-operation="Inside" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Pocket inside">
                        <i data-lucide="circle-dot"></i>Inside
                    </div>
                    <div class="sidebar-item" data-operation="Center" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Center a shape">
                        <i data-lucide="circle"></i>Center
                    </div>
                    <div class="sidebar-item" data-operation="Outside" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Pocket outside">
                        <i data-lucide="circle"></i>Outside
                    </div>
                    <div class="sidebar-item" data-operation="Pocket" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Pocket a shape">
                        <i data-lucide="target"></i>Pocket
                    </div>
                    <div class="sidebar-item" data-operation="Vcarve In" data-bs-toggle="tooltip" data-bs-placement="bottom" title="V-Carve In">
                        <i data-lucide="star"></i>V-Carve In
                    </div>
                </div>
            </div>
            
            <div class="sidebar-section">
                <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#svg-paths-section">
                    <span>SVG Paths</span>
                    <i data-lucide="chevron-down"></i>
                </div>
                <div class="collapse" id="svg-paths-section">
                    <!-- SVG paths will be added dynamically -->
                </div>
            </div>
            
            <div class="sidebar-section">
                <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#tool-paths-section">
                    <span>Tool Paths</span>
                    <i data-lucide="chevron-down"></i>
                </div>
                <div class="collapse show" id="tool-paths-section">
                    <!-- Tool paths will be added dynamically -->
                </div>
            </div>
        </div>
    `;

    // Add sidebar event handlers
    sidebar.addEventListener('click', function (e) {
        const item = e.target.closest('.sidebar-item');
        if (!item) return;

        const operation = item.dataset.operation;
        const pathId = item.dataset.pathId;

        if (operation) {
            handleOperationClick(operation);
        } else if (pathId) {
            handlePathClick(pathId);
        }

        // Update selection
        sidebar.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
    });

    // Context menu for paths
    sidebar.addEventListener('contextmenu', function (e) {
        const item = e.target.closest('.sidebar-item');
        if (!item || !item.dataset.pathId) return;

        e.preventDefault();
        showContextMenu(e, item.dataset.pathId);
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {


    initializeLayout();
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
