/**
 * Polygon operation - creates a regular polygon with specified number of sides
 */
"use strict";

class Polygon extends Operation {
    constructor() {
        super("Polygon", "fa fa-star-o");
        this.properties = {
            sides: 6,
            radius: 10
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
            this.nextHelpStep(); // Move to drag radius step
        }
    }

    onMouseMove(canvas, evt) {
        if (this.isDrawing && this.centerPoint) {
            var mouse = this.normalizeEvent(canvas, evt);
            // Calculate radius from center to mouse
            const dx = mouse.x - this.centerPoint.x;
            const dy = mouse.y - this.centerPoint.y;
            this.properties.radius = Math.sqrt(dx * dx + dy * dy) / viewScale;

            // Update the properties display if visible
            const radiusInput = document.getElementById('polygon-radius');
            const radiusValue = document.getElementById('polygon-radius-value');
            if (radiusInput) radiusInput.value = this.properties.radius.toFixed(1);
            if (radiusValue) radiusValue.textContent = this.properties.radius.toFixed(1);

            redraw();
        }
    }

    onMouseUp(canvas, evt) {
        if (this.isDrawing && this.centerPoint) {
            // Create the polygon using current properties
            this.createPolygon(this.centerPoint, parseInt(this.properties.sides), this.properties.radius * viewScale);
            this.isDrawing = false;
            this.centerPoint = null;
            this.nextHelpStep(); // Move to completion step
        }
    }


    createPolygon(center, numSides, radius) {
        const points = [];
        const angle = 360 / numSides;

        for (let i = 0; i < numSides; i++) {
            const thisAngle = angle * i * (Math.PI / 180); // Convert to radians
            const x = center.x + radius * Math.cos(thisAngle);
            const y = center.y + radius * Math.sin(thisAngle);
            points.push({x:x, y:y});
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
        svgPath.selected = true;
        selectSidebarNode(svgPath.id);

        svgpathId++;
        redraw();

        // Show properties panel for the newly created polygon
        setTimeout(() => {
            // Switch to draw tools tab and show properties
            const drawToolsTab = document.getElementById('draw-tools-tab');
            const drawToolsPane = document.getElementById('draw-tools');

            document.querySelectorAll('#sidebar-tabs .nav-link').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

            drawToolsTab.classList.add('active');
            drawToolsPane.classList.add('show', 'active');

            showPathPropertiesEditor(svgPath);
        }, 100);
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        return `
            <div class="mb-3">
                <label for="polygon-sides" class="form-label">Number of Sides</label>
                <input type="number"
                       class="form-control"
                       id="polygon-sides"
                       name="sides"
                       min="3"
                       max="20"
                       value="${this.properties.sides}">
            </div>

            <div class="mb-3">
                <label for="polygon-radius" class="form-label">Radius: <span id="polygon-radius-value">${this.properties.radius.toFixed(1)}</span>mm</label>
                <input type="range"
                       class="form-range"
                       id="polygon-radius"
                       name="radius"
                       min="1"
                       max="50"
                       step="0.1"
                       value="${this.properties.radius}"
                       oninput="document.getElementById('polygon-radius-value').textContent = this.value">
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

    onPropertiesChanged(data) {
        // Update our properties with the new values
        this.properties = { ...this.properties, ...data };

        // Convert string values to numbers
        this.properties.sides = parseInt(this.properties.sides);
        this.properties.radius = parseFloat(this.properties.radius);

        // If we have a center point and we're not currently drawing, create immediately
        if (this.centerPoint && !this.isDrawing) {
            this.createPolygon(this.centerPoint, this.properties.sides, this.properties.radius * viewScale);
            this.centerPoint = null;
            this.setHelpStep(3); // Show completion message
        }
        super.onPropertiesChanged(data);
    }

    // Help System Interface
    getHelpSteps() {
        return [
            'Set the number of sides in the properties panel above',
            'Click on the canvas to set the center point of the polygon',
            'Drag outward to set the radius, then release to create',
            'Polygon created! Adjust properties or click Done to finish'
        ];
    }

    // Drawing
    draw(ctx) {
        if (this.isDrawing && this.centerPoint) {
            // Draw preview polygon while dragging
            const points = [];
            const sides = parseInt(this.properties.sides);
            const angle = 360 / sides;

            for (let i = 0; i < sides; i++) {
                const thisAngle = angle * i * (Math.PI / 180);
                const x = this.centerPoint.x + (this.properties.radius * viewScale) * Math.cos(thisAngle);
                const y = this.centerPoint.y + (this.properties.radius * viewScale) * Math.sin(thisAngle);
                points.push({x: x, y: y});
            }

            // Draw preview
            ctx.save();
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                if (i === 0) {
                    ctx.moveTo(points[i].x, points[i].y);
                } else {
                    ctx.lineTo(points[i].x, points[i].y);
                }
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            // Draw center point
            ctx.save();
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(this.centerPoint.x, this.centerPoint.y, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
        }
    }
}

