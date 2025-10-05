class Workpiece extends Operation {
    constructor() {
        super('Workpiece', 'fa fa-cube');
    }

    // Origin position calculation function
    calculateOriginPosition(position, width, length) {
        // Use the shared global function
        return calculateOriginFromPosition(position, width, length);
    }

    // No mouse interactions needed for workpiece tool
    onMouseDown(canvas, evt) {
        // No canvas interaction needed
    }

    onMouseMove(canvas, evt) {
        // No canvas interaction needed
    }

    onMouseUp(canvas, evt) {
        // No canvas interaction needed
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        // Get current values from options (stored in mm)
        const currentWidth = getOption("workpieceWidth") || 300;
        const currentLength = getOption("workpieceLength") || 200;
        const currentThickness = getOption("workpieceThickness") || 19;
        const currentGridSize = getOption("gridSize") || 10;

        // Check if using inches for display
        const useInches = getOption('Inches');
        const unitLabel = useInches ? 'in' : 'mm';

        // Convert values for display (with fractions in inch mode)
        const displayWidth = formatDimension(currentWidth, useInches, true);
        const displayLength = formatDimension(currentLength, useInches, true);
        const displayThickness = formatDimension(currentThickness, useInches, true);
        const displayGridSize = formatDimension(currentGridSize, useInches, true);

        const currentSpecies = getOption("woodSpecies") || 'Pine';
        const currentOriginPosition = getOption("originPosition") || 'middle-center';
        const currentShowGrid = getOption("showGrid") !== false;
        const currentShowOrigin = getOption("showOrigin") !== false;
        const currentShowWorkpiece = getOption("showWorkpiece") !== false;

        // Generate species dropdown options
        let speciesOptions = '';
        if (typeof woodSpeciesDatabase !== 'undefined') {
            Object.keys(woodSpeciesDatabase).forEach(species => {
                const selected = species === currentSpecies ? 'selected' : '';
                speciesOptions += `<option value="${species}" ${selected}>${species}</option>`;
            });
        }

        return `
            <style>
                .origin-position-grid {
                    max-width: 150px;
                    margin: 0 auto;
                }
                .origin-position-grid .form-check-input {
                    margin: 0;
                    transform: scale(0.8);
                    position: relative;
                }
                .origin-position-grid .grid-cell {
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid #dee2e6;
                    background-color: #f8f9fa;
                    border-radius: 4px;
                    padding: 8px;
                    min-height: 30px;
                }
                .origin-position-grid .grid-cell:hover {
                    background-color: #e9ecef;
                    cursor: pointer;
                }
                .origin-position-grid .form-check-input:checked + .grid-cell,
                .origin-position-grid .grid-cell:has(.form-check-input:checked) {
                    background-color: #cfe2ff;
                    border-color: #0d6efd;
                }
                .origin-position-grid .grid-cell {
                    cursor: pointer;
                }
            </style>

            <div class="alert alert-info mb-3">
                <i data-lucide="package"></i>
                <strong>Workpiece Setup</strong><br>
                Configure your workpiece dimensions and material properties
            </div>

            <div class="row mb-3">
                <div class="col-md-6">
                    <label for="workpieceWidth" class="form-label">Width (${unitLabel})</label>
                    <input type="text" class="form-control" id="workpieceWidth" name="workpieceWidth"
                           value="${displayWidth}" data-unit-type="${useInches ? 'inches' : 'mm'}">
                    <small class="text-muted">Enter value as ${useInches ? 'decimal or fraction (e.g., 11.75 or 11 3/4)' : 'millimeters'}</small>
                </div>
                <div class="col-md-6">
                    <label for="workpieceLength" class="form-label">Length (${unitLabel})</label>
                    <input type="text" class="form-control" id="workpieceLength" name="workpieceLength"
                           value="${displayLength}" data-unit-type="${useInches ? 'inches' : 'mm'}">
                    <small class="text-muted">Enter value as ${useInches ? 'decimal or fraction' : 'millimeters'}</small>
                </div>
            </div>

            <div class="row mb-3">
                <div class="col-md-6">
                    <label for="workpieceThickness" class="form-label">Thickness (${unitLabel})</label>
                    <input type="text" class="form-control" id="workpieceThickness" name="workpieceThickness"
                           value="${displayThickness}" data-unit-type="${useInches ? 'inches' : 'mm'}">
                    <small class="text-muted">Common: ${useInches ? '3/4, 1/2, 1/4' : '19, 12, 6'}</small>
                </div>
                <div class="col-md-6">
                    <label for="woodSpecies" class="form-label">Wood Species</label>
                    <select class="form-select" id="woodSpecies" name="woodSpecies">
                        ${speciesOptions}
                    </select>
                </div>
            </div>

            <div class="row mb-3 align-items-center">
                <div class="col-auto">
                    <label for="gridSize" class="form-label mb-0">Grid Size (${unitLabel}):</label>
                </div>
                <div class="col-auto">
                    <input type="text" class="form-control" id="gridSize" name="gridSize"
                           value="${displayGridSize}" data-unit-type="${useInches ? 'inches' : 'mm'}" style="width: 100px;">
                </div>
            </div>

            <div class="row mb-3">
                <div class="col-md-4">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="showGrid" name="showGrid"
                               ${currentShowGrid ? 'checked' : ''}>
                        <label class="form-check-label" for="showGrid">
                            Show Grid
                        </label>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="showOrigin" name="showOrigin"
                               ${currentShowOrigin ? 'checked' : ''}>
                        <label class="form-check-label" for="showOrigin">
                            Show Origin
                        </label>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="showWorkpiece" name="showWorkpiece"
                               ${currentShowWorkpiece ? 'checked' : ''}>
                        <label class="form-check-label" for="showWorkpiece">
                            Show Workpiece
                        </label>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <label class="form-label">Origin Position</label>
                <div class="origin-position-grid">
                    <div class="row g-1">
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="top-left"
                                       ${currentOriginPosition === 'top-left' ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="top-center"
                                       ${currentOriginPosition === 'top-center' ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="top-right"
                                       ${currentOriginPosition === 'top-right' ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="middle-left"
                                       ${currentOriginPosition === 'middle-left' ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="middle-center"
                                       ${currentOriginPosition === 'middle-center' ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="middle-right"
                                       ${currentOriginPosition === 'middle-right' ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="bottom-left"
                                       ${currentOriginPosition === 'bottom-left' ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="bottom-center"
                                       ${currentOriginPosition === 'bottom-center' ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="grid-cell" onclick="this.querySelector('input').click()">
                                <input class="form-check-input" type="radio" name="originPosition" value="bottom-right"
                                       ${currentOriginPosition === 'bottom-right' ? 'checked' : ''}>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-text">Select where to place the origin (0,0) on your workpiece</div>
            </div>

            <div class="alert alert-light">
                <small class="text-muted">
                    <strong>Note:</strong> Changing workpiece dimensions will automatically re-center the workpiece in the viewport.
                </small>
            </div>
        `;
    }

    updateFromProperties(data) {
        super.updateFromProperties(data);

        console.log('Workpiece updateFromProperties called with:', data);

        let dimensionChanged = false;
        let originChanged = false;
        const useInches = getOption('Inches');

        // Update global options when properties change
        // Parse inputs using parseDimension to handle both mm and inch inputs
        if ('workpieceWidth' in data) {
            const newValue = parseDimension(data.workpieceWidth, useInches) || 300;
            setOption("workpieceWidth", newValue);
            dimensionChanged = true;
        }

        if ('workpieceLength' in data) {
            const newValue = parseDimension(data.workpieceLength, useInches) || 200;
            setOption("workpieceLength", newValue);
            dimensionChanged = true;
        }

        if ('workpieceThickness' in data) {
            const newValue = parseDimension(data.workpieceThickness, useInches) || 19;
            setOption("workpieceThickness", newValue);

            // Recalculate tool depths and steps that are percentage-based
            if (typeof recalculateToolPercentages === 'function') {
                recalculateToolPercentages();
                // Refresh tool table to show updated values and warnings
                if (typeof renderToolsTable === 'function') {
                    renderToolsTable();
                }
            }
        }

        if ('gridSize' in data) {
            const newValue = parseDimension(data.gridSize, useInches) || 10;
            setOption("gridSize", newValue);
        }

        if ('woodSpecies' in data) {
            setOption("woodSpecies", data.woodSpecies);
        }

        if ('originPosition' in data) {
            console.log('Origin position change detected:', data.originPosition);
            setOption("originPosition", data.originPosition);
            originChanged = true;
        }

        if ('showGrid' in data) {
            setOption("showGrid", data.showGrid);
        }

        if ('showOrigin' in data) {
            setOption("showOrigin", data.showOrigin);
        }

        if ('showWorkpiece' in data) {
            setOption("showWorkpiece", data.showWorkpiece);
        }

        // Note: gridSize is already handled above with parseDimension

        // Update origin position if dimensions or origin position changed
        if (dimensionChanged || originChanged) {
            // Use the values from options (already parsed and saved above)
            const width = getOption("workpieceWidth") * (typeof viewScale !== 'undefined' ? viewScale : 10);
            const length = getOption("workpieceLength") * (typeof viewScale !== 'undefined' ? viewScale : 10);
            const position = getOption("originPosition") || 'middle-center';

            const newOrigin = this.calculateOriginPosition(position, width, length);
            console.log('Updating origin from', typeof origin !== 'undefined' ? `${origin.x}, ${origin.y}` : 'undefined', 'to', `${newOrigin.x}, ${newOrigin.y}`, 'for position:', position);
            console.log('Width:', width, 'Length:', length, 'Position:', position);

            if (typeof origin !== 'undefined') {
                origin.x = newOrigin.x;
                origin.y = newOrigin.y;
                console.log('Origin updated to:', origin.x, origin.y);
            } else {
                console.log('Warning: origin object is undefined');
            }
        }

        // If dimensions changed, re-center the workpiece view
        if (dimensionChanged && typeof centerWorkpiece === 'function') {
            centerWorkpiece();
        }
    }

    onPropertiesChanged(data) {
        // Force immediate canvas redraw when workpiece properties change
        if (typeof redraw === 'function') {
            redraw();
        }

        // For debugging - log when properties change
        console.log('Workpiece properties changed:', data);

        // Force a second redraw on next frame to ensure all updates are visible
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                if (typeof redraw === 'function') {
                    redraw();
                }
            });
        }
    }

    // Help system integration
    getHelpSteps() {
        return [
            'Configure your workpiece dimensions: width, length, and thickness in millimeters.',
            'Select your wood species from the dropdown to optimize cutting parameters.',
            'Set the grid size and toggle display options (grid, origin, workpiece outline).',
            'Choose the origin position by clicking on the 3x3 grid - this sets where (0,0) will be located.',
            'All changes update the canvas immediately and are saved automatically.'
        ];
    }

    getHelpText() {
        // Return all steps as a formatted list for the workpiece tool
        const steps = this.getHelpSteps();
        return `
            <strong>Workpiece Configuration:</strong>
            <ul>
                ${steps.map(step => `<li>${step}</li>`).join('')}
            </ul>
        `;
    }
}