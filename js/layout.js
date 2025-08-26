/**
 * 
 */

var mode = "Select";
var options = [];


var optionData = localStorage.getItem('options');
if (optionData)
    options = JSON.parse(optionData);
else {
    options = [
        { recid: 1, option: 'Grid', value: true, desc: 'Show Grid' },
        { recid: 2, option: 'Origin', value: true, desc: 'Show Origin'},
        { recid: 3, option: 'Inches', value: false, desc: 'Display Inches'},
        { recid: 4, option: 'safeHeight', value: 5, desc: 'Safe Height in mm' },
        { recid: 5, option: 'tolerance', value: 1, desc: 'Tool path tolerance' },
        { recid: 6, option: 'zbacklash', value: 0.1, desc: 'Back lash compensation in mm' }
    ]
}

var config = {
    optionlayout: {
        name: 'optionlayout',
        padding: 4,

        panels: [
            {
                type: 'main',
                resizable: true,
                size: '100%',
                minSize: 300,
                html: '<div id="optionGrid" ></div>'  // Added explicit sizing
            },
            {
                type: 'bottom',
                resizable: true,
                minSize: 50,
                html: '<div id="optionForm"></div>'  // Added explicit sizing
            }
        ]
    },
    optiongrid: {
        name: 'optionGrid',
        columns: [
            { field: 'id', text: 'Id', hidden:true },
            { field: 'option', text: 'Option', size: '33%', sortable: true, searchable: true },
            { field: 'desc', text: 'Description', size: '33%' },
            {
                field: 'value', text: 'Value', size: '33%', sortable: true, resizable: true, style: 'text-align: center',
                editable: { type: 'float', autoFormat: false, style: 'text-align: center' },
                render: function (record, index, col_index) {
                    // Example condition: Hide checkbox if 'name' is 'John Doe'
                    if (typeof record.value === 'boolean') {
                        return '<input type="checkbox" ' + (record.value ? 'checked' : '') + '>';
                    } else {
                        // Return default checkbox HTML or use the built-in w2ui rendering
                        // For default w2ui checkbox, you might need to return specific HTML
                        // or let w2ui handle it if you're only hiding conditionally.
                        // A common approach for custom rendering is to return the HTML directly.
                        return record.value;
                    }
                }
            }
        ],
        records: options || [], // Added fallback for undefined options
        onClick: function (event) {
       
            var records = w2ui.optionGrid.records;
            for (var i in records) {
                if (records[i].recid == event.detail.recid && typeof records[i].value === 'boolean') {
                    records[i].value = !records[i].value;
                    break;
                }
            }
            //var form = w2ui.form;
            //form.refresh();
            w2ui.optionGrid.save();
            redraw(); 
        },
        onChange: function (event) {

            var records = w2ui.optionGrid.records;
            for (var i in records) {
                if (records[i].recid == event.detail.recid) {
                    records[i].value = event.detail.value.new;
                    break;
                }
            }              
            //var form = w2ui.form;
            //form.refresh();
            w2ui.optionGrid.save();
            redraw();
        }
    },
    form: {
        name: 'form',
        style: 'margin-top: -20px;',
        // Added form fields - you need to define what fields you want to show
        actions: {
            Reset: function () {
                this.clear();
            },
            Save: function () {
                var errors = this.validate();
                if (errors.length > 0) return;
                console.log(this.recid + " " + this.record);

                w2ui.optionGrid.save();
                w2popup.close();
                redraw();
                localStorage.setItem('options', JSON.stringify(w2ui.optionGrid.records));
            }
        }
    }
};

function initOptions() {
    // initialization in memory
    $().w2layout(config.optionlayout);
    $().w2grid(config.optiongrid);
    $().w2form(config.form);
}

