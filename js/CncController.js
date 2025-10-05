

// Import other operations...

class CncController {
  constructor() {
    this.operationManager = new OperationManager();
    
    // Register all operations
    this.operationManager.registerOperation(new Select());
    this.operationManager.registerOperation(new Workpiece());
    this.operationManager.registerOperation(new Origin());
    // Pan tool removed - use middle mouse button to pan
    this.operationManager.registerOperation(new Transform());
    this.operationManager.registerOperation(new PathEdit());
    this.operationManager.registerOperation(new Pen());
    this.operationManager.registerOperation(new Polygon());
    this.operationManager.registerOperation(new Text());
    this.operationManager.registerOperation(new Drill());

    // Set default operation to Select
    this.operationManager.setCurrentOperation('Select');
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
      redraw();
    });

    // Prevent context menu on middle mouse button
    this.canvas.addEventListener('contextmenu', (evt) => {
      if (evt.button === 1) {
        evt.preventDefault();
      }
    });

    this.operationManager.addOperations();
    addSidebarOperations();
  }

  setMode(mode) {
    setMode(mode);
    this.operationManager.setCurrentOperation(mode);
    
  }

  draw() {
    // Draw current operation
    this.operationManager.draw(this.ctx);
  }
}