/**
 * Toolpath Properties Manager
 * Manages operation-specific properties, tool selection, and defaults for CNC operations
 */

class ToolpathPropertiesManager {
    constructor() {
        // Define operation configurations
        this.operationConfigs = {
            'Drill': {
                compatibleBits: ['Drill'],
                fields: ['tool', 'depth', 'step'],
                description: 'Drill holes at selected points'
            },
            'Profile': {
                compatibleBits: ['End Mill', 'Ball Nose', 'VBit'],
                fields: ['tool', 'depth', 'step', 'inside', 'direction'],
                description: 'Cut along the profile of the selected path'
            },
            'Pocket': {
                compatibleBits: ['End Mill', 'Ball Nose'],
                fields: ['tool', 'depth', 'step', 'stepover', 'direction'],
                description: 'Remove all material inside the path'
            },
            'VCarve': {
                compatibleBits: ['VBit'],
                fields: ['tool', 'depth', 'inside'],
                description: 'V-carve inside the path with tapered cuts'
            }

        };

        // Load defaults from localStorage
        this.loadDefaults();
    }

    /**
     * Load operation defaults from localStorage
     */
    loadDefaults() {
        const stored = localStorage.getItem('toolpathOperationDefaults');
        if (stored) {
            try {
                this.defaults = JSON.parse(stored);
            } catch (e) {
                console.error('Error loading operation defaults:', e);
                this.defaults = {};
            }
        } else {
            this.defaults = {};
        }
    }

    /**
     * Save operation defaults to localStorage
     */
    saveDefaults() {
        try {
            localStorage.setItem('toolpathOperationDefaults', JSON.stringify(this.defaults));
        } catch (e) {
            console.error('Error saving operation defaults:', e);
        }
    }

    /**
     * Get default values for an operation
     */
    getDefaults(operationName) {
        if (!this.defaults[operationName]) {
            // Initialize with sensible defaults
            const workpieceThickness = getOption ? getOption('workpieceThickness') : 10;
            this.defaults[operationName] = {
                toolId: null, // Will be set to first compatible tool
                depth: workpieceThickness,
                step: workpieceThickness * 0.25,
                stepover: 25,
                inside: 'inside', // Default to 'inside' for inside/outside option
                direction: 'climb' // Default to 'climb' for direction option
            };
        }
        return this.defaults[operationName];
    }

    /**
     * Update defaults for an operation
     */
    updateDefaults(operationName, values) {
        this.defaults[operationName] = { ...this.getDefaults(operationName), ...values };
        this.saveDefaults();
    }

    /**
     * Get compatible tools for an operation
     */
    getCompatibleTools(operationName) {
        const config = this.operationConfigs[operationName];
        if (!config) return [];

        const compatibleBits = config.compatibleBits;

        // Filter tools from global tools array
        if (typeof window.tools !== 'undefined') {
            return window.tools.filter(tool => compatibleBits.includes(tool.bit));
        }

        return [];
    }

    /**
     * Get the first compatible tool for an operation
     */
    getDefaultTool(operationName) {
        const compatibleTools = this.getCompatibleTools(operationName);
        return compatibleTools.length > 0 ? compatibleTools[0] : null;
    }

    /**
     * Generate HTML for tool selection dropdown
     */
    generateToolDropdownHTML(operationName, selectedToolId = null) {
        const compatibleTools = this.getCompatibleTools(operationName);

        if (compatibleTools.length === 0) {
            return '<p class="text-danger">No compatible tools available. Please add tools in the tool library.</p>';
        }

        // If no tool is selected, use the default from last time or first available
        if (selectedToolId === null || selectedToolId === undefined) {
            const defaults = this.getDefaults(operationName);
            selectedToolId = defaults.toolId;

            // If still null, use first compatible tool
            if (selectedToolId === null && compatibleTools.length > 0) {
                selectedToolId = compatibleTools[0].recid;
            }
        }

        // Verify the selected tool exists in the compatible tools
        const toolExists = compatibleTools.some(tool => tool.recid === selectedToolId);
        if (!toolExists && compatibleTools.length > 0) {
            // Fallback to first compatible tool if selected tool doesn't exist
            selectedToolId = compatibleTools[0].recid;
        }

        let html = '<div class="mb-3">';
        html += '<label for="tool-select" class="form-label small"><strong>Tool:</strong></label>';
        html += '<select class="form-select form-select-sm" id="tool-select" name="toolId">';

        compatibleTools.forEach(tool => {
            const selected = tool.recid === selectedToolId ? 'selected' : '';
            html += `<option value="${tool.recid}" ${selected}>${tool.name} (${tool.diameter}mm ${tool.bit})</option>`;
        });

        html += '</select>';
        html += '</div>';

        return html;
    }

