class PatternOpp extends Select {
    constructor() {
        super('Pattern', 'grid-3x3');
        this.name = 'Pattern';
        this.icon = 'grid-3x3';
        this.tooltip = 'Create linear or circular arrays of selected paths';
        this.properties = {
            type: 'linear',
            rows: 1,
            cols: 2,
            spacingX: 50,
            spacingY: 50,
            count: 6,
            radius: 50,
            startAngle: 0,
            fullCircle: true,
            endAngle: 360,
            rotateItems: true
        };
        this.currentPath = null;
        this.generatedIds = [];
        this.sourceIds = [];
        this.groupId = null;
    }

    applyPattern() {
        var selected = selectMgr.selectedPaths();
        if (selected.length === 0) {
            notify("Select at least one path to pattern");
            return;
        }

        var patternType = document.getElementById('pattern-type').value;

        // Determine source paths
        var sourcePaths;
        var isReapply = this.currentPath && this.currentPath.creationTool === 'Pattern' && this.currentPath.creationProperties.sourceIds;
        if (isReapply) {
            var srcIds = this.currentPath.creationProperties.sourceIds;
            sourcePaths = svgpaths.filter(p => srcIds.includes(p.id));
            if (sourcePaths.length === 0) sourcePaths = selected;
        } else {
            sourcePaths = selected;
        }

        var sourceIds = sourcePaths.map(p => p.id);
        addUndo(false, true, false, sourceIds);

        this.readPropertiesFromForm(patternType);

        // Generate new path data
        var pathDataList = [];
        if (patternType === 'linear') {
            pathDataList = this.generateLinearPaths(sourcePaths);
        } else {
            pathDataList = this.generateCircularPaths(sourcePaths);
        }

        var creationProps = {
            type: patternType,
            sourceIds: sourceIds,
            rows: this.properties.rows,
            cols: this.properties.cols,
            spacingX: this.properties.spacingX,
            spacingY: this.properties.spacingY,
            count: this.properties.count,
            radius: this.properties.radius,
            startAngle: this.properties.startAngle,
            fullCircle: this.properties.fullCircle,
            endAngle: this.properties.endAngle,
            rotateItems: this.properties.rotateItems
        };

        // Get existing generated paths to reuse
        var existingIds = isReapply ? this.generatedIds : [];
        var existingPaths = existingIds.map(id => svgpaths.find(p => p.id === id)).filter(Boolean);

        var newGeneratedIds = [];
        var groupId = this.groupId || ('pattern-group-' + svgpathId);

        for (var i = 0; i < pathDataList.length; i++) {
            if (i < existingPaths.length) {
                // Update existing path in-place
                existingPaths[i].path = pathDataList[i].path;
                existingPaths[i].bbox = boundingBox(pathDataList[i].path);
                existingPaths[i].creationProperties = creationProps;
                existingPaths[i].patternGroupId = groupId;
                newGeneratedIds.push(existingPaths[i].id);
            } else {
                // Create new path
                var svgPath = {
                    id: 'Pattern' + svgpathId,
                    type: 'path',
                    name: 'Pattern ' + svgpathId,
                    visible: true,
                    selected: false,
                    closed: pathDataList[i].closed,
                    path: pathDataList[i].path,
                    bbox: boundingBox(pathDataList[i].path),
                    creationTool: 'Pattern',
                    creationProperties: creationProps,
                    patternGroupId: groupId
                };
                svgpaths.push(svgPath);
                newGeneratedIds.push(svgPath.id);
                svgpathId++;
            }
        }

        // Remove excess old paths if fewer needed now
        for (var i = pathDataList.length; i < existingPaths.length; i++) {
            var idx = svgpaths.indexOf(existingPaths[i]);
            if (idx >= 0) svgpaths.splice(idx, 1);
        }

        this.generatedIds = newGeneratedIds;
        this.sourceIds = sourceIds;
        this.groupId = groupId;

        // Update currentPath reference for future re-edits
        if (newGeneratedIds.length > 0) {
            this.currentPath = svgpaths.find(p => p.id === newGeneratedIds[0]);
        }

        // Rebuild sidebar group (remove old, add fresh)
        var groupName = patternType === 'linear'
            ? `${this.properties.cols}x${this.properties.rows} Grid`
            : `${this.properties.count}x Circular`;
        var groupPaths = newGeneratedIds.map(id => svgpaths.find(p => p.id === id)).filter(Boolean);

        // Remove old sidebar group first
        var el = document.querySelector(`[data-pattern-group-id="${groupId}"]`);
        if (el) el.remove();

        addPatternGroup(groupId, groupName, 'grid-3x3', groupPaths, 'Pattern');

        // Select the source paths, not the generated ones
        selectMgr.unselectAll();
        for (var i = 0; i < sourcePaths.length; i++) {
            selectMgr.selectPath(sourcePaths[i]);
        }

        redraw();
    }

