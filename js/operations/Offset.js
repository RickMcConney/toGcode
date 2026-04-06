class OffsetOpp extends Select {
    constructor() {
        super('Offset', 'fullscreen');
        this.name = 'Offset';
        this.icon = 'fullscreen';
        this.tooltip = 'Create an offset copy of selected paths (inward or outward)';
        this.fields = {
            distance:  { key: 'distance',  label: 'Distance',     type: 'dimension', default: 5 },
            direction: { key: 'direction', label: 'Direction',    type: 'choice',    default: 'outside',
                         options: [{ value: 'outside', label: 'Outside (expand)' }, { value: 'inside', label: 'Inside (shrink)' }] },
            joinType:  { key: 'joinType',  label: 'Corner Style', type: 'choice',    default: 'round',
                         options: [{ value: 'round', label: 'Round' }, { value: 'miter', label: 'Miter (sharp)' }, { value: 'square', label: 'Square' }] }
        };

        this.properties = {
            distance: 5,
            direction: 'outside',
            joinType: 'round'
        };
        this.currentPath = null;
        this.generatedIds = [];
        this.sourceIds = [];
    }

    applyOffset() {
        var selected = selectMgr.selectedPaths();
        if (selected.length === 0) {
            notify("Select at least one path to offset");
            return;
        }

        const formValues = PropertiesManager.collectValues(Object.values(this.fields));
        var distanceMM = formValues.distance;
        var direction  = formValues.direction;
        var joinType   = formValues.joinType;

        if (distanceMM <= 0) {
            notify("Offset distance must be greater than 0");
            return;
        }

        this.properties.distance = distanceMM;
        this.properties.direction = direction;
        this.properties.joinType = joinType;

        var distanceWorld = distanceMM * viewScale;
        var joinEnum;
        switch (joinType) {
            case 'round': joinEnum = ClipperLib.JoinType.jtRound; break;
            case 'miter': joinEnum = ClipperLib.JoinType.jtMiter; break;
            case 'square': joinEnum = ClipperLib.JoinType.jtSquare; break;
            default: joinEnum = ClipperLib.JoinType.jtRound;
        }

        // Determine source paths: stored sources when re-editing, otherwise current selection
        var sourcePaths;
        var isReapply = this.currentPath && this.currentPath.creationTool === 'Offset' && this.currentPath.creationProperties.sourceIds;
        if (isReapply) {
            var srcIds = this.currentPath.creationProperties.sourceIds;
            sourcePaths = svgpaths.filter(p => srcIds.includes(p.id));
            if (sourcePaths.length === 0) sourcePaths = selected;
        } else {
            sourcePaths = selected;
        }

        var sourceIds = sourcePaths.map(p => p.id);
        addUndo(false, true, false, sourceIds);

        // Generate offset geometry
        var allSolutions = [];
        for (var i = 0; i < sourcePaths.length; i++) {
            var srcPath = sourcePaths[i].path;
            var co = new ClipperLib.ClipperOffset(20, 0.25);
            co.AddPath(srcPath, joinEnum, ClipperLib.EndType.etClosedPolygon);

            var sol = [];
            var delta = direction === 'outside' ? distanceWorld : -distanceWorld;
            co.Execute(sol, delta);

            for (var j = 0; j < sol.length; j++) {
                if (sol[j].length > 0) {
                    sol[j].push(sol[j][0]);
                }
                allSolutions.push(sol[j]);
            }
        }

        var creationProps = {
            distance: distanceMM,
            direction: direction,
            joinType: joinType,
            sourceIds: sourceIds
        };

        // Get existing generated paths to reuse
        var existingIds = isReapply ? this.generatedIds : [];
        var existingPaths = existingIds.map(id => svgpaths.find(p => p.id === id)).filter(Boolean);

        var newGeneratedIds = [];

        for (var i = 0; i < allSolutions.length; i++) {
            if (i < existingPaths.length) {
                // Update existing path in-place
                existingPaths[i].path = allSolutions[i];
                existingPaths[i].bbox = boundingBox(allSolutions[i]);
                existingPaths[i].creationProperties = creationProps;
                newGeneratedIds.push(existingPaths[i].id);
            } else {
                // Need a new path
                var svgPath = {
                    id: 'Offset' + svgpathId,
                    type: 'path',
                    name: 'Offset ' + svgpathId,
                    visible: true,
                    selected: false,
                    closed: true,
                    path: allSolutions[i],
                    bbox: boundingBox(allSolutions[i]),
                    creationTool: 'Offset',
                    creationProperties: creationProps
                };
                svgpaths.push(svgPath);
                addSvgPath(svgPath.id, svgPath.name);
                newGeneratedIds.push(svgPath.id);
                svgpathId++;
            }
        }

        // Remove excess old paths if fewer solutions now
        for (var i = allSolutions.length; i < existingPaths.length; i++) {
            var idx = svgpaths.indexOf(existingPaths[i]);
            if (idx >= 0) svgpaths.splice(idx, 1);
            var el = document.querySelector(`[data-path-id="${existingPaths[i].id}"]`);
            if (el) el.remove();
        }

        this.generatedIds = newGeneratedIds;
        this.sourceIds = sourceIds;

        // Update currentPath reference to first generated path for future re-edits
        if (newGeneratedIds.length > 0) {
            this.currentPath = svgpaths.find(p => p.id === newGeneratedIds[0]);
        }

        // Select the source paths, not the generated ones
        selectMgr.unselectAll();
        for (var i = 0; i < sourcePaths.length; i++) {
            selectMgr.selectPath(sourcePaths[i]);
        }

        redraw();
    }

    setEditPath(path) {
        this.currentPath = path;
        if (path && path.creationProperties) {
            const cp = path.creationProperties;
            this.properties.distance  = cp.distance  ?? 5;
            this.properties.direction = cp.direction ?? 'outside';
            this.properties.joinType  = cp.joinType  ?? 'round';
            if (cp.sourceIds) {
                this.sourceIds = cp.sourceIds;
                this.generatedIds = svgpaths
                    .filter(p => p.creationTool === 'Offset' && p.creationProperties &&
                        p.creationProperties.sourceIds && arraysEqual(p.creationProperties.sourceIds, cp.sourceIds))
                    .map(p => p.id);
            }
        }
    }

    update(path) {
        if (path && path.creationProperties) {
            const cp = path.creationProperties;
            this.properties.distance  = cp.distance  ?? 5;
            this.properties.direction = cp.direction ?? 'outside';
            this.properties.joinType  = cp.joinType  ?? 'round';
        }
    }

    getPropertiesHTML(path) {
        const pathProperties = this.currentPath?.creationProperties ?? null;
        return `
            <div class="alert alert-info mb-3">
                <strong>Offset Tool</strong><br>
                Create an offset copy of selected paths
            </div>
            ${PropertiesManager.formHTML(Object.values(this.fields), pathProperties, this.properties)}
            <div class="mb-3">
                <button type="button" class="btn btn-primary btn-sm w-100" id="offset-apply-button"
                        onclick="cncController.operationManager.currentOperation.applyOffset()">
                    <i data-lucide="check"></i> Apply Offset
                </button>
                <div class="form-text small">Select paths, set distance, then click Apply</div>
            </div>`;
    }

    onPropertiesChanged(data) {
        const values = PropertiesManager.collectValues(Object.values(this.fields));
        this.properties = { ...this.properties, ...values };
        super.onPropertiesChanged(data);
    }

    stop() {
        this.currentPath = null;
        this.generatedIds = [];
        this.sourceIds = [];
    }
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
