class Line extends Pen {
    constructor() {
        super();
        this.name = 'Line';
        this.icon = 'slash';
        this.tooltip = 'Draw a single line segment. Click once for the start point, click again for the end point, then drag either endpoint to edit it.';
        this.displayName = 'Line';
        this.currentPath = null;
        this.handleHitRadius = 28;

        this.centerXField = {
            key: 'x',
            label: 'X',
            type: 'dimension',
            default: 0,
            persist: false
        };
        this.centerYField = {
            key: 'y',
            label: 'Y',
            type: 'dimension',
            default: 0,
            persist: false
        };
        this.lengthField = {
            key: 'length',
            label: 'Length',
            type: 'dimension',
            default: 40,
            persist: false
        };
        this.angleField = {
            key: 'angle',
            label: 'Angle',
            type: 'number',
            default: 0,
            step: 1,
            persist: false
        };
        this.nameField = {
            key: 'name',
            label: 'Name',
            type: 'text',
            default: '',
            persist: false
        };
        this.lockObjectField = {
            key: 'lockObject',
            label: 'Lock object',
            type: 'checkbox',
            default: false,
            persist: false
        };
        this.fields = {
            x: this.centerXField,
            y: this.centerYField,
            length: this.lengthField,
            angle: this.angleField,
            lockObject: this.lockObjectField,
            name: this.nameField
        };
        this.properties = {
            x: 0,
            y: 0,
            length: 40,
            angle: 0,
            lockObject: false,
            name: ''
        };
        this.previewPath = null;
        this.lineChangedDuringDrag = false;

        this.keydownHandler = (evt) => {
            if (!this.active) return;

            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT'
                || activeElement.tagName === 'TEXTAREA'
                || activeElement.tagName === 'SELECT'
            )) {
                return;
            }

            const previousEditPathId = this.editPath?.id || null;

            if (evt.key === 'Escape') {
                if (this.editPath !== null) {
                    this.editPath = null;
                    redraw();
                } else if (this.nodes.length > 0) {
                    this.nodes = [];
                    this.mousePos = null;
                    redrawOverlay();
                }
            }

