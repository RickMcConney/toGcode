var makerjs = require('makerjs');

var AVAILABLE_SHAPES = [
    { value: 'Belt', label: "Belt" },
    { value: 'Circle', label: "Circle" },
    { value: 'Ellipse', label: "Ellipse" },
    { value: 'Heart', label: "Heart" },
    { value: 'Polygon', label: "Polygon" },
    { value: 'Rectangle', label: "Rentangle" },
    { value: 'RoundRectangle', label: "Round Rentangle" },
    { value: 'Sign', label: "Sign" },
    { value: 'Star', label: "Star" }
]

function invertArc(arc) {
    var chord = new makerjs.paths.Chord(arc);
    var midPoint = makerjs.point.middle(chord);
    makerjs.path.rotate(arc, 180, midPoint);
}

function Heart(r, a2) {

    var a = a2 / 2;

    var a_radians = makerjs.angle.toRadians(a);

    var x = Math.cos(a_radians) * r;
    var y = Math.sin(a_radians) * r;

    var z = makerjs.solvers.solveTriangleASA(90, 2 * r, 90 - a);

    let paths = {
        arc1: new makerjs.paths.Arc([x, 0], r, -a, 180 - a),
        line1: new makerjs.paths.Line([x * 2, -y], [0, -z + y])
    };


    paths.arc1 = makerjs.path.mirror(paths.arc1, false, true);
    paths.line1 = makerjs.path.mirror(paths.line1, false, true);
    paths.arc2 = makerjs.path.mirror(paths.arc1, true, false);
    paths.line2 = makerjs.path.mirror(paths.line1, true, false);



    var model = { paths: paths };

    return model;
}


class Shape extends Operation {
    constructor() {
        super('Shape', 'pentagon', 'Create basic shapes (circle, rectangle, polygon, star, etc.)');
        this.defaults = {};
        this.oldShape = null;

        for (let shape of AVAILABLE_SHAPES) {
            let meta = null;
            switch (shape.value) {
                case "Star":
                    meta = makerjs.models.Star.metaParameters;
                    meta = meta.slice(0, 3);
                    meta[0].value = 5;
                    meta[1].value = 40;
                    meta[2].value = 20;
                    break;
                case "Belt":
                    meta = makerjs.models.Belt.metaParameters;
                    break;
                case "Circle":
                    meta = [{ title: 'radius', value: 20, min: 1, max: 100 }
                    ];
                    break;
                case "Ellipse":
                    meta = makerjs.models.Ellipse.metaParameters;
                    break;
                case "Polygon":
                    meta = makerjs.models.Polygon.metaParameters;
                    meta[1].value = 20;
                    meta = meta.slice(0, 3);
                    break;
                case "Rectangle":
                    meta = makerjs.models.Rectangle.metaParameters;
                    meta[0].value = 100;
                    meta[1].value = 50;
                    break;
                case "RoundRectangle":
                    meta = makerjs.models.RoundRectangle.metaParameters;
                    meta[0].value = 100;
                    meta[1].value = 50;
                    break;
                case "Sign":
                    meta = makerjs.models.RoundRectangle.metaParameters;
                    meta[0].value = 100;
                    meta[1].value = 50;
                    break;
                case "Heart":
                    meta = [{ title: 'radius', value: 20, min: 1, max: 100 },
                    { title: "angle", value: 90, min: 60, max: 120 },
                    ];
                    break;
            }
            if (meta) {
                this.defaults[shape.value] = meta;
            }

        }

        this.properties = {};
    }

    isDimension(key) {
        let dimension = ["radius", "distance", "width", "height", "left", "right", "inner", "outer", "radiusX", "radiusY"];
        let tokens = key.split("_");
        if (tokens.length > 1) {
            let param = tokens[1];
            if (dimension.includes(param))
                return true;
        }
        return false;
    }

    getArgs(shape, data) {
        let param = this.defaults[shape];
        let arg = [];
        for (let i = 0; i < param.length; i++) {
            let name = param[i].paramName;
            if (this.isDimension(name)) {
                let value = this.getProperty(name);
                arg[i] = parseDimension(value);
            }
            else
                arg[i] = this.getProperty(name);
        }
        return arg;
    }


