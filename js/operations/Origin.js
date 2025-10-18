class Origin extends Operation {
    constructor() {
        super('Origin', null);
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        const currentOriginX = (typeof origin !== 'undefined' && origin.x !== undefined) ? origin.x : 0;
        const currentOriginY = (typeof origin !== 'undefined' && origin.y !== undefined) ? origin.y : 0;

        return `
            <div class="alert alert-info mb-3">
                <i data-lucide="anchor"></i>
                <strong>Origin Position</strong><br>
                Current origin coordinates in internal units
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <label for="originX" class="form-label">Origin X</label>
                    <input type="number" class="form-control" id="originX" name="originX" value="${currentOriginX.toFixed(2)}" step="0.01">
                </div>
                <div class="col-md-6">
                    <label for="originY" class="form-label">Origin Y</label>
                    <input type="number" class="form-control" id="originY" name="originY" value="${currentOriginY.toFixed(2)}" step="0.01">
                </div>
            </div>
        `;
    }

    updateFromProperties(data) {
        super.updateFromProperties(data);

        // Update global origin object when properties change
        if (typeof origin !== 'undefined') {
            if ('originX' in data) {
                origin.x = parseFloat(data.originX) || 0;
            }
            if ('originY' in data) {
                origin.y = parseFloat(data.originY) || 0;
            }
        }
    }

    onPropertiesChanged(data) {
        // Trigger canvas redraw when origin values change
        redraw();
    }

    // Update properties panel when origin changes from mouse interaction
    updatePropertiesPanel() {
        const originXInput = document.getElementById('originX');
        const originYInput = document.getElementById('originY');

        if (originXInput && typeof origin !== 'undefined' && origin.x !== undefined) {
            originXInput.value = origin.x.toFixed(2);
        }
        if (originYInput && typeof origin !== 'undefined' && origin.y !== undefined) {
            originYInput.value = origin.y.toFixed(2);
        }
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

            // Update properties panel with new values
            this.updatePropertiesPanel();
            redraw();
        }
    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
    }



}