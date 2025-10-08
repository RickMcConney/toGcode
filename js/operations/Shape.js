var makerjs = require('makerjs');

var AVAILABLE_SHAPES = [{ value: 'Star', label: "Star" },
{ value: 'Belt', label: "Belt" },
{ value: 'Polygon', label: "Polygon" },
{ value: 'Rectangle', label: "Rentangle" },
{ value: 'RoundRectangle', label: "Round Rentangle" },
{ value: 'Heart', label: "Heart" }

]

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
        super('Shape', 'fa fa-pencil');
        this.defaults = {};

        for (let shape of AVAILABLE_SHAPES) {
            let meta = null;
            switch (shape.value) {
                case "Star":
                    meta = makerjs.models.Star.metaParameters;
                    meta = meta.slice(0, 3);
                    break;
                case "Belt":
                    meta = makerjs.models.Belt.metaParameters;
                    break;
                case "Polygon":
                    meta = makerjs.models.Polygon.metaParameters;
                    meta = meta.slice(0, 3);
                    break;
                case "Rectangle":
                    meta = makerjs.models.Rectangle.metaParameters;
                    break;
                case "RoundRectangle":
                    meta = makerjs.models.RoundRectangle.metaParameters;
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

        this.properties.shape = "Star";
    }

    isDimension(key)
    {
        let dimension =["radius","distance","width","height","left","right","inner","outer"];
        let tokens = key.split("_");
        if(tokens.length > 1)
        {
            let param = tokens[1];
            if(dimension.includes(param))
                return true;
        }
        return false;
    }

    getArgs(shape, data)
    {
        let param = this.defaults[shape];

        let arg = [];
        for (let i = 0; i < param.length; i++) {
            let name = shape + '_' + param[i].title.split(" ")[0];
            if(data != null){
                arg[i] = data[name];
            }
            else if (this.properties[name] !== undefined){
                arg[i] = this.properties[name]
            }
            else{
                arg[i] = param[i].value;
            }
        }
        return arg;
    }

    //todo need to store create params in mm
    toInternal(value)
    {
        //const useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
        //let valueInMM =  useInches ? parseFloat(value) * 25.4 : parseFloat(value);
        return value * viewScale;
    }
    makeShape(x, y, svgPath, data) {

        let shape = this.properties.shape;
        if(svgPath != null) shape = svgPath.creationProperties.shape;
        let arg = this.getArgs(shape, data);

        switch (shape) {

            case 'Star':

                this.model = new makerjs.models.Star(arg[0], this.toInternal(arg[1]), this.toInternal(arg[2]), 2);
                break;
            case 'Belt':
                this.model = new makerjs.models.Belt(this.toInternal(arg[0]), this.toInternal(arg[1]), this.toInternal(arg[2]));
                break;
            case 'Polygon':
                this.model = new makerjs.models.Polygon(arg[0], this.toInternal(arg[1]), arg[2], false);
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

        var chain = makerjs.model.findSingleChain(this.model);
        if(!chain) return;
        
        this.points = makerjs.chain.toKeyPoints(chain, 1 * viewScale);

        var path = [];
        for (let p of this.points) {
            path.push({ x: p[0] + x, y: p[1] + y });
        }

        path.push(path[0]);

        if (svgPath == null) {
            addUndo(false, true, false);
            svgPath = {
                id: shape + svgpathId,
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
                    param: this.defaults[shape],
                    arg:arg,
                    center: { x: x, y: y }
                }
            };
            svgpaths.push(svgPath);
            addSvgPath(svgPath.id, svgPath.name);

            // Auto-select the newly created polygon
            svgPath.selected = true;
            selectSidebarNode(svgPath.id);
            this.currentPath = svgPath;


            svgpathId++;
        }
        else{
            svgPath.path = path;
            svgPath.bbox = boundingBox(path);
            svgPath.creationProperties.arg = arg;
        }
        redraw();
    }

    stop()
    {
        this.currentPath = null;
    }
    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        this.makeShape(mouse.x, mouse.y, null, null);

    }

    updateInPlace(svgPath, data) {
        var props = svgPath.creationProperties;
        for (let key in data) {
            let value = parseFloat(data[key]);
            if (!isNaN(value)){
                data[key] = value;
                if(this.isDimension(key)){
                    this.properties[key] = parseDimension(value);
                    data[key] = parseDimension(value);
                }
            }
        }

        this.makeShape(props.center.x, props.center.y, svgPath, data);
    }

    getCurrentProperties() {
        return this.parameters.star;
    }

    getEditPropertiesHTML(path) {
        return this.getPropertiesHTML(path);
    }

    getPropertiesHTML(path) {
        // Get current values from UI if available, otherwise use properties
        let type = this.properties.shape;
        let arg = this.getArgs(type);
        if(path)
        {
            type = path.creationProperties.shape;
            arg = [...path.creationProperties.arg];
        }
        let param = this.defaults[type];
        
       for(let i = 0;i<param.length;i++){
            param[i].name = type + '_' + param[i].title.split(" ")[0]
            if(this.isDimension(param[i].name))
            {
                if(path)
                    arg[i] = formatDimension(arg[i]);
                else
                    arg[i] = Math.round(formatDimension(arg[i])*2)/2;
            }
        }

        return `

            <div class="mb-3">
                <label for="shape-select" class="form-label">Shape</label>
                <select class="shape-select" id="shape-select" name="shape">
                    ${AVAILABLE_SHAPES.map(s =>
            `<option value="${s.value}" ${type === s.value ? 'selected' : ''}>${s.label}</option>`).join('\n                    ')}
                </select>
            </div>

            <div class="mb-3">
                
                ${param.map((prop, index) =>
                `<label for="${prop.name}" class="form-label">${prop.title}</label>
                <input type="number"
                       class="form-control"
                       id="${prop.name}"
                       name="${prop.name}"
                       min="${prop.min}"
                       max="${prop.max}"
                       value="${arg[index]}">`).join('\n                    ')}
            </div>

            ${this.centerPoint ? `
            <div class="alert alert-info">
                <i data-lucide="info"></i>
                Center point set at (0, 0)
            </div>
            ` : ''}

            ${this.isDrawing ? `
            <div class="alert alert-warning">
                <i data-lucide="mouse"></i>
                Drag to set radius, then release to create polygon
            </div>
            ` : ''}
        `;
    }

    


    onPropertiesChanged(data) {
        // Prevent infinite recursion when updating HTML
        if (this._isUpdatingHTML) {
            return;
        }

        // Update our properties with the new values
        let oldShape = this.properties.shape || 'Star';
        this.properties = { ...this.properties, ...data };

        for (let key in this.properties) {
            let value = parseFloat(this.properties[key]);
            if (!isNaN(value)){
                this.properties[key] = value;
                if(this.isDimension(key)){
                    this.properties[key] = parseDimension(value);
                    data[key] = parseDimension(value);
                }
            }
        }

        // Only update HTML if shape type changed
        if (oldShape !== this.properties.shape) {
            this._isUpdatingHTML = true;

            const form = document.getElementById('tool-properties-form');
            form.innerHTML = this.getPropertiesHTML();

            // Re-attach event listeners after HTML replacement
            this._attachPropertyListeners();

            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }

            this._isUpdatingHTML = false;
        }
        if(this.currentPath)
        {
            var props = this.currentPath.creationProperties;
            this.makeShape(props.center.x, props.center.y, this.currentPath, data);
        }

        super.onPropertiesChanged(data);
    }

    _attachPropertyListeners() {
        const form = document.getElementById('tool-properties-form');
        if (!form) return;

        const inputs = form.querySelectorAll('input, select, textarea');

        inputs.forEach(input => {
            const handleInputChange = () => {
                // Prevent handler from running during HTML updates
                if (this._isUpdatingHTML) return;

                // Gather all form data
                const formData = {};
                form.querySelectorAll('input, select, textarea').forEach(inp => {
                    if (inp.name) {
                        if (inp.type === 'checkbox') {
                            formData[inp.name] = inp.checked;
                        } else if (inp.type === 'number' || inp.type === 'range') {
                            formData[inp.name] = parseFloat(inp.value) || 0;
                        } else {
                            formData[inp.name] = inp.value;
                        }
                    }
                });

                // Call this operation's update method directly
                this.updateFromProperties(formData);
            };

            // Add both change and input events for real-time updates
            input.addEventListener('change', handleInputChange);
            input.addEventListener('input', handleInputChange);
        });
    }

}