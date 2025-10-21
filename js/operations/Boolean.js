var AVAILABLE_OPERATIONS = [
    { value: 'Union', label: "Union" },
    { value: 'Intersect', label: "Intersect" },
    { value: 'Subtract', label: "Subtract" }
]

function applyBooleanOperation() {
    const clipper = new ClipperLib.Clipper();
    let operation = document.getElementById("boolean-select").value;
    var inputPaths = [];

    if (selectMgr.selectedPaths().length < 2) {
        notify("Need at least two paths selected");
        return;
    }
    let targetPath = selectMgr.lastSelected().path;

    for (var i = 0; i < svgpaths.length; i++) {
        var path = svgpaths[i].path;
        if (selectMgr.isSelected(svgpaths[i]))
        {
            inputPaths.push(path);
        }
    }


    const solutionPaths = new ClipperLib.Paths();

    if (operation == "Union") {
        clipper.AddPaths(inputPaths, ClipperLib.PolyType.ptSubject, true);
        clipper.Execute(
            ClipperLib.ClipType.ctUnion, // Perform a union operation
            solutionPaths,
            ClipperLib.PolyFillType.pftNonZero,
            ClipperLib.PolyFillType.pftNonZero
        );
    }
    else if (operation == "Intersect") {
        clipper.AddPath(targetPath, ClipperLib.PolyType.ptSubject, true);
        let index = inputPaths.indexOf(targetPath);
        if (index >= 0) inputPaths.splice(index, 1);
        clipper.AddPaths(inputPaths, ClipperLib.PolyType.ptClip, true);
        clipper.Execute(
            ClipperLib.ClipType.ctIntersection, // Perform a intersection operation
            solutionPaths,
            ClipperLib.PolyFillType.pftEvenOdd,
            ClipperLib.PolyFillType.pftEvenOdd
        );
    }
    else if (operation == "Subtract") {
        clipper.AddPath(targetPath, ClipperLib.PolyType.ptSubject, true);
        let index = inputPaths.indexOf(targetPath);
        if (index >= 0) inputPaths.splice(index, 1);
        clipper.AddPaths(inputPaths, ClipperLib.PolyType.ptClip, true);
        clipper.Execute(
            ClipperLib.ClipType.ctDifference, // Perform a intersection operation
            solutionPaths,
            ClipperLib.PolyFillType.pftEvenOdd,
            ClipperLib.PolyFillType.pftEvenOdd
        );
    }

    solutionPaths[0].push(solutionPaths[0][0]);
    addUndo(false, true, false);
    let svgPath = {
        id: operation + svgpathId,
        type: 'path',
        name: operation + ' ' + svgpathId,
        visible: true,
        path: solutionPaths[0],
        bbox: boundingBox(solutionPaths[0]),
        // Store creation properties for editing
        creationTool: 'Boolean',
        creationProperties: {
            operation: operation,
        }
    };
    svgpaths.push(svgPath);
    addSvgPath(svgPath.id, svgPath.name);

    // Auto-select the newly created polygon
    selectMgr.unselectAll();
    selectMgr.selectPath(svgPath);

    svgpathId++;
    redraw();
    console.log("boolean " + operation);
}

class BooleanOpp extends Select {
    constructor() {
        super('Boolean', 'squares-unite');
        this.name = 'Boolean';
        this.icon = 'squares-unite';
        this.tooltip = 'Perform boolean operations (union, intersect, subtract) on selected paths';
    }

    getEditPropertiesHTML(path) {
        return this.getPropertiesHTML(path);
    }

    getPropertiesHTML(path) {
        // Get current values from UI if available, otherwise use properties
        let type = this.properties.type;


        return `

            <div class="mb-3">
                <label for="boolean-select" class="form-label small"><strong>Operation:</strong></label>
                <select class="form-select form-select-sm" id="boolean-select" name="boolean-select">
                    ${AVAILABLE_OPERATIONS.map(s =>
            `<option value="${s.value}" ${type === s.value ? 'selected' : ''}>${s.label}</option>`).join('\n                    ')}
                </select>
            </div>

             <div class="mb-3">
                <button type="button" class="btn btn-primary btn-sm w-100" id="boolean-apply-button" onClick="applyBooleanOperation()">
                    <i data-lucide="check"></i> Apply
                </button>
                <div class="form-text small">Select paths Click Apply to apply operation</div>
        </div>

            ${this.isDrawing ? `
            <div class="alert alert-warning">
                <i data-lucide="mouse"></i>
                Drag to set radius, then release to create polygon
            </div>
            ` : ''}
        `;


    }



    onPropertiesChanged(data) {

        this.properties = { ...this.properties, ...data };
        super.onPropertiesChanged(data);
    }


}