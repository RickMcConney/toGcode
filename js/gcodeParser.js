/**
 * G-code Parser
 * Shared parser for both 2D and 3D simulators
 * Handles variable G-code commands, axis ordering, and axis inversions based on post-processor profiles
 */

// Movement type constants - match G-code conventions: G0 = rapid, G1 = cutting
const NON_MOVEMENT = -1;  // Non-movement lines (comments, empty lines, M-codes, etc.)
const RAPID = 0;          // G0 - Rapid positioning move
const CUT = 1;            // G1 - Linear cutting move

// Pre-compiled regex patterns for performance (avoid recreating on every iteration)
const TOOL_REGEX = /Tool:\s*ID=(\d+)\s+Type=([A-Za-z ]+)\s+Diameter=([\d.]+)\s+Angle=([\d.]+)(?:\s+StepDown=([\d.]+))?/;
const COORD_REGEX = /([XYZIJ])([\d.-]+)/gi;
const FEED_REGEX = /F([\d.-]+)/i;

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
            cwArcCommand: 'G2',
            ccwArcCommand: 'G3',
            rapidAxes: ['X', 'Y', 'Z'],
            cutAxes: ['X', 'Y', 'Z'],
            rapidInversions: { X: false, Y: false, Z: false },
            cutInversions: { X: false, Y: false, Z: false }
        };
    }

    const rapidInfo = parseGcodeTemplate(profile.rapidTemplate || 'G0 X Y Z F');
    const cutInfo = parseGcodeTemplate(profile.cutTemplate || 'G1 X Y Z F');

    // Extract arc commands from templates (first token)
    var cwArcCmd = 'G2', ccwArcCmd = 'G3';
    if (profile.cwArcTemplate) {
        var tokens = profile.cwArcTemplate.trim().split(/\s+/);
        if (tokens[0]) cwArcCmd = tokens[0];
    }
    if (profile.ccwArcTemplate) {
        var tokens = profile.ccwArcTemplate.trim().split(/\s+/);
        if (tokens[0]) ccwArcCmd = tokens[0];
    }

    return {
        rapidCommand: rapidInfo.command,
        cutCommand: cutInfo.command,
        cwArcCommand: cwArcCmd,
        ccwArcCommand: ccwArcCmd,
        rapidAxes: rapidInfo.axes,
        cutAxes: cutInfo.axes,
        rapidInversions: rapidInfo.inversions,
        cutInversions: cutInfo.inversions
    };
}

/**
 * Shared non-movement object - referenced by all non-movement entries to save memory
 * Movement type: NON_MOVEMENT (-1) = non-movement (comment, empty line, unrecognized command)
 */
const SHARED_NON_MOVEMENT = Object.freeze({
    x: 0,
    y: 0,
    z: 0,
    f: 0,       // feedRate
    t: -1,      // tool index (-1 = no tool)
    m: NON_MOVEMENT  // movement type (-1 = non-movement)
});

/**
 * Parse a G-code string and extract movements with optimized memory structure
 *
 * Movement object (6 fields instead of 14):
 *   x, y, z - coordinates
 *   f - feed rate
 *   t - tool index (-1 for no tool, 0+ for index into tools array)
 *   m - movement type: 0=non-movement, 1=rapid (G0), 2=cutting (G1)
 *
 * Non-movement entries reference SHARED_NON_MOVEMENT to save memory
 *
 * @param {string} gcode - G-code string
 * @param {object} parseConfig - Parse configuration from createGcodeParseConfig()
 * @returns {object} - { movements: array, tools: array } where tools are shared across movements
 */
