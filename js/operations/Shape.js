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
        arc1: new makerjs.paths.Arc([x , 0], r, -a, 180 - a),
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

        for(let shape of AVAILABLE_SHAPES)
        {
            let meta = null;
            switch (shape.value) {
                case "Star":
                    meta = makerjs.models.Star.metaParameters;
                    meta = meta.slice(0,3);
                    break;
                case "Belt":
                    meta = makerjs.models.Belt.metaParameters;
                    break;
                case "Polygon":
                    meta = makerjs.models.Polygon.metaParameters;
                    meta = meta.slice(0,3);
                    break;
                case "Rectangle":
                    meta = makerjs.models.Rectangle.metaParameters;
                    break;
                case "RoundRectangle":
                    meta = makerjs.models.RoundRectangle.metaParameters;
                    break;
                case "Heart":
                    meta = [{ title:'Radius', value:20, min:1, max:100},
                         {title: "Angle" , value:90, min:60, max:120},
                    ];
                    break;
            }
            if(meta)
            {
                this.defaults[shape.value] = meta;
            }

        }

        this.properties.shape = "Star";
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        let param = this.defaults[this.properties.shape];
        let arg=[];
        for(let i = 0;i<param.length;i++)
        {
            let name = this.properties.shape+'_'+param[i].title.split(" ")[0];
            if(this.properties[name] !== undefined)
                arg[i] = this.properties[name]
            else 
                arg[i] = param[i].value;  
        }
        switch (this.properties.shape) {

            case 'Star':

                this.model = new makerjs.models.Star(arg[0], arg[1]*viewScale, arg[2]*viewScale, 2);
                break;
            case 'Belt':
                this.model = new makerjs.models.Belt(arg[0]*viewScale, arg[1]*viewScale, arg[2]*viewScale);
                break;
            case 'Polygon':
                this.model = new makerjs.models.Polygon(arg[0],arg[1]*viewScale, arg[2],false);
                break;
            case 'Rectangle':
                this.model = new makerjs.models.Rectangle(arg[0]*viewScale, arg[1]*viewScale);
                break;
            case 'RoundRectangle':
                this.model = new makerjs.models.RoundRectangle(arg[0]*viewScale, arg[1]*viewScale,arg[2]*viewScale);
                break;
            case 'Heart':
                this.model = Heart(arg[0]*viewScale, arg[1]);
                break;
        }

        var chain = makerjs.model.findSingleChain(this.model);
        this.points = makerjs.chain.toKeyPoints(chain, 1*viewScale);
        var path = [];
        for (let p of this.points) {
            path.push({ x: p[0] + mouse.x, y: p[1] + mouse.y });
        }

        path.push(path[0]);

        addUndo(false, true, false);
        var svgPath = {
            id: this.properties.shape + svgpathId,
            type: 'path',
            name: this.properties.shape + ' ' + svgpathId,
            selected: false,
            visible: true,
            path: path,
            bbox: boundingBox(path),
            // Store creation properties for editing
            creationTool: 'Shape',
            creationProperties: {
                param: param,
                center: { x: mouse.x, y: mouse.y }
            }
        };
        svgpaths.push(svgPath);
        addSvgPath(svgPath.id, svgPath.name);

        // Auto-select the newly created polygon
        svgPath.selected = true;
        selectSidebarNode(svgPath.id);

        svgpathId++;
        redraw();

    }


    getCurrentProperties() {
        return this.parameters.star;
    }

    getPropertiesHTML() {
        // Get current values from UI if available, otherwise use properties
        let type = this.properties.shape;
        const param = this.defaults[type];

        return `

            <div class="mb-3">
                <label for="shape-select" class="form-label">Shape</label>
                <select class="shape-select" id="shape-select" name="shape">
                    ${AVAILABLE_SHAPES.map(s =>
            `<option value="${s.value}" ${type === s.value ? 'selected' : ''}>${s.label}</option>`).join('\n                    ')}
                </select>
            </div>

            <div class="mb-3">
                
                ${param.map(prop =>
                `<label for="${type+'_'+prop.title.split(" ")[0]}" class="form-label">${prop.title}</label>
                <input type="number"
                       class="form-control"
                       id="${type+'_'+prop.title.split(" ")[0]}"
                       name="${type+'_'+prop.title.split(" ")[0]}"
                       min="${prop.min}"
                       max="${prop.max}"
                       value="${this.properties[type+'_'+prop.title.split(" ")[0]] || prop.value}">`).join('\n                    ')}
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

        for (let i in this.properties) {
            let value = parseFloat(this.properties[i]);
            if (!isNaN(value))
                this.properties[i] = value;
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