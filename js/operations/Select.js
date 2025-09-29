
class Select extends Operation {
    constructor() {
        super('Select', 'fa fa-mouse-pointer');
        this.unselectOnMouseDown = true;
        this.selectionOrder = []; // Track order of path selection
    }


    onMouseUp(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        if (this.selectBox) {
            selectPathsInRect(this.selectBox);
            this.selectBox = null;
        }
    }

    onMouseDown(canvas, evt) {
        this.mouseDown = true;
        var mouse = this.normalizeEvent(canvas, evt);
        this.dragStartX = mouse.x;
        this.dragStartY = mouse.y;
        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        var selectedPath = closestPath(mouse, false);
        if (selectedPath) {
            if (selectedPath.selected) {
                if(this.unselectOnMouseDown)
                {
                    selectedPath.selected = false;
                    unselectSidebarNode(selectedPath.id);

                    // Remove from selection order
                    this.selectionOrder = this.selectionOrder.filter(id => id !== selectedPath.id);

                    // Check if any paths are still selected after deselecting this one
                    const remainingSelectedPaths = svgpaths.filter(path => path.selected);
                    if (remainingSelectedPaths.length === 0) {
                        // Check if Move tool is currently active - if so, don't exit the tool
                        const isMoveToolActive = window.cncController &&
                                               window.cncController.operationManager &&
                                               window.cncController.operationManager.currentOperation &&
                                               window.cncController.operationManager.currentOperation.name === 'Move';

                        if (!isMoveToolActive) {
                            showToolsList();
                        }
                    } else {
                        // Find the most recently selected path that's still selected
                        let mostRecentPath = null;
                        for (let i = this.selectionOrder.length - 1; i >= 0; i--) {
                            const pathId = this.selectionOrder[i];
                            mostRecentPath = svgpaths.find(path => path.id === pathId && path.selected);
                            if (mostRecentPath) break;
                        }

                        if (mostRecentPath) {
                            const drawToolsTab = document.getElementById('draw-tools-tab');
                            const isOnDrawToolsTab = drawToolsTab && drawToolsTab.classList.contains('active');

                            // Check if Move tool is currently active - if so, don't show path properties
                            const isMoveToolActive = window.cncController &&
                                                   window.cncController.operationManager &&
                                                   window.cncController.operationManager.currentOperation &&
                                                   window.cncController.operationManager.currentOperation.name === 'Move';

                            if (isOnDrawToolsTab && mostRecentPath.creationTool && mostRecentPath.creationProperties && !isMoveToolActive) {
                                // Check if this is a draw tool that supports editing
                                if (mostRecentPath.creationTool === 'Text' || mostRecentPath.creationTool === 'Polygon') {
                                    // Show properties editor for the most recently selected path
                                    showPathPropertiesEditor(mostRecentPath);
                                }
                            }
                        }
                    }
                }
            }
            else {
                selectedPath.selected = true;
                selectSidebarNode(selectedPath.id);

                // Add to selection order (remove if already there, then add to end)
                this.selectionOrder = this.selectionOrder.filter(id => id !== selectedPath.id);
                this.selectionOrder.push(selectedPath.id);

                // Check if we're on Operations tab and an operation tool is active
                const operationsTab = document.getElementById('operations-tab');
                const isOnOperationsTab = operationsTab && operationsTab.classList.contains('active');

                if (isOnOperationsTab) {
                    // Check if an operation properties editor is currently shown (operation is active)
                    const operationPropertiesEditor = document.getElementById('operation-properties-editor');
                    const isOperationActive = operationPropertiesEditor && operationPropertiesEditor.style.display !== 'none';

                    if (isOperationActive) {
                        // An operation is active - apply it to the newly selected path
                        const activeOperationTitle = document.getElementById('operation-properties-title');
                        if (activeOperationTitle) {
                            const operationName = activeOperationTitle.textContent.replace(' Operation', '');
                            // Apply the operation to the newly selected path
                            applyOperationToPath(operationName, selectedPath);
                        }
                    }
                } else {
                    // We're on Draw Tools tab - show properties panel if appropriate
                    const drawToolsTab = document.getElementById('draw-tools-tab');
                    const isOnDrawToolsTab = drawToolsTab && drawToolsTab.classList.contains('active');

                    // Check if Move tool is currently active - if so, don't show path properties
                    const isMoveToolActive = window.cncController &&
                                           window.cncController.operationManager &&
                                           window.cncController.operationManager.currentOperation &&
                                           window.cncController.operationManager.currentOperation.name === 'Move';

                    if (isOnDrawToolsTab && selectedPath.creationTool && selectedPath.creationProperties && !isMoveToolActive) {
                        // Check if this is a draw tool that supports editing
                        if (selectedPath.creationTool === 'Text' || selectedPath.creationTool === 'Polygon') {
                            // Show properties editor for this path
                            showPathPropertiesEditor(selectedPath);
                        }
                    }
                }
            }

        } else if (!evt.shiftKey && this.unselectOnMouseDown) {
            unselectAll();
            this.selectionOrder = []; // Clear selection order

            // Check if Move tool is currently active - if so, don't exit the tool
            const isMoveToolActive = window.cncController &&
                                   window.cncController.operationManager &&
                                   window.cncController.operationManager.currentOperation &&
                                   window.cncController.operationManager.currentOperation.name === 'Move';

            if (!isMoveToolActive) {
                showToolsList();
            }
        }
    }
    onMouseMove(canvas, evt, inHandle) {

        var mouse = this.normalizeEvent(canvas, evt);

        if (this.mouseDown && !inHandle) {
            var x = evt.offsetX || (evt.pageX - canvas.offsetLeft);
            var y = evt.offsetY || (evt.pageY - canvas.offsetTop);
            var dx = x - this.rawdragStartX;
            var dy = y - this.rawdragStartY;

            if (Math.abs(dx) < 10 || Math.abs(dy) < 10) return;

            var sx = Math.min(this.dragStartX, mouse.x);
            var ex = Math.max(this.dragStartX, mouse.x);
            var sy = Math.min(this.dragStartY, mouse.y);
            var ey = Math.max(this.dragStartY, mouse.y);
            var rl = this.dragStartX < mouse.x;

            this.selectBox = { minx: sx, miny: sy, maxx: ex, maxy: ey, rl: rl };
            this.highlightPathsInRect(this.selectBox);
        }
        else {
            closestPath(mouse, true);
        }
    }

