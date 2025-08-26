class Operation {
    constructor(name, icon) {
        this.name = name;
        this.icon = icon;
    }

    // Lifecycle methods
    start() { }
    stop() { }

    // Mouse event handlers  
    onMouseDown(evt) { }
    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        var path = closestPath(mouse,true);
    }
    onMouseUp(evt) { }
    onMouseWheel(evt) { }
    onClick(evt) { }

    // Drawing
    draw(ctx) { }

    // Optional helper methods
    isActive() {
        return false;
    }

    // Utility methods available to all operations
    normalizeEvent(target, e) {

        if (!e) { e = self.event; }
        var x = 0;
        var y = 0;
        var rect = canvas.getBoundingClientRect();


        x = (e.clientX - rect.left) / (rect.right - rect.left) * canvas.width;
        y = (e.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height;


        return { x: (x - target.offsetLeft - offsetX) / scaleFactor, y: (y - target.offsetTop - offsetY) / scaleFactor };
    }

        highlightPathsInRect(selectBox) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;

            for (var j = 0; j < svgpaths[i].path.length; j++) {
                svgpaths[i].highlight = false;
                var pt = svgpaths[i].path[j];
                if (pointInBoundingBox(pt, selectBox)) {
                    svgpaths[i].highlight = true;
                    continue;
                }
            }
        }
    }

    selectPathsInRect(selectBox,addToSelection) {
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;

            for (var j = 0; j < svgpaths[i].path.length; j++) {
                if(!addToSelection)
                    svgpaths[i].selected = false;
                var pt = svgpaths[i].path[j];
                if (pointInBoundingBox(pt, selectBox)) {
                    svgpaths[i].selected = true;
                    continue;
                }
            }
        }
    }
}