function showOptions() {
    w2popup.open({
        title: 'Options',
        width: 900,
        height: 600,
        showMax: true,
        body: '<div id="main" style="position: absolute; left: 5px; top: 5px; right: 5px; bottom: 5px;"></div>',
        onOpen: function (event) {
            event.complete.then(() => {
                // Render the layout first
                $('#w2ui-popup #main').w2render('optionlayout');
                $('#optionGrid').w2render('optionGrid');
                $('#optionForm').w2render('form');
                if (w2ui.optionGrid) {
                    // Force the grid container to take full height
                    var mainPanel = w2ui.optionlayout.get('main');
                    var availableHeight = $('#optionGrid').parent().height();
                    if (availableHeight > 0) {
                        $('#optionGrid').height(availableHeight - 2); // Leave small margin
                    }
                }
            });
        },
        onToggle: function (event) {
            event.complete.then(() => {
                if (w2ui.optionlayout) {
                    w2ui.optionlayout.resize();
                }
            });
        }
    });
}


function getOption(name) {
    if (w2ui.optionGrid) {
        var records = w2ui.optionGrid.records;
        for (var i in records) {
            if (records[i].option == name)
                return records[i].value;
        }
    }
    return false;
}


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


function addLayout() {
    var pstyle = 'border: 1px solid #dfdfdf; padding: 5px;';
    $('#layout')
        .w2layout(
            {
                name: 'mylayout',

                panels: [
                    {
                        type: 'top',
                        size: 50,
                        resizable: false,
                        style: pstyle,
                        html: '<div id="w2toolbar" style="padding: 4px; border: 1px solid #dfdfdf; border-radius: 3px"></div>'

                    },
                    {
                        type: 'left',
                        size: 200,
                        resizable: true,
                        style: pstyle,
                        html: '<div id="w2sidebar" style="height: 100%; width: 100%; float: left"></div>'
                    },
                    {
                        type: 'main',
                        size: '100%',
                        style: pstyle + 'border-top: 0px;',
                        html: '<canvas id="canvas" width="2000" height="2000"></canvas>'
                    },
                    {
                        type: 'preview',
                        size: 305,
                        resizable: true,
                        style: pstyle,
                        html: '<div id="w2grid" style="height: 300px; width: 100%px"></div>'
                    }, {
                        type: 'bottom',
                        size: 50,
                        style: pstyle,
                        resizable: false,
                        html: '<div id="status">Tool: </div>'
                    }]
            });
};

function addToolbar() {
    $('#w2toolbar').w2toolbar({
        name: 'toolbar',
        tooltip:'bottom',
        items: [
            {
                type: 'button',
                id: 'New',
                //text : 'New',
                text: 'New',
                tooltip: 'Clear and start a new project',
                icon: 'w2ui-icon-plus'
            },
            {
                type: 'button',
                id: 'Open',
                text: 'Open',
                tooltip: 'Open a project file',
                icon: 'fa fa-file-open-o'
            },
            {
                type: 'button',
                id: 'Save',
                text: 'Save',
                tooltip: 'Save the current project',
                icon: 'fa fa-save'
            },
            {
                type: 'button',
                id: 'Import',
                text: 'Import',
                tooltip: 'Import an SVG file',
                icon: 'fa fa-file-text-o'
            },
            {
                type: 'button',
                id: 'Gcode',
                text: 'Gcode',
                tooltip: 'Generate Gcode file',
                icon: 'fa fa-gear'
            },

            {
                type: 'break',
                id: 'break0'
            }, {
                type: 'button',
                id: 'Undo',
                text: 'Undo',
                tooltip: 'Undo last operation',
                icon: 'fa fa-undo'
            },

            {
                type: 'spacer'
            },
            {
                type: 'button',
                id: 'Options',
                text: 'Options',
                icon: 'fa fa-gear',
                tooltip: 'Options',
            },
            {
                type: 'button',
                id: 'Help',
                text: 'Help',
                icon: 'fa fa-question-circle',
                tooltip: 'Help',

            }

        ],

        onClick: function (event) {

            if (event.target == 'New')
                newProject();
            else if (event.target == 'Open')
                fileOpen.click();
            else if (event.target == 'Save')
                saveProject();
            else if (event.target == 'Import')
                fileInput.click();
            else if (event.target == "Gcode")
                doGcode();
            else if (event.target == "Undo")
                doUndo();
            else if (event.target == "Redo")
                doRedo();
            else if (event.target == "Options")
                showOptions();
            else if (event.target == "Help")
                showHelp();
        }
    });
};