function parseGcodeFile(gcode, parseConfig) {
    if (!parseConfig) {
        parseConfig = createGcodeParseConfig(null);
    }

    const lines = gcode.split('\n');
    const movements = [];
    const lineMap = [];         // lineMap[movementIndex] = original G-code line number
    const tools = [];           // Deduplicated tool list
    const toolMap = new Map();  // toolId -> index mapping for fast lookup

    let currentX = 0, currentY = 0, currentZ = 0;
    let currentFeedRate = 1000;
    let currentToolIndex = -1;  // Index into tools array (-1 = no tool)

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const trimmed = line.trim();

        // Skip empty lines - reference shared non-movement object
        if (!trimmed) {
            movements.push(SHARED_NON_MOVEMENT);
            lineMap.push(lineIndex);
            continue;
        }

        // Handle comment lines (both parentheses and semicolon styles)
        if (trimmed.startsWith('(') || trimmed.startsWith(';')) {
            // Extract comment text based on format
            let commentText = '';
            if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
                commentText = trimmed.substring(1, trimmed.length - 1);
            } else if (trimmed.startsWith(';')) {
                commentText = trimmed.substring(1);
            } else if (trimmed.startsWith('(')) {
                commentText = trimmed.substring(1);
            }

            // Try to extract tool info from comment text (pre-check to avoid expensive regex)
            if (commentText.includes('Tool:')) {
                const toolMatch = commentText.match(TOOL_REGEX);
                if (toolMatch) {
                    const toolId = toolMatch[1];
                    const toolType = toolMatch[2].trim();
                    const toolDiameter = parseFloat(toolMatch[3]) || 0;
                    const toolAngle = parseFloat(toolMatch[4]) || 0;
                    const stepDown = parseFloat(toolMatch[5]) || 0;

                    // Check if this tool already exists in our tools array
                    if (!toolMap.has(toolId)) {
                        // New tool - add to tools array and map
                        const toolIndex = tools.length;
                        tools.push({
                            id: toolId,
                            type: toolType,
                            diameter: toolDiameter,
                            angle: toolAngle,
                            stepDown: stepDown
                        });
                        toolMap.set(toolId, toolIndex);
                        currentToolIndex = toolIndex;
                    } else {
                        // Tool already exists - use its index
                        currentToolIndex = toolMap.get(toolId);
                    }
                }
            }

            // Comment lines reference shared non-movement object
            movements.push(SHARED_NON_MOVEMENT);
            lineMap.push(lineIndex);
            continue;
        }

        // Extract command (first token) - optimize by avoiding split
        const spaceIdx = trimmed.search(/\s/);
        const command = spaceIdx > 0 ? trimmed.substring(0, spaceIdx) : trimmed;

        // Determine if this is a rapid or cutting move
        let isCutting = false;
        let axes = null;
        let inversions = null;

        let isArc = false;
        let arcCW = false;

        if (command === parseConfig.rapidCommand) {
            isCutting = false;
            axes = parseConfig.rapidAxes;
            inversions = parseConfig.rapidInversions;
        } else if (command === parseConfig.cutCommand) {
            isCutting = true;
            axes = parseConfig.cutAxes;
            inversions = parseConfig.cutInversions;
        } else if (command === parseConfig.cwArcCommand) {
            isArc = true;
            arcCW = true;
            axes = parseConfig.cutAxes;
            inversions = parseConfig.cutInversions;
        } else if (command === parseConfig.ccwArcCommand) {
            isArc = true;
            arcCW = false;
            axes = parseConfig.cutAxes;
            inversions = parseConfig.cutInversions;
        } else {
            // Not a movement command we recognize - reference shared non-movement
            movements.push(SHARED_NON_MOVEMENT);
            lineMap.push(lineIndex);
            continue;
        }

        // Extract coordinates from line using pre-compiled regex (now includes I, J)
        const coordinates = {};
        let coordMatch;
        while ((coordMatch = COORD_REGEX.exec(trimmed)) !== null) {
            const axis = coordMatch[1].toUpperCase();
            coordinates[axis] = parseFloat(coordMatch[2]);
        }
        // Reset regex for next line
        COORD_REGEX.lastIndex = 0;

        // Extract feed rate (only if line contains 'F')
        if (trimmed.includes('F') || trimmed.includes('f')) {
            const feedMatch = trimmed.match(FEED_REGEX);
            if (feedMatch) {
                currentFeedRate = parseFloat(feedMatch[1]) || currentFeedRate;
            }
        }

        if (isArc) {
            // G2/G3 arc command — expand to linear segments for simulation
            const endPos = { x: currentX, y: currentY, z: currentZ };

            for (const axis of axes) {
                if (coordinates.hasOwnProperty(axis)) {
                    let value = coordinates[axis];
                    if (inversions[axis]) value = -value;
                    if (axis === 'X') endPos.x = value;
                    else if (axis === 'Y') endPos.y = value;
                    else if (axis === 'Z') endPos.z = value;
                }
            }

            // I, J are relative offsets from current position to arc center
            const ci = coordinates.I || 0;
            const cj = coordinates.J || 0;
            const cx = currentX + ci;
            const cy = currentY + cj;

            // Calculate start and end angles
            const startAngle = Math.atan2(currentY - cy, currentX - cx);
            const endAngle = Math.atan2(endPos.y - cy, endPos.x - cx);

            // Calculate angular span
            let span;
            if (arcCW) {
                span = startAngle - endAngle;
                if (span <= 0) span += 2 * Math.PI;
            } else {
                span = endAngle - startAngle;
                if (span <= 0) span += 2 * Math.PI;
            }

            // Handle full circles (start == end)
            const dx = endPos.x - currentX;
            const dy = endPos.y - currentY;
            if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
                span = 2 * Math.PI;
            }

            // Number of segments: ~1 per 5 degrees, minimum 8
            const numSegments = Math.max(8, Math.ceil(span / (5 * Math.PI / 180)));
            const radius = Math.sqrt((currentX - cx) * (currentX - cx) + (currentY - cy) * (currentY - cy));

            // Z interpolation for helical arcs
            const zStart = currentZ;
            const zEnd = endPos.z;

            for (let seg = 1; seg <= numSegments; seg++) {
                const frac = seg / numSegments;
                const angle = arcCW
                    ? startAngle - span * frac
                    : startAngle + span * frac;

                const segX = cx + radius * Math.cos(angle);
                const segY = cy + radius * Math.sin(angle);
                const segZ = zStart + (zEnd - zStart) * frac;

                movements.push({
                    x: segX,
                    y: segY,
                    z: segZ,
                    f: currentFeedRate,
                    t: currentToolIndex,
                    m: CUT
                });
                lineMap.push(lineIndex);
            }

            // Update current position to arc endpoint
            currentX = endPos.x;
            currentY = endPos.y;
            currentZ = endPos.z;
        } else {
            // Linear move (G0/G1)
            const newPos = { x: currentX, y: currentY, z: currentZ };

            for (const axis of axes) {
                if (coordinates.hasOwnProperty(axis)) {
                    let value = coordinates[axis];
                    if (inversions[axis]) value = -value;
                    if (axis === 'X') newPos.x = value;
                    else if (axis === 'Y') newPos.y = value;
                    else if (axis === 'Z') newPos.z = value;
                }
            }

            const movement = {
                x: newPos.x,
                y: newPos.y,
                z: newPos.z,
                f: currentFeedRate,
                t: currentToolIndex,
                m: isCutting ? CUT : RAPID
            };

            movements.push(movement);
            lineMap.push(lineIndex);

            currentX = newPos.x;
            currentY = newPos.y;
            currentZ = newPos.z;
        }
    }

    // Return movements, tools, and line mapping
    // lineMap[i] = original G-code line number for movements[i]
    // When G2/G3 arcs are expanded, multiple movements map to the same line
    return {
        movements: movements,
        tools: tools,
        lineMap: lineMap,
        sharedNonMovement: SHARED_NON_MOVEMENT
    };
}
