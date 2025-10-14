/**
 * Step-Wise Help System
 * Manages progressive help states and contextual guidance for tools
 */

class StepWiseHelpSystem {
    constructor() {
        this.activeOperation = null;
        this.helpSteps = [];
        this.currentStep = 0;
        this.isEnabled = true;
    }

    // Register an operation with its help steps
    registerOperation(operationName, helpSteps) {
        if (!this.operations) {
            this.operations = new Map();
        }
        this.operations.set(operationName, helpSteps);
    }

    // Set the active operation and reset to first step
    setActiveOperation(operationName) {
        if (this.operations && this.operations.has(operationName)) {
            this.activeOperation = operationName;
            this.helpSteps = this.operations.get(operationName);
            this.currentStep = 0;
            this.updateDisplay();
        } else {
            // Fall back to generic help
            this.activeOperation = operationName;
            this.helpSteps = [`Use the ${operationName} tool by clicking and dragging on the canvas.`];
            this.currentStep = 0;
            this.updateDisplay();
        }
    }

    // Progress to the next step
    nextStep() {
        if (this.currentStep < this.helpSteps.length - 1) {
            this.currentStep++;
            this.updateDisplay();
            return true;
        }
        return false;
    }

    // Go back to previous step
    previousStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.updateDisplay();
            return true;
        }
        return false;
    }

    // Set specific step
    setStep(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.helpSteps.length) {
            this.currentStep = stepIndex;
            this.updateDisplay();
            return true;
        }
        return false;
    }

    // Reset to first step
    reset() {
        this.currentStep = 0;
        this.updateDisplay();
    }

    // Get current help text
    getCurrentHelp() {
        if (this.helpSteps.length > 0 && this.currentStep < this.helpSteps.length) {
            return this.helpSteps[this.currentStep];
        }
        return 'No help available.';
    }

    // Get progress information
    getProgress() {
        return {
            current: this.currentStep + 1,
            total: this.helpSteps.length,
            percentage: this.helpSteps.length > 0 ? Math.round(((this.currentStep + 1) / this.helpSteps.length) * 100) : 0
        };
    }

    // Update the help display in the UI
    updateDisplay() {
        if (!this.isEnabled) return;

        const helpContent1 = document.getElementById('tool-help-content');
        const helpContent2 = document.getElementById('operation-help-content');

        if (helpContent1 || helpContent2) {
            const progress = this.getProgress();
            const helpText = this.getCurrentHelp();

            const html = `
                <div class="help-step">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <small class="text-muted">Step ${progress.current} of ${progress.total}</small>
                        <div class="progress" style="width: 60px; height: 4px;">
                            <div class="progress-bar" role="progressbar"
                                 style="width: ${progress.percentage}%"
                                 aria-valuenow="${progress.percentage}"
                                 aria-valuemin="0"
                                 aria-valuemax="100"></div>
                        </div>
                    </div>
                    <div class="help-text">${helpText}</div>
                    ${this.createNavigationButtons()}
                </div>
            `;

            if(helpContent1) helpContent1.innerHTML = html;
            if(helpContent2) helpContent2.innerHTML = html;

            lucide.createIcons();
        }
    }

    // Create navigation buttons for help steps
    createNavigationButtons() {
        if (this.helpSteps.length <= 1) return '';

        const hasNext = this.currentStep < this.helpSteps.length - 1;
        const hasPrev = this.currentStep > 0;

        return `
            <div class="help-navigation mt-2">
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button"
                            class="btn btn-outline-secondary"
                            id="help-prev"
                            ${!hasPrev ? 'disabled' : ''}
                            onclick="window.stepWiseHelp?.previousStep()">
                        <i data-lucide="chevron-left"></i>
                    </button>
                    <button type="button"
                            class="btn btn-outline-secondary"
                            id="help-next"
                            ${!hasNext ? 'disabled' : ''}
                            onclick="window.stepWiseHelp?.nextStep()">
                        <i data-lucide="chevron-right"></i>
                    </button>
                    <button type="button"
                            class="btn btn-outline-secondary"
                            onclick="window.stepWiseHelp?.reset()">
                        <i data-lucide="rotate-ccw"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // Enable/disable the help system
    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (enabled) {
            this.updateDisplay();
        } else {
            this.clearDisplay();
        }
    }

    // Clear the help display
    clearDisplay() {
        const helpContent = document.getElementById('tool-help-content') ||
                           document.getElementById('operation-help-content');
        if (helpContent) {
            helpContent.innerHTML = '';
        }
    }

    // Clear active operation
    clearActiveOperation() {
        this.activeOperation = null;
        this.helpSteps = [];
        this.currentStep = 0;
        this.clearDisplay();
    }

    // Static method to create and initialize default help steps
    static createDefaultHelpSteps() {
        const helpSteps = {
            'Select': [
                'Click on a path to select it, or drag to select multiple paths',
                'Selected paths will be highlighted and can be moved or operated on',
                'Selection is a toggle - click again to deselect'
            ],
            'Origin': [
                'Drag to set the origin point (0,0)',
                'This will be the starting position for your CNC machine',
                'All coordinates will be relative to this point'
            ],
            'Pan': [
                'Click and drag to pan the view around the canvas',
                'Use this to navigate around large designs',
                'Scroll wheel also zooms in and out'
            ],
            'Move': [
                'Click on a path to select it, or drag to select multiple paths',
                'Use center handle to move the selection, Side handles to scale, top handle to rotate',
                'Hold Shift while dragging to scale uniformly or constrain movement',
                'All selected paths will move/scale/rotate together'
            ],
            'Edit Points': [
                'Click on a path to select it for editing',
                'Drag the circular handles to move individual points',
                'Hold Alt and click on a line segment to add a new point',
                'Hover over a point and press Delete/Backspace to remove it',
                'Click on a different path to edit it, or click empty space to deselect'
            ],
            'Boolean': [
                'Select Multiple paths',
                'Select Operation and click Apply',
            ],
            'Gemini': [
                'Make sure you have a Gemini API key from Google Cloud',
                'Enter your API key and a text prompt describing the shape you want to create',
                'Click Apply, wait a few seconds for the AI to generate the SVG paths',
                'The generated paths will be added to your canvas for further editing'
            ],
            'Pen': [
                'Click on the canvas to set the first point of the path',
                'Click to add more points and create line segments',
                'To close the path, click near the first point when the green circle appears',
                'Press Escape to finish the path without closing'
            ],
            'Polygon': [
                'Set the number of sides in the properties panel',
                'Click to place the center point of the polygon and drag outwards to size it',
                'Polygon created! Adjust properties or click Done to finish'
            ],
            'Shape': [
                'Set the shape properties',
                'Click to place the center point of the shape',
                'Shape created! Adjust properties or click Done to finish'
            ],
            'Text': [
                'Enter your text in the properties panel',
                'Choose font and size settings',
                'Click on the canvas to place the text',
                'Text paths created! Edit properties or click Done'
            ],
            'Drill': [
                'Click to generate drill toolpaths'
            ],
            'Inside': [
                'Select closed paths to cut inside',
                'Tool will cut inside the path boundary',
                'Depth of cut is determined by tool depth setting',
                'Check tool diameter and cutting parameters',
                'Inside cutting toolpath generated'
            ],
            'Outside': [
                'Select closed paths to cut outside',
                'Tool will cut outside the path boundary',
                'Depth of cut is determined by tool depth setting',
                'Useful for cutting parts out of stock material',
                'Outside cutting toolpath generated'
            ],
            'Center': [
                'Select paths to cut along the center line',
                'Tool follows the exact path without offset',
                'Depth of cut is determined by tool depth setting',
                'Good for engraving or decorative cuts',
                'Center line toolpath generated'
            ],
            'Pocket': [
                'Select closed paths to pocket out material',
                'Tool will remove all material inside the path',
                'Depth of cut is determined by tool depth setting',
                'Set cutting depth and stepover percentage',
                'Pocket toolpath generated with multiple passes'
            ],
            'Vcarve In': [
                'Select paths for V-carving inside',
                'Uses V-bit to create tapered cuts',
                'Deeper cuts create wider grooves',
                'V-carve toolpath generated'
            ],
            'Workpiece': [
                'Configure your workpiece dimensions: width, length, and thickness in millimeters',
                'Select your wood species from the dropdown to optimize cutting parameters',
                'Set the grid size and toggle display options (grid, origin, workpiece outline)',
                'Choose the origin position by clicking on the 3x3 grid - this sets where (0,0) will be located',
                'All changes update the canvas immediately and are saved automatically'
            ]
        };

        return helpSteps;
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.stepWiseHelp = new StepWiseHelpSystem();

    // Initialize with default help steps
    const defaultSteps = StepWiseHelpSystem.createDefaultHelpSteps();
    Object.entries(defaultSteps).forEach(([operation, steps]) => {
        window.stepWiseHelp.registerOperation(operation, steps);
    });
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StepWiseHelpSystem;
} else {
    window.StepWiseHelpSystem = StepWiseHelpSystem;
}