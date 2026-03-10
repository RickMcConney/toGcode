class Drill extends Operation {
    constructor() {
        super('Drill', null);
        this.circleColor = circleColor;
        this.holeThreshold = 15;
        this.hoveredPath = null;
    }

    stop() {
        this.circle = null;
        // Clear any highlights when leaving drill mode
        if (this.hoveredPath) {
            this.hoveredPath.highlight = false;
            this.hoveredPath = null;
        }
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        // Get the currently selected tool's bit type from the properties panel
        var selectedBit = this.getSelectedBitType();

        // Check if click is on or near a circular SVG path
        var nearPath = closestPath(mouse, false);
        if (nearPath) {
            var circleInfo = this.detectCircle(nearPath);
            if (circleInfo) {
                // Helical drilling requires an end mill
                if (selectedBit === 'Drill') {
                    notify('Helical drilling requires an End Mill. Drill bits cannot move laterally.', 'error');
                    return;
                }
                // Select the path briefly to show it was acted on
                selectMgr.unselectAll();
                selectMgr.selectPath(nearPath);
                makeHelicalHole(circleInfo, nearPath.id);
                selectMgr.unselectAll();
                return;
            }
        }

        // No circular path clicked — point peck drill
        // Warn if using an end mill for peck drilling
        if (selectedBit === 'End Mill') {
            if (!this.endMillPeckWarningAcknowledged) {
                this.endMillPeckWarningAcknowledged = true;
                notify('Warning: Peck drilling with an End Mill is not recommended. Click again to proceed.', 'warning');
                return;
            }
        }
        this.endMillPeckWarningAcknowledged = false;

        var pt = closestPoint(mouse);
        if (pt.dist < this.holeThreshold)
            makeHole(pt);
        else
            makeHole(mouse);
    }

    /**
     * Get the bit type of the currently selected tool from the properties panel.
     */
    getSelectedBitType() {
        if (window.toolpathPropertiesManager) {
            try {
                var data = window.toolpathPropertiesManager.collectFormData();
                var tool = window.toolpathPropertiesManager.getToolById(data.toolId);
                if (tool) return tool.bit;
            } catch (e) {}
        }
        if (window.currentTool) return window.currentTool.bit;
        return null;
    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        // Highlight circular SVG paths on hover (like Select does)
        var previousHovered = this.hoveredPath;

        // Clear previous highlight
        if (previousHovered) {
            previousHovered.highlight = false;
        }

        var nearPath = closestPath(mouse, true);
        if (nearPath && this.detectCircle(nearPath)) {
            nearPath.highlight = true;
            this.hoveredPath = nearPath;
            this.circle = null; // Don't show drill cursor when over a circle
        } else {
            this.hoveredPath = null;
            // Show drill cursor when not hovering a circle
            this.circle = { x: mouse.x, y: mouse.y, r: 5 };
        }

        redraw();
    }

    draw(ctx) {
        if(this.circle)
        {
            // Convert world coordinates to screen coordinates for canvas drawing
            const screen = worldToScreen(this.circle.x, this.circle.y);
            ctx.beginPath();
            // Scale radius by zoom level so preview circle size matches zoom
            ctx.arc(screen.x, screen.y, this.circle.r * zoomLevel, 0, 2 * Math.PI);
            ctx.strokeStyle = this.circleColor;
            ctx.lineWidth = 0.2;
            ctx.stroke();
        }
    }

    /**
     * Detect if an svgpath is circular. Returns {cx, cy, radius} in world coords or null.
     */
    detectCircle(svgPath) {
        var path = svgPath.path;
        if (!path || path.length < 8) return null;

        // Calculate centroid
        var cx = 0, cy = 0;
        for (var i = 0; i < path.length; i++) {
            cx += path[i].x;
            cy += path[i].y;
        }
        cx /= path.length;
        cy /= path.length;

        // Calculate average radius and check variance
        var totalR = 0;
        var radii = [];
        for (var i = 0; i < path.length; i++) {
            var dx = path[i].x - cx;
            var dy = path[i].y - cy;
            var r = Math.sqrt(dx * dx + dy * dy);
            radii.push(r);
            totalR += r;
        }
        var avgR = totalR / path.length;
        if (avgR < 1) return null; // Too small

        // Check that all points are within 5% of the average radius
        var maxDeviation = 0;
        for (var i = 0; i < radii.length; i++) {
            var dev = Math.abs(radii[i] - avgR) / avgR;
            if (dev > maxDeviation) maxDeviation = dev;
        }

        if (maxDeviation > 0.05) return null; // Not circular enough

        return { cx: cx, cy: cy, radius: avgR };
    }

}
