/**
 * G-code Parser
 * Shared parser for both 2D and 3D simulators
 * Handles variable G-code commands, axis ordering, and axis inversions based on post-processor profiles
 */

/**
 * Parse a G-code template string to extract command and axis information
 * @param {string} template - Template string like "G0 X Y Z F" or "G00 Y X -Z F"
 * @returns {object} - { command: string, axes: array, inversions: object }
 */
function parseGcodeTemplate(template) {
    // Extract G-code command (first token)
    const tokens = template.split(/\s+/);
    const command = tokens[0];  // e.g., "G0", "G00", "GOTO"

    // Extract axis placeholders in order they appear, handling inversions
    const axisMatches = template.matchAll(/(-?)([XYZ])\b/g);
    const axes = [];
    const inversions = {};

    for (const match of axisMatches) {
        const inverted = match[1] === '-';
        const axis = match[2];
        axes.push(axis);
        inversions[axis] = inverted;
    }

    // If no axes found, default to X Y Z
    if (axes.length === 0) {
        axes.push('X', 'Y', 'Z');
        inversions.X = false;
        inversions.Y = false;
        inversions.Z = false;
    }

    return {
        command: command,
        axes: axes,
        inversions: inversions
    };
}

/**
 * Create a G-code parse configuration from a post-processor profile
 * @param {object} profile - Post-processor profile object
 * @returns {object} - Parse configuration with rapid and cut command info
 */
function createGcodeParseConfig(profile) {
    if (!profile) {
        // Fallback to defaults if no profile provided
        return {
            rapidCommand: 'G0',
            cutCommand: 'G1',
            rapidAxes: ['X', 'Y', 'Z'],
            cutAxes: ['X', 'Y', 'Z'],
            rapidInversions: { X: false, Y: false, Z: false },
            cutInversions: { X: false, Y: false, Z: false }
        };
    }

    const rapidInfo = parseGcodeTemplate(profile.rapidTemplate || 'G0 X Y Z F');
    const cutInfo = parseGcodeTemplate(profile.cutTemplate || 'G1 X Y Z F');

    return {
        rapidCommand: rapidInfo.command,
        cutCommand: cutInfo.command,
        rapidAxes: rapidInfo.axes,
        cutAxes: cutInfo.axes,
        rapidInversions: rapidInfo.inversions,
        cutInversions: cutInfo.inversions
    };
}

/**
 * Parse a G-code string and extract movements
 * @param {string} gcode - G-code string
 * @param {object} parseConfig - Parse configuration from createGcodeParseConfig()
 * @returns {array} - Array of movement objects
 */
function parseGcodeFile(gcode, parseConfig) {
    if (!parseConfig) {
        parseConfig = createGcodeParseConfig(null);
    }

    const lines = gcode.split('\n');
    const movements = [];
    let currentX = 0, currentY = 0, currentZ = 0;
    let currentFeedRate = 1000;
    let currentTool = null;
    let currentToolId = null;
    let currentToolType = null;
    let currentToolDiameter = 0;
    let currentToolAngle = 0;
    let currentStepDown = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const trimmed = line.trim();

        // Skip empty lines
        if (!trimmed) continue;

        // Handle comment lines (both parentheses and semicolon styles)
        if (trimmed.startsWith('(') || trimmed.startsWith(';')) {
            // Extract comment text based on format
            let commentText = '';
            if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
                // Format: (Tool: ID=...)
                commentText = trimmed.substring(1, trimmed.length - 1);
            } else if (trimmed.startsWith(';')) {
                // Format: ;Tool: ID=...
                commentText = trimmed.substring(1);
            } else if (trimmed.startsWith('(')) {
                // Unclosed parenthesis (some formats don't close)
                commentText = trimmed.substring(1);
            }

            // Try to extract tool info from comment text
            // Pattern handles multi-word tool types like "End Mill" and "Ball Nose"
            const toolMatch = commentText.match(/Tool:\s*ID=(\d+)\s+Type=([A-Za-z ]+)\s+Diameter=([\d.]+)\s+Angle=([\d.]+)(?:\s+StepDown=([\d.]+))?/);
            if (toolMatch) {
                currentToolId = toolMatch[1];
                currentToolType = toolMatch[2].trim();  // Remove extra spaces
                currentToolDiameter = parseFloat(toolMatch[3]) || 0;
                currentToolAngle = parseFloat(toolMatch[4]) || 0;
                currentStepDown = parseFloat(toolMatch[5]) || 0;
                currentTool = `${currentToolType} (${currentToolDiameter}mm)`;
            }
            continue;
        }

        // Extract command (first token)
        const tokens = trimmed.split(/\s+/);
        const command = tokens[0];

        // Determine if this is a rapid or cutting move
        let isCutting = false;
        let axes = null;
        let inversions = null;

        if (command === parseConfig.rapidCommand) {
            isCutting = false;
            axes = parseConfig.rapidAxes;
            inversions = parseConfig.rapidInversions;
        } else if (command === parseConfig.cutCommand) {
            isCutting = true;
            axes = parseConfig.cutAxes;
            inversions = parseConfig.cutInversions;
        } else {
            // Not a movement command we recognize, skip
            continue;
        }

        // Extract coordinates from line
        // Create a regex that matches any axis letter followed by a number
        const coordinates = {};
        const coordRegex = /([XYZ])([\d.-]+)/gi;
        let coordMatch;
        while ((coordMatch = coordRegex.exec(trimmed)) !== null) {
            const axis = coordMatch[1].toUpperCase();
            coordinates[axis] = parseFloat(coordMatch[2]);
        }

        // Apply inversions and create final position
        const newPos = { x: currentX, y: currentY, z: currentZ };

        // Process coordinates in the order specified by the template
        for (const axis of axes) {
            if (coordinates.hasOwnProperty(axis)) {
                let value = coordinates[axis];

                // Apply inversion if specified
                if (inversions[axis]) {
                    value = -value;
                }

                // Map axis to x, y, z
                if (axis === 'X') newPos.x = value;
                else if (axis === 'Y') newPos.y = value;
                else if (axis === 'Z') newPos.z = value;
            }
        }

        // Extract feed rate
        const feedMatch = trimmed.match(/F([\d.-]+)/i);
        if (feedMatch) {
            currentFeedRate = parseFloat(feedMatch[1]) || currentFeedRate;
        }

        // Create movement entry
        const movement = {
            x: newPos.x,
            y: newPos.y,
            z: newPos.z,
            isG1: isCutting,
            isCutting: isCutting,  // Alias for clarity
            feedRate: isCutting ? currentFeedRate : 6000,
            type: isCutting ? 'feed' : 'rapid',
            tool: currentTool,
            toolId: currentToolId,
            toolType: currentToolType,
            toolDiameter: currentToolDiameter,
            toolAngle: currentToolAngle,
            stepDown: currentStepDown,
            gcodeLineNumber: lineIndex + 1  // 1-indexed line number from G-code file
        };

        // Add movement regardless of whether position changed (includes no-op moves)
        // This allows every G-code line to be selectable in the viewer
        movements.push(movement);

        // Update current position
        currentX = newPos.x;
        currentY = newPos.y;
        currentZ = newPos.z;
    }

    return movements;
}
