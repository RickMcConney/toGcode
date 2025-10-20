
class Select extends Operation {
    static instance;
    static selected = [];

    constructor() {
        super('Select', null);
        this.unselectOnMouseDown = true;
        this.selectionId = 2;
    }

    static getInstance(){
        if(!Select.instance)
            Select.instance = new Select();
        return Select.instance;
    }

    noSelection()
    {
        return Select.selected.length === 0;
    }

    isSelected(path)
    {
        if(Select.selected.length === 0) return false;
        let index = Select.selected.indexOf(path);
        return index >= 0;
    }

    selectPath(path)
    {
        Select.selected.push(path);
        selectSidebarNode(path.id);
        path.highlight = false;
    }

    unselectPath(path)
    {
        let index = Select.selected.indexOf(path);
        if (index !== -1) { 
            Select.selected.splice(index, 1); 
        }
        path.highlight = false;
        unselectSidebarNode(path.id);    
    }

    unselectAll()
    {
        if(Select.selected.length > 0)
        {
            for(let path of Select.selected)
            {
                unselectSidebarNode(path.id);
                path.highlight = false;
            }
        }
        Select.selected = [];
    }

    firstSelected()
    {
        if(Select.selected.length > 0)
            return Select.selected[0];
        return null;
    }

    lastSelected()
    {
        if(Select.selected.length > 0)
            return Select.selected[Select.selected.length-1];
        return null;
    }

    selectedPaths()
    {
        return Select.selected;
    }

    selectPathsInRect(selectBox,addToSelection) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;

            for (var j = 0; j < svgpaths[i].path.length; j++) {
                if(!addToSelection)
                    this.unselectPath(svgpaths[i]);
                var pt = svgpaths[i].path[j];
                if (pointInBoundingBox(pt, selectBox)) {
                    this.selectPath(svgpaths[i]);
                }
            }
        }
    }

    onMouseDown(canvas, evt) {
        this.mouseDown = true;
        var mouse = this.normalizeEvent(canvas, evt);
        this.dragStartX = mouse.x;
        this.dragStartY = mouse.y;
        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        var selectedPath = closestPath(mouse, false);
        if (selectedPath) {
            if (this.isSelected(selectedPath)) {
                if (this.unselectOnMouseDown) {
                    this.unselectPath(selectedPath);
                }
            }
            else {
                this.selectPath(selectedPath);
            }

        } else if (!evt.shiftKey && this.unselectOnMouseDown) {
            this.unselectAll();
        }
        this.showSelection();
    }

    onMouseMove(canvas, evt, inHandle) {

        var mouse = this.normalizeEvent(canvas, evt);

        if (this.mouseDown && !inHandle) {
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
        else {
            closestPath(mouse, true);
        }
    }

    onMouseUp(canvas, evt) {
        this.mouseDown = false;
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

            if (pathToShow){
                if (pathToShow.creationTool == "Shape" || pathToShow.creationTool == "Text") 
                    showPathPropertiesEditor(pathToShow);
            }
            else {
                showToolsList();
            }
        }

        if (pathToShow)
        {
            if (isOnOperationsTab)
                this.doOperation();
        }
        redraw();

    }

    draw(ctx) {
        if (this.selectBox) {
            ctx.strokeStyle = selectionBoxColor;
            let topLeft = worldToScreen(this.selectBox.minx, this.selectBox.miny);
            let bottomRight = worldToScreen(this.selectBox.maxx, this.selectBox.maxy);
            ctx.strokeRect(
                topLeft.x,
                topLeft.y,
                bottomRight.x - topLeft.x,
                bottomRight.y - topLeft.y
            );
        }
    }

}