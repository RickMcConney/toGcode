/**
 * GcodeView - Displays G-code during simulation with current line highlighting
 * and seeking support via line clicks.
 */
class GcodeView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.lines = [];                    // Array of {lineNumber, text, element}
        this.currentLineNumber = -1;        // Currently highlighted line
        this.gcodeText = '';               // Full G-code text
    }

    /**
     * Populate the view with G-code text
     * @param {string} gcodeText - Raw G-code with newlines
     */
    populate(gcodeText) {
        this.gcodeText = gcodeText;
        this.lines = [];
        this.currentLineNumber = -1;
        this._renderLines(gcodeText);
    }

    /**
     * Highlight the current line and auto-scroll to keep it visible
     * @param {number} lineNumber - G-code line number
     */
    setCurrentLine(lineNumber) {
        if (lineNumber === this.currentLineNumber) {
            return;  // No change
        }

        // Remove highlight from previous line
        if (this.currentLineNumber >= 0) {
            const prevElement = this.container.querySelector(
                `[data-line-number="${this.currentLineNumber}"]`
            );
            if (prevElement) {
                prevElement.classList.remove('active-gcode-line');
            }
        }

        // Add highlight to the exact line requested
        const currentElement = this.container.querySelector(
            `[data-line-number="${lineNumber}"]`
        );
        if (currentElement) {
            currentElement.classList.add('active-gcode-line');
            // Auto-scroll into view
            currentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            this.currentLineNumber = lineNumber;
        }
    }

    /**
     * Show the G-code view
     */
    show() {
        if (this.container) {
            this.container.style.display = '';
        }
    }

    /**
     * Hide the G-code view
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    /**
     * Clear all lines and hide
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.lines = [];
        this.currentLineNumber = -1;
        this.gcodeText = '';
    }

    /**
     * Internal: Parse and render G-code lines
     * @private
     */
    _renderLines(gcodeText) {
        if (!this.container) {
            console.warn('GcodeView container not found');
            return;
        }

        let lines = gcodeText.split('\n');
        // Remove trailing empty lines
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }

        let lineNumber = 0;  // 0-indexed (matches movement array indexing)

        const fragment = document.createDocumentFragment();

        lines.forEach((text) => {
            // Skip empty lines but still count them
            const trimmed = text.trim();

            const lineDiv = document.createElement('div');
            lineDiv.className = 'gcode-line';
            lineDiv.setAttribute('data-line-number', lineNumber);

            // Format: "N: G-code text" (0-based indexing to match movement array)
            const lineText = document.createElement('span');
            lineText.className = 'gcode-line-number';
            lineText.textContent = lineNumber + ': ';  // 0-based indexing

            const codeText = document.createElement('span');
            codeText.className = 'gcode-line-code';
            codeText.textContent = trimmed || '(empty)';

            lineDiv.appendChild(lineText);
            lineDiv.appendChild(codeText);

            // Store reference
            this.lines.push({
                lineNumber: lineNumber,
                text: text,
                element: lineDiv
            });

            fragment.appendChild(lineDiv);
            lineNumber++;
        });

        this.container.innerHTML = '';
        this.container.appendChild(fragment);

        // Wire up click handlers
        this._setupClickHandlers();
    }

    /**
     * Internal: Set up click handlers for seeking
     * @private
     */
    _setupClickHandlers() {
        if (!this.container) return;

        const lineElements = this.container.querySelectorAll('.gcode-line');
        lineElements.forEach((element) => {
            element.addEventListener('click', (e) => {
                const lineNumber = parseInt(element.getAttribute('data-line-number'), 10);
                this._handleLineClick(lineNumber);
            });

            // Visual feedback on hover
            element.style.cursor = 'pointer';
        });
    }

    /**
     * Internal: Handle click on a G-code line
     * @private
     */
    _handleLineClick(lineNumber) {
        // Highlight the clicked line in viewer
        this.setCurrentLine(lineNumber);

        // Seek the simulator to this line
        // Check 2D simulation first (even if paused, it's the active simulation)
        if (typeof simulation2D !== 'undefined' && (simulation2D.isRunning || simulation2D.isPaused)) {
            // 2D simulation is active (running or paused) - direct line-based seeking
            if (typeof setSimulation2DLineNumber === 'function') {
                setSimulation2DLineNumber(lineNumber);
            }
        } else if (typeof toolpathAnimation !== 'undefined' && toolpathAnimation) {
            // 3D simulation - use seekToLineNumber for line-driven animation
            toolpathAnimation.seekToLineNumber(lineNumber);
        }
    }

}
