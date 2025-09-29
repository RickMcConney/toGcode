class Transform extends Select {
    constructor() {
        super();
        this.name = 'Move';
        this.icon = 'fa fa-arrows';
        this.transformBox = null;
        this.handleSize = 8;
        this.ROTATION_SNAP = Math.PI / 36; // 5 degree snapping
        this.unselectOnMouseDown = true;

        // Transform tracking properties
        this.deltaX = 0;
        this.deltaY = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.rotation = 0; // in degrees
        this.initialTransformBox = null;
        this.originalPaths = [];
    }

    start() {
        super.start();
        this.activeHandle = null;
        this.startAngle = 0;
        this.currentAngle = 0;
        this.transformStartPos = { x: 0, y: 0 };

        // Reset transform tracking values
        this.deltaX = 0;
        this.deltaY = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.rotation = 0;

        if (this.hasSelectedPaths()) {
            this.transformBox = this.createTransformBox(svgpaths);
            this.initialTransformBox = { ...this.transformBox };

            // Store original path positions
            this.originalPaths = svgpaths.map(path => {
                if (path.selected) {
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

        // Refresh properties panel to show the right state
        this.refreshPropertiesPanel();
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

        // If clicking on a handle, don't call parent (prevents deselection)
        if (this.activeHandle) {
            // Ensure initialTransformBox exists when clicking on handle
            if (!this.initialTransformBox && this.transformBox) {
                this.initialTransformBox = { ...this.transformBox };

                // Also store original path positions if missing
                if (this.originalPaths.length === 0) {
                    this.originalPaths = svgpaths.map(path => {
                        if (path.selected) {
                            return {
                                id: path.id,
                                path: path.path.map(pt => ({ x: pt.x, y: pt.y }))
                            };
                        }
                        return null;
                    }).filter(p => p !== null);
                }
            }

            this.transformStartPos = { x: mouse.x, y: mouse.y };
           //canvas.style.cursor = "grabbing";
            addUndo(false, true, false);

            if (this.activeHandle.type === 'rotate') {
                if (!this.initialTransformBox) {
                    return;
                }
                this.startAngle = Math.atan2(
                    mouse.y - this.initialTransformBox.centerY,
                    mouse.x - this.initialTransformBox.centerX
                );
                this.currentAngle = this.rotation * Math.PI / 180; // Convert from degrees
            }

            // Store the initial mouse position for scaling/rotation calculations
            if (this.activeHandle.type === 'scale' || this.activeHandle.type === 'rotate') {
                this.initialMousePos = { x: mouse.x, y: mouse.y };
            }
        } else {
            // If not clicking on a handle, allow normal selection behavior
            super.onMouseDown(canvas, evt);

            // Check if selection changed and update transform box accordingly
            const hadTransformBox = !!this.transformBox;
            if (this.hasSelectedPaths() && !this.transformBox) {
                this.transformBox = this.createTransformBox(svgpaths);
                this.initialTransformBox = { ...this.transformBox };

                // Store original path positions for transformation reference
                this.originalPaths = svgpaths.map(path => {
                    if (path.selected) {
                        return {
                            id: path.id,
                            path: path.path.map(pt => ({ x: pt.x, y: pt.y }))
                        };
                    }
                    return null;
                }).filter(p => p !== null);

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
                this.refreshPropertiesPanel();
            }
        }
    }

    onMouseMove(canvas, evt) {
        super.onMouseMove(canvas, evt,this.activeHandle !== null);
        var mouse = this.normalizeEvent(canvas, evt);
        if (!this.mouseDown)
            this.activeHandle = this.getHandleAtPoint(mouse);

        if (this.mouseDown && this.activeHandle) {

            const dx = mouse.x - this.transformStartPos.x;
            const dy = mouse.y - this.transformStartPos.y;

            if (this.activeHandle.type === 'translate') {
                // Handle translation
                svgpaths.forEach(path => {
                    if (path.selected) {
                        path.path = path.path.map(pt => ({
                            x: pt.x + dx,
                            y: pt.y + dy
                        }));
                        path.bbox = boundingBox(path.path);
                    }
                });
                // Update transform box position
                this.transformBox.minx += dx;
                this.transformBox.maxx += dx;
                this.transformBox.miny += dy;
                this.transformBox.maxy += dy;
                this.transformBox.centerX += dx;
                this.transformBox.centerY += dy;

                // Update tracked deltas
                this.deltaX += dx;
                this.deltaY += dy;
            }
            else if (this.activeHandle.type === 'scale') {
                // Check if initialTransformBox is available
                if (!this.initialTransformBox) {
                    return;
                }

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

                svgpaths.forEach(path => {
                    if (path.selected) {
                        const originalPath = this.originalPaths.find(p => p.id === path.id);
                        if (originalPath) {
                            path.path = originalPath.path.map(pt => {
                                // Apply scale first, then rotation, then translation
                                let newX = this.initialTransformBox.centerX + (pt.x - this.initialTransformBox.centerX) * scaleX;
                                let newY = this.initialTransformBox.centerY + (pt.y - this.initialTransformBox.centerY) * scaleY;

                                // Apply rotation if there is any
                                if (this.rotation !== 0) {
                                    const rotationRad = this.rotation * Math.PI / 180;
                                    const dx = newX - this.initialTransformBox.centerX;
                                    const dy = newY - this.initialTransformBox.centerY;
                                    const cos = Math.cos(rotationRad);
                                    const sin = Math.sin(rotationRad);
                                    newX = this.initialTransformBox.centerX + (dx * cos - dy * sin);
                                    newY = this.initialTransformBox.centerY + (dx * sin + dy * cos);
                                }

                                // Apply translation
                                newX += this.deltaX;
                                newY += this.deltaY;

                                return { x: newX, y: newY };
                            });
                            path.bbox = boundingBox(path.path);
                        }
                    }
                });
                this.updateCreationProperties();
                this.transformBox = this.createTransformBox(svgpaths);
            }
            else if (this.activeHandle.type === 'rotate') {
                // Check if initialTransformBox is available
                if (!this.initialTransformBox) {
                    return;
                }

                // Calculate current angle from center to mouse
                const currentAngle = Math.atan2(
                    mouse.y - this.initialTransformBox.centerY,
                    mouse.x - this.initialTransformBox.centerX
                );

                // Calculate rotation difference
                let rotationDelta = currentAngle - this.startAngle;

                // Apply snapping
                rotationDelta = Math.round(rotationDelta / this.ROTATION_SNAP) * this.ROTATION_SNAP;

                // Update tracked rotation value (convert to degrees)
                this.rotation = (this.currentAngle + rotationDelta) * 180 / Math.PI;

                // Rotate all selected paths from their original positions
                svgpaths.forEach(path => {
                    if (path.selected) {
                        const originalPath = this.originalPaths.find(p => p.id === path.id);
                        if (originalPath) {
                            path.path = originalPath.path.map(pt => {
                                // Apply scale first, then rotation, then translation
                                let newX = this.initialTransformBox.centerX + (pt.x - this.initialTransformBox.centerX) * this.scaleX;
                                let newY = this.initialTransformBox.centerY + (pt.y - this.initialTransformBox.centerY) * this.scaleY;

                                // Apply rotation around center
                                const rotationRad = this.rotation * Math.PI / 180;
                                const dx = newX - this.initialTransformBox.centerX;
                                const dy = newY - this.initialTransformBox.centerY;
                                const cos = Math.cos(rotationRad);
                                const sin = Math.sin(rotationRad);
                                newX = this.initialTransformBox.centerX + (dx * cos - dy * sin);
                                newY = this.initialTransformBox.centerY + (dx * sin + dy * cos);

                                // Apply translation
                                newX += this.deltaX;
                                newY += this.deltaY;

                                return { x: newX, y: newY };
                            });
                            path.bbox = boundingBox(path.path);
                        }
                    }
                });
                this.updateCreationProperties();
                this.transformBox = this.createTransformBox(svgpaths);
            }

            this.transformStartPos = { x: mouse.x, y: mouse.y };

            // Update center display in real-time during move operations
            this.updateCenterDisplay();

            redraw();
        }
    }
    onMouseUp(canvas, evt) {
        const hadSelectBox = this.selectBox; // Check if we were doing drag selection
        super.onMouseUp(canvas, evt);
        this.mouseDown = false;
        //canvas.style.cursor = "grab";

        if (this.hasSelectedPaths()) {
            this.transformBox = this.createTransformBox(svgpaths);
            // If we just completed a drag selection, ensure initialTransformBox is created
            if (hadSelectBox && !this.initialTransformBox) {
                this.initialTransformBox = { ...this.transformBox };

                // Store original path positions
                this.originalPaths = svgpaths.map(path => {
                    if (path.selected) {
                        return {
                            id: path.id,
                            path: path.path.map(pt => ({ x: pt.x, y: pt.y }))
                        };
                    }
                    return null;
                }).filter(p => p !== null);
            }
            // Refresh properties panel after drag selection
            if (hadSelectBox) {
                this.refreshPropertiesPanel();
            }
        }
        else{
            this.transformBox = null;
        }
        if (this.activeHandle) {
            // Update final positions
            svgpaths.forEach(path => {
                if (path.selected) {
                    path.bbox = boundingBox(path.path);
                }
            });

            // Reset transform state
            if (this.activeHandle.type === 'rotate') {
                this.currentAngle = this.transformBox.rotation;
            }
            this.transformBox = this.createTransformBox(svgpaths);
            this.activeHandle = null;
            this.transformStartPos = null;
            // Update center display after completing move
            this.updateCenterDisplay();
        }
    }

    draw(ctx) {
        super.draw(ctx);
        this.drawTransformBox(ctx);
    }


    hasSelectedPaths() {
        return svgpaths.some(path => path.selected);
    }

    createTransformBox(paths) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // Calculate bounding box for all selected paths
        paths.forEach(path => {
            if (path.selected) {
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

    drawRotationAngle() {
        if (!this.transformBox || !this.activeHandle || this.activeHandle.type !== 'rotate') return;

        const angle = Math.round((this.transformBox.rotation * 180 / Math.PI) % 360);
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.fillText(`${angle}°`, this.transformBox.centerX + 10, this.transformBox.miny - 25);
        ctx.restore();
    }

    drawTransformBox() {
        if (!this.transformBox) return;

        ctx.save();
        ctx.strokeStyle = 'blue';
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
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.stroke();

        // Draw handles (convert handle positions to screen coordinates)
        const handles = this.getTransformHandles();
        handles.forEach(handle => {
            let screenHandle = worldToScreen(handle.x, handle.y);
            ctx.beginPath();
            if (handle.type === 'rotate') {
                ctx.arc(screenHandle.x, screenHandle.y, this.handleSize / 2, 0, Math.PI * 2);
            } else {
                ctx.rect(screenHandle.x - this.handleSize / 2, screenHandle.y - this.handleSize / 2,
                    this.handleSize, this.handleSize);
            }
            ctx.fillStyle = 'blue';
            if (this.activeHandle)
                ctx.fillStyle = handle.id == this.activeHandle.id ? highlightColor : 'blue';
            ctx.fill();
            ctx.stroke();
        });
        this.drawRotationAngle();
        ctx.restore();
    }

    getTransformHandles() {
        if (!this.transformBox) return [];

        const { minx, miny, maxx, maxy, centerX, centerY } = this.transformBox;

        return [
            { id: 1, x: minx, y: miny, type: 'scale', corner: 'tl' },
            { id: 2, x: maxx, y: miny, type: 'scale', corner: 'tr' },
            { id: 3, x: maxx, y: maxy, type: 'scale', corner: 'br' },
            { id: 4, x: minx, y: maxy, type: 'scale', corner: 'bl' },
            { id: 5, x: centerX, y: miny - 20, type: 'rotate' },
            { id: 6, x: centerX, y: centerY, type: 'translate' }
        ];
    }

    getHandleAtPoint(point) {
        const handles = this.getTransformHandles();
        for (let handle of handles) {
            const dx = handle.x - point.x;
            const dy = handle.y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= this.handleSize) {
                return handle;
            }
        }
        return null;
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        const hasSelectedPaths = this.hasSelectedPaths();
        const disabled = hasSelectedPaths ? '' : 'disabled';

        // Show center position only if we have a transform box
        let centerInfo = '';
        if (this.transformBox) {
            const centerMM = toMM(this.transformBox.centerX, this.transformBox.centerY);
            centerInfo = `
                <div class="alert alert-info mb-3">
                    <i data-lucide="move"></i>
                    <strong>Center Position</strong><br>
                    X: <span id="move-center-x">${centerMM.x.toFixed(2)}</span> mm<br>
                    Y: <span id="move-center-y">${centerMM.y.toFixed(2)}</span> mm
                </div>
            `;
        } else {
            centerInfo = `
                <div class="alert alert-info mb-3">
                    <i data-lucide="info"></i>
                    <strong>Move Tool</strong><br>
                    Select objects to see their center position and apply transformations.
                </div>
            `;
        }

        return centerInfo + `
            <div class="mb-3">
                <label class="form-label"><strong>Translation</strong></label>
                <div class="row">
                    <div class="col-6">
                        <label for="move-delta-x" class="form-label">Delta X (mm)</label>
                        <input type="number" class="form-control" id="move-delta-x" name="deltaX"
                               value="${(this.deltaX / viewScale).toFixed(2)}" step="0.1" ${disabled}>
                    </div>
                    <div class="col-6">
                        <label for="move-delta-y" class="form-label">Delta Y (mm)</label>
                        <input type="number" class="form-control" id="move-delta-y" name="deltaY"
                               value="${(-this.deltaY / viewScale).toFixed(2)}" step="0.1" ${disabled}>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <label class="form-label"><strong>Scale</strong></label>
                <div class="row">
                    <div class="col-6">
                        <label for="move-scale-x" class="form-label">Scale X</label>
                        <input type="number" class="form-control" id="move-scale-x" name="scaleX"
                               value="${this.scaleX.toFixed(3)}" step="0.01" min="0.1" max="10" ${disabled}>
                    </div>
                    <div class="col-6">
                        <label for="move-scale-y" class="form-label">Scale Y</label>
                        <input type="number" class="form-control" id="move-scale-y" name="scaleY"
                               value="${this.scaleY.toFixed(3)}" step="0.01" min="0.1" max="10" ${disabled}>
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
                        'Drag the center handle to move, corner handles to scale, or the top handle to rotate. Changes in the canvas update these values, and changing these values applies to the selected objects.' :
                        'Select objects first, then drag the center handle to move, corner handles to scale, or the top handle to rotate.'
                    }
                </small>
            </div>
        `;
    }

    updateFromProperties(data) {
        this.properties = { ...this.properties, ...data };

        // Apply property changes to transform values
        if (data.deltaX !== undefined) this.deltaX = parseFloat(data.deltaX) * viewScale;
        if (data.deltaY !== undefined) this.deltaY = -parseFloat(data.deltaY) * viewScale;  // Flip Y for CNC coordinates
        if (data.scaleX !== undefined) this.scaleX = parseFloat(data.scaleX);
        if (data.scaleY !== undefined) this.scaleY = parseFloat(data.scaleY);
        if (data.rotation !== undefined) this.rotation = parseFloat(data.rotation);

        // Apply transformation to paths based on current property values
        if (this.hasSelectedPaths()) {
            this.applyTransformFromProperties();
            this.updateCenterDisplay();
        }
    }

    updateCenterDisplay() {
        if (!this.transformBox) return;

        // Convert center coordinates from pixels to mm
        const centerMM = toMM(this.transformBox.centerX, this.transformBox.centerY);

        // Update the display elements if they exist, but avoid updating the currently focused element
        const activeElement = document.activeElement;

        const centerXElement = document.getElementById('move-center-x');
        const centerYElement = document.getElementById('move-center-y');
        const deltaXElement = document.getElementById('move-delta-x');
        const deltaYElement = document.getElementById('move-delta-y');
        const scaleXElement = document.getElementById('move-scale-x');
        const scaleYElement = document.getElementById('move-scale-y');
        const rotationElement = document.getElementById('move-rotation');

        if (centerXElement) {
            centerXElement.textContent = centerMM.x.toFixed(2);
        }
        if (centerYElement) {
            centerYElement.textContent = centerMM.y.toFixed(2);
        }

        // Only update input fields if they're not currently being edited
        if (deltaXElement && deltaXElement !== activeElement) {
            deltaXElement.value = (this.deltaX / viewScale).toFixed(2);
        }
        if (deltaYElement && deltaYElement !== activeElement) {
            deltaYElement.value = (-this.deltaY / viewScale).toFixed(2);
        }
        if (scaleXElement && scaleXElement !== activeElement) {
            scaleXElement.value = this.scaleX.toFixed(3);
        }
        if (scaleYElement && scaleYElement !== activeElement) {
            scaleYElement.value = this.scaleY.toFixed(3);
        }
        if (rotationElement && rotationElement !== activeElement) {
            rotationElement.value = this.rotation.toFixed(1);
        }
    }

    applyTransformFromProperties() {
        if (!this.initialTransformBox || this.originalPaths.length === 0) return;

        // Apply transformation to all selected paths
        svgpaths.forEach(path => {
            if (path.selected) {
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
                            const dx = newX - centerX;
                            const dy = newY - centerY;
                            const cos = Math.cos(rotationRad);
                            const sin = Math.sin(rotationRad);
                            newX = centerX + (dx * cos - dy * sin);
                            newY = centerY + (dx * sin + dy * cos);
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
        this.transformBox = this.createTransformBox(svgpaths);
        redraw();
    }

    updateCreationProperties() {
        // Update creation properties for all selected paths to reflect their new positions
        svgpaths.forEach(path => {
            if (path.selected && path.creationProperties) {
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