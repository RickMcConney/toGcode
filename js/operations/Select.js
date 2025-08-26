
class Select extends Operation {
    constructor() {
        super('Select', 'fa fa-mouse-pointer');
        this.unselectOnMouseDown = true;
    }


    onMouseUp(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        if (this.selectBox) {
            selectPathsInRect(this.selectBox);
            this.selectBox = null;
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
            if (selectedPath.selected) {
                if(this.unselectOnMouseDown)
                {
                    selectedPath.selected = false;                
                    unselectSidebarNode(selectedPath.id);
                }
            }
            else {
                selectedPath.selected = true;
                selectSidebarNode(selectedPath.id);
            }

        } else if (!evt.shiftKey && this.unselectOnMouseDown) {
            unselectAll();
        }
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
            this.selectPathsInRect(this.selectBox,evt.shiftKey);
            this.selectBox = null;
        }
    }



    draw(ctx) {
        if (this.selectBox) {
            ctx.strokeStyle = 'blue';
            ctx.strokeRect(
                this.selectBox.minx,
                this.selectBox.miny,
                this.selectBox.maxx - this.selectBox.minx,
                this.selectBox.maxy - this.selectBox.miny
            );
        }
    }

}