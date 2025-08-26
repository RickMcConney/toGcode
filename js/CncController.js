

// Import other operations...

class CncController {
  constructor() {
    this.operationManager = new OperationManager();
    
    // Register all operations
    this.operationManager.registerOperation(new Select());
    this.operationManager.registerOperation(new Origin());
    this.operationManager.registerOperation(new Pan());
    this.operationManager.registerOperation(new Transform());
    this.operationManager.registerOperation(new Pen());
    this.operationManager.registerOperation(new Polygon());
    this.operationManager.registerOperation(new Text());
    this.operationManager.registerOperation(new Drill());

  }

  setupEventListeners() {

    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.canvas.addEventListener('mousedown', (evt) => {
      this.operationManager.handleMouseEvent('Down', this.canvas, evt);
      redraw();
    });

    this.canvas.addEventListener('mouseup', (evt) => {
      this.operationManager.handleMouseEvent('Up', this.canvas, evt);
      redraw();
    });

    this.canvas.addEventListener('mousemove', (evt) => {
      this.operationManager.handleMouseEvent('Move', this.canvas, evt);
      redraw();
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