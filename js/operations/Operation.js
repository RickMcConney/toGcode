class Operation {
    constructor(name, icon=null, tooltip='') {
        this.name = name;
        this.icon = icon;
        this.tooltip = tooltip;
        this.properties = {};
        this.isInPropertiesMode = false;
    }

    // Lifecycle methods
    start() {
        if (window.stepWiseHelp) {
            window.stepWiseHelp.setActiveOperation(this.name);
        }
    }

    stop() {
        if (window.stepWiseHelp) {
            window.stepWiseHelp.clearActiveOperation();
        }
    }

    // Mouse event handlers
    onMouseDown(evt) { }
    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        var path = closestPath(mouse,true);
    }
    onMouseUp(evt) { }
    onMouseWheel(evt) { }
    onClick(evt) { }

    // Drawing
    draw(ctx) { }

    // Optional helper methods
    isActive() {
        return false;
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        return '<p class="text-muted">No properties available for this tool.</p>';
    }

    updateFromProperties(data) {
        
        this.onPropertiesChanged(data);
        this.properties = { ...this.properties, ...data };
    }

    onPropertiesChanged(data) {
        // Override in subclasses to handle property changes
        redraw(); // Trigger redraw by default
    }

    // Return raw world coordinates without snap (for drag delta calculations)
    normalizeEventRaw(target, e) {
        var rect = target.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        if (typeof screenToWorld === 'function') {
            return screenToWorld(x, y);
        }
        return { x, y };
    }

    // Snap-to-grid functionality
    snapToGrid(x, y) {
        // Only snap if snap is enabled
        if (typeof getOption === 'function' && getOption("snapGrid") === false) {
            return { x, y };
        }

        // Get grid size (default 10mm)
        const gridSize = (typeof getOption === 'function' && getOption("gridSize")) || 10;

        // Calculate snap interval: 1/10 of grid size in world coordinates
        // gridSize is in mm, viewScale converts to world units
        const snapInterval = (gridSize * viewScale) / 10;

        // Round to nearest snap interval
        return {
            x: Math.round(x / snapInterval) * snapInterval,
            y: Math.round(y / snapInterval) * snapInterval
        };
    }

    oldNormalizeEvent(target, e) {
        if (!e) { e = self.event; }
        var x = 0;
        var y = 0;
        var rect = canvas.getBoundingClientRect();
        x = (e.clientX - rect.left) / (rect.right - rect.left) * canvas.width;
        y = (e.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height;
        return { x: (x - target.offsetLeft - offsetX) / scaleFactor, y: (y - target.offsetTop - offsetY) / scaleFactor };
    }

    normalizeEvent(target, e) {
        if (!e) { e = self.event; }
        var x = 0;
        var y = 0;
        var rect = canvas.getBoundingClientRect();
        x = (e.clientX - rect.left) / (rect.right - rect.left) * canvas.width;
        y = (e.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height;

        // Convert screen to world coordinates
        var worldCoords;
        if (typeof worldToScreen === 'function' && typeof screenToWorld === 'function') {
            // x,y are already in canvas coordinate space (getBoundingClientRect accounts for all nesting)
            worldCoords = screenToWorld(x, y);
        } else {
            // fallback to old method if mapping not available
            worldCoords = {
                x: (x - offsetX) / scaleFactor,
                y: (y - offsetY) / scaleFactor
            };
        }

        // Apply snap-to-grid
        return this.snapToGrid(worldCoords.x, worldCoords.y);
    }

        highlightPathsInRect(selectBox) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;

            for (var j = 0; j < svgpaths[i].path.length; j++) {
                svgpaths[i].highlight = false;
                var pt = svgpaths[i].path[j];
                if (pointInBoundingBox(pt, selectBox)) {
                    svgpaths[i].highlight = true;
                    break;
                }
            }
        }
    }


}
