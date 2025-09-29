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
            // Use zoomLevel for new system
            var newX = this.dragOriginX + dx / (typeof zoomLevel !== 'undefined' ? zoomLevel : 1);
            var newY = this.dragOriginY + dy / (typeof zoomLevel !== 'undefined' ? zoomLevel : 1);
            // Clamp origin to workpiece bounds (absolute bounds, not relative to drag start)
            var workpieceWidth = typeof getOption === 'function' ? getOption("workpieceWidth") * (typeof viewScale !== 'undefined' ? viewScale : 1) : 100;
            var workpieceLength = typeof getOption === 'function' ? getOption("workpieceLength") * (typeof viewScale !== 'undefined' ? viewScale : 1) : 100;
            var centerX = typeof Xcenter !== 'undefined' ? Xcenter : 0;
            var centerY = typeof Ycenter !== 'undefined' ? Ycenter : 0;
            var minX = 0;
            var maxX = workpieceWidth;
            var minY = 0;
            var maxY = workpieceLength;
            origin.x = Math.max(minX, Math.min(maxX, newX));
            origin.y = Math.max(minY, Math.min(maxY, newY));

            redraw();
        }
    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
    }



}