var AVAILABLE_OPERATIONS = [
    { value: 'Union', label: "Union" },
    { value: 'Intersect', label: "Intersect" },
    { value: 'Subtract', label: "Subtract" }
]

function applyBooleanOperation() {
    const clipper = new ClipperLib.Clipper();
    let operation = document.getElementById("pm-operation").value;
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
            ClipperLib.ClipType.ctUnion,
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
            ClipperLib.ClipType.ctIntersection,
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
            ClipperLib.ClipType.ctDifference,
            solutionPaths,
            ClipperLib.PolyFillType.pftEvenOdd,
            ClipperLib.PolyFillType.pftEvenOdd
        );
    }

    if (solutionPaths.length === 0 || solutionPaths[0].length === 0) return;
    solutionPaths[0].push(solutionPaths[0][0]);
    let selectedIds = selectMgr.selectedPaths().map(p => p.id);
    addUndo(false, true, false, selectedIds);
    let svgPath = {
        id: operation + svgpathId,
        type: 'path',
        name: operation + ' ' + svgpathId,
        visible: true,
        path: solutionPaths[0],
        bbox: boundingBox(solutionPaths[0]),
        creationTool: 'Boolean',
        creationProperties: { operation: operation }
    };
    for (var i = 0; i < svgpaths.length; i++) {
        if (selectMgr.isSelected(svgpaths[i])) {
            setVisibility(svgpaths[i].id, false);
        }
    }

    svgpaths.push(svgPath);
    addSvgPath(svgPath.id, svgPath.name);

    selectMgr.unselectAll();
    selectMgr.selectPath(svgPath);

    svgpathId++;
    redraw();
}

class BooleanOpp extends Select {
    constructor() {
        super('Boolean', 'squares-unite');
        this.name = 'Boolean';
        this.icon = 'squares-unite';
        this.tooltip = 'Perform boolean operations (union, intersect, subtract) on selected paths';

        this.operationField = {
            key: 'operation',
            label: 'Operation',
            type: 'choice',
            default: 'Union',
            options: AVAILABLE_OPERATIONS
        };
    }

    getPropertiesHTML(path) {
        const pathProperties = this.currentPath?.creationProperties ?? null;
        return `
            <div class="alert alert-info mb-3">
                <strong>Boolean Tool</strong><br>
                Perform boolean operations on selected paths
            </div>
            ${PropertiesManager.fieldHTML(this.operationField,
                PropertiesManager.resolveValue(this.operationField, pathProperties, this.properties))}
            <div class="mb-3">
                <button type="button" class="btn btn-primary btn-sm w-100" id="boolean-apply-button" onClick="applyBooleanOperation()">
                    <i data-lucide="check"></i> Apply
                </button>
                <div class="form-text small">Select paths then click Apply to apply operation</div>
            </div>`;
    }

    onPropertiesChanged(data) {
        const values = PropertiesManager.collectValues([this.operationField]);
        this.properties = { ...this.properties, ...values };
        super.onPropertiesChanged(data);
    }
}