function showHelp()
{
    w2alert( 'Import an SVG file<br>Select a tool<br>Select a Path<br>Perform an Operation<br>Save the gcode<br>&copy; 2025 Rick McConney','Help');
}

function addSidebar() {
    $('#w2sidebar').w2sidebar({
        name: 'sidebar',
        toggleAlign: 'left',
        //flat:true,
        //flatButton:true,

        menu: [
            { id: 'show', text: 'Show', icon: 'fa fa-eye' },
            { id: 'hide', text: 'Hide', icon: 'fa fa-eye-slash' },
            { id: 'delete', text: 'Delete', icon: 'fa fa-trash-o' }
        ],
        nodes: [{
            id: 'Operation',
            text: 'OPERATION',
            icon: 'fa fa-wrench',
            expanded: true,
            group: true,
            nodes: []
            
        },
        {
            id: 'paths',
            text: 'SVG PATHS',
            icon: 'fa fa-circle-o',
            expanded: false,
            group: true,
            nodes: []
        },
        {
            id: 'toolpaths',
            text: 'TOOL PATHS',
            icon: 'fa fa-circle-o',
            expanded: true,
            group: true,
            nodes: []
        }]
    });

    w2ui.sidebar.on('menuClick', function (event) {

        if (event.detail && event.detail.menuItem && event.detail.menuItem.id == 'delete'){
            console.log(event);
            var child = w2ui.sidebar.get(event.target);
            var parent = child.parent;
            doRemoveToolPath(event.target);
            if(parent && parent.nodes.length == 0 && parent.group == false)
                w2ui.sidebar.remove(parent.id);

    }
        else if (event.detail && event.detail.menuItem && event.detail.menuItem.id == 'show')
            setVisibility(event.target, true);
        else if (event.detail && event.detail.menuItem && event.detail.menuItem.id == 'hide')
            setVisibility(event.target, false);
    });
    w2ui.sidebar.on('click', function (event) {

        
        addUndo(target);
        
        var target = event.target;
        if (target == 'Select')
            doSelect(target);
        else if (target == 'Origin')
            doOrigin();
        else if (target == 'Pan')
            doPan();
        else if (target == 'Move')
            doMove();

        else if (target == 'Pen')
            doPen();
        else if (target == 'Text')
            doText();

        else if (target == 'Inside')
            doInside();
        else if (target == 'Center')
            doCenter();
        else if (target == 'Outside')
            doOutside();

        else if (target == 'Pocket')
            doPocket();
        else if (target == 'Vcarve In')
            doVcarveIn();
        else if (target == 'Vcarve Out')
            doVcarveOut();
        else if (target == 'Drill')
            doDrill();
        else
        {
            doSelect(target);
            w2ui.sidebar.toggle(event.target);
        }


    });
};

function addSidebarOperations() {
  
    w2ui.sidebar.insert("Operation", null, { id: 'Inside', text: 'Inside', icon: 'fa fa-stop-circle' });
    w2ui.sidebar.insert("Operation", null, { id: 'Center', text: 'Center', icon: 'fa fa-circle-thin' });
    w2ui.sidebar.insert("Operation", null, { id: 'Outside', text: 'Outside', icon: 'fa fa-circle-o' });
    w2ui.sidebar.insert("Operation", null, { id: 'Pocket', text: 'Pocket', icon: 'fa fa-bullseye' });
    w2ui.sidebar.insert("Operation", null, { id: 'Vcarve In', text: 'VCarve In', icon: 'fa fa-star' });
    //w2ui.sidebar.insert("Operation", null, { id: 'Vcarve Out', text: 'VCarve Out', icon: 'fa fa-star-o' });
    }

var bits = [{
    id: 1,
    text: 'End Mill'
}, {
    id: 2,
    text: 'Drill'
}, {
    id: 3,
    text: 'VBit'
} // todo support ball nose

];

