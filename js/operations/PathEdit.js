// Constants
const SMOOTHING_FACTOR = 0.5;
const MIN_SEGMENT_LENGTH = 0.001;
const MIN_ANGLE_THRESHOLD = 0.01;
const MAX_TANGENT_RATIO = 0.99;
const ARC_POINTS_PER_RADIAN = 3;

class PathEdit extends Select {
    constructor() {
        super('Edit','edit');
        this.name = 'Edit';
        this.icon = 'edit';
        this.tooltip = 'Edit individual points of a path (move, add, delete)';
 

        this.unselectOnMouseDown = false; // Don't auto-deselect when clicking
        this.handleSize = 8; // Size of point handles (in pixels)
        this.activeHandle = null;
        this._selectedPath = null;
        this.originalPath = null;

        // Add/Delete point functionality
        this.insertPreviewPoint = null; // {x, y, segmentIndex} for preview when Alt is held
        this.hoveredHandle = null; // Track which handle is hovered for delete feedback
        this.selectedHandlesForRadius = []; // Array of handle indices selected for radius application
        this.handleWasDragged = false; // Track if handle was dragged vs clicked
        this.originalPathBeforeRadius = null; // Store original path before radius operations for re-application
        this.syncFirstLast = false; // Track if first/last points should be synchronized
        this.lastRadiusValue = '5'; // Store last entered radius value
        this.lastInvertValue = false; // Store last invert checkbox state

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

    // Getter for selectedPath - centralizes selectMgr access
    get selectedPath() {
        return selectMgr.lastSelected();
    }

    // Setter for selectedPath - kept for compatibility but value is ignored
    // Selection is managed through selectMgr
    set selectedPath(value) {
        // No-op: selection is managed through selectMgr
    }

    // Helper to update properties panel and refresh icons
    updatePropertiesPanel() {
        const form = document.getElementById('tool-properties-form');
        if (form) {
            form.innerHTML = this.getPropertiesHTML();
            this.wireRadiusControls();
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    start() {
        super.start();
        this.activeHandle = null;
        this.originalPath = null;
        this.selectedHandlesForRadius = [];
        this.originalPathBeforeRadius = null;

        // Add keydown listener when tool becomes active
        document.addEventListener('keydown', this.keydownHandler);
    }

    stop() {
        super.stop();
        this.activeHandle = null;
        this.originalPath = null;
        this.insertPreviewPoint = null;
        this.hoveredHandle = null;
        this.selectedHandlesForRadius = [];
        this.originalPathBeforeRadius = null;
        this.syncFirstLast = false;

        // Clean up keydown listener
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }
    }

    onMouseDown(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);
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
                // Track that we haven't dragged yet
                this.handleWasDragged = false;

                // Check if this is a closed path with duplicate endpoints
                const path = this.selectedPath.path;
                const n = path.length;
                this.syncFirstLast = false;

                if (this.selectedPath.closed && n > 1) {
                    // Check if first and last points are the same
                    const firstLast = (path[0].x === path[n-1].x && path[0].y === path[n-1].y);
                    // Only sync if we're dragging the first or last point
                    if (firstLast && (this.activeHandle === 0 || this.activeHandle === n-1)) {
                        this.syncFirstLast = true;
                    }
                }

                // Store original path for undo (in case of drag)
                if (!this.originalPath) {
                    addUndo(false, true, false);
                    this.originalPath = this.selectedPath.path.map(pt => ({ x: pt.x, y: pt.y }));
                }
                return;
            }
        }

