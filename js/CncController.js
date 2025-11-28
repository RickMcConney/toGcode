

// Import other operations...

class CncController {
  constructor() {
    this.operationManager = new OperationManager();

    // Register all operations
    let select = Select.getInstance();
    this.operationManager.registerOperation(select);
    this.operationManager.registerOperation(new Workpiece());
    //this.operationManager.registerOperation(new Origin());
    // Pan tool removed - use middle mouse button to pan
    this.operationManager.registerOperation(new Transform());
    this.operationManager.registerOperation(new PathEdit());
    this.operationManager.registerOperation(new BooleanOpp());
    this.operationManager.registerOperation(new Gemini())
    this.operationManager.registerOperation(new Pen());
    this.operationManager.registerOperation(new Shape());
    this.operationManager.registerOperation(new Text());
    this.operationManager.registerOperation(new Drill());
    this.operationManager.registerOperation(new TabEditor());

    // Set default operation to Select
    this.operationManager.setCurrentOperation('Select');

    // RAF render loop properties
    this.isDirty = false;
    this.renderFrameId = null;
    this.lastFrameTime = 0;
  }

  setupEventListeners() {

    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');

    // Middle mouse button panning state
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.startPanX = 0;
    this.startPanY = 0;

    this.canvas.addEventListener('mousedown', (evt) => {
      // Middle mouse button (button === 1) triggers panning
      if (evt.button === 1) {
        this.isPanning = true;
        this.panStartX = evt.offsetX || (evt.pageX - this.canvas.offsetLeft);
        this.panStartY = evt.offsetY || (evt.pageY - this.canvas.offsetTop);
        this.startPanX = typeof panX !== 'undefined' ? panX : 0;
        this.startPanY = typeof panY !== 'undefined' ? panY : 0;
        evt.preventDefault(); // Prevent default middle-click behavior
        return;
      }

      this.operationManager.handleMouseEvent('Down', this.canvas, evt);
      redraw();
    });

    this.canvas.addEventListener('mouseup', (evt) => {
      // Release middle mouse button panning
      if (evt.button === 1) {
        this.isPanning = false;
        evt.preventDefault();
        return;
      }

      this.operationManager.handleMouseEvent('Up', this.canvas, evt);
      redraw();
    });

    this.canvas.addEventListener('mousemove', (evt) => {
      // Handle middle mouse button panning
      if (this.isPanning) {
        var x = evt.offsetX || (evt.pageX - this.canvas.offsetLeft);
        var y = evt.offsetY || (evt.pageY - this.canvas.offsetTop);
        var dx = x - this.panStartX;
        var dy = y - this.panStartY;

        if (typeof panX !== 'undefined' && typeof panY !== 'undefined') {
          panX = this.startPanX + dx;
          panY = this.startPanY + dy;
        }
        redraw();
        evt.preventDefault();
        return;
      }

      this.operationManager.handleMouseEvent('Move', this.canvas, evt);
      //redraw();
    });

    // Prevent context menu on middle mouse button
    this.canvas.addEventListener('contextmenu', (evt) => {
      if (evt.button === 1) {
        evt.preventDefault();
      }
    });

    // Handle document visibility changes (pause RAF when tab hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseRenderLoop();
      } else {
        this.resumeRenderLoop();
      }
    });

    // Cleanup RAF on page unload
    window.addEventListener('beforeunload', () => {
      if (this.renderFrameId) {
        cancelAnimationFrame(this.renderFrameId);
      }
    });

    // Start the RAF render loop
    this.startRenderLoop();
  }

  setMode(mode) {
    setMode(mode);
    this.operationManager.setCurrentOperation(mode);
    
  }

  draw() {
    // Draw current operation
    this.operationManager.draw(this.ctx);
  }

  // RAF Render Loop Methods

  startRenderLoop() {
    const runRenderLoop = (timestamp) => {
      this.lastFrameTime = timestamp;

      // Check dirty flag and render if needed
      if (this.isDirty) {
        redrawCore();
        this.isDirty = false;
      }

      // Schedule next frame
      this.renderFrameId = requestAnimationFrame(runRenderLoop);
    };

    // Start the loop
    this.renderFrameId = requestAnimationFrame(runRenderLoop);
  }

  pauseRenderLoop() {
    if (this.renderFrameId) {
      cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }
  }

  resumeRenderLoop() {
    if (!this.renderFrameId) {
      this.startRenderLoop();
    }
  }

  setDirty() {
    this.isDirty = true;
  }
}

// Global render system functions

// Initialize controller as global
var cncController;  // Will be set in initialization

// Global function to mark canvas as needing redraw
function setDirty() {
  if (typeof cncController !== 'undefined' && cncController && cncController.setDirty) {
    cncController.setDirty();
  }
}

// Immediate redraw (for special cases like simulation)
function redrawImmediate() {
  if (typeof redrawCore === 'function') {
    redrawCore();
  }
}