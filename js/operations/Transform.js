class Transform extends Select {
    constructor() {
        super();
        this.name = 'Move';
        this.icon = 'fa fa-arrows';
        this.transformBox = null;
        this.handleSize = 8;
        this.ROTATION_SNAP = Math.PI / 36; // 5 degree snapping
        this.unselectOnMouseDown = false;
    }

    start() {
        super.start();
        this.activeHandle = null;
        this.startAngle = 0;
        this.currentAngle = 0;
        this.transformStartPos = { x: 0, y: 0 };
        if (this.hasSelectedPaths()) {
            this.transformBox = this.createTransformBox(svgpaths);
        }

    }
    stop() {
        super.stop();
        this.transformBox = null;
    }
    onMouseDown(canvas, evt) {
        super.onMouseDown(canvas, evt);
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;


        this.activeHandle = this.getHandleAtPoint(mouse);
        // Check if clicking on a handle
        if (this.activeHandle) {
            this.transformStartPos = { x: mouse.x, y: mouse.y };
            canvas.style.cursor = "grabbing";
            addUndo(false, true, false);
        }


        if (this.activeHandle && this.activeHandle.type === 'rotate') {

            // Store original path positions when starting rotation
            this.originalPaths = svgpaths.map(path => {
                if (path.selected) {
                    return {
                        id: path.id,
                        path: path.path.map(pt => ({ x: pt.x, y: pt.y }))
                    };
                }
                return null;
            }).filter(p => p !== null);

            this.startAngle = Math.atan2(
                mouse.y - this.transformBox.centerY,
                mouse.x - this.transformBox.centerX
            );
            this.currentAngle = this.transformBox.rotation || 0;
        }

    }

    onMouseMove(canvas, evt) {
        super.onMouseMove(canvas, evt,this.activeHandle !== null);
        var mouse = this.normalizeEvent(canvas, evt);
        if (!this.mouseDown)
            this.activeHandle = this.getHandleAtPoint(mouse);

        if (this.mouseDown && this.activeHandle) {

            const dx = mouse.x - this.transformStartPos.x;
            const dy = mouse.y - this.transformStartPos.y;

            if (this.activeHandle.type === 'translate') {
                // Handle translation
                svgpaths.forEach(path => {
                    if (path.selected) {
                        path.path = path.path.map(pt => ({
                            x: pt.x + dx,
                            y: pt.y + dy
                        }));
                        path.bbox = boundingBox(path.path);
                    }
                });
                // Update transform box position
                this.transformBox.minx += dx;
                this.transformBox.maxx += dx;
                this.transformBox.miny += dy;
                this.transformBox.maxy += dy;
                this.transformBox.centerX += dx;
                this.transformBox.centerY += dy;
            }
            else if (this.activeHandle.type === 'scale') {
                // Calculate scale factors with limits
                let scaleX = Math.max(0.1, Math.min(10,
                    (mouse.x - this.transformBox.centerX) /
                    (this.transformStartPos.x - this.transformBox.centerX)
                ));
                let scaleY = Math.max(0.1, Math.min(10,
                    (mouse.y - this.transformBox.centerY) /
                    (this.transformStartPos.y - this.transformBox.centerY)
                ));

                if (evt.shiftKey) {
                    var max = Math.max(scaleX, scaleY);
                    scaleY = max;
                    scaleX = max;
                }

                svgpaths.forEach(path => {
                    if (path.selected) {
                        path.path = path.path.map(pt => ({
                            x: this.transformBox.centerX + (pt.x - this.transformBox.centerX) * scaleX,
                            y: this.transformBox.centerY + (pt.y - this.transformBox.centerY) * scaleY
                        }));
                        path.bbox = boundingBox(path.path);
                    }
                });
                this.transformBox = this.createTransformBox(svgpaths);
            }
            else if (this.activeHandle.type === 'rotate') {
                // Calculate new angle from center to mouse
                const newAngle = Math.atan2(
                    mouse.y - this.transformBox.centerY,
                    mouse.x - this.transformBox.centerX
                );

                // Calculate absolute rotation
                let rotation = newAngle - this.startAngle + this.currentAngle;

                // Apply snapping
                rotation = Math.round(rotation / this.ROTATION_SNAP) * this.ROTATION_SNAP;

                // Update transform box rotation
                this.transformBox.rotation = rotation;

                // Rotate all selected paths from their original positions
                svgpaths.forEach(path => {
                    if (path.selected) {
                        const originalPath = this.originalPaths.find(p => p.id === path.id);
                        if (originalPath) {
                            path.path = originalPath.path.map(pt => {
                                const dx = pt.x - this.transformBox.centerX;
                                const dy = pt.y - this.transformBox.centerY;
                                const cos = Math.cos(rotation);
                                const sin = Math.sin(rotation);
                                return {
                                    x: this.transformBox.centerX + (dx * cos - dy * sin),
                                    y: this.transformBox.centerY + (dx * sin + dy * cos)
                                };
                            });
                            path.bbox = boundingBox(path.path);
                        }
                    }
                });
            }

            this.transformStartPos = { x: mouse.x, y: mouse.y };
            redraw();
        }
    }
    onMouseUp(canvas, evt) {
        super.onMouseUp(canvas, evt);
        this.mouseDown = false;
        canvas.style.cursor = "grab";
        if (this.hasSelectedPaths()) {
            this.transformBox = this.createTransformBox(svgpaths);
        }
        else{
            this.transformBox = null;
        }
        if (this.activeHandle) {
            // Update final positions
            svgpaths.forEach(path => {
                if (path.selected) {
                    path.bbox = boundingBox(path.path);
                }
            });

            // Reset transform state
            if (this.activeHandle.type === 'rotate') {
                this.currentAngle = this.transformBox.rotation;
            }
            this.transformBox = this.createTransformBox(svgpaths);
            this.activeHandle = null;
            this.transformStartPos = null;
        }
    }

    draw(ctx) {
        super.draw(ctx);
        this.drawTransformBox(ctx);
    }


    hasSelectedPaths() {
        return svgpaths.some(path => path.selected);
    }

    createTransformBox(paths) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // Calculate bounding box for all selected paths
        paths.forEach(path => {
            if (path.selected) {
                minX = Math.min(minX, path.bbox.minx);
                minY = Math.min(minY, path.bbox.miny);
                maxX = Math.max(maxX, path.bbox.maxx);
                maxY = Math.max(maxY, path.bbox.maxy);
            }
        });

        if (minX === Infinity) return null; // No selected paths

        if (maxX - minX < 2) { maxX++; minX--; }
        if (maxY - minY < 2) { maxY++; minY--; }
        return {
            minx: minX,
            miny: minY,
            maxx: maxX,
            maxy: maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            width: maxX - minX,
            height: maxY - minY,
            rotation: 0
        };
    }

    drawRotationAngle() {
        if (!this.transformBox || !this.activeHandle || this.activeHandle.type !== 'rotate') return;

        const angle = Math.round((this.transformBox.rotation * 180 / Math.PI) % 360);
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.fillText(`${angle}°`, this.transformBox.centerX + 10, this.transformBox.miny - 25);
        ctx.restore();
    }

    drawTransformBox() {
        if (!this.transformBox) return;

        ctx.save();
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 1;

        // Rotate context around center point
        ctx.translate(this.transformBox.centerX, this.transformBox.centerY);
        ctx.rotate(this.transformBox.rotation);
        ctx.translate(-this.transformBox.centerX, -this.transformBox.centerY);

        // Draw main box
        ctx.beginPath();
        ctx.rect(this.transformBox.minx, this.transformBox.miny,
            this.transformBox.width, this.transformBox.height);
        ctx.stroke();

        // Draw handles
        const handles = this.getTransformHandles();
        handles.forEach(handle => {
            ctx.beginPath();
            if (handle.type === 'rotate') {
                ctx.arc(handle.x, handle.y, this.handleSize / 2, 0, Math.PI * 2);
            } else {
                ctx.rect(handle.x - this.handleSize / 2, handle.y - this.handleSize / 2,
                    this.handleSize, this.handleSize);
            }
            ctx.fillStyle = 'blue';
            if (this.activeHandle)
                ctx.fillStyle = handle.id == this.activeHandle.id ? highlightColor : 'blue';
            ctx.fill();
            ctx.stroke();
        });
        this.drawRotationAngle();
        ctx.restore();
    }

    getTransformHandles() {
        if (!this.transformBox) return [];

        const { minx, miny, maxx, maxy, centerX, centerY } = this.transformBox;

        return [
            { id: 1, x: minx, y: miny, type: 'scale', corner: 'tl' },
            { id: 2, x: maxx, y: miny, type: 'scale', corner: 'tr' },
            { id: 3, x: maxx, y: maxy, type: 'scale', corner: 'br' },
            { id: 4, x: minx, y: maxy, type: 'scale', corner: 'bl' },
            { id: 5, x: centerX, y: miny - 20, type: 'rotate' },
            { id: 6, x: centerX, y: centerY, type: 'translate' }
        ];
    }

    getHandleAtPoint(point) {
        const handles = this.getTransformHandles();
        for (let handle of handles) {
            const dx = handle.x - point.x;
            const dy = handle.y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= this.handleSize) {
                return handle;
            }
        }
        return null;
    }
}