    readPropertiesFromForm(patternType) {
        if (patternType === 'linear') {
            this.properties.type = 'linear';
            this.properties.rows = parseInt(document.getElementById('pattern-rows').value) || 1;
            this.properties.cols = parseInt(document.getElementById('pattern-cols').value) || 1;
            this.properties.spacingX = parseDimension(document.getElementById('pattern-spacing-x').value);
            this.properties.spacingY = parseDimension(document.getElementById('pattern-spacing-y').value);
        } else {
            this.properties.type = 'circular';
            this.properties.count = parseInt(document.getElementById('pattern-count').value) || 4;
            this.properties.radius = parseDimension(document.getElementById('pattern-radius').value);
            this.properties.startAngle = parseFloat(document.getElementById('pattern-start-angle').value) || 0;
            this.properties.fullCircle = document.getElementById('pattern-full-circle').checked;
            this.properties.endAngle = this.properties.fullCircle ? 360 : (parseFloat(document.getElementById('pattern-end-angle').value) || 360);
            this.properties.rotateItems = document.getElementById('pattern-rotate-items').checked;
        }
    }

    // Returns array of { path: [{x,y}...], closed: bool }
    generateLinearPaths(sourcePaths) {
        var rows = this.properties.rows;
        var cols = this.properties.cols;
        var spacingXWorld = this.properties.spacingX * viewScale;
        var spacingYWorld = this.properties.spacingY * viewScale;
        var result = [];

        for (var s = 0; s < sourcePaths.length; s++) {
            var srcPath = sourcePaths[s].path;
            for (var row = 0; row < rows; row++) {
                for (var col = 0; col < cols; col++) {
                    if (row === 0 && col === 0) continue;
                    var dx = col * spacingXWorld;
                    var dy = row * spacingYWorld;
                    var newPath = [];
                    for (var i = 0; i < srcPath.length; i++) {
                        newPath.push({ x: srcPath[i].x + dx, y: srcPath[i].y + dy });
                    }
                    result.push({ path: newPath, closed: sourcePaths[s].closed });
                }
            }
        }
        return result;
    }

    generateCircularPaths(sourcePaths) {
        var count = this.properties.count;
        var radiusWorld = this.properties.radius * viewScale;
        var startAngle = this.properties.startAngle;
        var fullCircle = this.properties.fullCircle;
        var endAngle = this.properties.endAngle;
        var rotateItems = this.properties.rotateItems;

        var angleSpan = fullCircle ? 360 : (endAngle - startAngle);
        var angleStep = angleSpan / (fullCircle ? count : Math.max(count - 1, 1));
        var result = [];

        for (var s = 0; s < sourcePaths.length; s++) {
            var srcPath = sourcePaths[s].path;
            var srcBbox = sourcePaths[s].bbox;
            var srcCenterX = (srcBbox.minx + srcBbox.maxx) / 2;
            var srcCenterY = (srcBbox.miny + srcBbox.maxy) / 2;

            for (var n = 1; n < count; n++) {
                var angle = startAngle + n * angleStep;
                var angleRad = angle * Math.PI / 180;
                var dx = radiusWorld * Math.cos(angleRad) - radiusWorld * Math.cos(startAngle * Math.PI / 180);
                var dy = radiusWorld * Math.sin(angleRad) - radiusWorld * Math.sin(startAngle * Math.PI / 180);

                var newPath = [];
                for (var i = 0; i < srcPath.length; i++) {
                    var px = srcPath[i].x;
                    var py = srcPath[i].y;
                    if (rotateItems) {
                        var rx = px - srcCenterX;
                        var ry = py - srcCenterY;
                        var rotAngle = n * angleStep * Math.PI / 180;
                        px = srcCenterX + rx * Math.cos(rotAngle) - ry * Math.sin(rotAngle);
                        py = srcCenterY + rx * Math.sin(rotAngle) + ry * Math.cos(rotAngle);
                    }
                    newPath.push({ x: px + dx, y: py + dy });
                }
                result.push({ path: newPath, closed: sourcePaths[s].closed });
            }
        }
        return result;
    }

