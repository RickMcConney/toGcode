
class Select extends Operation {
    static instance;
    static selected = [];

    constructor() {
        super('Select', null);
        this.unselectOnMouseDown = true;
        this.selectionId = 2;
    }

    static getInstance() {
        if (!Select.instance)
            Select.instance = new Select();
        return Select.instance;
    }

    noSelection() {
        return Select.selected.length === 0;
    }

    isSelected(path) {
        if (Select.selected.length === 0) return false;
        let index = Select.selected.indexOf(path);
        return index >= 0;
    }

    selectPath(path) {
        Select.selected.push(path);
        selectSidebarNode(path.id);
        path.highlight = false;
    }

    unselectPath(path) {
        let index = Select.selected.indexOf(path);
        if (index !== -1) {
            Select.selected.splice(index, 1);
        }
        path.highlight = false;
        unselectSidebarNode(path.id);
    }

    unselectAll() {
        if (Select.selected.length > 0) {
            for (let path of Select.selected) {
                unselectSidebarNode(path.id);
                path.highlight = false;
            }
        }
        Select.selected = [];
    }

    firstSelected() {
        if (Select.selected.length > 0)
            return Select.selected[0];
        return null;
    }

    lastSelected() {
        if (Select.selected.length > 0)
            return Select.selected[Select.selected.length - 1];
        return null;
    }

    selectedPaths() {
        return Select.selected;
    }

    selectPathsInRect(selectBox, addToSelection) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;

            for (var j = 0; j < svgpaths[i].path.length; j++) {
                if (!addToSelection)
                    this.unselectPath(svgpaths[i]);
                var pt = svgpaths[i].path[j];
                if (pointInBoundingBox(pt, selectBox)) {
                    this.selectPath(svgpaths[i]);
                }
            }
        }
    }

    toggleSelection(path, evt) {
        if (path) {
            if (this.isSelected(path)) {
                if (this.unselectOnMouseDown) {
                    this.unselectPath(path);
                }
            }
            else {
                this.selectPath(path);
            }

        } else if (!evt.shiftKey && this.unselectOnMouseDown) {
            this.unselectAll();
        }
        this.showSelection();
    }

    onMouseDown(canvas, evt) {
        this.mouseDown = true;
        var mouse = this.normalizeEvent(canvas, evt);
        this.dragStartX = mouse.x;
        this.dragStartY = mouse.y;
        this.initialMousePos = mouse;
        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        this.dragPath = null;


    }

    pointInPath(pt) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;
            var bbox = svgpaths[i].bbox;
            if (pointInBoundingBox(pt, bbox)) {
                return svgpaths[i];
            }
        }
        return null;
    }

    onMouseMove(canvas, evt) {

        var mouse = this.normalizeEvent(canvas, evt);
        if (this.mouseDown) {
            if (Math.abs(this.dragStartX - mouse.x) > 8 || Math.abs(this.dragStartY - mouse.y) > 8) {
                if (!this.selectBox) {
                    if (this.dragPath) {
                        var dx = mouse.x - this.dragStartX;
                        var dy = mouse.y - this.dragStartY;

                        if (evt.shiftKey) {
                            // constrained - use the larger delta
                            if (Math.abs(mouse.x - this.initialMousePos.x) > Math.abs(mouse.y - this.initialMousePos.y)) {
                                dy = 0;
                            } else {
                                dx = 0;
                            }
                        }
                        this.deltaX += dx;
                        this.deltaY += dy;

                        if (this.noSelection())
                            this.translate(this.dragPath, dx, dy);
                        else
                            this.translateSelected(dx, dy);


                        this.dragStartX = mouse.x;
                        this.dragStartY = mouse.y;
                    }
                    else {
                        this.dragPath = closestPath(mouse, false);
                        addUndo(false, true, false);
                    }
                }

                if (!this.dragPath) {
                    var x = evt.offsetX || (evt.pageX - canvas.offsetLeft);
                    var y = evt.offsetY || (evt.pageY - canvas.offsetTop);
                    var dx = x - this.rawdragStartX;
                    var dy = y - this.rawdragStartY;

                    if (Math.abs(dx) < 10 || Math.abs(dy) < 10) return;

                    var sx = Math.min(this.dragStartX, mouse.x);
                    var ex = Math.max(this.dragStartX, mouse.x);
                    var sy = Math.min(this.dragStartY, mouse.y);
                    var ey = Math.max(this.dragStartY, mouse.y);
                    var rl = this.dragStartX < mouse.x;

                    this.selectBox = { minx: sx, miny: sy, maxx: ex, maxy: ey, rl: rl };
                    this.highlightPathsInRect(this.selectBox);
                }
            }
        }
        else {
            closestPath(mouse, true);
        }
    }

    onMouseUp(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = false;

        if (this.dragPath) {
            this.dragPath = null;
            return;
        }

        if (Math.abs(this.dragStartX - mouse.x) < 8 && Math.abs(this.dragStartY - mouse.y) < 8) {
            let path = closestPath(mouse, false);
            this.toggleSelection(path, evt);
        }

        if (this.selectBox) {
            this.selectPathsInRect(this.selectBox, evt.shiftKey);
            this.selectBox = null;
        }
        this.showSelection();
    }

    doOperation() {

        // Check if an operation properties editor is currently shown (operation is active)
        const operationPropertiesEditor = document.getElementById('operation-properties-editor');
        const isOperationActive = operationPropertiesEditor && operationPropertiesEditor.style.display !== 'none';

        if (isOperationActive) {
            generateToolpathForSelection();
        }

    }

    showSelection() {
        const operationsTab = document.getElementById('operations-tab');
        const isOnOperationsTab = operationsTab && operationsTab.classList.contains('active');
        const changePanel = !isOnOperationsTab && window.cncController.operationManager.currentOperation.name !== 'Move' &&
            window.cncController.operationManager.currentOperation.name !== 'Boolean';


        let pathToShow = this.lastSelected();

        if (changePanel) {

            if (pathToShow) {
                if (pathToShow.creationTool == "Shape" || pathToShow.creationTool == "Text")
                    showPathPropertiesEditor(pathToShow);
            }
            else {
                showToolsList();
            }
        }

        if (pathToShow) {
            if (isOnOperationsTab)
                this.doOperation();
        }
        redraw();

    }

    translateSelected(dx, dy) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;
            let path = svgpaths[i];
            if (this.isSelected(path)) {

                path.path = path.path.map(pt => ({
                    x: pt.x + dx,
                    y: pt.y + dy
                }));
                path.bbox = boundingBox(path.path);
            }
        }
        if(this.pivotCenter)
        {
            this.pivotCenter.x += dx;
            this.pivotCenter.y += dy;
        }
    }

    translate(path, dx, dy) {
        path.path = path.path.map(pt => ({
            x: pt.x + dx,
            y: pt.y + dy
        }));
        path.bbox = boundingBox(path.path);
        if(this.pivotCenter)
        {
            this.pivotCenter.x += dx;
            this.pivotCenter.y += dy;
        }      

    }

    draw(ctx) {
        if (this.selectBox) {
            ctx.strokeStyle = selectionBoxColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]); // Dashed line
            let topLeft = worldToScreen(this.selectBox.minx, this.selectBox.miny);
            let bottomRight = worldToScreen(this.selectBox.maxx, this.selectBox.maxy);
            ctx.strokeRect(
                topLeft.x,
                topLeft.y,
                bottomRight.x - topLeft.x,
                bottomRight.y - topLeft.y
            );
            ctx.setLineDash([]);
        }
    }

}