/**
 * Polygon operation - creates a regular polygon with specified number of sides
 */
"use strict";

class Polygon extends Operation {
    constructor() {
        super("Polygon", "fa fa-star-o");

        // Try to load saved properties, fall back to defaults (2x grid size or 2 inches)
        const useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
        const defaultGridSize = (typeof getOption !== 'undefined' ? getOption("gridSize") : null) || 10;
        const defaultRadius = useInches ? (defaultGridSize ) : (defaultGridSize * 2); // 2 inches or 2x grid
        const savedSides = getOption("polygonSides") || 6;
        const savedRadius = getOption("polygonRadius");
        const finalRadius = (savedRadius !== null && savedRadius !== undefined) ? savedRadius : defaultRadius;

        this.properties = {
            sides: savedSides,
            radius: finalRadius
        };
        this.centerPoint = null;
        this.isDrawing = false;
    }

   createPolyDialog(mouse) {
        // Remove any existing dialog
        let existingDialog = document.getElementById('polyDialog');
        if (existingDialog) {
            document.body.removeChild(existingDialog);
        }

        // Create dialog container
        const dialog = document.createElement('div');
        dialog.id = 'polyDialog';
        dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border: 1px solid #ccc;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1000;
    `;

        // Create dialog content
        dialog.innerHTML = `

        <div style="margin-bottom: 15px;">
            <label for="fontSize">Number of sides:</label><br>
            <input type="number" id="sides" value="6" min="1" max="500" style="width: 200px; margin-top: 5px;">
        </div>
        <div style="text-align: right;">
            <button id="cancelPolyBtn" style="margin-right: 10px;">Cancel</button>
            <button id="okPolyBtn">OK</button>
        </div>
    `;

        document.body.appendChild(dialog);
        document.getElementById('cancelPolyBtn').addEventListener('click', () => this.closePolyDialog(false, mouse));
        document.getElementById('okPolyBtn').addEventListener('click', () => this.closePolyDialog(true, mouse));
        document.addEventListener('keydown', function (evt, mouse) {
            const dialog = document.getElementById('polyDialog');
            if (!dialog) return;

            if (evt.key === 'Enter') {
                this.closePolyDialog(true, mouse);
            } else if (evt.key === 'Escape') {
                this.closePolyDialog(false, mouse);
            }
        });


        // Focus the text input
        document.getElementById('sides').focus();
    }

    // Add function to handle dialog close
    closePolyDialog(accepted, mouse) {
        const dialog = document.getElementById('polyDialog');
        if (!dialog) return;

        if (accepted) {
            const sides = parseInt(document.getElementById('sides').value);
            if (sides >= 3) {
                    this.createPolygon(mouse, sides, this.defaultSize*viewScale);
            }
            else {
                alert('Please enter at least 3 sides');
            }

        }

        document.body.removeChild(dialog);
    }
    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        if (!this.isDrawing) {
            // First click sets center point
            this.centerPoint = { x: mouse.x, y: mouse.y };
            this.isDrawing = true;
            window.stepWiseHelp?.nextStep(); // Move to drag radius step
        }
    }

    onMouseMove(canvas, evt) {
        if (this.isDrawing && this.centerPoint) {
            var mouse = this.normalizeEvent(canvas, evt);
            // Calculate radius from center to mouse in world coordinates
            const dx = mouse.x - this.centerPoint.x;
            const dy = mouse.y - this.centerPoint.y;
            this.worldRadius = Math.sqrt(dx * dx + dy * dy);

            // Convert to mm for properties storage (always stored in mm)
            this.properties.radius = this.worldRadius / viewScale;

            // Update the properties display if visible
            const radiusInput = document.getElementById('polygon-radius');
            const radiusValue = document.getElementById('polygon-radius-value');
            if (radiusInput && radiusValue) {
                const useInches = getOption('Inches');
                const step = useInches ? 0.125 : 0.5;

                if (useInches) {
                    // Convert mm to inches and round to step
                    const inches = this.properties.radius / 25.4;
                    const roundedInches = Math.round(inches / step) * step;
                    radiusInput.value = roundedInches;
                    radiusValue.textContent = formatDimension(this.properties.radius, true);
                } else {
                    radiusInput.value = this.properties.radius.toFixed(1);
                    radiusValue.textContent = this.properties.radius.toFixed(1);
                }
            }

            redraw();
        }
    }

    onMouseUp(canvas, evt) {
        if (this.isDrawing && this.centerPoint) {
            // Create the polygon using current UI values
            const currentProps = this.getCurrentProperties();
            this.createPolygon(this.centerPoint, currentProps.sides, this.properties.radius * viewScale);
            this.isDrawing = false;
            this.centerPoint = null;
            window.stepWiseHelp?.nextStep(); // Move to completion step
        }
    }


    createPolygon(center, numSides, radius) {
        const points = [];

        if (numSides % 2 === 1) {
            // Odd-sided polygons: put one point at the bottom
            const angleStep = (2 * Math.PI) / numSides;
            const startAngle = -Math.PI / 2; // Start with a point at bottom (flip 180 degrees from 90)

            for (let i = 0; i < numSides; i++) {
                const angle = startAngle + (i * angleStep);
                const x = center.x + radius * Math.cos(angle);
                const y = center.y + radius * Math.sin(angle);
                points.push({x: x, y: y});
            }
        } else {
            // Even-sided polygons: put an edge at the bottom
            const angleStep = (2 * Math.PI) / numSides;
            const startAngle = -Math.PI / 2 + (angleStep / 2); // Flip 180 degrees and offset so edge is at bottom

            for (let i = 0; i < numSides; i++) {
                const angle = startAngle + (i * angleStep);
                const x = center.x + radius * Math.cos(angle);
                const y = center.y + radius * Math.sin(angle);
                points.push({x: x, y: y});
            }
        }
        points.push(points[0]); // Close the polygon

        addUndo(false, true, false);
        var svgPath = {
            id: "Poly" + svgpathId,
            type: 'path',
            name: 'Polygon ' + svgpathId,
            selected: false,
            visible: true,
            path: points,
            bbox: boundingBox(points),
            // Store creation properties for editing
            creationTool: 'Polygon',
            creationProperties: {
                sides: numSides,
                radius: radius / viewScale, // Store in mm
                center: { x: center.x, y: center.y }
            }
        };
        svgpaths.push(svgPath);
        addSvgPath(svgPath.id, svgPath.name);

        // Auto-select the newly created polygon
        svgPath.selected = 1;
        selectSidebarNode(svgPath.id);

        svgpathId++;
        redraw();
    }

    // Helper method to get current property values from UI (always returns mm)
    getCurrentProperties() {
        const sidesInput = document.getElementById('polygon-sides');
        const radiusInput = document.getElementById('polygon-radius');

        // Default radius = 2 inches or 2x grid size
        const useInches = getOption('Inches');
        const defaultGridSize = getOption("gridSize") || 10;
        const defaultRadius = useInches ? (defaultGridSize) : (defaultGridSize * 2); // 2 inches or 2x grid

        // If inputs exist, use their values (convert from inches to mm if needed)
        // Otherwise use current properties (which are always in mm)
        const sides = sidesInput ? parseInt(sidesInput.value) : (this.properties.sides || 6);
        let radius;
        if (radiusInput) {
            // Slider value is in inches when useInches=true, convert back to mm
            const sliderValue = parseFloat(radiusInput.value);
            radius = useInches ? (sliderValue * 25.4) : sliderValue;
        } else {
            radius = this.properties.radius || defaultRadius;
        }

        return { sides, radius };
    }

    // Lifecycle methods
    start() {
        // Refresh saved properties when tool is activated (default = 2 inches or 2x grid size)
        const useInches = getOption('Inches');
        const defaultGridSize = getOption("gridSize") || 10;
        const defaultRadius = useInches ? (defaultGridSize) : (defaultGridSize * 2); // 2 inches or 2x grid
        const savedSides = getOption("polygonSides") || 6;
        const savedRadius = getOption("polygonRadius");
        const finalRadius = (savedRadius !== null && savedRadius !== undefined) ? savedRadius : defaultRadius;

        this.properties.sides = savedSides;
        this.properties.radius = finalRadius;

        super.start();
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        // Get current values from UI if available, otherwise use properties
        const currentProps = this.getCurrentProperties();

        // Get display units
        const useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
        const unitLabel = useInches ? 'in' : 'mm';
        const displayRadius = formatDimension(currentProps.radius, true);

        // Dynamic max based on workpiece size
        const workpieceWidth = getOption("workpieceWidth") || 300;
        const workpieceLength = getOption("workpieceLength") || 200;
        const maxDimension = Math.max(workpieceWidth, workpieceLength) / 2;
        const maxRadius = useInches ? Math.ceil(maxDimension / 25.4) : maxDimension;

        // 1/8" increments in inch mode, 0.5mm in metric
        const step = useInches ? 0.125 : 0.5;

        return `
            <div class="mb-3">
                <label for="polygon-sides" class="form-label">Number of Sides</label>
                <input type="number"
                       class="form-control"
                       id="polygon-sides"
                       name="sides"
                       min="3"
                       max="20"
                       value="${currentProps.sides}">
            </div>

            <div class="mb-3">
                <label for="polygon-radius" class="form-label">Radius: <span id="polygon-radius-value">${displayRadius}</span>${unitLabel}</label>
                <input type="range"
                       class="form-range"
                       id="polygon-radius"
                       name="radius"
                       min="${useInches ? 0.125 : 1}"
                       max="${maxRadius}"
                       step="${step}"
                       value="${useInches ? Math.round((currentProps.radius / 25.4) / step) * step : currentProps.radius}"
                       data-unit-type="${useInches ? 'inches' : 'mm'}"
                       oninput="document.getElementById('polygon-radius-value').textContent = formatDimension(parseFloat(this.value) * ${useInches ? 25.4 : 1}, true)">
            </div>

            ${this.centerPoint ? `
            <div class="alert alert-info">
                <i data-lucide="info"></i>
                Center point set at (${this.centerPoint.x.toFixed(1)}, ${this.centerPoint.y.toFixed(1)})
            </div>
            ` : ''}

            ${this.isDrawing ? `
            <div class="alert alert-warning">
                <i data-lucide="mouse"></i>
                Drag to set radius, then release to create polygon
            </div>
            ` : ''}
        `;
    }

    getEditPropertiesHTML(path) {
        // Get display units
        const useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
        const unitLabel = useInches ? 'in' : 'mm';

        // Calculate ACTUAL current center from bounding box
        const actualCenterX = (path.bbox.minx + path.bbox.maxx) / 2;
        const actualCenterY = (path.bbox.miny + path.bbox.maxy) / 2;
        const actualCenterMM = toMM(actualCenterX, actualCenterY);

        // Calculate ACTUAL current radius from path points
        // Find the distance from center to first point (all should be same for regular polygon)
        const dx = path.path[0].x - actualCenterX;
        const dy = path.path[0].y - actualCenterY;
        const actualRadiusWorld = Math.sqrt(dx * dx + dy * dy);
        const actualRadiusMM = actualRadiusWorld / viewScale;

        const displayRadius = formatDimension(actualRadiusMM, true);
        const displayCenterX = formatDimension(actualCenterMM.x, true);
        const displayCenterY = formatDimension(actualCenterMM.y, true);

        // Dynamic max based on workpiece size
        const workpieceWidth = getOption("workpieceWidth") || 300;
        const workpieceLength = getOption("workpieceLength") || 200;
        const maxDimension = Math.max(workpieceWidth, workpieceLength) / 2;
        const maxRadius = useInches ? Math.ceil(maxDimension / 25.4) : maxDimension;

        // 1/8" increments in inch mode, 0.5mm in metric
        const step = useInches ? 0.125 : 0.5;

        return `
            <div class="mb-3">
                <label for="edit-polygon-sides" class="form-label">Number of Sides</label>
                <input type="number"
                       class="form-control"
                       id="edit-polygon-sides"
                       name="sides"
                       min="3"
                       max="20"
                       value="${path.creationProperties.sides}">
            </div>

            <div class="mb-3">
                <label for="edit-polygon-radius" class="form-label">Radius: <span id="edit-polygon-radius-value">${displayRadius}</span> ${unitLabel}</label>
                <input type="range"
                       class="form-range"
                       id="edit-polygon-radius"
                       name="radius"
                       min="${useInches ? 0.125 : 1}"
                       max="${maxRadius}"
                       step="${step}"
                       value="${useInches ? Math.round((actualRadiusMM / 25.4) / step) * step : actualRadiusMM}"
                       data-unit-type="${useInches ? 'inches' : 'mm'}"
                       oninput="document.getElementById('edit-polygon-radius-value').textContent = formatDimension(parseFloat(this.value) * ${useInches ? 25.4 : 1}, true)">
            </div>

            <div class="alert alert-info">
                <i data-lucide="info"></i>
                Center: (${displayCenterX}, ${displayCenterY}) ${unitLabel}
            </div>
        `;
    }

    onPropertiesChanged(data) {
        // Update our properties with the new values
        this.properties = { ...this.properties, ...data };

        // Convert string values to numbers
        this.properties.sides = parseInt(this.properties.sides);

        // Parse radius - convert from inches to mm if needed
        const useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
        this.properties.radius = useInches ? parseFloat(this.properties.radius) * 25.4 : parseFloat(this.properties.radius);

        // Save properties for future polygon instances (always stored in mm)
        setOption("polygonSides", this.properties.sides);
        setOption("polygonRadius", this.properties.radius);

        // If we're currently drawing, update the preview immediately
        if (this.isDrawing && this.centerPoint) {
            redraw();
        }

        // If we have a center point and we're not currently drawing, create immediately
        if (this.centerPoint && !this.isDrawing) {
            const currentProps = this.getCurrentProperties();
            this.createPolygon(this.centerPoint, currentProps.sides, currentProps.radius * viewScale);
            this.centerPoint = null;
            window.stepWiseHelp?.setStep(3); // Show completion message
        }
        super.onPropertiesChanged(data);
    }

    // Drawing
    draw(ctx) {
        if (this.isDrawing && this.centerPoint) {
            // Draw preview polygon while dragging - work in world coordinates then convert to screen
            const worldPoints = [];
            // Get current sides value from UI, not from saved properties
            const currentProps = this.getCurrentProperties();
            const sides = currentProps.sides;
            // Use the world radius for calculations
            const radiusInWorldUnits = this.worldRadius || 0;

            if (sides % 2 === 1) {
                // Odd-sided polygons: put one point at the bottom
                const angleStep = (2 * Math.PI) / sides;
                const startAngle = -Math.PI / 2; // Start with a point at bottom (flip 180 degrees)

                for (let i = 0; i < sides; i++) {
                    const angle = startAngle + (i * angleStep);
                    const worldX = this.centerPoint.x + radiusInWorldUnits * Math.cos(angle);
                    const worldY = this.centerPoint.y + radiusInWorldUnits * Math.sin(angle);
                    worldPoints.push({x: worldX, y: worldY});
                }
            } else {
                // Even-sided polygons: put an edge at the bottom
                const angleStep = (2 * Math.PI) / sides;
                const startAngle = -Math.PI / 2 + (angleStep / 2); // Flip 180 degrees and offset so edge is at bottom

                for (let i = 0; i < sides; i++) {
                    const angle = startAngle + (i * angleStep);
                    const worldX = this.centerPoint.x + radiusInWorldUnits * Math.cos(angle);
                    const worldY = this.centerPoint.y + radiusInWorldUnits * Math.sin(angle);
                    worldPoints.push({x: worldX, y: worldY});
                }
            }

            // Convert world points to screen coordinates for drawing
            const screenPoints = worldPoints.map(point => worldToScreen(point.x, point.y));

            // Draw preview
            ctx.save();
            ctx.strokeStyle = selectColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            for (let i = 0; i < screenPoints.length; i++) {
                if (i === 0) {
                    ctx.moveTo(screenPoints[i].x, screenPoints[i].y);
                } else {
                    ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
                }
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            // Draw center point (convert from world coordinates to screen coordinates)
            const centerScreen = worldToScreen(this.centerPoint.x, this.centerPoint.y);
            ctx.save();
            ctx.fillStyle = selectColor;
            ctx.beginPath();
            ctx.arc(centerScreen.x, centerScreen.y, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
        }
    }
}

