/**
 * Toolpath Properties Manager
 * Manages operation-specific properties, tool selection, and defaults for CNC operations
 */

class ToolpathPropertiesManager {
    constructor() {
        // Define operation configurations
        this.operationConfigs = {
            'Drill': {
                compatibleBits: ['Drill', 'End Mill'],
                fields: ['tool', 'depth', 'step'],
                description: 'Drill holes at selected points or helical drill selected circles'
            },
            'Profile': {
                compatibleBits: ['End Mill', 'Ball Nose', 'VBit'],
                fields: ['tool', 'depth', 'step', 'inside', 'direction', 'numLoops', 'overCut'],
                description: 'Cut along the profile of the selected path'
            },
            'Pocket': {
                compatibleBits: ['End Mill', 'Ball Nose'],
                fields: ['tool', 'strategy', 'depth', 'step', 'stepover', 'angle', 'direction'],
                description: 'Remove all material inside the path'
            },
            'VCarve': {
                compatibleBits: ['VBit'],
                fields: ['tool', 'depth', 'inside', 'overCut'],
                description: 'V-carve inside the path with tapered cuts'
            },
            'Surfacing': {
                compatibleBits: ['End Mill'],
                fields: ['tool', 'depth', 'stepover', 'angle'],
                description: 'Surface the entire workpiece with parallel passes',
                defaultDepth: 1,
                defaultStepover: 75,
                applyButtonLabel: 'Apply Surfacing',
                applyButtonDescription: 'Generates a surfacing toolpath over the entire workpiece.'
            },
            '3dProfile': {
                compatibleBits: ['Ball Nose'],
                fields: ['strategy', 'tool', 'depth', 'step', 'stepover', 'angle', 'restToolDiameter'],
                description: 'Raster toolpath following STL surface with ball nose bit',
                defaultStepover: 15,
                applyButtonLabel: 'Generate 3D Profile',
                applyButtonDescription: 'Generates raster toolpaths that follow the STL surface.'
            },
            'Inlay': {
                compatibleBits: ['End Mill', 'Ball Nose'],
                fields: ['inlayType', 'tool', 'finishingTool', 'depth', 'step', 'stepover', 'clearance', 'glueGap', 'angle', 'direction', 'cutOut'],
                description: 'Create male plug or female socket for inlay work',
                toolLabel: 'Pocketing Tool:',
                applyButtonLabel: 'Generate Inlay',
                applyButtonDescription: 'Select paths then click to generate inlay toolpaths (pocket + finishing profile).'
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
            const config = this.operationConfigs[operationName];
            this.defaults[operationName] = {
                toolId: null, // Will be set to first compatible tool
                depth: config && config.defaultDepth !== undefined ? config.defaultDepth : workpieceThickness,
                step: workpieceThickness * 0.25,
                stepover: config && config.defaultStepover !== undefined ? config.defaultStepover : 25,
                angle: 0, // Default to horizontal (0°) for infill lines
                inside: 'inside', // Default to 'inside' for inside/outside option
                direction: 'climb', // Default to 'climb' for direction option
                numLoops: 1,
                overCut: 0,
                restToolDiameter: 0,
                strategy: operationName === 'Pocket' ? 'adaptive' : 'raster',
                inlayType: 'female',
                clearance: 0.1,
                glueGap: 0.5,
                finishingToolId: null,
                cutOut: false
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

        const config = this.operationConfigs[operationName];
        const toolLabel = config?.toolLabel || 'Tool:';

        let html = '<div class="mb-3">';
        html += `<label for="tool-select" class="form-label small"><strong>${toolLabel}</strong></label>`;
        html += '<select class="form-select form-select-sm" id="tool-select" name="toolId">';

        compatibleTools.forEach(tool => {
            const selected = tool.recid === selectedToolId ? 'selected' : '';
            html += `<option value="${tool.recid}" ${selected}>${tool.name} (${tool.diameter}mm ${tool.bit})</option>`;
        });

        html += '</select>';
        html += '</div>';

        return html;
    }

    generateDropdownHTML(id, name, label, options, value, helpText = '') {
        let html = '<div class="mb-3">';
        html += `<label for="${id}" class="form-label small"><strong>${label}</strong></label>`;
        html += `<select class="form-select form-select-sm" id="${id}" name="${name}">`;
        options.forEach(opt => {
            const optValue = typeof opt === 'string' ? opt.toLowerCase() : opt.value;
            const optLabel = typeof opt === 'string' ? opt : opt.label;
            const selected = optValue === value.toLowerCase() ? 'selected' : '';
            html += `<option value="${optValue}" ${selected}>${optLabel}</option>`;
        });
        html += '</select>';
        if (helpText) html += `<div class="form-text">${helpText}</div>`;
        html += '</div>';
        return html;
    }

    generateInsideOutsideDropdownHTML(operationName, value = null) {
        if (value === null) value = this.getDefaults(operationName).inside;
        return this.generateDropdownHTML('inside-select', 'inside', 'Cutting Side:', ['Inside', 'Outside', 'Center'], value);
    }

    generateDirectionDropdownHTML(operationName, value = null) {
        if (value === null) value = this.getDefaults(operationName).direction;
        return this.generateDropdownHTML('direction-select', 'direction', 'Direction:', ['Climb', 'Conventional'], value);
    }

    generateNumLoopsInputHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).numLoops;
        }

        let html = '<div class="mb-3">';
        html += '<label for="numloops-input" class="form-label small"><strong>Profile Loops:</strong></label>';
        html += '<input type="number" class="form-control form-control-sm" id="numloops-input" name="numLoops" ';
        html += `value="${value}" step="1" min="1" required>`;
        html += '<div class="form-text">Number of offset passes (1 = single pass)</div>';
        html += '</div>';
        return html;
    }

    generateOverCutInputHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).overCut;
        }

        value = formatDimension(value, false);

        let html = '<div class="mb-3">';
        html += '<label for="overcut-input" class="form-label small"><strong>Over/Under Cut:</strong></label>';
        html += '<input type="text" class="form-control form-control-sm" id="overcut-input" name="overCut" ';
        html += `value="${value}">`;
        html += '<div class="form-text">+ leaves stock, − cuts past the line</div>';
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
     * Generate HTML for infill angle input
     */
    generateAngleInputHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).angle;
        }

        let html = '<div class="mb-3">';
        html += '<label for="angle-input" class="form-label small"><strong>Infill Angle (°):</strong></label>';
        html += '<input type="number" class="form-control form-control-sm" id="angle-input" name="angle" ';
        html += `value="${value}" step="1" min="0" max="180" required>`;
        html += '<div class="form-text">Angle of infill lines from horizontal (0-180°)</div>';
        html += '</div>';

        return html;
    }

    /**
     * Generate HTML for strategy dropdown (Raster vs Contour).
     */
    generateStrategyDropdownHTML(operationName, value = null) {
        if (value === null) value = this.getDefaults(operationName).strategy || 'raster';

        let options, helpText;
        if (operationName === 'Pocket') {
            options = [
                { value: 'adaptive', label: 'Adaptive' },
                { value: 'raster', label: 'Raster' },
                { value: 'contour', label: 'Contour' }
            ];
            helpText = 'Adaptive combines contour and raster for optimal clearing';
        } else {
            options = [
                { value: 'raster', label: 'Raster' },
                { value: 'contour', label: 'Contour (Waterline)' }
            ];
            helpText = 'Raster for curved surfaces, Contour for vertical walls';
        }
        return this.generateDropdownHTML('strategy-select', 'strategy', 'Strategy:', options, value, helpText);
    }

    /**
     * Generate HTML for rest machining previous tool dropdown.
     * Lists all Ball Nose tool diameters so the user can specify what roughing tool was used.
     */
    generateRestToolDiameterHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).restToolDiameter || 0;
        }

        // Collect unique Ball Nose diameters from the tool library
        const ballNoseTools = (window.tools || []).filter(t => t.bit === 'Ball Nose');
        const diameters = [...new Set(ballNoseTools.map(t => t.diameter))].sort((a, b) => b - a);

        let html = '<div class="mb-3">';
        html += '<label for="rest-tool-select" class="form-label small"><strong>Previous Tool:</strong></label>';
        html += '<select class="form-select form-select-sm" id="rest-tool-select" name="restToolDiameter">';
        html += `<option value="0" ${value == 0 ? 'selected' : ''}>None (full cut from stock)</option>`;

        diameters.forEach(d => {
            const selected = value == d ? 'selected' : '';
            html += `<option value="${d}" ${selected}>${d}mm Ball Nose</option>`;
        });

        html += '</select>';
        html += '<div class="form-text">Roughing tool used in a previous pass — skips air where that tool already cut</div>';
        html += '</div>';

        return html;
    }

    /**
     * Generate HTML for inlay type dropdown (Female Socket / Male Plug)
     */
    generateInlayTypeDropdownHTML(operationName, value = null) {
        if (value === null) value = this.getDefaults(operationName).inlayType || 'female';
        return this.generateDropdownHTML('inlay-type-select', 'inlayType', 'Inlay Type:',
            [{ value: 'female', label: 'Female Socket' }, { value: 'male', label: 'Male Plug' }],
            value, 'Socket: pockets inside the path. Plug: pockets outside the path.');
    }

    /**
     * Generate HTML for clearance input
     */
    generateClearanceInputHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).clearance || 0.1;
        }

        let html = '<div class="mb-3">';
        html += '<label for="clearance-input" class="form-label small"><strong>Clearance (mm):</strong></label>';
        html += '<input type="number" class="form-control form-control-sm" id="clearance-input" name="clearance" ';
        html += `value="${value}" step="0.01" min="0" required>`;
        html += '<div class="form-text">Gap between male and female parts for fit</div>';
        html += '</div>';

        return html;
    }

    /**
     * Generate HTML for glue gap input (V-bit inlay)
     */
    generateGlueGapInputHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).glueGap || 0.5;
        }

        let html = '<div class="mb-3">';
        html += '<label for="glue-gap-input" class="form-label small"><strong>Glue Gap (mm):</strong></label>';
        html += '<input type="number" class="form-control form-control-sm" id="glue-gap-input" name="glueGap" ';
        html += `value="${value}" step="0.1" min="0" required>`;
        html += '<div class="form-text">Vertical clearance between plug and socket bottom for glue (V-bit inlay)</div>';
        html += '</div>';

        return html;
    }

    /**
     * Generate HTML for cut-out checkbox (male plug only)
     */
    generateCutOutCheckboxHTML(operationName, value = null) {
        if (value === null) {
            value = this.getDefaults(operationName).cutOut || false;
        }

        let html = '<div class="mb-3 form-check">';
        html += `<input type="checkbox" class="form-check-input" id="cutout-checkbox" name="cutOut" ${value ? 'checked' : ''}>`;
        html += '<label class="form-check-label small" for="cutout-checkbox"><strong>Cut out plug</strong></label>';
        html += '<div class="form-text">Profile around the plug at full material depth to separate it</div>';
        html += '</div>';

        return html;
    }

    /**
     * Generate HTML for finishing tool dropdown (End Mill or VBit)
     */
    generateFinishingToolDropdownHTML(operationName, selectedToolId = null) {
        const finishingBits = ['End Mill', 'VBit', 'Ball Nose'];
        const compatibleTools = (window.tools || []).filter(tool => finishingBits.includes(tool.bit));

        if (compatibleTools.length === 0) {
            return '<p class="text-danger">No compatible finishing tools available. Add an End Mill or V-Bit.</p>';
        }

        if (selectedToolId === null || selectedToolId === undefined) {
            const defaults = this.getDefaults(operationName);
            selectedToolId = defaults.finishingToolId;
            if (selectedToolId === null && compatibleTools.length > 0) {
                selectedToolId = compatibleTools[0].recid;
            }
        }

        const toolExists = compatibleTools.some(tool => tool.recid === selectedToolId);
        if (!toolExists && compatibleTools.length > 0) {
            selectedToolId = compatibleTools[0].recid;
        }

        let html = '<div class="mb-3">';
        html += '<label for="finishing-tool-select" class="form-label small"><strong>Finishing Tool:</strong></label>';
        html += '<select class="form-select form-select-sm" id="finishing-tool-select" name="finishingToolId">';

        compatibleTools.forEach(tool => {
            const selected = tool.recid === selectedToolId ? 'selected' : '';
            html += `<option value="${tool.recid}" ${selected}>${tool.name} (${tool.diameter}mm ${tool.bit})</option>`;
        });

        html += '</select>';
        html += '<div class="form-text">Tool for the finishing profile pass (End Mill or V-Bit)</div>';
        html += '</div>';

        return html;
    }

    /**
     * Build a default name from depth + operation name, e.g. "2.0 mm Pocket"
     */
    getDefaultName(operationName, existingProperties) {
        if (existingProperties?.toolpathName) return existingProperties.toolpathName;
        const depth = existingProperties?.depth ?? this.getDefaults(operationName).depth;
        const depthStr = formatDimension(depth, false);
        return `${depthStr} ${operationName}`;
    }

    /**
     * Generate complete properties form HTML for an operation
     */
    generatePropertiesHTML(operationName, existingProperties = null) {
        const config = this.operationConfigs[operationName];
        if (!config) {
            return '<p class="text-danger">Unknown operation</p>';
        }

        // Field name -> { prop, generator, useNullish }
        const fieldGenerators = [
            { field: 'inlayType',        prop: 'inlayType',        gen: 'generateInlayTypeDropdownHTML' },
            { field: 'tool',             prop: 'toolId',           gen: 'generateToolDropdownHTML' },
            { field: 'strategy',         prop: 'strategy',         gen: 'generateStrategyDropdownHTML' },
            { field: 'finishingTool',    prop: 'finishingToolId',  gen: 'generateFinishingToolDropdownHTML' },
            { field: 'inside',           prop: 'inside',           gen: 'generateInsideOutsideDropdownHTML' },
            { field: 'direction',        prop: 'direction',        gen: 'generateDirectionDropdownHTML' },
            { field: 'depth',            prop: 'depth',            gen: 'generateDepthInputHTML' },
            { field: 'step',             prop: 'step',             gen: 'generateStepInputHTML' },
            { field: 'numLoops',         prop: 'numLoops',         gen: 'generateNumLoopsInputHTML',       nullish: true },
            { field: 'overCut',          prop: 'overCut',          gen: 'generateOverCutInputHTML',        nullish: true },
            { field: 'stepover',         prop: 'stepover',         gen: 'generateStepoverInputHTML' },
            { field: 'clearance',        prop: 'clearance',        gen: 'generateClearanceInputHTML',      nullish: true },
            { field: 'glueGap',          prop: 'glueGap',          gen: 'generateGlueGapInputHTML',        nullish: true },
            { field: 'cutOut',           prop: 'cutOut',           gen: 'generateCutOutCheckboxHTML',      nullish: true },
            { field: 'angle',            prop: 'angle',            gen: 'generateAngleInputHTML' },
            { field: 'restToolDiameter', prop: 'restToolDiameter', gen: 'generateRestToolDiameterHTML',    nullish: true },
        ];

        let html = '';

        // Info box header
        html += `<div class="alert alert-info mb-3"><strong>${operationName}</strong><br>${config.description}</div>`;

        // Name field
        const defaultName = this.getDefaultName(operationName, existingProperties);
        html += `<div class="mb-3">`;
        html += `<label for="toolpath-name-input" class="form-label small"><strong>Name:</strong></label>`;
        html += `<input type="text" class="form-control form-control-sm" id="toolpath-name-input" name="toolpathName" value="${defaultName.replace(/"/g, '&quot;')}">`;
        html += `</div>`;

        // Generate fields from config
        for (const fg of fieldGenerators) {
            if (!config.fields.includes(fg.field)) continue;
            const value = fg.nullish ? (existingProperties?.[fg.prop] ?? null) : (existingProperties?.[fg.prop] || null);
            html += this[fg.gen](operationName, value);
        }

        // Update/Apply button
        const buttonLabel = config.applyButtonLabel || 'Update Toolpath';
        const buttonDesc = config.applyButtonDescription || 'Select paths to generate toolpaths. Click Update to apply changes to the last toolpath.';
        html += `<div class="mb-3">`;
        html += `<button type="button" class="btn btn-primary btn-sm w-100" id="update-toolpath-button">`;
        html += `<i data-lucide="refresh-cw"></i> ${buttonLabel}</button>`;
        html += `<div class="form-text small">${buttonDesc}</div></div>`;

        return html;
    }

    /**
     * Collect form data from the properties panel
     */
    collectFormData() {
        const data = {};

        const nameInput = document.getElementById('toolpath-name-input');
        if (nameInput) data.toolpathName = nameInput.value.trim();

        // [elementId, dataKey, parser]
        const fields = [
            ['tool-select',           'toolId',           v => parseInt(v)],
            ['inside-select',         'inside',           v => v],
            ['direction-select',      'direction',        v => v],
            ['depth-input',           'depth',            v => parseDimension(v)],
            ['step-input',            'step',             v => parseDimension(v)],
            ['stepover-input',        'stepover',         v => parseFloat(v)],
            ['angle-input',           'angle',            v => parseFloat(v)],
            ['numloops-input',        'numLoops',         v => Math.max(1, parseInt(v) || 1)],
            ['overcut-input',         'overCut',          v => parseDimension(v) || 0],
            ['inlay-type-select',     'inlayType',        v => v],
            ['clearance-input',       'clearance',        v => parseFloat(v) || 0],
            ['glue-gap-input',        'glueGap',          v => parseFloat(v) || 0],
            ['finishing-tool-select', 'finishingToolId',   v => parseInt(v)],
            ['rest-tool-select',      'restToolDiameter',  v => parseFloat(v) || 0],
            ['strategy-select',       'strategy',          v => v],
        ];

        for (const [id, key, parser] of fields) {
            const el = document.getElementById(id);
            if (el) data[key] = parser(el.value);
        }

        const cutOutCheckbox = document.getElementById('cutout-checkbox');
        if (cutOutCheckbox) data.cutOut = cutOutCheckbox.checked;

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

        if (config.fields.includes('angle')) {
            if (data.angle === null || data.angle === undefined || data.angle < 0 || data.angle > 180) {
                errors.push('Infill angle must be between 0 and 180°');
            }
        }

        if (config.fields.includes('finishingTool') && !data.finishingToolId) {
            errors.push('Please select a finishing tool');
        }

        if (config.fields.includes('clearance')) {
            if (data.clearance === null || data.clearance === undefined || data.clearance < 0) {
                errors.push('Clearance must be 0 or greater');
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