    setEditPath(path) {
        this.currentPath = path;
        if (path && path.creationProperties) {
            this.loadPropertiesFromPath(path);
            // Collect all pattern paths in same group for in-place updates
            if (path.patternGroupId) {
                this.groupId = path.patternGroupId;
                this.generatedIds = svgpaths
                    .filter(p => p.patternGroupId === path.patternGroupId)
                    .map(p => p.id);
            }
            if (path.creationProperties.sourceIds) {
                this.sourceIds = path.creationProperties.sourceIds;
            }
        }
    }

    update(path) {
        if (path && path.creationProperties) {
            this.loadPropertiesFromPath(path);
        }
    }

    loadPropertiesFromPath(path) {
        var cp = path.creationProperties;
        this.properties.type = cp.type || 'linear';
        this.properties.rows = cp.rows || 1;
        this.properties.cols = cp.cols || 2;
        this.properties.spacingX = cp.spacingX || 50;
        this.properties.spacingY = cp.spacingY || 50;
        this.properties.count = cp.count || 6;
        this.properties.radius = cp.radius || 50;
        this.properties.startAngle = cp.startAngle || 0;
        this.properties.fullCircle = cp.fullCircle !== false;
        this.properties.endAngle = cp.endAngle || 360;
        this.properties.rotateItems = cp.rotateItems !== false;
    }

    getEditPropertiesHTML(path) {
        return this.getPropertiesHTML(path);
    }

    getPropertiesHTML(path) {
        var type = this.properties.type || 'linear';
        var rows = this.properties.rows || 1;
        var cols = this.properties.cols || 2;
        var spacingX = formatDimension(this.properties.spacingX, true);
        var spacingY = formatDimension(this.properties.spacingY, true);
        var count = this.properties.count || 6;
        var radius = formatDimension(this.properties.radius, true);
        var startAngle = this.properties.startAngle || 0;
        var fullCircle = this.properties.fullCircle !== false;
        var endAngle = this.properties.endAngle || 360;
        var rotateItems = this.properties.rotateItems !== false;
        var linearDisplay = type === 'linear' ? 'block' : 'none';
        var circularDisplay = type === 'circular' ? 'block' : 'none';
        var endAngleDisplay = fullCircle ? 'none' : 'block';

        return `
            <div class="alert alert-info mb-3">
                <strong>Pattern Tool</strong><br>
                Create linear or circular arrays of selected paths
            </div>
            <div class="mb-3">
                <label for="pattern-type" class="form-label small"><strong>Pattern Type:</strong></label>
                <select class="form-select form-select-sm" id="pattern-type" name="type">
                    <option value="linear" ${type === 'linear' ? 'selected' : ''}>Linear Grid</option>
                    <option value="circular" ${type === 'circular' ? 'selected' : ''}>Circular Array</option>
                </select>
            </div>

            <div id="linear-properties" style="display: ${linearDisplay};">
                <div class="mb-3">
                    <label for="pattern-cols" class="form-label small"><strong>Columns:</strong></label>
                    <input type="number" class="form-control form-control-sm" id="pattern-cols" name="cols" value="${cols}" min="1" max="100">
                </div>
                <div class="mb-3">
                    <label for="pattern-rows" class="form-label small"><strong>Rows:</strong></label>
                    <input type="number" class="form-control form-control-sm" id="pattern-rows" name="rows" value="${rows}" min="1" max="100">
                </div>
                <div class="mb-3">
                    <label for="pattern-spacing-x" class="form-label small"><strong>Spacing X:</strong></label>
                    <input type="text" class="form-control form-control-sm" id="pattern-spacing-x" name="spacingX" value="${spacingX}">
                </div>
                <div class="mb-3">
                    <label for="pattern-spacing-y" class="form-label small"><strong>Spacing Y:</strong></label>
                    <input type="text" class="form-control form-control-sm" id="pattern-spacing-y" name="spacingY" value="${spacingY}">
                </div>
            </div>

            <div id="circular-properties" style="display: ${circularDisplay};">
                <div class="mb-3">
                    <label for="pattern-count" class="form-label small"><strong>Count:</strong></label>
                    <input type="number" class="form-control form-control-sm" id="pattern-count" name="count" value="${count}" min="2" max="100">
                </div>
                <div class="mb-3">
                    <label for="pattern-radius" class="form-label small"><strong>Radius:</strong></label>
                    <input type="text" class="form-control form-control-sm" id="pattern-radius" name="radius" value="${radius}">
                </div>
                <div class="mb-3">
                    <label for="pattern-start-angle" class="form-label small"><strong>Start Angle:</strong></label>
                    <input type="number" class="form-control form-control-sm" id="pattern-start-angle" name="startAngle" value="${startAngle}" min="0" max="360">
                </div>
                <div class="mb-3 form-check">
                    <input type="checkbox" class="form-check-input" id="pattern-full-circle" name="fullCircle" ${fullCircle ? 'checked' : ''}>
                    <label class="form-check-label small" for="pattern-full-circle">Full Circle</label>
                </div>
                <div id="end-angle-group" style="display: ${endAngleDisplay};" class="mb-3">
                    <label for="pattern-end-angle" class="form-label small"><strong>End Angle:</strong></label>
                    <input type="number" class="form-control form-control-sm" id="pattern-end-angle" name="endAngle" value="${endAngle}" min="0" max="360">
                </div>
                <div class="mb-3 form-check">
                    <input type="checkbox" class="form-check-input" id="pattern-rotate-items" name="rotateItems" ${rotateItems ? 'checked' : ''}>
                    <label class="form-check-label small" for="pattern-rotate-items">Rotate Items</label>
                </div>
            </div>

            <div class="mb-3">
                <button type="button" class="btn btn-primary btn-sm w-100" id="pattern-apply-button" onclick="cncController.operationManager.currentOperation.applyPattern()">
                    <i data-lucide="check"></i> Apply Pattern
                </button>
                <div class="form-text small">Select paths, configure pattern, then click Apply</div>
            </div>
        `;
    }

