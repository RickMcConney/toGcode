class Operation {
    constructor(name, icon) {
        this.name = name;
        this.icon = icon;
        this.properties = {};
        this.currentHelpStep = 0;
        this.isInPropertiesMode = false;
    }

    // Lifecycle methods
    start() {
        this.resetHelpSteps();
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
        this.properties = { ...this.properties, ...data };
        this.onPropertiesChanged(data);
    }

    onPropertiesChanged(data) {
        // Override in subclasses to handle property changes
        redraw(); // Trigger redraw by default
    }

    // Help System Interface
    getHelpSteps() {
        return [`Use the ${this.name} tool by clicking and dragging on the canvas.`];
    }

    getCurrentHelpStep() {
        return this.currentHelpStep;
    }

    setHelpStep(stepIndex) {
        const steps = this.getHelpSteps();
        if (stepIndex >= 0 && stepIndex < steps.length) {
            this.currentHelpStep = stepIndex;
            this.updateHelpDisplay();
        }
    }

    nextHelpStep() {
        const steps = this.getHelpSteps();
        if (this.currentHelpStep < steps.length - 1) {
            this.currentHelpStep++;
            this.updateHelpDisplay();
            return true;
        }
        return false;
    }

    resetHelpSteps() {
        this.currentHelpStep = 0;
        this.updateHelpDisplay();
    }

    getHelpText() {
        const steps = this.getHelpSteps();
        if (steps.length > 0 && this.currentHelpStep < steps.length) {
            return steps[this.currentHelpStep];
        }
        return `Use the ${this.name} tool by clicking and dragging on the canvas.`;
    }

    updateHelpDisplay() {
        if (window.stepWiseHelp && window.stepWiseHelp.activeOperation === this.name) {
            window.stepWiseHelp.setStep(this.currentHelpStep);
        }
    }

    // Utility methods available to all operations
    normalizeEvent(target, e) {

        if (!e) { e = self.event; }
        var x = 0;
        var y = 0;
        var rect = canvas.getBoundingClientRect();


        x = (e.clientX - rect.left) / (rect.right - rect.left) * canvas.width;
        y = (e.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height;


        return { x: (x - target.offsetLeft - offsetX) / scaleFactor, y: (y - target.offsetTop - offsetY) / scaleFactor };
    }

        highlightPathsInRect(selectBox) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;

            for (var j = 0; j < svgpaths[i].path.length; j++) {
                svgpaths[i].highlight = false;
                var pt = svgpaths[i].path[j];
                if (pointInBoundingBox(pt, selectBox)) {
                    svgpaths[i].highlight = true;
                    continue;
                }
            }
        }
    }

    selectPathsInRect(selectBox,addToSelection) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;

            for (var j = 0; j < svgpaths[i].path.length; j++) {
                if(!addToSelection)
                    svgpaths[i].selected = false;
                var pt = svgpaths[i].path[j];
                if (pointInBoundingBox(pt, selectBox)) {
                    svgpaths[i].selected = true;
                    continue;
                }
            }
        }
    }
}