    toInternal(value) {
        return value * viewScale;
    }



    walkOptions = {
        onPath: function (wp) {
            if (wp.pathContext.type === 'arc') {
                invertArc(wp.pathContext);
            }
        }
    };



    makeShape(shape, x, y, svgPath, data) {

        let arg = this.getArgs(shape, data);

        switch (shape) {

            case 'Star':

                this.model = new makerjs.models.Star(arg[0], this.toInternal(arg[1]), this.toInternal(arg[2]), 2);
                break;
            case 'Belt':
                this.model = new makerjs.models.Belt(this.toInternal(arg[0]), this.toInternal(arg[1]), this.toInternal(arg[2]));
                break;
            case 'Circle':
                this.model = new makerjs.models.Ellipse(this.toInternal(arg[0]), this.toInternal(arg[0]));
                break;
            case 'Ellipse':
                this.model = new makerjs.models.Ellipse(this.toInternal(arg[0]), this.toInternal(arg[1]));
                break;
            case 'Polygon':
                this.model = new makerjs.models.Polygon(arg[0], this.toInternal(arg[1]), arg[2], false);
                break;
            case 'Sign':
                var sign = new makerjs.models.RoundRectangle(this.toInternal(arg[0]), this.toInternal(arg[1]), this.toInternal(arg[2]));
                makerjs.model.walk(sign, this.walkOptions);
                this.model = sign;
                break;
            case 'Rectangle':
                this.model = new makerjs.models.Rectangle(this.toInternal(arg[0]), this.toInternal(arg[1]));
                break;
            case 'RoundRectangle':
                this.model = new makerjs.models.RoundRectangle(this.toInternal(arg[0]), this.toInternal(arg[1]), this.toInternal(arg[2]));
                break;
            case 'Heart':
                this.model = Heart(this.toInternal(arg[0]), arg[1]);
                break;
        }

        this.model.origin = [x, y];
        if (shape == "Rectangle" || shape == "RoundRectangle" || shape == "Sign")
            this.model.origin = [x - this.toInternal(arg[0]) / 2, y - this.toInternal(arg[1]) / 2];
        var chain = makerjs.model.findSingleChain(this.model);
        if (!chain) return;

        this.points = makerjs.chain.toKeyPoints(chain, 1 * viewScale);

        var path = [];
        for (let p of this.points) {
            path.push({ x: p[0], y: p[1] });
        }
        if (path[0].x == path[path.length - 1].x && path[0].y == path[path.length - 1].y)
            path.pop();

        path.push(path[0]);

        let oldId = null;
        let oldsvgpathId = null;
        if (svgPath != null) {
            oldId = svgPath.id;
            oldsvgpathId = svgPath.svgpathId;
        }
        if (svgPath == null) {
            addUndo(false, true, false);
            svgPath = {
                closed: true,
                svgpathId: svgpathId,
                id: shape + '_' + svgpathId,
                type: 'path',
                name: shape + ' ' + svgpathId,
                selected: false,
                visible: true,
                path: path,
                bbox: boundingBox(path),
                // Store creation properties for editing
                creationTool: 'Shape',
                creationProperties: {
                    shape: shape,
                    properties: { ...this.properties },
                    center: { x: x, y: y }
                }
            };
            svgpaths.push(svgPath);

            selectSidebarNode(svgPath.id);
            this.currentPath = svgPath;


            svgpathId++;
        }
        else {
            svgPath.path = path;
            svgPath.id = shape + '_' + oldsvgpathId;
            svgPath.name = shape + ' ' + oldsvgpathId;
            svgPath.bbox = boundingBox(path);
            svgPath.creationProperties.shape = shape;
            svgPath.creationProperties.properties = { ...this.properties };
        }

        addOrReplaceSvgPath(oldId, svgPath.id, svgPath.name);
        selectMgr.unselectAll();
        selectMgr.selectPath(svgPath);

        const title = document.getElementById('tool-properties-title');
        title.textContent = `Edit ${shape} - ${svgPath.name}`;

        redraw();
    }

