class Pen extends Operation {
    constructor() {
        super('Pen', 'fa fa-pencil');
        document.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape') {
                this.finishDrawing();
            }

        });
    }

    start() {
        this.drawingPoints = [];
    }

    stop() {
        this.finishDrawing();
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.drawingPoints.push({ x: mouse.x, y: mouse.y });
        this.lastPoint = { x: mouse.x, y: mouse.y };
    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        if (this.lastPoint) {
            this.previewLine = {
                start: this.lastPoint,
                end: { x: mouse.x, y: mouse.y }
            }
        }
    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
        this.endDrawing();
    }

    draw(ctx) {

        // Draw all existing line segments
        if (this.drawingPoints.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.drawingPoints[0].x, this.drawingPoints[0].y);
            for (var i = 1; i < this.drawingPoints.length; i++) {
                ctx.lineTo(this.drawingPoints[i].x, this.drawingPoints[i].y);
            }
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw preview line
        if (this.previewLine) {
            ctx.beginPath();
            ctx.moveTo(this.previewLine.start.x, this.previewLine.start.y);
            ctx.lineTo(this.previewLine.end.x, this.previewLine.end.y);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

    }

    endDrawing() {
        if (this.previewLine && this.previewLine.start.x == this.previewLine.end.x && this.previewLine.start.y == this.previewLine.end.y) {
            return;
        }

        if (this.previewLine) {
            this.drawingPoints.push({ x: this.previewLine.end.x, y: this.previewLine.end.y });
            this.lastPoint = { x: this.previewLine.end.x, y: this.previewLine.end.y };
        }
    }



    finishDrawing() {
		
        if (this.drawingPoints.length > 1) {
            addUndo(false, true, false);
            var svgPath = {
                id: "Pen" + svgpathId,
                type: 'path',
                name: 'Pen ' + svgpathId,
                selected: false,
                visible: true,
                path: this.drawingPoints.slice(), // Create a copy of the points
                bbox: boundingBox(this.drawingPoints)
            };
            svgpaths.push(svgPath);
            addSvgPath(svgPath.id, svgPath.name);
            svgpathId++;
        }

        this.isDrawing = false;
        this.drawingPoints = [];
        this.lastPoint = null;
        this.previewLine = null;

    }



}