class Pan extends Operation {
    constructor() {
        super('Pan', 'fa fa-hand-paper-o');
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        const currentPanX = typeof panX !== 'undefined' ? panX : 0;
        const currentPanY = typeof panY !== 'undefined' ? panY : 0;
        const currentZoomLevel = typeof zoomLevel !== 'undefined' ? zoomLevel : 1;

        return `
            <div class="alert alert-info mb-3">
                <i data-lucide="move"></i>
                <strong>Pan & Zoom</strong><br>
                Current view position and zoom level
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <label for="panX" class="form-label">Pan X</label>
                    <input type="number" class="form-control" id="panX" name="panX" value="${currentPanX.toFixed(1)}" step="0.1">
                </div>
                <div class="col-md-6">
                    <label for="panY" class="form-label">Pan Y</label>
                    <input type="number" class="form-control" id="panY" name="panY" value="${currentPanY.toFixed(1)}" step="0.1">
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-12">
                    <label for="zoomLevel" class="form-label">Zoom Level</label>
                    <input type="number" class="form-control" id="zoomLevel" name="zoomLevel" value="${currentZoomLevel.toFixed(2)}" step="0.01" min="0.2" max="50">
                    <div class="form-text">Range: 0.2 to 50</div>
                </div>
            </div>
        `;
    }

    updateFromProperties(data) {
        super.updateFromProperties(data);

        // Update global pan variables when properties change
        if ('panX' in data) {
            if (typeof panX !== 'undefined') {
                panX = parseFloat(data.panX) || 0;
            }
        }
        if ('panY' in data) {
            if (typeof panY !== 'undefined') {
                panY = parseFloat(data.panY) || 0;
            }
        }
        if ('zoomLevel' in data) {
            if (typeof zoomLevel !== 'undefined') {
                const newZoom = parseFloat(data.zoomLevel) || 1;
                // Clamp zoom level to valid range
                zoomLevel = Math.max(0.2, Math.min(50, newZoom));
            }
        }
    }

    onPropertiesChanged(data) {
        // Trigger canvas redraw when pan values change
        redraw();
    }

    // Update properties panel when pan/zoom changes from mouse interaction
    updatePropertiesPanel() {
        const panXInput = document.getElementById('panX');
        const panYInput = document.getElementById('panY');
        const zoomLevelInput = document.getElementById('zoomLevel');

        if (panXInput && typeof panX !== 'undefined') {
            panXInput.value = panX.toFixed(1);
        }
        if (panYInput && typeof panY !== 'undefined') {
            panYInput.value = panY.toFixed(1);
        }
        if (zoomLevelInput && typeof zoomLevel !== 'undefined') {
            zoomLevelInput.value = zoomLevel.toFixed(2);
        }
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
                // Update properties panel with new values
                this.updatePropertiesPanel();
            }
        }
    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
    }

}