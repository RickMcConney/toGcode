class OperationManager {
  constructor() {
    this.operations = new Map();
    this.currentOperation = null;
  }

  registerOperation(operation) {
    this.operations.set(operation.name, operation);
  }

  getOperation(name) {
    return this.operations.get(name);
  }

  getCurrentOperation() {
    return this.currentOperation;
  }

  setCurrentOperation(name) {
    if (this.currentOperation) {
      this.currentOperation.stop();
    }
    
    this.currentOperation = this.operations.get(name);
    if (this.currentOperation) {
      this.currentOperation.start();
    }
    var canvas = document.getElementById('canvas');
    if(name === 'Pan'|| name == 'Origin'){
        canvas.style.cursor = "grab";
    }
    else if(name === 'Move'){
        canvas.style.cursor = "move";
    }
    else if(name === 'Pen' || name == 'Drill'){
        canvas.style.cursor = "crosshair";
    }
    else if(name === 'Text'){
        canvas.style.cursor = "text";
    }
    else{
        canvas.style.cursor = "default"
    }
  }

  handleMouseEvent(eventName, canvas, evt) {
    if (this.currentOperation) {
      const handler = this.currentOperation[`onMouse${eventName}`];
      if (handler) {
        handler.call(this.currentOperation, canvas,evt);
      }
    }
  }

  addOperations(){
    for (let op of this.operations.values()) {
        addOperation(op.name,op.icon,op.tooltip);
    }
  }

  draw(ctx) {
    if (this.currentOperation) {
      this.currentOperation.draw(ctx);
    }
  }
}