    onMouseUp(canvas, evt) {
        this.mouseDown = false;
        if (this.selectBox) {
            this.selectPathsInRect(this.selectBox,evt.shiftKey);
            this.selectBox = null;

            // Update selection order for newly selected paths
            const selectedPaths = svgpaths.filter(path => path.selected);
            selectedPaths.forEach(path => {
                // Add to selection order if not already there
                if (!this.selectionOrder.includes(path.id)) {
                    this.selectionOrder.push(path.id);
                }
            });

            // Remove unselected paths from selection order
            this.selectionOrder = this.selectionOrder.filter(id =>
                svgpaths.some(path => path.id === id && path.selected)
            );

            // After drag selection, show properties panel for the selected paths if appropriate
            if (selectedPaths.length > 0) {
                // Find the most recently selected path for properties display
                let pathToShow = null;
                for (let i = this.selectionOrder.length - 1; i >= 0; i--) {
                    const pathId = this.selectionOrder[i];
                    pathToShow = svgpaths.find(path => path.id === pathId && path.selected);
                    if (pathToShow) break;
                }

                // If no path in selection order, use the first selected path
                if (!pathToShow && selectedPaths.length > 0) {
                    pathToShow = selectedPaths[0];
                }

                if (pathToShow) {
                    const drawToolsTab = document.getElementById('draw-tools-tab');
                    const isOnDrawToolsTab = drawToolsTab && drawToolsTab.classList.contains('active');

                    // Check if Move tool is currently active - if so, don't show path properties
                    const isMoveToolActive = window.cncController &&
                                           window.cncController.operationManager &&
                                           window.cncController.operationManager.currentOperation &&
                                           window.cncController.operationManager.currentOperation.name === 'Move';

                    if (isOnDrawToolsTab && pathToShow.creationTool && pathToShow.creationProperties && !isMoveToolActive) {
                        // Check if this is a draw tool that supports editing
                        if (pathToShow.creationTool === 'Text' || pathToShow.creationTool === 'Polygon') {
                            // Show properties editor for this path
                            showPathPropertiesEditor(pathToShow);
                        }
                    }
                }
            }
        }
    }



    draw(ctx) {
        if (this.selectBox) {
            ctx.strokeStyle = 'blue';
            let topLeft = worldToScreen(this.selectBox.minx, this.selectBox.miny);
            let bottomRight = worldToScreen(this.selectBox.maxx, this.selectBox.maxy);
            ctx.strokeRect(
                topLeft.x,
                topLeft.y,
                bottomRight.x - topLeft.x,
                bottomRight.y - topLeft.y
            );
        }
    }

}