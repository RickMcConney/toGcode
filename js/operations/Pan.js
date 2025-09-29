class Pan extends Operation {
    constructor() {
        super('Pan', 'fa fa-hand-paper-o');
    }

    // Old pan logic for legacy system
    oldOnMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;
        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageX - canvas.offsetLeft);
        this.startOffsetX = offsetX;
        this.startOffsetY = offsetY;
    }
    oldOnMouseMove(canvas, evt) {
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

    // New pan logic for virtual coordinate system
    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;
        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        this.startPanX = typeof panX !== 'undefined' ? panX : 0;
        this.startPanY = typeof panY !== 'undefined' ? panY : 0;
    }
    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        if (this.mouseDown) {
            var x = evt.offsetX || (evt.pageX - canvas.offsetLeft);
            var y = evt.offsetY || (evt.pageY - canvas.offsetTop);
            var dx = x - this.rawdragStartX;
            var dy = y - this.rawdragStartY;
            if (typeof panX !== 'undefined' && typeof panY !== 'undefined') {
                panX = this.startPanX + dx;
                panY = this.startPanY + dy;
            }
        }
    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
    }

}