var milling = [
    {
        id: 1,
        text: 'Climb'
    },
    {
        id: 2,
        text: 'Conventional'
    }
];

var tools = [{
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

},
{
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

function freeToolId() {
    var id = 0;
    var inuse = true;
    while (inuse) {
        id++;
        inuse = false;
        for (var i = 0; i < tools.length; i++) {
            if (tools[i].recid == id) {
                inuse = true;
                break;
            }
        }
        if (!inuse)
            return id;
    }
    return tools.length;
}

function toDisplayUnits(value) {
    if (getOption('Inches'))
        return (value / 25.4).toFixed(3) + ' in';
    else
        return value + ' mm';
}

function toFeedUnits(value) {
    if (getOption('Inches'))
        return (value / 25.4).toFixed(3) + ' in/min';
    else
        return value + ' mm/min';
}

var grid;
function addGrid() {
    grid = $('#w2grid').w2grid({
        name: 'grid',
        show: {
            header: false,  // indicates if header is visible
            toolbar: true,  // indicates if toolbar is visible
            footer: false,  // indicates if footer is visible
            columnHeaders: true,   // indicates if columns is visible
            lineNumbers: false,  // indicates if line numbers column is visible
            expandColumn: false,  // indicates if expand column is visible
            selectColumn: false,  // indicates if select column is visible
            emptyRecords: true,   // indicates if empty records are visible
            toolbarReload: false,   // indicates if toolbar reload button is visible
            toolbarColumns: true,   // indicates if toolbar columns button is visible
            toolbarSearch: false,   // indicates if toolbar search controls are visible
            toolbarAdd: false,   // indicates if toolbar add new button is visible
            toolbarEdit: false,   // indicates if toolbar edit button is visible
            toolbarDelete: true,   // indicates if toolbar delete button is visible
            toolbarSave: false,   // indicates if toolbar save button is visible
            selectionBorder: true,   // display border around selection (for selectType = 'cell')
            recordTitles: true,   // indicates if to define titles for records
            skipRecords: false    // indicates if skip records should be visible
        },
        multiSelect: false,
        reorderRows: true,
        reorderColumns: true,
        recordHeight: 32, // Updated default for w2ui 2.0
        onAdd: function (event) {
            w2alert('add');
        },
        onEdit: function (event) {
            w2alert('edit');
        },
        onDelete: function (event) {
            console.log('delete has default behavior');
        },
        onSave: function (event) {
            //w2alert('save');
        },
        columns: [{
            field: 'recid',
            text: 'ID',
            size: '4%',
            sortable: true,
            resizable: true
        },
        {
            field: 'color',
            text: '<i class="fa  fa-eyedropper"></i> Color',
            tooltip: "User defined color of tool path", size: '4%', sortable: true, resizable: false,
            editable: { type: 'color' },
            render: function (record, index, column_index) {
                var html = '<div style="height:24px;padding:0px;background-color: #' + record.color + '"></div>';
                return html;
            }
        },
        {
            field: 'name',
            text: '<i class="fa  fa-tag"></i> Name',
            tooltip: "Tool name",
            size: '12%',
            sortable: true,
            resizable: true,
            editable: {
                type: 'text'
            }
        },
        {
            field: 'bit',
            text: '<i class="fa fa-wrench"></i> Tool',
            tooltip: "Type of tool",
            size: '10%',
            sortable: true,
            resizable: true,
            editable: {
                type: 'combo',
                items: bits,
                filter: false
            }
        },
        {
            field: 'direction',
            text: '<i class="fa fa-retweet"></i> Direction',
            tooltip: "Direction of cut",
            size: '10%',
            sortable: true,
            resizable: true,
            editable: {
                type: 'combo',
                items: milling,
                filter: false
            }
        },
        {
            field: 'diameter',
            text: '<i class="fa fa-ban"></i> Diameter',
            tooltip: "Tool diameter in mm",

            size: '10%',
            sortable: true,
            resizable: true,
            render: 'int',
            editable: {
                type: 'int',
                min: 1,
                max: 25,
                autoFormat: false
            },
            render: function (record, index, column_index) {
                return toDisplayUnits(record.diameter);

            }
        }, {
            field: 'feed',
            text: '<i class="fa fa-arrows-h"></i> X-Y Feed',
            tooltip: "X-Y Feed rate in mm/min",
            size: '10%',
            sortable: true,
            resizable: true,
            render: 'int',
            editable: {
                type: 'int',
                min: 10,
                max: 1000,
                autoFormat: false
            },
            render: function (record, index, column_index) {
                return toFeedUnits(record.feed);

            }
        }, {
            field: 'zfeed',
            text: '<i class="fa fa-arrows-v"></i>  Z Feed',
            tooltip: "Z feed rate in mm/min",
            size: '10%',
            sortable: true,
            resizable: true,
            render: 'int',
            editable: {
                type: 'int',
                min: 10,
                max: 1000,
                autoFormat: false
            },
            render: function (record, index, column_index) {
                return toFeedUnits(record.zfeed);
            }
        }, {
            field: 'angle',
            text: '<i class="fa fa-chevron-down"></i>  Angle',
            tooltip: "Angle of tool 0 for end mills",
            size: '10%',
            sortable: true,
            resizable: true,
            editable: {
                type: 'int',
                min: 0,
                max: 90,
                autoFormat: false
            }
        }, {
            field: 'depth',
            text: '<i class="fa fa-arrow-down"></i> Depth',
            tooltip: "Depth to cut or drill to in mm",
            size: '10%',
            sortable: true,
            resizable: true,
            editable: {
                type: 'int',
                min: 0,
                max: 25,
                autoFormat: false
            },
            render: function (record, index, column_index) {
                return toDisplayUnits(record.depth);

            }
        },
        {
            field: 'step',
            text: '<i class="fa  fa-angle-double-down"></i> Step Down',
            tooltip: "Step down depth in mm",
            size: '10%',
            sortable: true,
            resizable: true,
            editable: {
                type: 'float',
                min: 0.5,
                max: 5,
                autoFormat: false
            },
            render: function (record, index, column_index) {
                return toDisplayUnits(record.step);

            }
        },
        {
            field: 'stepover',
            text: '<i class="fa fa-angle-double-right"></i> Step Over %',
            tooltip: "Step over as a percentage of tool diameter",
            size: '10%',
            sortable: true,
            resizable: true,
            editable: {
                type: 'int',
                min: 5,
                max: 100,
                autoFormat: false
            }
        }],
        toolbar: {
            items: [{
                id: 'add',
                type: 'button',
                text: 'Add Tool',
                icon: 'w2ui-icon-plus'
            }],
            onClick: function (event) {
                if (event.target == 'add') {

                    w2ui.grid.add({
                        recid: freeToolId(),
                        color: currentTool.color,
                        name: currentTool.name + " copy",
                        diameter: currentTool.diameter,
                        direction: currentTool.direction,
                        feed: currentTool.feed,
                        zfeed: currentTool.zfeed,
                        angle: currentTool.angle,
                        bit: currentTool.bit,
                        depth: currentTool.depth,
                        step: currentTool.step,
                        stepover: currentTool.stepover,
                    });
                    tools = grid.records;

                    localStorage.setItem('tools', JSON.stringify(tools));
                }
            }
        },
        records: tools
    });

    grid.on('delete', function (event) {
        event.complete.then(() => {
            tools = grid.records;
            localStorage.setItem('tools', JSON.stringify(tools));
        });
    });



    grid.on('change', function (event) {

        event.complete.then(() => {
            w2ui[event.target].save();
            tools = grid.records;
            localStorage.setItem('tools', JSON.stringify(tools));
            var recid = event.detail.recid;
            for (var i = 0; i < tools.length; i++) {
                if (recid == tools[i].recid) {
                    currentTool = tools[i];
                    toolChanged(currentTool);
                    setMode(null);
                    grid.status(currentTool.name);
                }
            }
        });
    });

    grid.on('save', function (event) {
        console.log(event);

    });

    grid.on('click', function (event) {

        var recid = event.detail.recid;
        for (var i = 0; i < tools.length; i++) {
            if (recid == tools[i].recid) {
                currentTool = tools[i];
                setMode(null);
            }
        }

    });
};

function addOperation(name, icon) {
    var node = {
        id: name,
        text: name,
        icon: icon
    };
    var parent = w2ui.sidebar.get('Operation');
    w2ui.sidebar.insert(parent, null, node);
}

function setIcon(id, icon) {
    var node = w2ui.sidebar.get(id);
    node.icon = icon;
    w2ui.sidebar.refresh();
}

function removeToolPath(id) {
    w2ui.sidebar.remove(id);
}

function clearToolPaths() {
    var paths = w2ui.sidebar.get("toolpaths")
    while (paths.nodes.length > 0) {
        w2ui.sidebar.remove(paths.nodes[0].id); // Remove the first child
      }
    w2ui.sidebar.refresh()
}


function selectSidebarNode(id) {
    setTimeout(function () {
        w2ui.sidebar.select(id);
        w2ui.sidebar.scrollIntoView(id);
    }, 100);

}

function unselectSidebarNode(id) {
    if (id == null)
        w2ui.sidebar.unselect(w2ui.sidebar.selected);
    else
        w2ui.sidebar.unselect(id);
}



function addToolPath(id, name, operation, toolName) {
    var icon = 'fa fa-circle-o';
    if (operation == "Outside") icon = 'fa fa-circle-o';
    else if (operation == "Inside") icon = 'fa fa-stop-circle';
    else if (operation == "Center") icon = 'fa fa-circle-thin';
    else if (operation == "Pocket") icon = 'fa fa-bullseye';
    else if (operation == "VCarve In") icon = 'fa fa-star';
    else if (operation == "VCarve Out") icon = 'fa fa-star-o';
    else if (operation == "Drill") icon = 'fa fa-dot-circle-o';
    var node = {
        id: id,
        text: name,
        icon: icon


    };
    var parent = w2ui.sidebar.get(toolName);
    if (parent)
        w2ui.sidebar.insert(parent, null, node);
    else {
        var tparent = parent = w2ui.sidebar.get("toolpaths");
        var pnode = {
            id: toolName,
            text: toolName,
            icon: 'fa fa-folder-o',
            //group: true,
            nodes:[]
        };
        w2ui.sidebar.insert(tparent, null, pnode);
        parent = w2ui.sidebar.get(toolName);
        w2ui.sidebar.insert(parent, null, node);
        
    }
    w2ui.sidebar.refresh();

}


function removeSvgPath(id) {
    w2ui.sidebar.remove(id);
    w2ui.sidebar.refresh();
}

function clearSvgPaths() {
    var paths = w2ui.sidebar.get("paths")
    while (paths.nodes.length > 0) {
        w2ui.sidebar.remove(paths.nodes[0].id); // Remove the first child
      }
    w2ui.sidebar.refresh();
}

function addSvgPath(id, name) {
    var icon = 'fa fa-shekel';
    if(name.indexOf("Circle") >=0)
        icon = 'fa fa-circle-thin';
    else if (name.indexOf("Rect") >=0)
        icon = 'fa fa-object-ungroup';
    var node = {
        id: id,
        text: name,
        icon: icon

    };
    var parent = w2ui.sidebar.get('paths');
    w2ui.sidebar.insert(parent, null, node);
    w2ui.sidebar.refresh();

}

function notify(msg) {
	w2utils.notify(msg, { timeout: 2000, error: true, where: query('#layout_mylayout_panel_main') });
}

var data = localStorage.getItem('tools');
if (data)
    tools = JSON.parse(data);


initOptions();

var currentTool = tools[0];
var currentFileName = "none";


addLayout();
addToolbar();
addSidebar();
addGrid();
var mode = "Select"; 
function setMode(m)
{
    if(m != null) mode = m;
    $("#status").html("Tool: " + currentTool.name + " [" + mode + "]");
}
