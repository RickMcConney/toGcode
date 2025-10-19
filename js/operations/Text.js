
class Text extends Operation {
    constructor() {
        super('Text', 'type', 'Create text paths using TTF fonts');

        this.currentPath = null;
    }

    getProperties() {
        const useInches = getOption('Inches');
        const defaultGridSize = getOption("gridSize") || 10;
        const defaultFontSize = useInches ? 25.4 : (defaultGridSize * 2); // 2 inches or 2x grid
        const savedFontSize = getOption("textFontSize");
        const finalFontSize = (savedFontSize !== null && savedFontSize !== undefined) ? savedFontSize : defaultFontSize;
        const savedFont = getOption("textFont") || 'fonts/Roboto-Regular.ttf';
        const savedText = getOption("textSample") || 'Sample Text';

        this.properties.fontSize = finalFontSize;
        this.properties.font = savedFont;
        this.properties.text = savedText;
    }
    // Lifecycle methods
    start() {
        // Refresh saved properties when tool is activated
        this.getProperties();
        super.start();
    }

    stop() {
        this.currentPath = null;
        super.stop();
    }

    // Set the path to edit (called from bootstrap-layout when selecting a path)
    setEditPath(path) {
        this.currentPath = path;
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
  
        // If we have text properties set, create text immediately
        if (this.properties.text && this.properties.text.trim() !== '') {
            this.addText(this.properties.text, mouse.x, mouse.y, this.properties.fontSize, this.properties.font);
            window.stepWiseHelp?.setStep(3); // Show completion message
        } 
    }

    // HTML Generation Helper Methods
    _generateFontSelect(selectedFont) {
        return `
            <div class="mb-3">
                <label for="font-select" class="form-label">Font</label>
                <select class="form-select" id="font-select" name="font">
                    ${AVAILABLE_FONTS.map(font =>
            `<option value="${font.value}" ${selectedFont === font.value ? 'selected' : ''}>${font.label}</option>`
        ).join('\n                    ')}
                </select>
            </div>`;
    }

    _generateFontSizeSlider(fontSize) {
        const useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
        const fontSizeValue = parseDimension(parseFloat(useInches ? 1 : 20));
        const displaySize = formatDimension(fontSizeValue, true);

        // Dynamic max based on workpiece size
        const workpieceWidth = getOption("workpieceWidth") || 300;
        const workpieceLength = getOption("workpieceLength") || 200;
        const maxDimension = Math.max(workpieceWidth, workpieceLength);
        const maxSize = useInches ? Math.ceil(maxDimension / 25.4) : maxDimension;
        const minSize = useInches ? 0.125 : 5;
        const step = useInches ? 0.125 : 1;

        return `
            <div class="mb-3">
                <label for="font-size" class="form-label">Font Size: <span id="font-size-value">${displaySize}</span></label>
                <input type="range"
                       class="form-range"
                       id="font-size"
                       name="fontSize"
                       min="${minSize}"
                       max="${maxSize}"
                       step="${step}"
                       value="${useInches ? Math.round((fontSizeValue / 25.4) / step) * step : fontSizeValue}"
                       data-unit-type="${useInches ? 'inches' : 'mm'}"
                       oninput="document.getElementById('font-size-value').textContent = formatDimension(parseFloat(this.value) * ${useInches ? 25.4 : 1}, ${useInches}, ${useInches})">
            </div>`;
    }

    _generatePropertiesHTML(text, font, fontSize, position = null) {
        let positionHTML = '';
        if (position) {
            const useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
            const pos = toMM(position.x, position.y);
            const displayX = formatDimension(pos.x, true);
            const displayY = formatDimension(pos.y, true);
            positionHTML = `Position: (${displayX}, ${displayY})`;
        } else {
            positionHTML = 'Position: ( , )';
        }

        return `
            <div class="mb-3">
                <label for="text-input" class="form-label">Text</label>
                <input type="text" class="form-control"
                         id="text-input"
                         name="text"
                         rows="3"
                         value="${text}"</input>
            </div>

            ${this._generateFontSelect(font)}
            ${this._generateFontSizeSlider(fontSize)}

        `;
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        // Check if we're editing an existing path
        if (this.currentPath && this.currentPath.creationProperties) {
            return this._generatePropertiesHTML(
                this.currentPath.creationProperties.text,
                this.currentPath.creationProperties.font,
                this.currentPath.creationProperties.fontSize,
                this.currentPath.creationProperties.position
            );
        }

        // Creating new text
        this.getProperties();
        return this._generatePropertiesHTML(
            this.properties.text,
            this.properties.font,
            this.properties.fontSize,
            null  // No position for new text
        );
    }

