class Pan extends Operation {
    constructor() {
        super('Pan', 'fa fa-hand-paper-o');
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;

        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        this.startOffsetX = offsetX;
        this.startOffsetY = offsetY;

    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        if (this.mouseDown) {
            var x = evt.offsetX || (evt.pageX - canvas.offsetLeft);
            var y = evt.offsetY || (evt.pageY - canvas.offsetTop);
            var dx = x - this.rawdragStartX;
            var dy = y - this.rawdragStartY;
            offsetX = this.startOffsetX + dx;
            offsetY = this.startOffsetY + dy;
        }
    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
    }

}