    stop() {
        this.currentPath = null;
    }
    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        let shape = this.getShape();
        this.makeShape(shape, mouse.x, mouse.y, null, null);

    }

    updateInPlace(svgPath, data) {
        var props = svgPath.creationProperties;

        this.makeShape(data.shape, props.center.x, props.center.y, svgPath, data);
    }

    getValueForProperty(shape, name) {
        let value = 0;
        if (this.currentPath && this.currentPath.creationProperties.properties[name] !== undefined) {
            value = this.currentPath.creationProperties.properties[name];
        }
        else if (this.properties && this.properties[name] !== undefined)
            value = this.properties[name];
        else {
            let def = this.defaults[shape];
            for (let i = 0; i < def.length; i++) {
                if (name === def[i].paramName) {
                    value = def[i].value;
                    break;
                }
            }
        }
        if (this.isDimension(name)) {
            value = formatDimension(value, true);
        }
        return value;
    }

    getShape() {
        return document.getElementById('shape-select').value;
    }

    getCurrentShape() {
        if (this.currentPath) {
            return this.currentPath.creationProperties.shape;
        }
        else if (this.properties && this.properties.shape) {
            return this.properties.shape;
        }
        else {
            return "Polygon";
        }
    }

    showProperties(shape) {
        for (let i = 0; i < AVAILABLE_SHAPES.length; i++) {
            let s = AVAILABLE_SHAPES[i].value;
            let display = (s === shape) ? 'block' : 'none';
            document.getElementById(`${s}-properties`).style.display = display;
        }
        document.getElementById('shape-select').value = shape;
    }

    getHtmlForProperties() {
        let html = '';
        for (let i = 0; i < AVAILABLE_SHAPES.length; i++) {
            let shape = AVAILABLE_SHAPES[i].value;
            let def = this.defaults[shape];
            let display = (shape === this.getCurrentShape()) ? 'block' : 'none';
            html += `<div id="${shape}-properties" style="display: ${display};"><h5 class="mt-3 mb-2">${shape} Properties</h5>`;
            for (let j = 0; j < def.length; j++) {
                let prop = def[j];
                let paramName = shape + '_' + prop.title.split(" ")[0];
                def[j].paramName = paramName;
                prop.type = "number";
                if (this.isDimension(paramName)) {
                    prop.type = "text";
                }
                html += `<label for="${paramName}" class="form-label small"><strong>${prop.title}:</strong></label>
                <input type="${prop.type}"
                       class="form-control form-control-sm"
                       id="${paramName}"
                       name="${paramName}"
                       min="${prop.min}"
                       max="${prop.max}"
                       value="${this.getValueForProperty(shape, paramName)}">`;
            }
            html += `</div>`;
        }
        return html;
    }


    getEditPropertiesHTML(path) {
        return this.getPropertiesHTML(path);
    }



    getPropertiesHTML(path) {


        let type = this.getCurrentShape();
        return `
            <div class="mb-3">
                <label for="shape-select" class="form-label small"><strong>Shape:</strong></label>
                <select class="form-select form-select-sm" id="shape-select" name="shape">
                    ${AVAILABLE_SHAPES.map(s =>
            `<option value="${s.value}" ${type === s.value ? 'selected' : ''}>${s.label}</option>`).join('\n                    ')}
                </select>
            </div>

            ${this.getHtmlForProperties()}

        `;

    }

    setEditPath(path) {
        this.currentPath = path;

    }

    update(path) {
        let shape = path.creationProperties.shape;
        this.showProperties(shape);
        this.properties = { ...this.properties, ...path.creationProperties.properties };
    }

    updateProperty(key, value) {
        document.getElementById(key).value = value;
    }

    getProperty(key) {
        return document.getElementById(key).value;
    }

    onPropertiesChanged(data) {

        let shape = data.shape;
        this.showProperties(shape);

        this.properties = { ...this.properties, ...data };

        for (let key in this.properties) {
            let value = this.properties[key];

            if (this.isDimension(key)) {
                this.properties[key] = parseDimension(value);
                data[key] = parseDimension(value);
                this.updateProperty(key, formatDimension(this.properties[key], true));
            }
            else {
                value = parseFloat(value);
                if (!isNaN(value)) {
                    this.properties[key] = value;
                    data[key] = value;
                }
                else {
                    data[key] = this.properties[key];
                }
            }
        }

        if (this.currentPath) {
            this.updateInPlace(this.currentPath, data);
        }
    }


}