        // If not clicking on a handle, check for path selection
        const clickedPath = closestPath(mouse, false);
        if (clickedPath) {
            // Deselect all other paths
            selectMgr.unselectAll();

            // Select the clicked path
            selectMgr.selectPath(clickedPath);
            this.originalPath = null;
            this.selectedHandlesForRadius = []; // Clear radius selection on path change
            this.originalPathBeforeRadius = null; // Clear saved original on path change

            this.updatePropertiesPanel();
            redraw();
        } else {
            // Clicked on empty space - deselect all
            selectMgr.unselectAll();
            this.originalPath = null;
            this.selectedHandlesForRadius = [];

            this.updatePropertiesPanel();
            redraw();
        }
    }

    onMouseMove(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);
        const selectedPath = this.selectedPath;

        if (this.mouseDown && this.activeHandle !== null && selectedPath) {
            // Mark that we dragged the handle
            this.handleWasDragged = true;

            // Update the point position
            selectedPath.path[this.activeHandle].x = mouse.x;
            selectedPath.path[this.activeHandle].y = mouse.y;

            // For closed paths with duplicate endpoints, synchronize first/last points
            if (this.syncFirstLast) {
                const path = selectedPath.path;
                const n = path.length;

                // If dragging first point, also update last point
                if (this.activeHandle === 0) {
                    path[n-1].x = mouse.x;
                    path[n-1].y = mouse.y;
                }
                // If dragging last point, also update first point
                else if (this.activeHandle === n-1) {
                    path[0].x = mouse.x;
                    path[0].y = mouse.y;
                }
            }

            // Recalculate bounding box
            selectedPath.bbox = boundingBox(selectedPath.path);

            redraw();
        } else if (!this.mouseDown && selectedPath) {
            // Check if hovering over a handle for cursor feedback
            const hoverHandle = this.getHandleAtPoint(mouse);
            const oldHover = this.hoveredHandle;
            const oldPreview = this.insertPreviewPoint;
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

            // Only redraw if hover state changed
            if (oldHover !== this.hoveredHandle || oldPreview !== this.insertPreviewPoint) {
                redraw();
            }
        }
        else {
            closestPath(mouse, true);
        }
    }

    onMouseUp(canvas, evt) {
        this.mouseDown = false;

        if (this.activeHandle !== null) {
            // Check if this was a click (no drag) to toggle radius selection
            if (!this.handleWasDragged) {
                // Toggle this handle in the selection
                const index = this.selectedHandlesForRadius.indexOf(this.activeHandle);
                if (index > -1) {
                    // Already selected, remove it
                    this.selectedHandlesForRadius.splice(index, 1);
                } else {
                    // Not selected, add it
                    this.selectedHandlesForRadius.push(this.activeHandle);
                }

                this.updatePropertiesPanel();
            }

            // Finished with handle
            this.activeHandle = null;
            this.syncFirstLast = false;
            // Don't reset originalPath - keep it so we don't create multiple undos
            // for the same path editing session
            redraw();
        }
    }

    draw(ctx) {
        super.draw(ctx);

        const selectedPath = this.selectedPath;

        // Draw point handles for selected path
        if (selectedPath && selectedPath.visible) {
            const path = selectedPath.path;
            // Use Set for O(1) lookup instead of O(n) includes()
            const selectedSet = new Set(this.selectedHandlesForRadius);

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
                } else if (selectedSet.has(i)) {
                    // Purple for selected for radius application
                    ctx.fillStyle = '#9333ea';
                    ctx.strokeStyle = '#6b21a8';
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
        const selectedPath = this.selectedPath;
        if (!selectedPath) return null;

        const path = selectedPath.path;
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
        const selectedPath = this.selectedPath;
        const hasSelection = !!selectedPath;
        const pointCount = hasSelection ? selectedPath.path.length : 0;
        const minPoints = hasSelection ? (selectedPath.closed ? 3 : 2) : 2;
        const selectedCount = this.selectedHandlesForRadius.length;
        const hasSelectedHandles = selectedCount > 0;

        let selectionMessage = '';
        if (selectedCount === 0) {
            selectionMessage = 'No points selected for radius';
        } else if (selectedCount === 1) {
            selectionMessage = `Point ${this.selectedHandlesForRadius[0] + 1} selected`;
        } else {
            selectionMessage = `${selectedCount} points selected`;
        }

        return `
            <div class="alert alert-info mb-3">
                <strong>${hasSelection ? 'Editing Path Points' : 'Edit Points Tool'}</strong><br>
                ${hasSelection ? `Path: ${selectedPath.name}<br>Points: ${pointCount}` : 'Select a path to edit its points.'}
                ${hasSelection ? `<br><span class="badge" style="background-color: ${hasSelectedHandles ? '#9333ea' : '#6c757d'};">${selectionMessage}</span>` : ''}
            </div>

            <button type="button" class="btn btn-primary btn-sm w-100 mb-3" id="applySmoothBtn" ${!hasSelection ? 'disabled' : ''}>
                <i data-lucide="sparkles"></i> Apply Smoothing
            </button>
            <small class="form-text text-muted text-center d-block mb-3">Click repeatedly for more smoothing (no new points added)</small>

            <div class="card mb-3">
                <div class="card-body">
                    <h6 class="card-title">Add Radius Corner</h6>

                    <div class="mb-2">
                        <label for="radiusInput" class="form-label">Radius</label>
                        <input type="text" class="form-control form-control-sm" id="radiusInput"
                               value="${this.lastRadiusValue}" placeholder="5mm or 1/4in" ${!hasSelection ? 'disabled' : ''}>
                    </div>

                    <div class="form-check mb-3">
                        <input class="form-check-input" type="checkbox" id="invertRadiusCheck" ${this.lastInvertValue ? 'checked' : ''} ${!hasSelection ? 'disabled' : ''}>
                        <label class="form-check-label" for="invertRadiusCheck">
                            Invert (cut into shape)
                        </label>
                    </div>

                    <button type="button" class="btn btn-success btn-sm w-100" id="applyRadiusBtn" ${!hasSelection ? 'disabled' : ''}>
                        <i data-lucide="circle-dot"></i> Apply Radius
                    </button>
                    <small class="form-text text-muted text-center d-block mt-2">
                        ${hasSelectedHandles ? `Will apply to ${selectedCount === 1 ? '1 point' : selectedCount + ' points'}` : 'Click points to select, or click Apply to radius all points'}
                    </small>
                </div>
            </div>

            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Edit Points:</strong><br>
                    • <strong>Click</strong> a point to select for radius (purple)<br>
                    • <strong>Drag</strong> handles to move points<br>
                    • <strong>Alt+Click</strong> on a line segment to add a point<br>
                    • <strong>Hover + Delete</strong> key to remove a point (min ${minPoints} points)<br>
                    • Click on a different path to edit it
                </small>
            </div>
        `;
    }

    onPropertiesChanged(data) {
        // PathEdit doesn't need to handle property changes
        // Button event handlers are wired up in bootstrap-layout.js
    }

    applySmoothingToPath() {
        const selectedPath = this.selectedPath;

        if (!selectedPath || !selectedPath.path) {
            console.log('No path selected for smoothing');
            return;
        }

        // Add undo before smoothing
        addUndo(false, true, false);

        // Apply single iteration of Laplacian smoothing
        const smoothedPath = this.laplacianSmooth(selectedPath.path, selectedPath.closed);

        // Update the path
        selectedPath.path = smoothedPath;

        // Recalculate bounding box
        selectedPath.bbox = boundingBox(selectedPath.path);

        redraw();
    }

    /**
     * Laplacian smoothing - moves points toward average of neighbors
     * Does NOT add new points, just repositions existing ones
     * @param {Array} path - Array of {x, y} points
     * @param {Boolean} closed - Whether the path is closed
     * @returns {Array} Smoothed path with same number of points
     */
    laplacianSmooth(path, closed) {
        if (path.length < 3) return path;

        const smoothed = [];

        // Check if this is a closed path with duplicate first/last point
        const hasDuplicateEndpoint = closed && path.length > 1 &&
                                      path[0].x === path[path.length - 1].x &&
                                      path[0].y === path[path.length - 1].y;

        for (let i = 0; i < path.length; i++) {
            const current = path[i];

            // For open paths, keep first and last points fixed
            if (!closed && (i === 0 || i === path.length - 1)) {
                smoothed.push({ x: current.x, y: current.y });
                continue;
            }

            // For closed paths with duplicate endpoint, skip the last point (will copy first point later)
            if (hasDuplicateEndpoint && i === path.length - 1) {
                continue; // Will be filled in after the loop
            }

            // Get neighbors
            const prevIndex = (i - 1 + path.length) % path.length;
            const nextIndex = (i + 1) % path.length;

            // For open paths, skip if we're at the edges
            if (!closed && (prevIndex >= path.length || nextIndex >= path.length)) {
                smoothed.push({ x: current.x, y: current.y });
                continue;
            }

            const prev = path[prevIndex];
            const next = path[nextIndex];

            // Calculate average position of neighbors
            const avgX = (prev.x + next.x) / 2;
            const avgY = (prev.y + next.y) / 2;

            // Move current point toward the average
            const newX = current.x + (avgX - current.x) * SMOOTHING_FACTOR;
            const newY = current.y + (avgY - current.y) * SMOOTHING_FACTOR;

            smoothed.push({ x: newX, y: newY });
        }

        // For closed paths with duplicate endpoint, copy the smoothed first point to the end
        if (hasDuplicateEndpoint) {
            smoothed.push({ x: smoothed[0].x, y: smoothed[0].y });
        }

        return smoothed;
    }

    /**
     * Wire up event handlers for radius controls
     */
    wireRadiusControls() {
        const applyRadiusBtn = document.getElementById('applyRadiusBtn');
        if (applyRadiusBtn) {
            applyRadiusBtn.addEventListener('click', () => {
                this.applyRadiusCorner();
            });
        }

        const smoothBtn = document.getElementById('applySmoothBtn');
        if (smoothBtn) {
            smoothBtn.addEventListener('click', () => {
                this.applySmoothingToPath();
            });
        }
    }

    /**
     * Apply a radius corner to the selected handles (or all if none selected)
     */
    applyRadiusCorner() {
        const selectedPath = this.selectedPath;
        if (!selectedPath) {
            console.log('No path selected for radius corner');
            return;
        }

        const radiusInput = document.getElementById('radiusInput');
        const invertCheck = document.getElementById('invertRadiusCheck');

        if (!radiusInput) {
            console.log('Radius input not found');
            return;
        }

        // Get radius using parseDimension (supports mm, inches, and fractions)
        const radiusMM = parseDimension(radiusInput.value);
        if (isNaN(radiusMM) || radiusMM <= 0) {
            console.log('Invalid radius value. Please enter a valid value (e.g., "5mm", "1/4in", "0.25")');
            return;
        }

        // Store the entered values for next time
        this.lastRadiusValue = radiusInput.value;
        const invert = invertCheck ? invertCheck.checked : false;
        this.lastInvertValue = invert;

        const radiusWorld = radiusMM * viewScale;

        // Save original path if not already saved
        if (!this.originalPathBeforeRadius) {
            this.originalPathBeforeRadius = {
                path: selectedPath.path.map(pt => ({ x: pt.x, y: pt.y })),
                closed: selectedPath.closed
            };
        }

        // Restore from original before applying new radius
        selectedPath.path = this.originalPathBeforeRadius.path.map(pt => ({ x: pt.x, y: pt.y }));

        // Check if path has duplicate endpoint (closed path)
        const path = selectedPath.path;
        const n = path.length;
        const hasDuplicateEndpoint = n > 1 &&
            path[0].x === path[n - 1].x &&
            path[0].y === path[n - 1].y;

        // Determine which points to apply radius to
        let pointsToProcess = [];
        if (this.selectedHandlesForRadius.length > 0) {
            // Use selected handles, but filter out the last point if it's a duplicate
            pointsToProcess = [...this.selectedHandlesForRadius];
            if (hasDuplicateEndpoint) {
                pointsToProcess = pointsToProcess.filter(idx => idx !== n - 1);
            }
        } else {
            // Apply to all points, excluding the last point if it's a duplicate
            const endIndex = hasDuplicateEndpoint ? n - 1 : n;
            for (let i = 0; i < endIndex; i++) {
                pointsToProcess.push(i);
            }
        }

        // Sort in descending order so we process from end to beginning
        // This prevents index shifting issues
        pointsToProcess.sort((a, b) => b - a);

        // Add undo before modification
        addUndo(false, true, false);

        // Apply radius to each selected point
        let successCount = 0;
        let failCount = 0;
        let processedPoint0 = false;

        for (const pointIndex of pointsToProcess) {
            const success = this.insertRadiusCorner(
                selectedPath,
                pointIndex,
                radiusWorld,
                invert
            );
            if (success) {
                successCount++;
                if (pointIndex === 0) {
                    processedPoint0 = true;
                }
            } else {
                failCount++;
            }
        }

        // If we processed point 0 and had a duplicate endpoint, fix the closure
        if (processedPoint0 && hasDuplicateEndpoint) {
            const updatedPath = selectedPath.path;
            const lastIndex = updatedPath.length - 1;
            // Update the last point to match the new first point
            updatedPath[lastIndex] = {
                x: updatedPath[0].x,
                y: updatedPath[0].y
            };
        }

        // Clear selection
        this.selectedHandlesForRadius = [];

        this.updatePropertiesPanel();

        // Recalculate bounding box
        selectedPath.bbox = boundingBox(selectedPath.path);

        // Show result
        if (failCount > 0) {
            console.log(`Applied radius to ${successCount} points, ${failCount} failed`);
        }

        redraw();
    }

    /**
     * Insert a radius corner (fillet) at the specified point index
     * @param {Object} svgPath - The path object
     * @param {Number} pointIndex - Index of the point to add radius to
     * @param {Number} radius - Radius in world coordinates
     * @param {Boolean} invert - If true, radius cuts into shape (concave), otherwise rounds out (convex)
     * @param {Boolean} suppressAlerts - If true, don't show alert dialogs (for batch operations)
     * @returns {Boolean} Success status
     */
    insertRadiusCorner(svgPath, pointIndex, radius, invert, suppressAlerts = false) {
        const path = svgPath.path;
        const n = path.length;

        if (n < 3) {
            return false;
        }

        // Check if path has duplicate endpoint (closed path)
        const hasDuplicateEndpoint = n > 1 &&
            path[0].x === path[n - 1].x &&
            path[0].y === path[n - 1].y;

        // Get the three points: previous, current (corner), next
        // Special handling for point 0 when there's a duplicate endpoint
        let prevIndex = (pointIndex - 1 + n) % n;
        let nextIndex = (pointIndex + 1) % n;

        // If we're at point 0 and have duplicate endpoint, use n-2 as previous
        if (pointIndex === 0 && hasDuplicateEndpoint) {
            prevIndex = n - 2;
        }

        const prev = path[prevIndex];
        const current = path[pointIndex];
        const next = path[nextIndex];

        // Calculate vectors from corner to neighbors
        const v1 = { x: prev.x - current.x, y: prev.y - current.y };
        const v2 = { x: next.x - current.x, y: next.y - current.y };

        // Calculate lengths
        const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        if (len1 < MIN_SEGMENT_LENGTH || len2 < MIN_SEGMENT_LENGTH) {
            return false; // Silently skip - adjacent points too close
        }

        // Normalize vectors
        const u1 = { x: v1.x / len1, y: v1.y / len1 };
        const u2 = { x: v2.x / len2, y: v2.y / len2 };

        // Calculate angle between vectors
        const dotProduct = u1.x * u2.x + u1.y * u2.y;
        const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

        if (Math.abs(angle) < MIN_ANGLE_THRESHOLD) {
            return false; // Silently skip - points are collinear
        }

        if (Math.abs(angle - Math.PI) < MIN_ANGLE_THRESHOLD) {
            return false; // Silently skip - angle too flat
        }

        // Calculate the distance from corner to tangent points
        const tangentDistance = radius / Math.tan(angle / 2);

        // Check if tangent distance is too large for the segments
        if (tangentDistance >= len1 * MAX_TANGENT_RATIO || tangentDistance >= len2 * MAX_TANGENT_RATIO) {
            return false; // Silently skip - radius too large
        }

        // Calculate cross product to determine handedness
        const cross = u1.x * u2.y - u1.y * u2.x;

        let arcCenter, startAngle, endAngle, sweepAngle, arcPoints;

        if (invert) {
            // INVERTED MODE: Arc centered at corner point, intersects both segments
            arcCenter = { x: current.x, y: current.y };

            // The intersection points are simply at radius distance along each segment direction
            const intersect1 = {
                x: current.x + u1.x * radius,
                y: current.y + u1.y * radius
            };

            const intersect2 = {
                x: current.x + u2.x * radius,
                y: current.y + u2.y * radius
            };

            // Check that intersections are within the segments
            if (radius >= len1 * MAX_TANGENT_RATIO || radius >= len2 * MAX_TANGENT_RATIO) {
                return false; // Silently skip - radius too large
            }

            // Calculate angles for the two intersection points
            startAngle = Math.atan2(intersect1.y - arcCenter.y, intersect1.x - arcCenter.x);
            endAngle = Math.atan2(intersect2.y - arcCenter.y, intersect2.x - arcCenter.x);

            // Calculate sweep angle - should be the interior angle
            sweepAngle = endAngle - startAngle;

            // Normalize to [-π, π]
            if (sweepAngle > Math.PI) {
                sweepAngle -= 2 * Math.PI;
            } else if (sweepAngle < -Math.PI) {
                sweepAngle += 2 * Math.PI;
            }

            // For inverted, we want to sweep through the interior (the smaller angle)
            // The sweep direction should match the cross product sign
            if (Math.sign(sweepAngle) !== Math.sign(cross)) {
                // Wrong direction, take the other way
                sweepAngle = sweepAngle > 0 ? sweepAngle - 2 * Math.PI : sweepAngle + 2 * Math.PI;
            }

            // Generate arc points
            const numArcPoints = Math.max(3, Math.ceil(Math.abs(sweepAngle) * ARC_POINTS_PER_RADIAN));
            arcPoints = [];

            for (let i = 0; i <= numArcPoints; i++) {
                const t = i / numArcPoints;
                const currentAngle = startAngle + sweepAngle * t;
                arcPoints.push({
                    x: arcCenter.x + radius * Math.cos(currentAngle),
                    y: arcCenter.y + radius * Math.sin(currentAngle)
                });
            }

        } else {
            // NORMAL MODE: Fillet tangent to both segments
            // Intersection points are where a circle of 'radius' centered at corner intersects the segments
            const intersect1 = {
                x: current.x + u1.x * radius,
                y: current.y + u1.y * radius
            };

            const intersect2 = {
                x: current.x + u2.x * radius,
                y: current.y + u2.y * radius
            };

            // Check that intersection points are within the segments
            if (radius >= len1 * MAX_TANGENT_RATIO || radius >= len2 * MAX_TANGENT_RATIO) {
                return false; // Silently skip - radius too large
            }

            // Calculate the arc radius for a tangent arc at these intersection points
            // For tangent points at distance 'radius' from corner with angle 'angle' between segments:
            // arcRadius = radius * tan(angle/2)
            const arcRadius = radius * Math.tan(angle / 2);

            // Calculate perpendicular vectors to each segment
            // For vector u1, perpendiculars are (-u1.y, u1.x) or (u1.y, -u1.x)
            // Choose the perpendicular that points away from the interior

            let perp1, perp2;
            if (cross > 0) {
                // Counter-clockwise turn - use left-hand perpendiculars for external fillet
                perp1 = { x: -u1.y, y: u1.x };
                perp2 = { x: -u2.y, y: u2.x };
            } else {
                // Clockwise turn - use right-hand perpendiculars for external fillet
                perp1 = { x: u1.y, y: -u1.x };
                perp2 = { x: u2.y, y: -u2.x };
            }

            // Calculate arc center from intersect1 using perpendicular
            // Arc center is at distance arcRadius perpendicular from intersection point
            arcCenter = {
                x: intersect1.x + perp1.x * arcRadius,
                y: intersect1.y + perp1.y * arcRadius
            };

            // Calculate angles for arc generation
            startAngle = Math.atan2(intersect1.y - arcCenter.y, intersect1.x - arcCenter.x);
            endAngle = Math.atan2(intersect2.y - arcCenter.y, intersect2.x - arcCenter.x);

            // Calculate sweep angle
            sweepAngle = endAngle - startAngle;

            // Normalize to [-π, π] to get the shorter arc
            if (sweepAngle > Math.PI) {
                sweepAngle -= 2 * Math.PI;
            } else if (sweepAngle < -Math.PI) {
                sweepAngle += 2 * Math.PI;
            }

            // The normalized sweep angle should now be the correct direction for the fillet
            // (the shorter arc that goes around the exterior of the corner)

            // Generate arc points - make sure to use EXACTLY the intersection points as endpoints
            const numArcPoints = Math.max(3, Math.ceil(Math.abs(sweepAngle) * ARC_POINTS_PER_RADIAN));
            arcPoints = [];

            // First point is exactly intersect1
            arcPoints.push({ x: intersect1.x, y: intersect1.y });

            // Generate intermediate points
            for (let i = 1; i < numArcPoints; i++) {
                const t = i / numArcPoints;
                const currentAngle = startAngle + sweepAngle * t;
                arcPoints.push({
                    x: arcCenter.x + arcRadius * Math.cos(currentAngle),
                    y: arcCenter.y + arcRadius * Math.sin(currentAngle)
                });
            }

            // Last point is exactly intersect2
            arcPoints.push({ x: intersect2.x, y: intersect2.y });
        }

        // Replace the current point with the arc points
        path.splice(pointIndex, 1, ...arcPoints);

        return true;
    }
}