    onPropertiesChanged(data) {
        // Update our properties with the new values
        this.properties = { ...this.properties, ...data };

        // Parse fontSize - convert from inches to mm if needed (always store in mm)
        const sizeInMM = parseDimension(data.fontSize);

        // Store the converted fontSize back to properties (always in mm)
        this.properties.fontSize = sizeInMM;
        data.fontSize = sizeInMM;

        // Save properties for future text instances
        this._saveTextOptions(data.text, data.font, sizeInMM);

        // Check if we're editing existing text
        if (this.currentPath && this.currentPath.creationProperties) {
            // Edit mode: update existing text
            this.updateTextInPlace(this.currentPath);
        } 
        //super.onPropertiesChanged(data);
    }

    // Options Management Helper Method
    _saveTextOptions(text, font, sizeInMM) {
        if (typeof setOption !== 'undefined') {
            setOption("textFontSize", sizeInMM); // Always stored in mm
            if (font) {
                setOption("textFont", font);
            }
            if (text) {
                setOption("textSample", text);
            }
        }
    }

    // Font Processing Helper Methods
    _processFontCommands(fontPath, currentX, y, fontname) {
        // Track separate subpaths
        var currentPathData = [];
        var allPaths = [];
        var lastX = currentX;
        var lastY = y;
        var firstPoint = null;

        fontPath.commands.forEach(function (cmd) {
            switch (cmd.type) {
                case 'M': // Move - Start new subpath
                    if (currentPathData.length > 0) {
                        // Save previous subpath if it exists
                        if (currentPathData.length >= 2) {
                            allPaths.push([...currentPathData]);
                        }
                    }
                    // Start new subpath
                    currentPathData = [];
                    firstPoint = { x: cmd.x, y: cmd.y };

                    // Don't add first point for single-line fonts
                    if (fontname.indexOf("SingleLine") === -1) {
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
                    var startIndex = (currentPathData.length === 0) ? 0 : 1;
                    var steps = 10;
                    for (var i = startIndex; i <= steps; i++) {
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
                    var startIndex = (currentPathData.length === 0) ? 0 : 1;
                    var steps = 10;
                    for (var i = startIndex; i <= steps; i++) {
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
                        currentPathData.push({ x: firstPoint.x, y: firstPoint.y });
                    }
                    break;
            }
        });

        // Add the last subpath if it exists
        if (currentPathData.length >= 2) {
            allPaths.push(currentPathData);
        }

        return allPaths;
    }

    _createSvgPathsFromSubpaths(allPaths, char, textGroupId, x, y, text, fontname, sizeInMM, pathIdMap = null) {
        const createdPaths = [];
        let pathIdCounter = 0;

        allPaths.forEach((pathData, pathIndex) => {
            pathData = clipper.JS.Lighten(pathData, getOption("tolerance"));
            if (pathData.length > 0) {
                var pathType = pathIndex === 0 ? 'outer' : 'inner';

                // Reuse original ID and name if available (for updates), otherwise create new
                var pathId, pathName, isSelected;
                if (pathIdMap && pathIdCounter < pathIdMap.length) {
                    pathId = pathIdMap[pathIdCounter].id;
                    pathName = pathIdMap[pathIdCounter].name;
                    isSelected = pathIdMap[pathIdCounter].selected;
                } else {
                    // Create new path
                    pathId = 'Text' + svgpathId;
                    pathName = 'Text_' + char + '_' + pathType + '_' + svgpathId;
                    isSelected = 1;
                    svgpathId++;
                }

                var svgPath = {
                    id: pathId,
                    type: 'path',
                    name: pathName,
                    selected: isSelected,
                    visible: true,
                    path: pathData,
                    bbox: boundingBox(pathData),
                    // Store creation properties for editing
                    creationTool: 'Text',
                    textGroupId: textGroupId,
                    creationProperties: {
                        text: text,
                        font: fontname,
                        fontSize: sizeInMM,
                        position: { x: x, y: y },
                        character: char,
                        pathType: pathType
                    }
                };

                createdPaths.push(svgPath);
                pathIdCounter++;
            }
        });

        return createdPaths;
    }

    async addText(text, x, y, sizeInMM = 20, fontname) {
        // Generate a unique group ID for all paths in this text
        const textGroupId = 'TextGroup' + Date.now();

        let fontUrl = fontname;


        // Use opentype.js for local TTF fonts
        opentype.load(fontUrl, (err, font) => {
            if (err) {
                console.error('Could not load font:', err);
                return;
            }
            else {
                this.createTextPath(font, text, x, y, sizeInMM, fontname, textGroupId);
                redraw();
            }
        });

    }

    createTextPath(font, text, x, y, sizeInMM, fontname, textGroupId) {
        // Process each character separately
        let currentX = x;

        // Calculate proper font size based on capital letter height
        const referenceChar = font.charToGlyph('H');
        const referenceBBox = referenceChar.getBoundingBox();
        const referenceHeight = referenceBBox.y2 - referenceBBox.y1;
        const scaleFactor = font.unitsPerEm / referenceHeight;
        let fontSize = sizeInMM * viewScale * scaleFactor;

        // Split text into individual characters
        const chars = text.split('');
        addUndo(false, true, false);
        chars.forEach((char, index) => {
            // Create path for single character
            var path = font.getPath(char, currentX, y, fontSize);

            // Process font commands to get subpaths
            var allPaths = this._processFontCommands(path, currentX, y, fontname);

            // Create SVG paths from subpaths
            const createdPaths = this._createSvgPathsFromSubpaths(
                allPaths, char, textGroupId, x, y, text, fontname, sizeInMM
            );

            // Add created paths to svgpaths array
            createdPaths.forEach(svgPath => {
                svgpaths.push(svgPath);
                selectMgr.selectPath(svgPath);
            });

            // Move to next character position
            currentX += font.getAdvanceWidth(char, fontSize);
        });

        // Add the text group to sidebar after all paths are created
        const textPaths = svgpaths.filter(p => p.textGroupId === textGroupId);
        if (typeof addTextGroup === 'function' && textPaths.length > 0) {
            addTextGroup(textGroupId, text, textPaths);
        }

        // Set currentPath to enable immediate editing
        if (textPaths.length > 0) {
            this.currentPath = textPaths[0];
        }
    }

    // Update text paths in place
    updateTextInPlace(path) {
        // Find all paths that belong to this text creation
        const data = this.properties;
        if (path === undefined)
            path = this.currentPath;
        if (!path || !path.creationProperties) return;
        const relatedPaths = svgpaths.filter(p =>
            p.creationTool === 'Text' &&
            p.creationProperties &&
            p.creationProperties.position.x === path.creationProperties.position.x &&
            p.creationProperties.position.y === path.creationProperties.position.y
        );


        // Text or font changed, need to recreate paths
        if (typeof opentype !== 'undefined') {
            opentype.load(data.font, (err, font) => {
                if (!err && font) {
                    this.updateTextPathsInPlace(relatedPaths, font, data);
                    redraw();
                }
            });
        }

    }

    // Update existing text paths without creating new ones
    updateTextPathsInPlace(textPaths, font, data) {
        const text = data.text;
        const sizeInMM = data.fontSize;
        const fontname = data.font;

        if (!textPaths.length) return;

        // Get position from the first path
        const position = textPaths[0].creationProperties.position;
        const x = position.x;
        const y = position.y;

        // Store original path IDs, names, and textGroupId to preserve them
        const textGroupId = textPaths[0].textGroupId || ('TextGroup' + Date.now());
        const originalPaths = textPaths.map(p => ({
            id: p.id,
            name: p.name

        }));

        // Remove existing text paths from sidebar and array
        selectMgr.unselectAll();
        textPaths.forEach(textPath => {
            const pathIndex = svgpaths.findIndex(p => p.id === textPath.id);
            if (pathIndex !== -1) {
                removeSvgPath(textPath.id);
                svgpaths.splice(pathIndex, 1);
            }
        });

        // Create new text paths using the same logic as the original text tool
        let currentX = x;

        // Calculate proper font size based on capital letter height
        const referenceChar = font.charToGlyph('H');
        const referenceBBox = referenceChar.getBoundingBox();
        const referenceHeight = referenceBBox.y2 - referenceBBox.y1;
        const scaleFactor = font.unitsPerEm / referenceHeight;
        let fontSizeScaled = sizeInMM * viewScale * scaleFactor;
        let pathIdCounter = 0; // Track which original ID to reuse

        const chars = text.split('');
        chars.forEach((char, index) => {
            var fontPath = font.getPath(char, currentX, y, fontSizeScaled);

            // Process font commands to get subpaths
            var allPaths = this._processFontCommands(fontPath, currentX, y, fontname);

            // Create SVG paths from subpaths, reusing original IDs
            const createdPaths = this._createSvgPathsFromSubpaths(
                allPaths, char, textGroupId, x, y, text, fontname, sizeInMM,
                originalPaths.slice(pathIdCounter) // Pass remaining original paths for ID reuse
            );

            // Add created paths to svgpaths array
            createdPaths.forEach(svgPath => {
                
                svgpaths.push(svgPath);
                selectMgr.selectPath(svgPath);
                this.currentPath = svgPath;
                pathIdCounter++;
            });

            // Move to next character position
            currentX += font.getAdvanceWidth(char, fontSizeScaled);
        });

        // Add the updated text group to sidebar
        const updatedTextPaths = svgpaths.filter(p => p.textGroupId === textGroupId);
        if (updatedTextPaths.length > 0) {
            addTextGroup(textGroupId, text, updatedTextPaths);
        }
    }


}