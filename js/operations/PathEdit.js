class PathEdit extends Select {
    constructor() {
        super();
        this.name = 'Edit Points';
        this.icon = 'fa fa-edit';
        this.unselectOnMouseDown = false; // Don't auto-deselect when clicking
        this.handleSize = 8; // Size of point handles (in pixels)
        this.activeHandle = null;
        this.selectedPath = null;
        this.originalPath = null;

        // Add/Delete point functionality
        this.insertPreviewPoint = null; // {x, y, segmentIndex} for preview when Alt is held
        this.hoveredHandle = null; // Track which handle is hovered for delete feedback

        // Define keydown handler (will be added/removed in start/stop)
        this.keydownHandler = (evt) => {
            // Don't handle keyboard shortcuts if user is typing in an input field
            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.tagName === 'SELECT'
            )) {
                return; // Let the input handle the key press
            }

            if (evt.key === 'Delete' || evt.key === 'Backspace') {
                evt.preventDefault(); // Prevent default browser behavior
                this.deleteHoveredPoint();
            }
        };
    }

    start() {
        super.start();
        this.activeHandle = null;
        this.selectedPath = null;
        this.originalPath = null;

        // Check if there's already a selected path
        const selected = svgpaths.find(path => path.selected);
        if (selected) {
            this.selectedPath = selected;
        }

        // Add keydown listener when tool becomes active
        document.addEventListener('keydown', this.keydownHandler);
    }

    stop() {
        super.stop();
        this.activeHandle = null;
        this.selectedPath = null;
        this.originalPath = null;
        this.insertPreviewPoint = null;
        this.hoveredHandle = null;

        // Clean up keydown listener
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;

        // Check if Alt key is held for adding a point
        if (evt.altKey && this.selectedPath && this.insertPreviewPoint) {
            // Add a new point at the preview location
            addUndo(false, true, false);

            const insertIndex = this.insertPreviewPoint.segmentIndex + 1;
            this.selectedPath.path.splice(insertIndex, 0, {
                x: this.insertPreviewPoint.x,
                y: this.insertPreviewPoint.y
            });

            // Recalculate bounding box
            this.selectedPath.bbox = boundingBox(this.selectedPath.path);

            // Clear preview
            this.insertPreviewPoint = null;

            redraw();
            return;
        }

        // First check if we're clicking on a point handle
        if (this.selectedPath) {
            this.activeHandle = this.getHandleAtPoint(mouse);

            if (this.activeHandle !== null) {
                // Store original path for undo
                if (!this.originalPath) {
                    addUndo(false, true, false);
                    this.originalPath = this.selectedPath.path.map(pt => ({ x: pt.x, y: pt.y }));
                }
                return;
            }
        }

        // If not clicking on a handle, check for path selection
        var clickedPath = closestPath(mouse, false);
        if (clickedPath) {
            // Deselect all other paths
            svgpaths.forEach(path => {path.selected = 0; path.highlight = false; });

            // Select the clicked path
            clickedPath.selected = 2;
            this.selectedPath = clickedPath;
            this.originalPath = null;

            redraw();
        } else {
            // Clicked on empty space - deselect all
            svgpaths.forEach(path => {path.selected = 0; path.highlight = false; });
            this.selectedPath = null;
            this.originalPath = null;
            redraw();
        }
    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        // Update selected path reference
        this.selectedPath = svgpaths.find(path => path.selected);

        if (this.mouseDown && this.activeHandle !== null && this.selectedPath) {
            // Update the point position
            this.selectedPath.path[this.activeHandle].x = mouse.x;
            this.selectedPath.path[this.activeHandle].y = mouse.y;

            // Recalculate bounding box
            this.selectedPath.bbox = boundingBox(this.selectedPath.path);

            redraw();
        } else if (!this.mouseDown && this.selectedPath) {
            // Check if hovering over a handle for cursor feedback
            const hoverHandle = this.getHandleAtPoint(mouse);
            this.hoveredHandle = hoverHandle;

            // Check if Alt key is held for adding points
            if (evt.altKey) {
                // Find closest segment for insertion preview
                const segment = this.findClosestSegment(mouse);
                if (segment && hoverHandle === null) {
                    // Show preview for adding a point
                    this.insertPreviewPoint = {
                        x: segment.point.x,
                        y: segment.point.y,
                        segmentIndex: segment.segmentIndex
                    };
                    canvas.style.cursor = 'copy';
                } else {
                    this.insertPreviewPoint = null;
                    canvas.style.cursor = hoverHandle !== null ? 'pointer' : 'default';
                }
            } else {
                // Not holding Alt - clear preview
                this.insertPreviewPoint = null;

                if (hoverHandle !== null) {
                    canvas.style.cursor = 'pointer';
                } else {
                    canvas.style.cursor = 'default';
                }
            }

            redraw();
        }
        else {
            closestPath(mouse, true);
        }
    }

    onMouseUp(canvas, evt) {
        this.mouseDown = false;

        if (this.activeHandle !== null) {
            // Finished dragging a point
            this.activeHandle = null;
            // Don't reset originalPath - keep it so we don't create multiple undos
            // for the same path editing session
            redraw();
        }
    }

    draw(ctx) {
        super.draw(ctx);

        // Update selectedPath reference from svgpaths array
        this.selectedPath = svgpaths.find(path => path.selected);

        // Draw point handles for selected path
        if (this.selectedPath && this.selectedPath.visible) {
            const path = this.selectedPath.path;

            ctx.save();
            for (let i = 0; i < path.length; i++) {
                const pt = path[i];
                const screenPt = worldToScreen(pt.x, pt.y);

                // Draw handle
                ctx.beginPath();
                ctx.arc(screenPt.x, screenPt.y, this.handleSize, 0, Math.PI * 2);

                // Color based on state
                if (this.activeHandle === i) {
                    // Red for actively dragging
                    ctx.fillStyle = handleActiveColor;
                    ctx.strokeStyle = handleActiveStroke;
                } else if (this.hoveredHandle === i) {
                    // Yellow highlight for hovered (deletable)
                    ctx.fillStyle = handleHoverColor;
                    ctx.strokeStyle = handleHoverStroke;
                } else {
                    // Blue for normal
                    ctx.fillStyle = handleNormalColor;
                    ctx.strokeStyle = handleNormalStroke;
                }

                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();

            // Draw preview point when Alt is held
            if (this.insertPreviewPoint) {
                const screenPt = worldToScreen(this.insertPreviewPoint.x, this.insertPreviewPoint.y);

                ctx.save();
                ctx.beginPath();
                ctx.arc(screenPt.x, screenPt.y, this.handleSize, 0, Math.PI * 2);

                // Green semi-transparent for preview
                ctx.fillStyle = insertPreviewColor;
                ctx.strokeStyle = insertPreviewStroke;
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();

                // Add a small cross in the center
                ctx.beginPath();
                ctx.moveTo(screenPt.x - 3, screenPt.y);
                ctx.lineTo(screenPt.x + 3, screenPt.y);
                ctx.moveTo(screenPt.x, screenPt.y - 3);
                ctx.lineTo(screenPt.x, screenPt.y + 3);
                ctx.strokeStyle = insertPreviewStroke;
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.restore();
            }
        }
    }

    getHandleAtPoint(point) {
        // Always get the current selected path from svgpaths
        this.selectedPath = svgpaths.find(path => path.selected);

        if (!this.selectedPath) return null;

        const path = this.selectedPath.path;
        let closestHandle = null;
        let closestDistance = this.handleSize * 2;

        // Find the closest handle within the threshold distance
        for (let i = 0; i < path.length; i++) {
            const pt = path[i];
            const dx = pt.x - point.x;
            const dy = pt.y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= closestDistance) {
                closestDistance = distance;
                closestHandle = i;
            }
        }

        return closestHandle;
    }

    // Helper function: Calculate closest point on a line segment to a given point
    closestPointOnSegment(point, segStart, segEnd) {
        const dx = segEnd.x - segStart.x;
        const dy = segEnd.y - segStart.y;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared === 0) {
            // Segment is a point
            return { x: segStart.x, y: segStart.y };
        }

        // Calculate parameter t that represents position along the segment
        let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]

        // Calculate the closest point
        return {
            x: segStart.x + t * dx,
            y: segStart.y + t * dy
        };
    }

    // Helper function: Find the closest segment to the mouse cursor
    findClosestSegment(point) {
        if (!this.selectedPath) return null;

        const path = this.selectedPath.path;
        if (path.length < 2) return null;

        let closestSegmentIndex = -1;
        let closestPoint = null;
        let minDistance = Infinity;

        // Check each line segment
        const segmentCount = this.selectedPath.closed ? path.length : path.length - 1;

        for (let i = 0; i < segmentCount; i++) {
            const segStart = path[i];
            const segEnd = path[(i + 1) % path.length];

            const closestPt = this.closestPointOnSegment(point, segStart, segEnd);
            const dx = point.x - closestPt.x;
            const dy = point.y - closestPt.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;
                closestSegmentIndex = i;
                closestPoint = closestPt;
            }
        }

        // Only return if within reasonable distance
        if (minDistance < this.handleSize * 3) {
            return {
                segmentIndex: closestSegmentIndex,
                point: closestPoint,
                distance: minDistance
            };
        }

        return null;
    }

    // Delete the currently hovered point
    deleteHoveredPoint() {
        if (!this.selectedPath || this.hoveredHandle === null) return;

        const path = this.selectedPath.path;
        const minPoints = this.selectedPath.closed ? 3 : 2;

        // Check if we have enough points to delete one
        if (path.length <= minPoints) {
            console.log(`Cannot delete point: minimum ${minPoints} points required for ${this.selectedPath.closed ? 'closed' : 'open'} path`);
            return;
        }

        // Add undo before deletion
        addUndo(false, true, false);

        // Remove the point
        path.splice(this.hoveredHandle, 1);

        // Recalculate bounding box
        this.selectedPath.bbox = boundingBox(path);

        // Clear hovered handle
        this.hoveredHandle = null;

        redraw();
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        // Update selected path reference
        this.selectedPath = svgpaths.find(path => path.selected);

        if (!this.selectedPath) {
            return `
                <div class="alert alert-info mb-3">
                    <i data-lucide="info"></i>
                    <strong>Edit Points Tool</strong><br>
                    Select a path to edit its points.
                </div>
            `;
        }

        const pointCount = this.selectedPath.path.length;
        const minPoints = this.selectedPath.closed ? 3 : 2;
        return `
            <div class="alert alert-info mb-3">
                <i data-lucide="edit"></i>
                <strong>Editing Path Points</strong><br>
                Path: ${this.selectedPath.name}<br>
                Points: ${pointCount}
            </div>
            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Edit Points:</strong><br>
                    • <strong>Drag</strong> handles to move points<br>
                    • <strong>Alt+Click</strong> on a line segment to add a point<br>
                    • <strong>Hover + Delete</strong> key to remove a point (min ${minPoints} points)<br>
                    • Click on a different path to edit it
                </small>
            </div>
        `;
    }
}
