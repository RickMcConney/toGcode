/**
 * Polygon operation - creates a regular polygon with specified number of sides
 */
"use strict";

class Polygon extends Operation {
    constructor() {
        super("Polygon", "fa fa-star-o");
        this.defaultSides = 6;
        this.defaultSize = 10; // 10mm default size
    }


    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        var self = this;

        w2prompt({
            title: w2utils.lang('Number of Sides'),
            width: 400,
            height: 200,
            label: 'Enter',
            value: '6',
            attrs: 'style="width: 200px" placeholder="Type here..."',
            btn_ok: {
                text: 'Ok',
                class: 'ok-class',
                style: 'color: green'
            },
            btn_cancel: {
                text: 'Cancel',
                class: 'ok-class'
            },
        })
            .change((event) => {
                console.log('change', event.detail.originalEvent.target.value)
            })
            .ok((event) => {

                var sides = parseInt(event.detail.value);
                if (sides >= 3) {
                    self.createPolygon(mouse, sides, self.defaultSize*viewScale);
                } else {
                    w2alert('Please enter at least 3 sides');
                }
            })
            .cancel((event) => {
                console.log('cancel')
            })


    }


    createPolygon(center, numSides, radius) {
        const points = [];
        const angle = 360 / numSides;

        for (let i = 0; i < numSides; i++) {
            const thisAngle = angle * i * (Math.PI / 180); // Convert to radians
            const x = center.x + radius * Math.cos(thisAngle);
            const y = center.y + radius * Math.sin(thisAngle);
            points.push({x:x, y:y});
        }
        points.push(points[0]); // Close the polygon

        addUndo(false, true, false);
        var svgPath = {
            id: "Poly" + svgpathId,
            type: 'path',
            name: 'Polygon ' + svgpathId,
            selected: false,
            visible: true,
            path: points,
            bbox: boundingBox(points)
        };
        svgpaths.push(svgPath);
        addSvgPath(svgPath.id, svgPath.name);
        svgpathId++;
        redraw();

    }
}

