/**
 * Base Tool Properties Editor Framework
 * Provides a consistent interface for tool property editing and help systems
 */

class ToolPropertiesEditor {
    constructor(toolName) {
        this.toolName = toolName;
        this.properties = {};
        this.helpSteps = [];
        this.currentHelpStep = 0;
        this.isActive = false;
    }

    // Abstract methods to be implemented by tool-specific editors
    getPropertiesHTML() {
        return '<p class="text-muted">No properties available for this tool.</p>';
    }

    updateFromProperties(data) {
        this.properties = { ...this.properties, ...data };
        this.onPropertiesChanged(data);
    }

    onPropertiesChanged(data) {
        // Override in subclasses to handle property changes
    }

    // Help system methods
    getHelpSteps() {
        return ['Click and drag to use this tool.'];
    }

    getCurrentHelpStep() {
        return this.currentHelpStep;
    }

    setHelpStep(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.getHelpSteps().length) {
            this.currentHelpStep = stepIndex;
            this.updateHelpDisplay();
        }
    }

    nextHelpStep() {
        const steps = this.getHelpSteps();
        if (this.currentHelpStep < steps.length - 1) {
            this.currentHelpStep++;
            this.updateHelpDisplay();
        }
    }

    resetHelpSteps() {
        this.currentHelpStep = 0;
        this.updateHelpDisplay();
    }

    getHelpText() {
        const steps = this.getHelpSteps();
        if (steps.length > 0 && this.currentHelpStep < steps.length) {
            return steps[this.currentHelpStep];
        }
        return 'Click and drag to use this tool.';
    }

    updateHelpDisplay() {
        const helpContent = document.getElementById('tool-help-content') ||
                           document.getElementById('operation-help-content');
        if (helpContent) {
            helpContent.innerHTML = this.getHelpText();
        }
    }

    // Utility methods for creating form elements
    createTextInput(label, name, value = '', placeholder = '') {
        return `
            <div class="mb-3">
                <label for="${name}" class="form-label">${label}</label>
                <input type="text"
                       class="form-control"
                       id="${name}"
                       name="${name}"
                       value="${value}"
                       placeholder="${placeholder}">
            </div>
        `;
    }

    createNumberInput(label, name, value = 0, min = null, max = null, step = null) {
        const minAttr = min !== null ? `min="${min}"` : '';
        const maxAttr = max !== null ? `max="${max}"` : '';
        const stepAttr = step !== null ? `step="${step}"` : '';

        return `
            <div class="mb-3">
                <label for="${name}" class="form-label">${label}</label>
                <input type="number"
                       class="form-control"
                       id="${name}"
                       name="${name}"
                       value="${value}"
                       ${minAttr}
                       ${maxAttr}
                       ${stepAttr}>
            </div>
        `;
    }

    createRangeInput(label, name, value = 50, min = 0, max = 100, step = 1) {
        return `
            <div class="mb-3">
                <label for="${name}" class="form-label">${label}: <span id="${name}-value">${value}</span></label>
                <input type="range"
                       class="form-range"
                       id="${name}"
                       name="${name}"
                       value="${value}"
                       min="${min}"
                       max="${max}"
                       step="${step}"
                       oninput="document.getElementById('${name}-value').textContent = this.value">
            </div>
        `;
    }

    createSelectInput(label, name, options, selectedValue = '') {
        const optionsHTML = options.map(option => {
            const value = typeof option === 'string' ? option : option.value;
            const text = typeof option === 'string' ? option : option.text;
            const selected = value === selectedValue ? 'selected' : '';
            return `<option value="${value}" ${selected}>${text}</option>`;
        }).join('');

        return `
            <div class="mb-3">
                <label for="${name}" class="form-label">${label}</label>
                <select class="form-select" id="${name}" name="${name}">
                    ${optionsHTML}
                </select>
            </div>
        `;
    }

    createCheckboxInput(label, name, checked = false) {
        return `
            <div class="mb-3 form-check">
                <input type="checkbox"
                       class="form-check-input"
                       id="${name}"
                       name="${name}"
                       ${checked ? 'checked' : ''}>
                <label class="form-check-label" for="${name}">
                    ${label}
                </label>
            </div>
        `;
    }

    createColorInput(label, name, value = '#000000') {
        return `
            <div class="mb-3">
                <label for="${name}" class="form-label">${label}</label>
                <input type="color"
                       class="form-control form-control-color"
                       id="${name}"
                       name="${name}"
                       value="${value}">
            </div>
        `;
    }

    // Status management
    activate() {
        this.isActive = true;
        this.resetHelpSteps();
    }

    deactivate() {
        this.isActive = false;
        this.resetHelpSteps();
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToolPropertiesEditor;
} else {
    window.ToolPropertiesEditor = ToolPropertiesEditor;
}