class Origin extends Operation {
    constructor() {
        super('Origin', 'fa fa-anchor');
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;
        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        this.dragOriginX = origin.x;
        this.dragOriginY = origin.y;
        addUndo(false, false, true);

    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        if (this.mouseDown) {
            var x = evt.offsetX || (evt.pageX - canvas.offsetLeft);
            var y = evt.offsetY || (evt.pageY - canvas.offsetTop);
            var dx = x - this.rawdragStartX;
            var dy = y - this.rawdragStartY;
            origin.x = this.dragOriginX + dx / scaleFactor;
            origin.y = this.dragOriginY + dy / scaleFactor;
            redraw();
        }
    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
    }



}