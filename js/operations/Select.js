
class Select extends Operation {
    static instance;
    static selected = new Set();  // Use Set to prevent duplicate selections

    static IDLE = 0;
    static DRAGGING = 2;
    static SELECTING = 3;

    static state = Select.IDLE;

    // Magic number constants
    static DRAG_THRESHOLD = 8;              // pixels before drag is detected
    static MIN_DISTANCE_CHECK = 10;         // minimum pixels to register distance

    constructor() {
        super('Select', null);
        this.unselectOnMouseDown = true;
        this.selectionId = 2;
    }

    static getInstance() {
        if (!Select.instance)
            Select.instance = new Select();
        return Select.instance;
    }

    /**
     * Check if there are no selected paths
     * @returns {Boolean} True if no paths are selected
     */
    noSelection() {
        return Select.selected.size === 0;
    }

    /**
     * Check if a path is currently selected
     * @param {Object} path - The path to check
     * @returns {Boolean} True if the path is selected
     */
    isSelected(path) {
        return Select.selected.has(path);
    }

    /**
     * Add a path to the selection set
     * Detects and logs duplicate selection attempts
     * @param {Object} path - The path to select
     */
    selectPath(path) {
        if (Select.selected.has(path)) {

            console.warn(`Duplicate selectPath() call for path: ${path.id}`, new Error().stack);

            return;  // Path already selected, don't add again
        }
        Select.selected.add(path);
        selectSidebarNode(path.id);
        path.highlight = false;
    }

    /**
     * Remove a path from the selection set
     * @param {Object} path - The path to deselect
     */
    unselectPath(path) {
        Select.selected.delete(path);
        path.highlight = false;
        delete path.originalPath;
        unselectSidebarNode(path.id);
    }

    /**
     * Deselect all currently selected paths
     */
    unselectAll() {
        if (Select.selected.size > 0) {
            for (let path of Select.selected) {
                unselectSidebarNode(path.id);
                path.highlight = false;
                delete path.originalPath;
            }
        }
        Select.selected.clear();
    }

    /**
     * Get the first selected path
     * @returns {Object|null} The first selected path, or null if none selected
     */
    firstSelected() {
        if (Select.selected.size > 0) {
            return [...Select.selected][0];
        }
        return null;
    }

    /**
     * Get the last selected path
     * @returns {Object|null} The last selected path, or null if none selected
     */
    lastSelected() {
        if (Select.selected.size > 0) {
            const arr = [...Select.selected];
            return arr[arr.length - 1];
        }
        return null;
    }

    /**
     * Get all selected paths as an array
     * @returns {Array} Array of selected path objects
     */
    selectedPaths() {
        return [...Select.selected];
    }

    /**
     * Select paths that have points within the given bounding box
     * @param {Object} selectBox - Bounding box {minx, miny, maxx, maxy, rl}
     * @param {Boolean} addToSelection - If true, add to existing selection; if false, replace selection
     */

    selectPathsInRect(selectBox, addToSelection) {
      const selectedInThisBox = new Set();  // Track which paths we've processed

      for (let i = 0; i < svgpaths.length; i++) {
          if (!svgpaths[i].visible) continue;
          if (!addToSelection)
              this.unselectPath(svgpaths[i]);

          for (let j = 0; j < svgpaths[i].path.length; j++) {
              const pt = svgpaths[i].path[j];
              if (pointInBoundingBox(pt, selectBox)) {
                  if (!selectedInThisBox.has(svgpaths[i].id)) {
                      this.selectPath(svgpaths[i]);
                      selectedInThisBox.add(svgpaths[i].id);
                  }
              }
          }
      }
  }

    toggleSelection(path, evt) {
        if (path) {
            if (this.isSelected(path)) {
                if (this.unselectOnMouseDown) {
                    this.unselectPath(path);
                }
            }
            else {
                this.selectPath(path);
            }

        } else if (!evt.shiftKey && this.unselectOnMouseDown) {
            this.unselectAll();
        }
        this.showSelection();
    }

