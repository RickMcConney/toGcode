class Transform extends Select {
    // Define state constants for Transform

    static IDLE = 0;
    static HOVERING = 1;
    static ADJUSTING_PIVOT = 2;
    static SCALING = 3;
    static ROTATING = 4;
    static DRAGGING = 5;
    static SELECTING = 6;
    static MIRRORING = 7;

    static state = Transform.IDLE;

    // Magic number constants
    static DRAG_THRESHOLD = 8;              // pixels before drag is detected
    static HANDLE_SIZE = 8;                 // radius of transform handles
    static HANDLE_HIT_RADIUS = 32;          // clickable radius (4x handle size)
    static MIN_BOX_DIMENSION = 2;           // minimum transform box dimension
    static SCALE_MIN = 0.1;                 // minimum scale factor
    static SCALE_MAX = 10;                  // maximum scale factor
    static ROTATION_LINE_LENGTH = 300;      // length of rotation reference line
    static MIRROR_BUTTON_OFFSET = 50;       // offset for mirror buttons from center
    static MIN_DISTANCE_CHECK = 10;         // minimum pixels to register distance

    constructor() {
        super('Move', 'move');
        this.name = 'Move';
        this.icon = 'move';
        this.tooltip = 'Move, scale, and rotate selected objects';
        this.transformBox = null;
        this.handleSize = Transform.HANDLE_SIZE;
        this.ROTATION_SNAP = Math.PI / 36; // 5 degree snapping
        this.unselectOnMouseDown = true;

        // Transform tracking properties
        this.deltaX = 0;
        this.deltaY = 0;
        this.scaleX = 1;
        this.scaleY = 1;

        this.initialTransformBox = null;
        this.pivotCenter = null;
        this.rotation = 0; // in degrees
        this.originalPivot = null;
    }

    start() {
        super.start();
        this.activeHandle = null;
        this.hoverHandle = null;

        // Reset transform tracking values
        this.resetTransformState();

        // Initialize based on selection
        if (this.hasSelectedPaths()) {
            this.setupTransformBox();
            this.updateCenterDisplay();
        } else {
            this.transformBox = null;
        }

        // Start in IDLE state
        Transform.state = Transform.IDLE;


        // Refresh properties panel to show the right state
        this.refreshPropertiesPanel();
        redraw();
    }

    // Helper method to reset all transform accumulators (but not pivot center or transform box)
    resetTransformState() {
        this.deltaX = 0;
        this.deltaY = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.rotation = 0;
        // Note: Don't reset pivotCenter or initialTransformBox here - they're needed for transforms
    }

    // Helper method to setup transform box with pivot center
    setupTransformBox() {
        this.transformBox = this.createTransformBox(svgpaths);
        this.initialTransformBox = { ...this.transformBox };

        if (this.pivotCenter == null) {
            this.pivotCenter = {
                x: this.transformBox.centerX,
                y: this.transformBox.centerY
            };
        }
        this.originalPivot = { ...this.pivotCenter };
        this.storeOriginalPaths();
    }

    // Helper method to store original paths for transformation reference
    storeOriginalPaths() {

        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            let path = svgpath.path;
            svgpath.originalPath = [];
            for (let i = 0; i < path.length; i++)
                svgpath.originalPath.push({ x: path[i].x, y: path[i].y });
        });
    }

    refreshPropertiesPanel() {
        // Check if the Move tool properties editor is currently visible
        const propertiesEditor = document.getElementById('tool-properties-editor');
        const isVisible = propertiesEditor && propertiesEditor.style.display !== 'none';

        if (isVisible) {
            // Re-trigger the properties panel display for the Move tool
            if (typeof showToolPropertiesEditor === 'function') {
                showToolPropertiesEditor('Move');
            }
        }
    }
    stop() {
        super.stop();
        this.transformBox = null;
    }
    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;

        // First check if we're clicking on a handle
        this.activeHandle = this.getHandleAtPoint(mouse);
        this.hoverHandle = null;

        // If clicking on a handle, handle transformation
        if (this.activeHandle) {

            addUndo(false, true, false);

            // Handle mirror as special case - immediate apply, no state change
            if (this.activeHandle.type === 'mirrorX') {
                this.mirrorX();
                this.activeHandle = null; // Don't persist active handle for mirror
                Transform.state = Transform.MIRRORING;
                return;
            }
            else if (this.activeHandle.type === 'mirrorY') {
                this.mirrorY();
                Transform.state = Transform.MIRRORING;
                this.activeHandle = null; // Don't persist active handle for mirror
                return;
            }

            // Store initial mouse position for scaling/rotation calculations
            this.initialMousePos = { x: mouse.x, y: mouse.y };

            // Transition to appropriate transform state based on handle type
            // At this point, transformBox, initialTransformBox, pivotCenter, and originalPaths are all guaranteed to exist
            if (this.activeHandle.type === 'center') {
                Transform.state = Transform.ADJUSTING_PIVOT;
            } else if (this.activeHandle.type === 'scale') {
                this.resetTransformState(); // Reset accumulators for clean scale
                Transform.state = Transform.SCALING;

            } else if (this.activeHandle.type === 'rotate') {
                this.resetTransformState(); // Reset accumulators for clean rotation
                Transform.state = Transform.ROTATING;
            }

        } else {
            // If not clicking on a handle, allow normal selection behavior
            super.onMouseDown(canvas, evt);

            // After parent handles the click, check if selection changed
            if (this.hasSelectedPaths()) {
                // We have selected paths - need to update transform box
                // This handles both new selections and adding to existing selections
                this.setupTransformBox();
                this.resetTransformState();
                this.refreshPropertiesPanel();
            } else if (!this.hasSelectedPaths() && this.transformBox) {
                // Selection was lost, clear transform state
                this.transformBox = null;
                this.initialTransformBox = null;

                this.pivotCenter = null;
                this.originalPivot = null;
                this.refreshPropertiesPanel();
            }

            // Transition to appropriate state based on what parent did
            if (Select.state == Select.DRAGGING) {
                Transform.state = Transform.DRAGGING;
            } else if (Select.state == Select.SELECTING) {
                Transform.state = Transform.SElECTING;
            }
        }
    }

    /**
     * Handle mouse move event with state-based transformation logic
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {MouseEvent} evt - The mouse event
     */
    onMouseMove(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);
        this.mouse = mouse;

        // Update hover detection when not dragging
        if (!this.mouseDown) {
            this.handleHoverDetection(mouse);
        }

        // Handle state-specific transformations when mouse is down
        if (this.mouseDown) {
            if (Transform.state == Transform.ADJUSTING_PIVOT) {
                this.handlePivotAdjustment(mouse);
            }
            else if (Transform.state == Transform.SCALING) {
                this.handleScaling(mouse, evt);
            }
            else if (Transform.state == Transform.ROTATING) {
                this.handleRotation(mouse);
            }
            else {
                super.onMouseMove(canvas, evt);
                this.updateCenterDisplay();
            }
        }
        if (Transform.state == Transform.IDLE)
            super.onMouseMove(canvas, evt);

        redraw();
    }

    /**
     * Handle hover detection for transform handles
     * @param {Object} mouse - Mouse position {x, y}
     */
    handleHoverDetection(mouse) {
        this.hoverHandle = this.getHandleAtPoint(mouse);
        if (this.hoverHandle) {
            Transform.state = Transform.HOVERING;
        } else if (Transform.state == Transform.HOVERING) {
            Transform.state = Transform.IDLE;
        }
    }

    /**
     * Handle pivot point adjustment (center handle)
     * @param {Object} mouse - Mouse position {x, y}
     */
    handlePivotAdjustment(mouse) {
        this.pivotCenter = mouse;
        this.center(); // Reset paths to original, not translated
        this.updateCenterDisplay();
    }

    /**
     * Handle scaling transformation
     * @param {Object} mouse - Mouse position {x, y}
     * @param {MouseEvent} evt - The mouse event (for shift key checking)
     */
    handleScaling(mouse, evt) {
        this.deltaX = 0;
        this.deltaY = 0;

        // Calculate scale factors based on mouse movement from initial position
        if (this.initialTransformBox == null) {
            return;
        }

        const initialDistanceX = this.initialMousePos.x - this.initialTransformBox.centerX;
        const initialDistanceY = this.initialMousePos.y - this.initialTransformBox.centerY;
        const currentDistanceX = mouse.x - this.initialTransformBox.centerX;
        const currentDistanceY = mouse.y - this.initialTransformBox.centerY;

        let scaleX = 1;
        let scaleY = 1;

        if (Math.abs(initialDistanceX) > 1) {
            scaleX = Math.max(Transform.SCALE_MIN, Math.min(Transform.SCALE_MAX, currentDistanceX / initialDistanceX));
        }
        if (Math.abs(initialDistanceY) > 1) {
            scaleY = Math.max(Transform.SCALE_MIN, Math.min(Transform.SCALE_MAX, currentDistanceY / initialDistanceY));
        }

        // Apply uniform scaling if shift key is pressed
        if (evt.shiftKey) {
            const avgScale = Math.max(Math.abs(scaleX), Math.abs(scaleY));
            scaleX = scaleX < 0 ? -avgScale : avgScale;
            scaleY = scaleY < 0 ? -avgScale : avgScale;
        }

        // Update and apply scale
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.scale(scaleX, scaleY);
        this.updateCreationProperties();
        this.transformBox = this.createTransformBox(svgpaths);
        this.updateCenterDisplay();
    }

    /**
     * Handle rotation transformation
     * @param {Object} mouse - Mouse position {x, y}
     */
    handleRotation(mouse) {
        this.deltaX = 0;
        this.deltaY = 0;

        // Calculate current angle from pivot center to mouse
        const currentAngle = Math.atan2(
            mouse.x - this.pivotCenter.x,
            mouse.y - this.pivotCenter.y
        );

        // Apply rotation snapping to nearest 5-degree increment
        const rotationDelta = Math.round(currentAngle / this.ROTATION_SNAP) * this.ROTATION_SNAP;

        // Convert to degrees and apply rotation
        this.rotation = rotationDelta * 180 / Math.PI;
        this.rotate(this.rotation);
        this.updateCreationProperties();
        this.transformBox = this.createTransformBox(svgpaths);
        this.updateCenterDisplay();
    }
    onMouseUp(canvas, evt) {
        const hadSelectBox = this.selectBox; // Check if we were doing drag selection
        const wasTransforming =
            (Transform.state == Transform.ADJUSTING_PIVOT ||
                Transform.state == Transform.SCALING ||
                Transform.state == Transform.ROTATING ||
                Transform.state == Transform.DRAGGING ||
                Transform.state == Transform.MIRRORING

            );

        const wasDraggingPath = Transform.state == Transform.DRAGGING;

        this.mouseDown = false;

        // Call parent to handle inherited Select behavior (may change selection)
        if (!wasTransforming)
            super.onMouseUp(canvas, evt);

        // Update transform state after mouse up
        if (this.hasSelectedPaths()) {
            // Update bboxes for all selected paths
            svgpaths.forEach(path => {
                if (selectMgr.isSelected(path)) {
                    path.bbox = boundingBox(path.path);
                }
            });

            // Store the previous transform box center to detect selection changes
            const prevCenter = this.transformBox ?
                { x: this.transformBox.centerX, y: this.transformBox.centerY } : null;

            // Always recalculate transform box to include all selected paths
            // This handles clicks, drags, and multi-selections
            this.transformBox = this.createTransformBox(svgpaths);
            this.initialTransformBox = { ...this.transformBox };
            this.activeHandle = null;

            // Update original paths from current state for sequential transformations
            // This ensures that scale + rotate works by applying rotate to scaled paths
            this.storeOriginalPaths();

            // Handle pivot point based on what just happened
            const newCenter = { x: this.transformBox.centerX, y: this.transformBox.centerY };

            if (prevCenter && this.pivotCenter) {
                // If we were dragging a path, move the pivot by the exact amount the transform box moved
                // This preserves the user's custom pivot point position relative to the shapes
                const boxMovement = {
                    x: newCenter.x - prevCenter.x,
                    y: newCenter.y - prevCenter.y
                };
                this.pivotCenter.x += boxMovement.x;
                this.pivotCenter.y += boxMovement.y;
                this.originalPivot.x += boxMovement.x;
                this.originalPivot.y += boxMovement.y;
            } else {
                // If selection changed or no custom pivot, reset to new transform box center
                if (!prevCenter || prevCenter.x !== newCenter.x || prevCenter.y !== newCenter.y) {
                    this.pivotCenter = { ...newCenter };
                    this.originalPivot = { ...newCenter };
                }
            }

            // Always reset accumulators after operation completes
            this.resetTransformState();

            // If we just finished a selection via drag, refresh properties
            if (hadSelectBox) {
                this.refreshPropertiesPanel();
            }

            // Transition back to IDLE state
            Transform.state = Transform.IDLE;
        }
        else {
            // No selection, clear transform state
            this.transformBox = null;
            this.activeHandle = null;
            // Transition to IDLE (without selection)
            Transform.state = Transform.IDLE;
        }

        this.updateCenterDisplay();
        redraw();
    }

    center() {
        let selected = selectMgr.selectedPaths();
        selected.forEach(path => {
            const originalPath = path.originalPath;
            if (originalPath) {
                path.path = [...originalPath];
                path.bbox = boundingBox(path.path);
            }
        });
    }

    /**
     * Apply scaling transformation to selected paths
     * Scales around the transform box center
     * @param {Number} scaleX - Horizontal scale factor
     * @param {Number} scaleY - Vertical scale factor
     */
    scale(scaleX, scaleY) {
        const cx = this.initialTransformBox.centerX;
        const cy = this.initialTransformBox.centerY;

        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            const path = svgpath.originalPath;
            if (path) {
                for (let i = 0; i < path.length; i++) {
                    let pt = path[i];
                    if (i != path.length - 1 || pt !== path[0]) {

                        const newX = cx + (pt.x - cx) * scaleX;
                        const newY = cy + (pt.y - cy) * scaleY;
                        svgpath.path[i].x = newX;
                        svgpath.path[i].y = newY;
                    }
                }
                svgpath.bbox = boundingBox(path);
            }
        });
    }

    /**
     * Apply rotation transformation to selected paths
     * Rotates around the pivot center point
     * @param {Number} angle - Rotation angle in degrees
     */
    rotate(angle) {
        const rotationRad = -angle * Math.PI / 180;
        const cos = Math.cos(rotationRad);
        const sin = Math.sin(rotationRad);
        const px = this.pivotCenter.x;
        const py = this.pivotCenter.y;

        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            const path = svgpath.originalPath;
            if (path) {
                for (let i = 0; i < path.length; i++) {
                    let pt = path[i];
                    if (i != path.length - 1 || pt !== path[0]) {

                        const dx = pt.x - px;
                        const dy = pt.y - py;

                        const newX = px + (dx * cos - dy * sin);
                        const newY = py + (dx * sin + dy * cos);
                        svgpath.path[i].x = newX;
                        svgpath.path[i].y = newY;
                    }
                }
                svgpath.bbox = boundingBox(svgpath.path);
            }
        });
    }

    /**
     * Mirror selected paths horizontally (flip left-right)
     */
    mirrorX() {
        const { centerX } = this.transformBox;
        const cx = 2 * centerX;
        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            let path = svgpath.path;
            for (let i = 0; i < path.length; i++) {
                let pt = path[i];
                if (i != path.length - 1 || pt !== path[0]) {
                    pt.x = cx - pt.x;
                }
            }

            svgpath.bbox = boundingBox(path);
        });
    }

    /**
     * Mirror selected paths vertically (flip top-bottom)
     */
    mirrorY() {
        const { centerY } = this.transformBox;
        const cy = 2 * centerY;
        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            let path = svgpath.path;
            for (let i = 0; i < path.length; i++) {
                let pt = path[i];
                if (i != path.length - 1 || pt !== path[0]) {
                    pt.y = cy - pt.y;
                }
            }
            svgpath.bbox = boundingBox(path);
        });
    }

    draw(ctx) {
        super.draw(ctx);
        this.drawTransformBox(ctx);
    }


    hasSelectedPaths() {
        return !selectMgr.noSelection();
    }

    createTransformBox(paths) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // Calculate bounding box for all selected paths
        paths.forEach(path => {
            if (selectMgr.isSelected(path)) {
                minX = Math.min(minX, path.bbox.minx);
                minY = Math.min(minY, path.bbox.miny);
                maxX = Math.max(maxX, path.bbox.maxx);
                maxY = Math.max(maxY, path.bbox.maxy);
            }
        });

        if (minX === Infinity) return null; // No selected paths

        if (maxX - minX < Transform.MIN_BOX_DIMENSION) { maxX++; minX--; }
        if (maxY - minY < Transform.MIN_BOX_DIMENSION) { maxY++; minY--; }
        return {
            minx: minX,
            miny: minY,
            maxx: maxX,
            maxy: maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            width: maxX - minX,
            height: maxY - minY,
            rotation: 0
        };
    }

    drawText(ctx) {
        // Only draw info text when actively transforming
        if (!this.transformBox) return;
        if (!(Transform.state == Transform.SCALING || Transform.state == Transform.ROTATING)) return;

        let text = '0'
        if (Transform.state == Transform.ROTATING) {
            text = this.rotation.toFixed(1) + '°';
        }
        else if (Transform.state == Transform.SCALING) {
            // Show current dimensions instead of scale factors
            const currentWidth = this.transformBox.width / viewScale;
            const currentHeight = this.transformBox.height / viewScale;

            text = formatDimension(currentWidth, true) + ' × ' + formatDimension(currentHeight, true);
        }

        let screenHandle = worldToScreen(this.mouse.x, this.mouse.y);
        ctx.save();
        ctx.fillStyle = pointFillColor;
        ctx.font = '12px Arial';
        ctx.fillText(text, screenHandle.x + 10, screenHandle.y - 25);
        ctx.restore();
    }

    drawHandle(ctx, handle) {
        let screenHandle = worldToScreen(handle.x, handle.y);
        let x = screenHandle.x;
        let y = screenHandle.y;
        let size = this.handleSize;
        let isActive = this.activeHandle?.id == handle.id;
        let isHovered = this.hoverHandle?.id == handle.id;
        let type = handle.type;

        ctx.beginPath();
        if (type == 'mirrorX') {
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x, y - size);
            ctx.lineTo(x, y);

            ctx.moveTo(x, y);
            ctx.lineTo(x, y - size);
            ctx.lineTo(x - size, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x, y);
        }
        else if (type == 'mirrorY') {
            ctx.moveTo(x, y);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x - size, y);
            ctx.lineTo(x, y);

            ctx.moveTo(x, y);
            ctx.lineTo(x - size, y);
            ctx.lineTo(x, y - size);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x, y);
        }
        else
            ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.closePath();

        // Color based on state
        if (isActive) {
            // Red for actively dragging
            ctx.fillStyle = handleActiveColor;
            ctx.strokeStyle = handleActiveStroke;
        } else if (isHovered) {
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



    drawRotation(ctx, handle) {
        // Guard: only draw if pivot center exists
        if (!this.pivotCenter || !this.mouse) return;

        let screenHandle = worldToScreen(this.mouse.x, this.mouse.y);
        let screenCenter = worldToScreen(this.pivotCenter.x, this.pivotCenter.y);
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(screenCenter.x, screenCenter.y);
        ctx.lineTo(screenHandle.x, screenHandle.y);
        ctx.closePath();
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = handleHoverColor;
        ctx.strokeStyle = handleHoverStroke;
        ctx.beginPath();
        ctx.arc(screenHandle.x, screenHandle.y, this.handleSize, 0, Math.PI * 2);
        ctx.closePath();

        ctx.stroke();
        ctx.fill();
    }

    drawTransformBox(ctx) {
        if (!this.transformBox) return;

        ctx.save();
        ctx.strokeStyle = selectionBoxColor;
        ctx.lineWidth = 1;

        // Rotate context around center point (convert center to screen coordinates)
        let screenCenter = worldToScreen(this.transformBox.centerX, this.transformBox.centerY);
        ctx.translate(screenCenter.x, screenCenter.y);
        ctx.rotate(this.transformBox.rotation);
        ctx.translate(-screenCenter.x, -screenCenter.y);

        // Draw main box (convert all corners to screen coordinates)
        let p1 = worldToScreen(this.transformBox.minx, this.transformBox.miny);
        let p2 = worldToScreen(this.transformBox.maxx, this.transformBox.miny);
        let p3 = worldToScreen(this.transformBox.maxx, this.transformBox.maxy);
        let p4 = worldToScreen(this.transformBox.minx, this.transformBox.maxy);

        // Only draw box outline when not actively transforming
        if (!this.mouseDown || Transform.state == Transform.ADJUSTING_PIVOT) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.closePath();
            ctx.stroke();
        }

        // Draw handles (convert handle positions to screen coordinates)
        const handles = this.getTransformHandles();

        // Show rotation reference line during rotation
        if (Transform.state == Transform.ROTATING) {
            this.drawRotation(ctx, handles[4]);
        }

        // Show center handle during pivot adjustment
        if (Transform.state == Transform.ADJUSTING_PIVOT) {
            this.drawHandle(ctx, handles[5]);
        }

        // Show all handles when not actively dragging/transforming
        if (!this.mouseDown || Transform.state == Transform.ADJUSTING_PIVOT) {
            handles.forEach(handle => {
                this.drawHandle(ctx, handle);
            });
        }

        this.drawText(ctx);
        ctx.restore();
    }

    getTransformHandles() {
        if (!this.transformBox) return [];

        const { minx, miny, maxx, maxy, centerX, centerY } = this.transformBox;
        let pivotX = centerX;
        let pivotY = centerY;
        if (this.pivotCenter) {
            pivotX = this.pivotCenter.x;
            pivotY = this.pivotCenter.y;
        }
        const rotationRad = this.rotation * Math.PI / 180;
        let ry = Transform.ROTATION_LINE_LENGTH * Math.cos(rotationRad);
        let rx = Transform.ROTATION_LINE_LENGTH * Math.sin(rotationRad);



        return [
            { id: 1, x: minx, y: miny, type: 'scale', corner: 'tl' },
            { id: 2, x: maxx, y: miny, type: 'scale', corner: 'tr' },
            { id: 3, x: maxx, y: maxy, type: 'scale', corner: 'br' },
            { id: 4, x: minx, y: maxy, type: 'scale', corner: 'bl' },
            { id: 5, x: pivotX + rx, y: pivotY + ry, type: 'rotate' },
            { id: 6, x: pivotX, y: pivotY, type: 'center' },
            { id: 7, x: centerX, y: centerY + Transform.MIRROR_BUTTON_OFFSET, type: 'mirrorY' },
            { id: 8, x: centerX + Transform.MIRROR_BUTTON_OFFSET, y: centerY, type: 'mirrorX' }
        ];
    }

    getHandleAtPoint(point) {
        const handles = this.getTransformHandles();
        for (let handle of handles) {
            const dx = handle.x - point.x;
            const dy = handle.y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= Transform.HANDLE_HIT_RADIUS) {
                return handle;
            }
        }
        return null;
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        const hasSelectedPaths = this.hasSelectedPaths();
        //const disabled = hasSelectedPaths ? '' : 'disabled';
        const disabled = '';
        // Show center position only if we have a transform box
        let centerInfo = '';
        if (this.transformBox) {
            const centerMM = toMM(this.transformBox.centerX, this.transformBox.centerY);
            const useInches = typeof getOption === 'function' && getOption('Inches');

            const centerXStr = formatDimension(centerMM.x, true);
            const centerYStr = formatDimension(centerMM.y, true);
            centerInfo = `
                <div class="alert alert-info mb-3">
                    <strong>Center Position</strong><br>
                    X: <span id="move-center-x">${centerXStr}</span><br>
                    Y: <span id="move-center-y">${centerYStr}</span>
                </div>
            `;
        } else {
            centerInfo = `
                <div class="alert alert-info mb-3">
                    <strong>Move Tool</strong><br>
                    Select objects to apply transformations.
                </div>
            `;
        }

        const useInches = typeof getOption === 'function' && getOption('Inches');

        const deltaXmm = this.deltaX / viewScale;
        const deltaYmm = -this.deltaY / viewScale;
        const deltaXValue = useInches ? formatDimension(deltaXmm, true) : deltaXmm.toFixed(2);
        const deltaYValue = useInches ? formatDimension(deltaYmm, true) : deltaYmm.toFixed(2);

        return centerInfo + `
            <div class="mb-3">
                <label class="form-label"><strong>Translation</strong></label>
                <div class="row">
                    <div class="col-6">
                        <label for="move-delta-x" class="form-label">Delta X</label>
                        <input type="text" class="form-control" id="move-delta-x" name="deltaX"
                               value="${deltaXValue}" ${disabled}>
                    </div>
                    <div class="col-6">
                        <label for="move-delta-y" class="form-label">Delta Y</label>
                        <input type="text" class="form-control" id="move-delta-y" name="deltaY"
                               value="${deltaYValue}" ${disabled}>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <label class="form-label"><strong>Dimensions</strong></label>
                <div class="row">
                    <div class="col-6">
                        <label for="move-width" class="form-label">Width</label>
                        <input type="text" class="form-control" id="move-width" name="width"
                               value="${this.transformBox ? (useInches ? formatDimension(this.transformBox.width / viewScale, true) : (this.transformBox.width / viewScale).toFixed(2)) : '0'}" ${disabled}>
                    </div>
                    <div class="col-6">
                        <label for="move-height" class="form-label">Height</label>
                        <input type="text" class="form-control" id="move-height" name="height"
                               value="${this.transformBox ? (useInches ? formatDimension(this.transformBox.height / viewScale, true) : (this.transformBox.height / viewScale).toFixed(2)) : '0'}" ${disabled}>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <label for="move-rotation" class="form-label"><strong>Rotation (degrees)</strong></label>
                <input type="number" class="form-control" id="move-rotation" name="rotation"
                       value="${this.rotation.toFixed(1)}" step="1" ${disabled}>
            </div>

            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Move Tool:</strong> ${hasSelectedPaths ?
                'Drag the center handle to move, corner handles to resize, or the top handle to rotate. Enter exact width/height to resize to specific dimensions.' :
                'Select objects first, then drag the center handle to move, corner handles to resize, or the top handle to rotate.'
            }
                </small>
            </div>
        `;
    }

    updateFromProperties(data) {
        // Guard: only allow property changes if paths are selected AND not actively dragging
        if (!this.transformBox || !(Transform.state == Transform.IDLE || Transform.state == Transform.HOVERING)) {
            // Silently ignore changes when not in a safe state (actively transforming or no selection)
            return;
        }

        this.properties = { ...this.properties, ...data };

        // Check if in inch mode for unit conversion
        const useInches = typeof getOption === 'function' && getOption('Inches');

        // Apply property changes to transform values
        // Use parseDimension to handle fractional inch input
        if (data.deltaX !== undefined) {
            const deltaXmm = parseDimension(data.deltaX, useInches);
            this.deltaX = deltaXmm * viewScale || 0;
        }
        if (data.deltaY !== undefined) {
            const deltaYmm = parseDimension(data.deltaY, useInches);
            this.deltaY = -deltaYmm * viewScale || 0;  // Flip Y for CNC coordinates
        }

        // Handle width/height changes by calculating appropriate scale factors
        if (data.width !== undefined && this.transformBox) {
            const widthMM = parseDimension(data.width, useInches);
            const originalWidth = this.transformBox.width / viewScale;
            this.scaleX = originalWidth > 0 ? widthMM / originalWidth : 1;
            this.scaleX = this.scaleX.toFixed(2);
        }
        if (data.height !== undefined && this.transformBox) {
            const heightMM = parseDimension(data.height, useInches);
            const originalHeight = this.transformBox.height / viewScale;
            this.scaleY = originalHeight > 0 ? heightMM / originalHeight : 1;
            this.scaleY = this.scaleY.toFixed(2);
        }

        if (data.rotation !== undefined) this.rotation = parseFloat(data.rotation) || 0;

        // Apply transformation to paths based on current property values
        if (this.hasSelectedPaths()) {
            this.applyTransformFromProperties();
            this.updateCenterDisplay();
        }
    }

    updateCenterDisplay() {

        let centerMM = { x: 0, y: 0 };
        let currentWidth = 0;
        let currentHeight = 0;
        let rotation = 0;

        if (this.transformBox) {
            centerMM = toMM(this.transformBox.centerX, this.transformBox.centerY);
            currentWidth = this.transformBox.width / viewScale;
            currentHeight = this.transformBox.height / viewScale;
            rotation = this.rotation;
        }

        // Convert center coordinates from pixels to mm

        const useInches = typeof getOption === 'function' && getOption('Inches');

        // Update the display elements if they exist, but avoid updating the currently focused element
        const activeElement = document.activeElement;

        const centerXElement = document.getElementById('move-center-x');
        const centerYElement = document.getElementById('move-center-y');
        const deltaXElement = document.getElementById('move-delta-x');
        const deltaYElement = document.getElementById('move-delta-y');
        const widthElement = document.getElementById('move-width');
        const heightElement = document.getElementById('move-height');
        const rotationElement = document.getElementById('move-rotation');

        if (centerXElement) {
            centerXElement.textContent = formatDimension(centerMM.x, true);
        }
        if (centerYElement) {
            centerYElement.textContent = formatDimension(centerMM.y, true);
        }

        // Only update input fields if they're not currently being edited
        const deltaXmm = this.deltaX / viewScale;
        const deltaYmm = -this.deltaY / viewScale;
        const deltaXValue = useInches ? formatDimension(deltaXmm, true) : deltaXmm.toFixed(2);
        const deltaYValue = useInches ? formatDimension(deltaYmm, true) : deltaYmm.toFixed(2);

        if (deltaXElement && deltaXElement !== activeElement) {
            deltaXElement.value = deltaXValue;

        }
        if (deltaYElement && deltaYElement !== activeElement) {
            deltaYElement.value = deltaYValue;

        }

        // Update width and height fields to show current dimensions

        const widthValue = useInches ? formatDimension(currentWidth, true) : currentWidth.toFixed(2);
        const heightValue = useInches ? formatDimension(currentHeight, true) : currentHeight.toFixed(2);

        if (widthElement && widthElement !== activeElement) {
            widthElement.value = widthValue;

        }
        if (heightElement && heightElement !== activeElement) {
            heightElement.value = heightValue;

        }
        if (rotationElement && rotationElement !== activeElement) {
            rotationElement.value = rotation.toFixed(1);

        }
    }

    applyTransformFromProperties() {
        if (!this.initialTransformBox) return;

        // Apply transformation to all selected paths
        let selected = selectMgr.selectedPaths();
        selected.forEach(path => {

            const originalPath = path.originalPath;
            if (originalPath) {
                // Apply translation, scale, and rotation from properties
                const centerX = this.initialTransformBox.centerX;
                const centerY = this.initialTransformBox.centerY;
                const rotationRad = this.rotation * Math.PI / 180;

                path.path = originalPath.map(pt => {
                    // Scale around center
                    let newX = centerX + (pt.x - centerX) * this.scaleX;
                    let newY = centerY + (pt.y - centerY) * this.scaleY;

                    // Rotate around center
                    if (rotationRad !== 0) {
                        const dx = newX - this.pivotCenter.x;
                        const dy = newY - this.pivotCenter.y;
                        const cos = Math.cos(rotationRad);
                        const sin = Math.sin(rotationRad);
                        newX = this.pivotCenter.x + (dx * cos - dy * sin);
                        newY = this.pivotCenter.y + (dx * sin + dy * cos);
                    }

                    // Translate
                    newX += this.deltaX;
                    newY += this.deltaY;



                    return { x: newX, y: newY };
                });

                path.bbox = boundingBox(path.path);
            }

        });

        // Update creation properties to reflect new positions
        this.updateCreationProperties();

        this.transformBox = this.createTransformBox(svgpaths);
        this.initialTransformBox = { ...this.transformBox };
        this.storeOriginalPaths();

        if (this.pivotCenter) {
            this.pivotCenter.x += this.deltaX;
            this.pivotCenter.y += this.deltaY;
        }

        redraw();
    }

    updateCreationProperties() {
        // Update creation properties for all selected paths to reflect their new positions
        svgpaths.forEach(path => {
            if (selectMgr.isSelected(path) && path.creationProperties) {
                if (path.creationTool === 'Text' && path.creationProperties.position) {
                    // For text, calculate the new position based on the transformation
                    const bbox = path.bbox;
                    if (bbox) {
                        // Use the current bounding box center as the new position
                        path.creationProperties.position.x = bbox.minx + (bbox.maxx - bbox.minx) / 2;
                        path.creationProperties.position.y = bbox.miny + (bbox.maxy - bbox.miny) / 2;
                    }
                } else if (path.creationTool === 'Polygon' && path.creationProperties.center) {
                    // For polygons, calculate the new center based on the transformation
                    const bbox = path.bbox;
                    if (bbox) {
                        // Use the current bounding box center as the new center
                        path.creationProperties.center.x = bbox.minx + (bbox.maxx - bbox.minx) / 2;
                        path.creationProperties.center.y = bbox.miny + (bbox.maxy - bbox.miny) / 2;
                    }
                }
            }
        });
    }
}