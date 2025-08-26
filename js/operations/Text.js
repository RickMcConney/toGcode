class Text extends Operation {
    constructor() {
        super('Text', 'fa fa-font');
    }



    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;
        this.createTextDialog(mouse.x, mouse.y);

    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
    }

    createTextDialog(x, y) {
        // Remove any existing dialog
        let existingDialog = document.getElementById('textDialog');
        if (existingDialog) {
            document.body.removeChild(existingDialog);
        }

        // Create dialog container
        const dialog = document.createElement('div');
        dialog.id = 'textDialog';
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
        <div style="margin-bottom: 10px;">
            <label for="textInput">Enter Text:</label><br>
            <input type="text" id="textInput" style="width: 200px; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px;">
            <label for="fontSelect">Select Font:</label><br>
            <select id="fontSelect" style="width: 200px; margin-top: 5px;">
                <option value="fonts/ReliefSingleLineCAD-Regular.ttf">Relief Single Line</option>
				<option value="fonts/Roboto-Regular.ttf">Roboto</option>
				<option value="fonts/EduNSWACTCursive-VariableFont_wght.ttf">Edu Cursive</option>
                <option value="fonts/AVHersheySimplexLight.ttf">AV Hershey Simplex Light</option>
                <option value="fonts/AVHersheyComplexHeavy.ttf">AV Hershey Complex Heavy</option>
            </select>
        </div>
        <div style="margin-bottom: 15px;">
            <label for="fontSize">Font Size:</label><br>
            <input type="number" id="fontSize" value="20" min="1" max="500" style="width: 200px; margin-top: 5px;">
        </div>
        <div style="text-align: right;">
            <button id="cancelTextBtn" style="margin-right: 10px;">Cancel</button>
            <button id="okTextBtn">OK</button>
        </div>
    `;

        document.body.appendChild(dialog);
        document.getElementById('cancelTextBtn').addEventListener('click', () => this.closeTextDialog(false));
        document.getElementById('okTextBtn').addEventListener('click', () => this.closeTextDialog(true));
        document.addEventListener('keydown', function (evt) {
            const dialog = document.getElementById('textDialog');
            if (!dialog) return;

            if (evt.key === 'Enter') {
                this.closeTextDialog(true);
            } else if (evt.key === 'Escape') {
                this.closeTextDialog(false);
            }
        });
        // Store coordinates for later use
        dialog.dataset.x = x;
        dialog.dataset.y = y;

        // Focus the text input
        document.getElementById('textInput').focus();
    }

    // Add function to handle dialog close
    closeTextDialog(accepted) {
        const dialog = document.getElementById('textDialog');
        if (!dialog) return;

        if (accepted) {
            const text = document.getElementById('textInput').value;
            const font = document.getElementById('fontSelect').value;
            const fontSize = parseInt(document.getElementById('fontSize').value);
            const x = parseFloat(dialog.dataset.x);
            const y = parseFloat(dialog.dataset.y);

            if (text) {
                this.addText(text, x, y, fontSize, font);
            }
        }

        document.body.removeChild(dialog);
    }


    addText(text, x, y, sizeInMM = 20, fontname) {
        // Try loading Roboto from Google Fonts CDN
        opentype.load(fontname, (err, font) => {
            if (err) {
                console.error('Could not load font:', err);
                return;
            }
            else {
                this.createTextPath(font, text, x, y, sizeInMM, fontname);
                redraw();
            }
        });

    }

    createTextPath(font, text, x, y, sizeInMM, fontname) {
        // Process each character separately
        let currentX = x;
        let fontSize = Math.round(4*sizeInMM*svgscale);

        // Split text into individual characters
        const chars = text.split('');
        addUndo(false, true, false);
        chars.forEach((char, index) => {
            // Create path for single character
            var path = font.getPath(char, currentX, y, fontSize);

            // Track separate subpaths
            var currentPathData = [];
            var allPaths = [];
            var lastX = currentX;
            var lastY = y;
            var firstPoint = null;

            path.commands.forEach(function (cmd) {
                switch (cmd.type) {
                    case 'M': // Move - Start new subpath
                        if (currentPathData.length > 0) {
                            // Save previous subpath if it exists
                            if (currentPathData.length >= 2) {
                                allPaths.push([...currentPathData]);
                            }
                        }
                        // Start new subpath do not add first point of single stroke fonts
                        currentPathData = [];

                        firstPoint = { x: cmd.x, y: cmd.y };
                        if (fontname.indexOf("SingleLine") == -1) {
                            currentPathData.push({ x: cmd.x, y: cmd.y });
                        }
                        lastX = cmd.x;
                        lastY = cmd.y;
                        break;

                    case 'L': // Line
                        currentPathData.push({ x: cmd.x, y: cmd.y });
                        lastX = cmd.x;
                        lastY = cmd.y;
                        break;

                    case 'C': // Curve
                        // Convert bezier curve to line segments
                        var steps = 10;
                        for (var i = 0; i <= steps; i++) {
                            var t = i / steps;
                            var tx = Math.pow(1 - t, 3) * lastX +
                                3 * Math.pow(1 - t, 2) * t * cmd.x1 +
                                3 * (1 - t) * Math.pow(t, 2) * cmd.x2 +
                                Math.pow(t, 3) * cmd.x;
                            var ty = Math.pow(1 - t, 3) * lastY +
                                3 * Math.pow(1 - t, 2) * t * cmd.y1 +
                                3 * (1 - t) * Math.pow(t, 2) * cmd.y2 +
                                Math.pow(t, 3) * cmd.y;
                            currentPathData.push({ x: tx, y: ty });
                        }
                        lastX = cmd.x;
                        lastY = cmd.y;
                        break;

                    case 'Q': // Quadratic curve
                        var steps = 10;
                        for (var i = 0; i <= steps; i++) {
                            var t = i / steps;
                            var tx = Math.pow(1 - t, 2) * lastX +
                                2 * (1 - t) * t * cmd.x1 +
                                Math.pow(t, 2) * cmd.x;
                            var ty = Math.pow(1 - t, 2) * lastY +
                                2 * (1 - t) * t * cmd.y1 +
                                Math.pow(t, 2) * cmd.y;
                            currentPathData.push({ x: tx, y: ty });
                        }
                        lastX = cmd.x;
                        lastY = cmd.y;
                        break;

                    case 'Z': // Close path
                        if (firstPoint && currentPathData.length > 0) {
                            currentPathData.push({x: firstPoint.x, y: firstPoint.y});

                        }
                        break;
                }
            });

            // Add the last subpath if it exists
            if (currentPathData.length >= 2) {
                allPaths.push(currentPathData);
            }

            // Create separate SVG path for each subpath
            allPaths.forEach((pathData, pathIndex) => {
                pathData = clipper.JS.Lighten(pathData, getOption("tolerance"));
                if (pathData.length > 0) {
                    var pathType = pathIndex === 0 ? 'outer' : 'inner';
                    var svgPath = {
                        id: 'Text' + svgpathId,
                        type: 'path',
                        name: 'Text_' + char + '_' + pathType + '_' + svgpathId,
                        selected: false,
                        visible: true,
                        path: pathData,
                        bbox: boundingBox(pathData)
                    };

                    svgpaths.push(svgPath);
                    addSvgPath(svgPath.id, 'Text_' + char + '_' + pathType + '_' + svgpathId);
                    svgpathId++;
                }
            });

            // Move to next character position
            currentX += font.getAdvanceWidth(char, fontSize);
        });


    }


}