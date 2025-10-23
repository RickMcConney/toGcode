class Transform extends Select {
    constructor() {
        super('Move', 'move');
        this.name = 'Move';
        this.icon = 'move';
        this.tooltip = 'Move, scale, and rotate selected objects';
        this.transformBox = null;
        this.handleSize = 8;
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
        this.originalPaths = [];
        this.originalPivot = null;
    }

    start() {
        super.start();
        this.activeHandle = null;
        this.hoverHandle = null;


        // Reset transform tracking values
        this.deltaX = 0;
        this.deltaY = 0;
        this.scaleX = 1;
        this.scaleY = 1;

        this.pivotCenter = null;
        this.rotation = 0;

        if (this.hasSelectedPaths()) {
            this.transformBox = this.createTransformBox(svgpaths);
            this.initialTransformBox = { ...this.transformBox };
            this.pivotCenter = {};
            this.pivotCenter.x = this.transformBox.centerX;
            this.pivotCenter.y = this.transformBox.centerY;
            this.originalPivot = { ...this.pivotCenter };


            // Store original path positions
            this.originalPaths = svgpaths.map(path => {
                if (selectMgr.isSelected(path)) {
                    return {
                        id: path.id,
                        path: path.path.map(pt => ({ x: pt.x, y: pt.y }))
                    };
                }
                return null;
            }).filter(p => p !== null);

            // Update display when starting
            this.updateCenterDisplay();
        }
        else
            this.transformBox = null;

        // Refresh properties panel to show the right state
        this.refreshPropertiesPanel();
        redraw();
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

        // If clicking on a handle, don't call parent (prevents deselection)
        if (this.activeHandle) {
            // Ensure initialTransformBox exists when clicking on handle
            if (this.transformBox) {
                this.initialTransformBox = { ...this.transformBox };
                if (this.pivotCenter == null) {
                    this.pivotCenter = {};
                    this.pivotCenter.x = this.transformBox.centerX;
                    this.pivotCenter.y = this.transformBox.centerY;
                    this.originalPivot = { ...this.pivotCenter };
                }


                // Also store original path positions if missing

                this.originalPaths = svgpaths.map(path => {
                    if (selectMgr.isSelected(path)) {
                        return {
                            id: path.id,
                            path: path.path.map(pt => ({ x: pt.x, y: pt.y }))
                        };
                    }
                    return null;
                }).filter(p => p !== null);

            }


            //canvas.style.cursor = "grabbing";
            addUndo(false, true, false);

            if (this.activeHandle.type === 'mirrorX') {
                this.mirrorX();
            }
            else if (this.activeHandle.type === 'mirrorY') {
                this.mirrorY();
            }

            // Store the initial mouse position for scaling/rotation calculations

            this.initialMousePos = { x: mouse.x, y: mouse.y };

        } else {
            // If not clicking on a handle, allow normal selection behavior
            super.onMouseDown(canvas, evt);
            this.pivotCenter = null;
            this.originalPivot = null;
            this.rotation = 0;


            // Check if selection changed and update transform box accordingly
            const hadTransformBox = !!this.transformBox;
            if (this.hasSelectedPaths() && !this.transformBox) {
                this.transformBox = this.createTransformBox(svgpaths);
                this.initialTransformBox = { ...this.transformBox };


                // Store original path positions for transformation reference
                this.originalPaths = svgpaths.map(path => {
                    if (selectMgr.isSelected(path)) {
                        return {
                            id: path.id,
                            path: path.path.map(pt => ({ x: pt.x, y: pt.y }))
                        };
                    }
                    return null;
                }).filter(p => p !== null);
                this.originalPivot = { ...this.pivotCenter };

                // Reset transform values when starting fresh
                this.deltaX = 0;
                this.deltaY = 0;
                this.scaleX = 1;
                this.scaleY = 1;
                this.rotation = 0;
                this.refreshPropertiesPanel();
            } else if (!this.hasSelectedPaths() && this.transformBox && !this.activeHandle) {
                // Only clear transform box if we're not in the middle of an active transformation
                this.transformBox = null;
                this.initialTransformBox = null;
                this.originalPaths = [];
                this.originalPivot = null;
                this.refreshPropertiesPanel();

            }
        }
    }

    onMouseMove(canvas, evt) {
        super.onMouseMove(canvas, evt);
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouse = mouse;
        if (!this.mouseDown) {
            this.hoverHandle = this.getHandleAtPoint(mouse);

        }

        if (this.mouseDown && this.activeHandle) {
            this.selectBox = null;


            if (this.activeHandle.type === 'center') {

                this.pivotCenter = mouse;
                this.center();

            }

            else if (this.activeHandle.type === 'scale') {
                this.deltaX = 0;
                this.deltaY = 0;
                // Calculate scale factors based on mouse movement from initial position
                const initialDistanceX = this.initialMousePos.x - this.initialTransformBox.centerX;
                const initialDistanceY = this.initialMousePos.y - this.initialTransformBox.centerY;
                const currentDistanceX = mouse.x - this.initialTransformBox.centerX;
                const currentDistanceY = mouse.y - this.initialTransformBox.centerY;

                let scaleX = 1;
                let scaleY = 1;

                if (Math.abs(initialDistanceX) > 1) {
                    scaleX = Math.max(0.1, Math.min(10, currentDistanceX / initialDistanceX));
                }
                if (Math.abs(initialDistanceY) > 1) {
                    scaleY = Math.max(0.1, Math.min(10, currentDistanceY / initialDistanceY));
                }

                if (evt.shiftKey) {
                    // Uniform scaling - use the larger scale factor
                    const avgScale = Math.max(Math.abs(scaleX), Math.abs(scaleY));
                    scaleX = scaleX < 0 ? -avgScale : avgScale;
                    scaleY = scaleY < 0 ? -avgScale : avgScale;
                }

                // Update tracked scale values
                this.scaleX = scaleX;
                this.scaleY = scaleY;

                this.scale(scaleX, scaleY);
                this.updateCreationProperties();
                this.transformBox = this.createTransformBox(svgpaths);
            }
            else if (this.activeHandle.type === 'rotate') {
                this.deltaX = 0;
                this.deltaY = 0;
                // Calculate current angle from center to mouse
                const currentAngle = Math.atan2(
                    mouse.x - this.pivotCenter.x,
                    mouse.y - this.pivotCenter.y
                );

                // Calculate rotation difference
                let rotationDelta = currentAngle;

                // Apply snapping
                rotationDelta = Math.round(rotationDelta / this.ROTATION_SNAP) * this.ROTATION_SNAP;

                // Update tracked rotation value (convert to degrees)
                this.rotation = (rotationDelta) * 180 / Math.PI;

                this.rotate(this.rotation);
                this.updateCreationProperties();
                this.transformBox = this.createTransformBox(svgpaths);
            }


        }

        if (this.mouseDown)
            this.updateCenterDisplay();
        redraw();
    }
    onMouseUp(canvas, evt) {
        const hadSelectBox = this.selectBox; // Check if we were doing drag selection
        super.onMouseUp(canvas, evt);
        this.mouseDown = false;
        //canvas.style.cursor = "grab";

        if (this.hasSelectedPaths()) {

            this.transformBox = this.createTransformBox(svgpaths);
            this.initialTransformBox = { ...this.transformBox };
            if (this.pivotCenter == null) {
                this.pivotCenter = {};
                this.pivotCenter.x = this.transformBox.centerX;
                this.pivotCenter.y = this.transformBox.centerY;
                this.originalPivot = { ...this.pivotCenter };
            }


            // Store original path positions
            this.originalPaths = svgpaths.map(path => {
                if (selectMgr.isSelected(path)) {
                    return {
                        id: path.id,
                        path: path.path.map(pt => ({ x: pt.x, y: pt.y }))
                    };
                }
                return null;
            }).filter(p => p !== null);
            this.originalPivot = { ...this.pivotCenter };

            // Refresh properties panel after drag selection
            if (hadSelectBox) {
                this.refreshPropertiesPanel();
            }
        }
        else {
            this.transformBox = null;
        }
        if (this.activeHandle) {
            // Update final positions
            svgpaths.forEach(path => {
                if (selectMgr.isSelected(path)) {
                    path.bbox = boundingBox(path.path);
                }
            });
            this.transformBox = this.createTransformBox(svgpaths);


            this.activeHandle = null;

        }
        this.updateCenterDisplay();
        redraw();
    }

    center() {
        svgpaths.forEach(path => {
            if (selectMgr.isSelected(path)) {
                const originalPath = this.originalPaths.find(p => p.id === path.id);
                if (originalPath) {
                    path.path = [...originalPath.path];
                    path.bbox = boundingBox(path.path);
                }
            }
        });
    }

    scale(scaleX, scaleY) {
        svgpaths.forEach(path => {
            if (selectMgr.isSelected(path)) {
                const originalPath = this.originalPaths.find(p => p.id === path.id);
                if (originalPath) {
                    path.path = originalPath.path.map(pt => {
                        let newX = this.initialTransformBox.centerX + (pt.x - this.initialTransformBox.centerX) * scaleX;
                        let newY = this.initialTransformBox.centerY + (pt.y - this.initialTransformBox.centerY) * scaleY;
                        return { x: newX, y: newY };
                    });
                    path.bbox = boundingBox(path.path);
                }
            }
        });
    }

    rotate(angle) {
        svgpaths.forEach(path => {
            if (selectMgr.isSelected(path)) {
                const originalPath = this.originalPaths.find(p => p.id === path.id);
                if (originalPath) {
                    path.path = originalPath.path.map(pt => {
                        // Apply rotation around center
                        const rotationRad = -angle * Math.PI / 180;
                        const dx = pt.x - this.pivotCenter.x;
                        const dy = pt.y - this.pivotCenter.y;
                        const cos = Math.cos(rotationRad);
                        const sin = Math.sin(rotationRad);
                        let newX = this.pivotCenter.x + (dx * cos - dy * sin);
                        let newY = this.pivotCenter.y + (dx * sin + dy * cos);

                        return { x: newX, y: newY };
                    });
                    path.bbox = boundingBox(path.path);
                }
            }
        });
    }

    mirrorX() {
        const { minx, miny, maxx, maxy, centerX, centerY } = this.transformBox;
        let cx = 2 * centerX;
        svgpaths.forEach(path => {
            if (selectMgr.isSelected(path)) {
                for (let pt of path.path) {
                    pt.x = cx - pt.x;
                }
                path.bbox = boundingBox(path.path);
            }
        });
    }

    mirrorY() {
        const { minx, miny, maxx, maxy, centerX, centerY } = this.transformBox;
        let cy = 2 * centerY;
        svgpaths.forEach(path => {
            if (selectMgr.isSelected(path)) {
                for (let pt of path.path)
                    pt.y = cy - pt.y
                path.bbox = boundingBox(path.path);
            }
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

        if (maxX - minX < 2) { maxX++; minX--; }
        if (maxY - minY < 2) { maxY++; minY--; }
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

    drawText() {
        if (!this.transformBox || !this.activeHandle) return;
        if (this.activeHandle.type == 'mirrorX' || this.activeHandle.type == 'mirrorY' || this.activeHandle.type == 'center') return;

        let text = '0'
        if (this.activeHandle.type == 'rotate')
            text = this.rotation.toFixed(1) + '°';
        else if (this.activeHandle.type == 'scale') {
            // Show current dimensions instead of scale factors
            const currentWidth = this.transformBox.width / viewScale;
            const currentHeight = this.transformBox.height / viewScale;


            text = formatDimension(currentWidth, true) + ' × ' + formatDimension(currentHeight, true);
        }
        else if (this.activeHandle.type == 'translate') {
            const deltaXmm = this.deltaX / viewScale;
            const deltaYmm = -this.deltaY / viewScale;


            text = formatDimension(deltaXmm, true) + ', ' + formatDimension(deltaYmm, true);
        }
        //let handle = this.getTransformHandles()[this.activeHandle.id - 1];
        let screenHandle = worldToScreen(this.mouse.x, this.mouse.y);
        //const angle = Math.round((this.transformBox.rotation * 180 / Math.PI) % 360);
        let angle = this.rotation.toFixed(1)
        ctx.save();
        ctx.fillStyle = pointFillColor;
        ctx.font = '12px Arial';
        ctx.fillText(text, screenHandle.x + 10, screenHandle.y - 25);
        ctx.restore();
    }

    drawHandle(handle) {
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



    drawRotation(handle) {

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

    drawTransformBox() {


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



        if (!this.mouseDown) {
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
        if (this.activeHandle && this.activeHandle.type === 'rotate')
            this.drawRotation(handles[4]);

        if (this.mouseDown && this.activeHandle && this.activeHandle.type === 'center')
            this.drawHandle(handles[5]);

        if (!this.mouseDown) {
            handles.forEach(handle => {
                this.drawHandle(handle);
            });


        }
        this.drawText();
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
        let ry = 300 * Math.cos(rotationRad);
        let rx = 300 * Math.sin(rotationRad);



        return [
            { id: 1, x: minx, y: miny, type: 'scale', corner: 'tl' },
            { id: 2, x: maxx, y: miny, type: 'scale', corner: 'tr' },
            { id: 3, x: maxx, y: maxy, type: 'scale', corner: 'br' },
            { id: 4, x: minx, y: maxy, type: 'scale', corner: 'bl' },
            { id: 5, x: pivotX + rx, y: pivotY + ry, type: 'rotate' },
            { id: 6, x: pivotX, y: pivotY, type: 'center' },
            { id: 7, x: centerX, y: centerY + 50, type: 'mirrorY' },
            { id: 8, x: centerX + 50, y: centerY, type: 'mirrorX' }
        ];
    }

    getHandleAtPoint(point) {
        const handles = this.getTransformHandles();
        for (let handle of handles) {
            const dx = handle.x - point.x;
            const dy = handle.y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= this.handleSize * 4) {
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
                    <i data-lucide="move"></i>
                    <strong>Center Position</strong><br>
                    X: <span id="move-center-x">${centerXStr}</span><br>
                    Y: <span id="move-center-y">${centerYStr}</span>
                </div>
            `;
        } else {
            centerInfo = `
                <div class="alert alert-info mb-3">
                    <i data-lucide="info"></i>
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
        if (!this.initialTransformBox || this.originalPaths.length === 0) return;

        // Apply transformation to all selected paths
        svgpaths.forEach(path => {
            if (selectMgr.isSelected(path)) {
                const originalPath = this.originalPaths.find(p => p.id === path.id);
                if (originalPath) {
                    // Apply translation, scale, and rotation from properties
                    const centerX = this.initialTransformBox.centerX;
                    const centerY = this.initialTransformBox.centerY;
                    const rotationRad = this.rotation * Math.PI / 180;

                    path.path = originalPath.path.map(pt => {
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
            }
        });

        // Update creation properties to reflect new positions
        this.updateCreationProperties();

        // Update transform box
        if (this.pivotCenter) {
            this.pivotCenter.x = this.originalPivot.x + this.deltaX;
            this.pivotCenter.y = this.originalPivot.y + this.deltaY;
        }
        this.transformBox = this.createTransformBox(svgpaths);

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