    /**
     * Handle mouse down event - prepare for potential drag/select operations
     * State transitions happen in onMouseMove once drag threshold is exceeded
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {MouseEvent} evt - The mouse event
     */
    onMouseDown(canvas, evt) {
        this.mouseDown = true;
        const mouse = this.normalizeEvent(canvas, evt);
        this.dragStartX = mouse.x;
        this.dragStartY = mouse.y;
        this.initialMousePos = mouse;
        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        this.dragPath = null;

        // Don't change state yet - wait for onMouseMove to detect threshold crossing
        // State will transition to DRAGGING or SELECTING when threshold exceeded
    }

    /**
     * Find a path that contains the given point within its bounding box
     * @param {Object} pt - Point {x, y}
     * @returns {Object|null} The path if found, null otherwise
     */
    pointInPath(pt) {
        for (let i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;
            const bbox = svgpaths[i].bbox;
            if (pointInBoundingBox(pt, bbox)) {
                return svgpaths[i];
            }
        }
        return null;
    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        if (this.mouseDown) {
            const thresholdExceeded = Math.abs(this.dragStartX - mouse.x) > Select.DRAG_THRESHOLD || Math.abs(this.dragStartY - mouse.y) > Select.DRAG_THRESHOLD;

            if (thresholdExceeded) {
                // Check if in DRAGGING state
                if (Select.state == Select.DRAGGING) {
                    let dragDeltaX = mouse.x - this.dragStartX;
                    let dragDeltaY = mouse.y - this.dragStartY;

                    if (evt.shiftKey) {
                        // Constrain movement to primary axis (larger delta)
                        if (Math.abs(mouse.x - this.initialMousePos.x) > Math.abs(mouse.y - this.initialMousePos.y)) {
                            dragDeltaY = 0;  // Constrain to X axis
                        } else {
                            dragDeltaX = 0;  // Constrain to Y axis
                        }
                    }
                    this.deltaX += dragDeltaX;
                    this.deltaY += dragDeltaY;

                    if (this.noSelection())
                        this.translate(this.dragPath, dragDeltaX, dragDeltaY);
                    else
                        this.translateSelected(dragDeltaX, dragDeltaY);

                    this.dragStartX = mouse.x;
                    this.dragStartY = mouse.y;
                }
                // Check if in SELECTING state
                else if (Select.state == Select.SELECTING) {
                    const screenX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
                    const screenY = evt.offsetY || (evt.pageY - canvas.offsetTop);
                    const screenDx = screenX - this.rawdragStartX;
                    const screenDy = screenY - this.rawdragStartY;

                    if (Math.abs(screenDx) < Select.MIN_DISTANCE_CHECK || Math.abs(screenDy) < Select.MIN_DISTANCE_CHECK) return;

                    const selectBoxMinX = Math.min(this.dragStartX, mouse.x);
                    const selectBoxMaxX = Math.max(this.dragStartX, mouse.x);
                    const selectBoxMinY = Math.min(this.dragStartY, mouse.y);
                    const selectBoxMaxY = Math.max(this.dragStartY, mouse.y);
                    const isLeftToRight = this.dragStartX < mouse.x;

                    this.selectBox = { minx: selectBoxMinX, miny: selectBoxMinY, maxx: selectBoxMaxX, maxy: selectBoxMaxY, rl: isLeftToRight };
                    this.highlightPathsInRect(this.selectBox);
                }
                // Not yet in a drag state - detect which type of drag to start
                else if (Select.state == Select.IDLE) {
                    // Try to find a path at the start position
                    this.dragPath = closestPath(mouse, false);

                    if (this.dragPath) {
                        if(selectMgr.isSelected(this.dragPath) || selectMgr.noSelection())
                        {
                            // Starting a path drag
                            Select.state = Select.DRAGGING;
                            addUndo(false, true, false);
                        }
                    } else {
                        // Starting a selection box
                        Select.state = Select.SELECTING;

                        const screenX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
                        const screenY = evt.offsetY || (evt.pageY - canvas.offsetTop);
                        const screenDx = screenX - this.rawdragStartX;
                        const screenDy = screenY - this.rawdragStartY;

                        if (Math.abs(screenDx) > Select.MIN_DISTANCE_CHECK || Math.abs(screenDy) > Select.MIN_DISTANCE_CHECK) {
                            const selectBoxMinX = Math.min(this.dragStartX, mouse.x);
                            const selectBoxMaxX = Math.max(this.dragStartX, mouse.x);
                            const selectBoxMinY = Math.min(this.dragStartY, mouse.y);
                            const selectBoxMaxY = Math.max(this.dragStartY, mouse.y);
                            const isLeftToRight = this.dragStartX < mouse.x;

                            this.selectBox = { minx: selectBoxMinX, miny: selectBoxMinY, maxx: selectBoxMaxX, maxy: selectBoxMaxY, rl: isLeftToRight };
                            this.highlightPathsInRect(this.selectBox);
                        }
                    }
                }
            }
        }
        else {
            // Mouse not down - update hover state
            closestPath(mouse, true);
            Select.state = Select.IDLE;
        }
    }