    generateInsideOutsideDropdownHTML(operationName, value = null) {

        if (value === null) {
            value = this.getDefaults(operationName).inside;
        }

        const options = ['Inside', 'Outside', 'Center'];


        let html = '<div class="mb-3">';
        html += '<label for="inside-select" class="form-label small"><strong>Cutting Side:</strong></label>';
        html += '<select class="form-select form-select-sm" id="inside-select" name="inside">';

        options.forEach(option => {
            const selected = option.toLowerCase() === value.toLowerCase() ? 'selected' : '';
            html += `<option value="${option.toLowerCase()}" ${selected}>${option}</option>`;
        });

        html += '</select>';
        html += '</div>';

        return html;
    }

    generateDirectionDropdownHTML(operationName, value = null) {

        if (value === null) {
            value = this.getDefaults(operationName).direction;
        }

        const options = ['Climb', 'Conventional'];

        let html = '<div class="mb-3">';
        html += '<label for="direction-select" class="form-label small"><strong>Direction:</strong></label>';
        html += '<select class="form-select form-select-sm" id="direction-select" name="direction">';


        options.forEach(option => {
            const selected = option.toLowerCase() === value.toLowerCase() ? 'selected' : '';
            html += `<option value="${option.toLowerCase()}" ${selected}>${option}</option>`;
        });

        html += '</select>';
        html += '</div>';

        return html;
    }

