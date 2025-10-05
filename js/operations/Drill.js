class Drill extends Operation {
    constructor() {
        super('Drill', 'fa fa-dot-circle-o');
        this.circleColor = circleColor;
        this.holeThreshold = 15;
    }

    stop() { 
        this.circle = null; 
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        var pt = closestPoint(mouse);
        if (pt.dist < this.holeThreshold)
            makeHole(pt);
        else
            makeHole(mouse);
    }
    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.circle = { x: mouse.x, y: mouse.y, r: 5 };
    }

    draw(ctx) {
        if(this.circle)
        {
            ctx.beginPath();
            ctx.arc(this.circle.x, this.circle.y, this.circle.r, 0, 2 * Math.PI);
            ctx.strokeStyle = this.circleColor;
            ctx.lineWidth = 0.2;
            ctx.stroke();
        }
    }

}