    onMouseUp(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = false;

        // Only toggle selection if we stayed in IDLE (never crossed 8px threshold)
        // If we transitioned to DRAGGING or SELECTING, don't change selection
        if (Select.state == Select.IDLE ) {
            let path = closestPath(mouse, false);
            this.toggleSelection(path, evt);
        }

        // Handle selection box (from SELECTING state)
        if (this.selectBox) {
            this.selectPathsInRect(this.selectBox, evt.shiftKey);
            this.selectBox = null;
        }

        // Clear drag path reference
        this.dragPath = null;

        // Return to IDLE state
        Select.state = Select.IDLE;

        this.showSelection();
    }

    doOperation() {

        // Check if an operation properties editor is currently shown (operation is active)
        const operationPropertiesEditor = document.getElementById('operation-properties-editor');
        const isOperationActive = operationPropertiesEditor && operationPropertiesEditor.style.display !== 'none';

        if (isOperationActive) {
            generateToolpathForSelection();
        }

    }

    showSelection() {
        const operationsTab = document.getElementById('operations-tab');
        const isOnOperationsTab = operationsTab && operationsTab.classList.contains('active');
        const changePanel = !isOnOperationsTab && window.cncController.operationManager.currentOperation.name !== 'Move' &&
            window.cncController.operationManager.currentOperation.name !== 'Boolean';


        let pathToShow = this.lastSelected();

        if (changePanel) {

            if (pathToShow) {
                if (pathToShow.creationTool == "Shape" || pathToShow.creationTool == "Text")
                    showPathPropertiesEditor(pathToShow);
            }
            else {
                showToolsList();
            }
        }

        if (pathToShow) {
            if (isOnOperationsTab)
                this.doOperation();
        }
        redraw();

    }

    translateSelected(dx, dy) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;
            let path = svgpaths[i];
            if (this.isSelected(path)) {

                path.path = path.path.map(pt => ({
                    x: pt.x + dx,
                    y: pt.y + dy
                }));
                path.bbox = boundingBox(path.path);
            }
        }

    }

    translate(path, dx, dy) {
        path.path = path.path.map(pt => ({
            x: pt.x + dx,
            y: pt.y + dy
        }));
        path.bbox = boundingBox(path.path);
     

    }

    draw(ctx) {
        if (this.selectBox) {
            ctx.strokeStyle = selectionBoxColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]); // Dashed line
            let topLeft = worldToScreen(this.selectBox.minx, this.selectBox.miny);
            let bottomRight = worldToScreen(this.selectBox.maxx, this.selectBox.maxy);
            ctx.strokeRect(
                topLeft.x,
                topLeft.y,
                bottomRight.x - topLeft.x,
                bottomRight.y - topLeft.y
            );
            ctx.setLineDash([]);
        }
    }

}