    /**
     * Generate HTML for depth input
     */
    generateDepthInputHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).depth;
        }

        value = formatDimension(value, true);

        let html = '<div class="mb-3">';
        html += '<label for="depth-input" class="form-label small"><strong>Depth:</strong></label>';
        html += '<input type="text" class="form-control form-control-sm" id="depth-input" name="depth" ';
        html += `value="${value}" step="0.1" min="0.1" required>`;
        html += '<div class="form-text">Cutting depth</div>';
        html += '</div>';

        return html;
    }

    /**
     * Generate HTML for step down input
     */
    generateStepInputHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).step;
        }

        value = formatDimension(value, true);

        let html = '<div class="mb-3">';
        html += '<label for="step-input" class="form-label small"><strong>Step Down:</strong></label>';
        html += '<input type="text" class="form-control form-control-sm" id="step-input" name="step" ';
        html += `value="${value}" step="0.1" min="0.1" required>`;
        html += '<div class="form-text">Depth per pass</div>';
        html += '</div>';

        return html;
    }

    /**
     * Generate HTML for stepover input
     */
    generateStepoverInputHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).stepover;
        }

        let html = '<div class="mb-3">';
        html += '<label for="stepover-input" class="form-label small"><strong>Stepover (%):</strong></label>';
        html += '<input type="number" class="form-control form-control-sm" id="stepover-input" name="stepover" ';
        html += `value="${value}" step="1" min="1" max="100" required>`;
        html += '<div class="form-text">Percentage of tool diameter to step over</div>';
        html += '</div>';

        return html;
    }

    /**
     * Generate complete properties form HTML for an operation
     */
    generatePropertiesHTML(operationName, existingProperties = null) {
        const config = this.operationConfigs[operationName];
        if (!config) {
            return '<p class="text-danger">Unknown operation</p>';
        }

        let html = '';

        // Tool selection dropdown
        if (config.fields.includes('tool')) {
            const toolId = existingProperties?.toolId || null;
            html += this.generateToolDropdownHTML(operationName, toolId);
        }

        // Inside/Outside selection (for relevant operations)
        if (config.fields.includes('inside')) {
            const inside = existingProperties?.inside || null;
            html += this.generateInsideOutsideDropdownHTML(operationName, inside);
        }
        // Direction selection (for relevant operations)
        if (config.fields.includes('direction')) {
            const direction = existingProperties?.direction || null;
            html += this.generateDirectionDropdownHTML(operationName, direction);
        }

        // Depth input
        if (config.fields.includes('depth')) {
            const depth = existingProperties?.depth || null;
            html += this.generateDepthInputHTML(operationName, depth);
        }

        // Step down input
        if (config.fields.includes('step')) {
            const step = existingProperties?.step || null;
            html += this.generateStepInputHTML(operationName, step);
        }

        // Stepover input
        if (config.fields.includes('stepover')) {
            const stepover = existingProperties?.stepover || null;
            html += this.generateStepoverInputHTML(operationName, stepover);
        }

        // Update button (only shown when there's an active toolpath to update)
        html += '<div class="mb-3">';
        html += '<button type="button" class="btn btn-primary btn-sm w-100" id="update-toolpath-button">';
        html += '<i data-lucide="refresh-cw"></i> Update Toolpath';
        html += '</button>';
        html += '<div class="form-text small">Select paths to generate toolpaths. Click Update to apply changes to the last toolpath.</div>';
        html += '</div>';

        return html;
    }

    /**
     * Collect form data from the properties panel
     */
    collectFormData() {
        const data = {};

        const toolSelect = document.getElementById('tool-select');
        const depthInput = document.getElementById('depth-input');
        const stepInput = document.getElementById('step-input');
        const stepoverInput = document.getElementById('stepover-input');
        const insideInput = document.getElementById('inside-select');
        const directionInput = document.getElementById('direction-select');

        if (toolSelect) {
            data.toolId = parseInt(toolSelect.value);
        }
        if (insideInput) {
            data.inside = insideInput.value;
        }
        if (directionInput) {
            data.direction = directionInput.value;
        }
        if (depthInput) {
            data.depth = parseDimension(depthInput.value);
        }
        if (stepInput) {
            data.step = parseDimension(stepInput.value);
        }
        if (stepoverInput) {
            data.stepover = parseFloat(stepoverInput.value);
        }

        return data;
    }

    /**
     * Validate form data
     */
    validateFormData(operationName, data) {
        const config = this.operationConfigs[operationName];
        const errors = [];

        if (config.fields.includes('tool') && !data.toolId) {
            errors.push('Please select a tool');
        }

        if (config.fields.includes('inside') && !data.inside) {
            errors.push('Please select inside/outside option');
        }
        if (config.fields.includes('depth')) {
            if (!data.depth || data.depth <= 0) {
                errors.push('Depth must be greater than 0');
            }
        }

        if (config.fields.includes('step')) {
            if (!data.step || data.step <= 0) {
                errors.push('Step down must be greater than 0');
            }
            if (data.depth && data.step > data.depth) {
                errors.push('Step down cannot be greater than total depth');
            }
        }

        if (config.fields.includes('stepover')) {
            if (!data.stepover || data.stepover <= 0 || data.stepover > 100) {
                errors.push('Stepover must be between 1 and 100%');
            }
        }

        return errors;
    }

    /**
     * Get tool object by recid
     */
    getToolById(toolId) {
        if (typeof window.tools !== 'undefined') {
            return window.tools.find(tool => tool.recid === toolId);
        }
        return null;
    }

    /**
     * Check if operation configuration exists
     */
    hasOperation(operationName) {
        return this.operationConfigs.hasOwnProperty(operationName);
    }

    /**
     * Get operation configuration
     */
    getOperationConfig(operationName) {
        return this.operationConfigs[operationName] || null;
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.toolpathPropertiesManager = new ToolpathPropertiesManager();
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToolpathPropertiesManager;
}
