/**
 * Polygon operation - creates a regular polygon with specified number of sides
 */
"use strict";

class Polygon extends Operation {
    constructor() {
        super("Polygon", "fa fa-star-o");
        this.defaultSides = 6;
        this.defaultSize = 10; // 10mm default size
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
        var self = this;
        this.createPolyDialog(mouse);
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
            bbox: boundingBox(points)
        };
        svgpaths.push(svgPath);
        addSvgPath(svgPath.id, svgPath.name);
        svgpathId++;
        redraw();

    }
}