    onPropertiesChanged(data) {
        if (data.type !== undefined) {
            this.properties.type = data.type;
            var linearEl = document.getElementById('linear-properties');
            var circularEl = document.getElementById('circular-properties');
            if (linearEl) linearEl.style.display = data.type === 'linear' ? 'block' : 'none';
            if (circularEl) circularEl.style.display = data.type === 'circular' ? 'block' : 'none';
        }
        if (data.rows !== undefined) this.properties.rows = parseInt(data.rows) || 1;
        if (data.cols !== undefined) this.properties.cols = parseInt(data.cols) || 1;
        if (data.spacingX !== undefined) {
            this.properties.spacingX = parseDimension(data.spacingX);
            var el = document.getElementById('pattern-spacing-x');
            if (el) el.value = formatDimension(this.properties.spacingX, true);
        }
        if (data.spacingY !== undefined) {
            this.properties.spacingY = parseDimension(data.spacingY);
            var el = document.getElementById('pattern-spacing-y');
            if (el) el.value = formatDimension(this.properties.spacingY, true);
        }
        if (data.count !== undefined) this.properties.count = parseInt(data.count) || 4;
        if (data.radius !== undefined) {
            this.properties.radius = parseDimension(data.radius);
            var el = document.getElementById('pattern-radius');
            if (el) el.value = formatDimension(this.properties.radius, true);
        }
        if (data.startAngle !== undefined) this.properties.startAngle = parseFloat(data.startAngle) || 0;
        if (data.fullCircle !== undefined) {
            this.properties.fullCircle = data.fullCircle === true || data.fullCircle === 'true' || data.fullCircle === 'on';
            var endAngleGroup = document.getElementById('end-angle-group');
            if (endAngleGroup) endAngleGroup.style.display = this.properties.fullCircle ? 'none' : 'block';
        }
        if (data.endAngle !== undefined) this.properties.endAngle = parseFloat(data.endAngle) || 360;
        if (data.rotateItems !== undefined) {
            this.properties.rotateItems = data.rotateItems === true || data.rotateItems === 'true' || data.rotateItems === 'on';
        }

        super.onPropertiesChanged(data);
    }

    stop() {
        this.currentPath = null;
        this.generatedIds = [];
        this.sourceIds = [];
        this.groupId = null;
    }
}