            this.syncEditPopup(previousEditPathId);
        };
    }

    onMouseDown(canvas, evt) {
        const previousEditPathId = this.editPath?.id || null;
        const mouse = this.normalizeEvent(canvas, evt);
        const mouseHit = this.normalizeEventWorld(canvas, evt);
        this.mouseDown = true;

        if (this.editPath !== null) {
            this.activeHandle = this._getHandleAt(mouseHit);
            if (this.activeHandle !== null) {
                this.handleWasDragged = false;
                addUndo(false, true, false);
                return;
            }

            const clicked = closestPath(mouse, false);
            if (clicked && clicked.creationTool === this.name && clicked !== this.editPath) {
                this.enterEditMode(clicked);
            } else if (!clicked) {
                this.editPath = null;
                this.currentPath = null;
                this.previewPath = null;
                this.mousePos = null;
                if (typeof showToolsList === 'function') {
                    showToolsList();
                } else {
                    redraw();
                }
            }

            this.syncEditPopup(previousEditPathId);
            return;
        }

        const clicked = closestPath(mouse, false);
        if (clicked && clicked.creationTool === this.name) {
            this.enterEditMode(clicked);
            this.syncEditPopup(previousEditPathId);
            return;
        }

        if (typeof showToolsList === 'function') {
            showToolsList();
        } else {
            redraw();
        }
        this.syncEditPopup(previousEditPathId);
    }

    onMouseMove(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);
        const mouseHit = this.normalizeEventWorld(canvas, evt);

        if (this.editPath !== null) {
            if (this.mouseDown && this.activeHandle !== null) {
                this.handleWasDragged = true;
                this.lineChangedDuringDrag = true;
                const nodes = this.editPath.creationProperties.nodes;
                nodes[this.activeHandle].x = mouse.x;
                nodes[this.activeHandle].y = mouse.y;
                this.editPath.path = this.tessellate(nodes, this.editPath.closed, this.editPath.creationProperties.curveFit);
                this.editPath.bbox = boundingBox(this.editPath.path);
                this.syncPropertiesPanel(this.editPath);
                redraw();
            } else {
                const hoveredHandle = this._getHandleAt(mouseHit);
                const previousHover = this.hoveredHandle;
                this.hoveredHandle = hoveredHandle;
                this.insertPreviewPoint = null;
                canvas.style.cursor = hoveredHandle !== null ? 'pointer' : 'default';

                if (hoveredHandle !== previousHover) {
                    redrawOverlay();
                }
            }
            return;
        }

        this.mousePos = null;
    }

    onMouseUp(canvas, evt) {
        const editedPath = this.editPath;
        const shouldSyncMachining = this.lineChangedDuringDrag;
        super.onMouseUp(canvas, evt);
        this.lineChangedDuringDrag = false;

        if (shouldSyncMachining && editedPath?.toolpathProperties && typeof scheduleShapeMachiningToolpathSync === 'function') {
            scheduleShapeMachiningToolpathSync(editedPath, { createIfMissing: true, delay: 0 });
        }

        this.syncEditPopup(this.editPath?.id || null);
    }

    stop() {
        this.currentPath = null;
        this.previewPath = null;
        this.lineChangedDuringDrag = false;
        super.stop();
    }

    setEditPath(path) {
        if (!path || path.creationTool !== this.name) {
            this.editPath = null;
            this.currentPath = null;
            redraw();
            return;
        }

        this.currentPath = path;
        this.enterEditMode(path);
        this.lineChangedDuringDrag = false;
        this.syncPropertiesPanel(path);
    }

    syncMetadataFromPath(path = this.currentPath) {
        const points = path?.path;
        if (!path || !Array.isArray(points) || points.length < 2) {
            return null;
        }

        const start = points[0];
        const end = points[points.length - 1];
        const centerWorldX = (start.x + end.x) / 2;
        const centerWorldY = (start.y + end.y) / 2;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const stored = { ...(path.creationProperties?.properties || {}) };
        const syncedProperties = {
            x: this.toExternal(centerWorldX),
            y: this.toExternal(centerWorldY),
            length: this.toExternal(Math.hypot(dx, dy)),
            angle: Math.round(Math.atan2(dy, dx) * 180 / Math.PI),
            lockObject: stored.lockObject !== undefined ? (stored.lockObject === true || stored.lockObject === 'true') : !!path.locked,
            name: stored.name !== undefined ? stored.name : (path.name || '')
        };

        path.creationProperties = {
            ...(path.creationProperties || {}),
            nodes: [
                { x: start.x, y: start.y, corner: true },
                { x: end.x, y: end.y, corner: true }
            ],
            closed: false,
            curveFit: 'catmull-rom',
            properties: syncedProperties
        };

        return syncedProperties;
    }

    syncPropertiesPanel(path = this.currentPath) {
        const syncedProperties = this.syncMetadataFromPath(path);
        if (!syncedProperties) {
            return null;
        }

        this.currentPath = path;
        this.properties = {
            ...this.properties,
            ...syncedProperties
        };

        const displayPosition = this.toDisplayPosition(syncedProperties.x, syncedProperties.y);
        PropertiesManager.setValue('x', formatDimension(displayPosition.x, true));
        PropertiesManager.setValue('y', formatDimension(displayPosition.y, true));
        PropertiesManager.setValue('length', formatDimension(syncedProperties.length, true));
        PropertiesManager.setValue('angle', syncedProperties.angle);
        PropertiesManager.setValue('lockObject', syncedProperties.lockObject);
        PropertiesManager.setValue('name', syncedProperties.name);

        return syncedProperties;
    }

    _getHandleAt(mouse) {
        if (!this.editPath || !this.editPath.creationProperties) return null;

        const nodes = this.editPath.creationProperties.nodes;
        let closest = null;
        let closestDist = Math.max(this.handleHitRadius, this.handleSize + 4) / zoomLevel;

        for (let i = 0; i < nodes.length; i++) {
            const dx = nodes[i].x - mouse.x;
            const dy = nodes[i].y - mouse.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= closestDist) {
                closest = i;
                closestDist = distance;
            }
        }

        return closest;
    }

    toInternal(value) {
        return value * viewScale;
    }

    toExternal(value) {
        return value / viewScale;
    }

    getOriginExternal() {
        return {
            x: typeof origin !== 'undefined' && Number.isFinite(origin.x) ? origin.x / viewScale : 0,
            y: typeof origin !== 'undefined' && Number.isFinite(origin.y) ? origin.y / viewScale : 0
        };
    }

    toDisplayPosition(x, y) {
        if (typeof toMM === 'function') {
            const coords = toMM(this.toInternal(x), this.toInternal(y));
            return { x: coords.x, y: coords.y };
        }

        const originExternal = this.getOriginExternal();
        return {
            x: x - originExternal.x,
            y: originExternal.y - y
        };
    }

    toStoredPosition(x, y) {
        const originExternal = this.getOriginExternal();
        return {
            x: x + originExternal.x,
            y: originExternal.y - y
        };
    }

    getPathShapeProperties(path = this.currentPath) {
        const stored = { ...(path?.creationProperties?.properties || {}) };
        const points = path?.path;
        if (!Array.isArray(points) || points.length < 2) {
            return {
                x: stored.x ?? 0,
                y: stored.y ?? 0,
                length: stored.length ?? 40,
                angle: Math.round(Number(stored.angle) || 0),
                lockObject: stored.lockObject === true || stored.lockObject === 'true',
                name: stored.name ?? (path?.name || '')
            };
        }

        const start = points[0];
        const end = points[points.length - 1];
        const centerWorldX = (start.x + end.x) / 2;
        const centerWorldY = (start.y + end.y) / 2;
        const dx = end.x - start.x;
        const dy = end.y - start.y;

        return {
            x: stored.x !== undefined ? stored.x : this.toExternal(centerWorldX),
            y: stored.y !== undefined ? stored.y : this.toExternal(centerWorldY),
            length: stored.length !== undefined ? stored.length : this.toExternal(Math.hypot(dx, dy)),
            angle: stored.angle !== undefined
                ? Math.round(Number(stored.angle) || 0)
                : Math.round(Math.atan2(dy, dx) * 180 / Math.PI),
            lockObject: stored.lockObject !== undefined ? (stored.lockObject === true || stored.lockObject === 'true') : !!path?.locked,
            name: stored.name !== undefined ? stored.name : (path?.name || '')
        };
    }

    renderGeometryFields(pathProperties = null) {
        const values = pathProperties || this.getPathShapeProperties(this.currentPath);
        const displayPosition = this.toDisplayPosition(values.x, values.y);
        return `
            <h5 class="mt-3 mb-2">Position</h5>
            ${PropertiesManager.fieldHTML(this.centerXField, displayPosition.x)}
            ${PropertiesManager.fieldHTML(this.centerYField, displayPosition.y)}
            <h5 class="mt-3 mb-2">Size</h5>
            ${PropertiesManager.fieldHTML(this.lengthField, values.length)}
            <h5 class="mt-3 mb-2">Rotation</h5>
            ${PropertiesManager.fieldHTML(this.angleField, values.angle)}
            ${PropertiesManager.fieldHTML(this.lockObjectField, values.lockObject)}
            ${PropertiesManager.fieldHTML(this.nameField, values.name)}
        `;
    }

    update(path) {
        if (!path) return;
        this.syncPropertiesPanel(path);
    }

    updateFromProperties(data, meta = {}) {
        this.onPropertiesChanged(data, meta);
    }

    onPropertiesChanged(data, meta = {}) {
        const currentValues = this.getPathShapeProperties(this.currentPath);
        const rawValues = {
            ...currentValues,
            ...this.properties,
            ...PropertiesManager.collectValues(Object.values(this.fields)),
            ...(data || {})
        };

        if (rawValues.x !== undefined || rawValues.y !== undefined) {
            const displayPosition = this.toDisplayPosition(currentValues.x, currentValues.y);
            const storedPosition = this.toStoredPosition(
                rawValues.x !== undefined ? Number(rawValues.x) : displayPosition.x,
                rawValues.y !== undefined ? Number(rawValues.y) : displayPosition.y
            );
            rawValues.x = storedPosition.x;
            rawValues.y = storedPosition.y;
        }

        rawValues.length = Math.max(0, Number(rawValues.length) || 0);
        rawValues.angle = Number.isFinite(Number(rawValues.angle)) ? Math.round(Number(rawValues.angle)) : 0;
        rawValues.lockObject = rawValues.lockObject === true || rawValues.lockObject === 'true';
        rawValues.name = typeof rawValues.name === 'string' ? rawValues.name.trim() : '';

        this.properties = {
            ...this.properties,
            ...rawValues
        };

        if (this.currentPath) {
            this.updateInPlace(this.currentPath, rawValues);
        }
    }

    updateInPlace(svgPath, values) {
        if (!svgPath) return;

        const centerX = this.toInternal(values.x);
        const centerY = this.toInternal(values.y);
        const halfLength = this.toInternal(values.length) / 2;
        const angleRad = values.angle * Math.PI / 180;
        const dx = Math.cos(angleRad) * halfLength;
        const dy = Math.sin(angleRad) * halfLength;

        const start = { x: centerX - dx, y: centerY - dy, corner: true };
        const end = { x: centerX + dx, y: centerY + dy, corner: true };
        const nodes = [start, end];
        const path = this.tessellate(nodes, false, 'catmull-rom');

        svgPath.path = path;
        svgPath.bbox = boundingBox(path);
        svgPath.name = values.name || svgPath.name || `Line ${svgPath.svgpathId || ''}`.trim();
        svgPath.locked = values.lockObject;
        svgPath.creationProperties = {
            ...(svgPath.creationProperties || {}),
            nodes,
            closed: false,
            curveFit: 'catmull-rom',
            properties: {
                x: values.x,
                y: values.y,
                length: values.length,
                angle: values.angle,
                lockObject: values.lockObject,
                name: values.name
            }
        };

        if (!svgPath.toolpathProperties && window.toolPathProperties?.getDefaultShapeCutProperties) {
            svgPath.toolpathProperties = window.toolPathProperties.getDefaultShapeCutProperties('Profile') || null;
        }

        this.editPath = svgPath;
        this.currentPath = svgPath;

        if (typeof scheduleShapeMachiningToolpathSync === 'function') {
            scheduleShapeMachiningToolpathSync(svgPath, { createIfMissing: true, delay: 0 });
        }

        redraw();
    }

    finishDrawing() {
        super.finishDrawing();
        if (!this.editPath) return;

        const values = this.getPathShapeProperties(this.editPath);
        this.currentPath = this.editPath;
        this.properties = {
            ...this.properties,
            ...values
        };
        this.editPath.creationProperties.properties = {
            x: values.x,
            y: values.y,
            length: values.length,
            angle: values.angle,
            lockObject: values.lockObject,
            name: values.name
        };

        if (!this.editPath.toolpathProperties && window.toolPathProperties?.getDefaultShapeCutProperties) {
            this.editPath.toolpathProperties = window.toolPathProperties.getDefaultShapeCutProperties('Profile') || null;
        }

        if (this.editPath.toolpathProperties && typeof scheduleShapeMachiningToolpathSync === 'function') {
            scheduleShapeMachiningToolpathSync(this.editPath, { createIfMissing: true, delay: 0 });
        }
    }

    createAtCanvasCenter() {
        const canvas = document.getElementById('canvas');
        if (!canvas || typeof screenToWorld !== 'function') return null;

        const center = screenToWorld(canvas.width / 2, canvas.height / 2);
        const halfLength = this.toInternal(this.properties.length || 40) / 2;
        const angleRad = (Number(this.properties.angle) || 0) * Math.PI / 180;
        const dx = Math.cos(angleRad) * halfLength;
        const dy = Math.sin(angleRad) * halfLength;

        this.nodes = [
            { x: center.x - dx, y: center.y - dy, corner: true },
            { x: center.x + dx, y: center.y + dy, corner: true }
        ];
        this.finishDrawing();
        this.previewPath = this.editPath;
        return this.editPath;
    }

    getPropertiesHTML() {
        let status;
        if (this.editPath) {
            status = `Editing: <strong>${this.editPath.name}</strong><br>2 endpoints`;
        } else if (this.nodes.length === 1) {
            status = 'Drawing: start point placed';
        } else {
            status = 'Click to place a start point, then click again to create the line.';
        }

        return `
            <div class="alert alert-info mb-3">
                <strong>Line Tool</strong><br>${status}
            </div>
            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Drawing:</strong><br>
                    • <strong>Click</strong> to place the start point<br>
                    • <strong>Click again</strong> to place the end point<br><br>
                    <strong>Editing:</strong><br>
                    • <strong>Drag</strong> either endpoint to reposition it<br>
                    • <strong>Click</strong> another Line path to edit it<br>
                    • <strong>Click empty space</strong> to start a new line<br>
                    • <strong>Escape</strong> to exit edit mode
                </small>
            </div>`;
    }
}
