# toGcode

<p align="center">
  <img src="icons/svgtogcode.jpeg" alt="toGcode Logo" width="200">
</p>

**🌐 [Launch toGcode](https://rickmcconney.github.io/toGcode/)**

A web-based CNC CAM (Computer-Aided Manufacturing) application that converts SVG files into G-code for CNC machines. Features AI-powered SVG generation, advanced path editing tools, and intelligent toolpath optimization. Designed with a focus on woodworking and maker-friendly CNC operations.

## 🚧 Work in Progress

This project is actively under development. Features and interfaces may change as the application evolves. While the core functionality is stable, new features and improvements are being added regularly.

Auto feed rate calculations are currently capped at 1000 mm/min. To adjust this value, go to the options panel and match it to your machine's capabilities. Alternatively, you can disable auto feed calculations, and the feed rate set on the individual tool will be used.

## Key Features

- 🤖 **AI-Powered Design**: Generate SVG designs from text descriptions using Google Gemini API (experimental)
- 🎨 **Visual CAM Workflow**: Import SVG, design toolpaths, export G-code - all in your browser
- ✏️ **Advanced Path Tools**: Boolean operations, parametric shapes, path editing, and freehand drawing
- 🔧 **Complete Tool Library**: Manage unlimited tools with full parameter control
- 📐 **Flexible Workpiece Setup**: Configure dimensions, material, origin position with visual feedback
- ⚙️ **Smart Operations**: Inside/Outside profiling, Pocketing, Drilling, V-Carving with automatic tool compensation
- 🎯 **Intelligent Feed Rates**: Auto-calculated speeds based on tool type and material properties
- 🔮 **3D Visualization**: Real-time 3D preview of cutting operations with voxel-based material removal simulation
- 💾 **No Installation Required**: Runs entirely in the browser with localStorage persistence
- 🖱️ **Intuitive Interface**: Modern Bootstrap 5 UI with resizable panels and contextual help

## Current Functionality

### File Operations
- **SVG Import**: Parse and import SVG files with support for various drawing software (Adobe Illustrator, Inkscape)
- **AI-Powered SVG Generation**: Generate SVG designs from text descriptions using Google Gemini API
  - Text-to-SVG conversion is experimental and has limited capabilities
  - Generates stroke-based line drawings (no fills)
  - Requires free Gemini API key (stored securely in browser localStorage)
  - Automatic import of generated SVG into workspace
- **G-code Export**: Generate standard G-code with proper feed rates, depths, and tool changes
- **Project Management**: Save/load project state with undo functionality

### Drawing Tools
- **Pen Tool**: Freehand drawing for custom paths
- **Shape Tool**: Insert parametric shapes from built-in library (powered by Maker.js)
  - Rectangles, Rounded rectangles, Circles, Ellipses, Stars, Polygons, Hearts
  - Configurable parameters for each shape type
- **Text Tool**: Add text with font support (using OpenType.js) using Google Fonts
- **Selection Tool**: Select and manipulate imported paths
- **Transform Tools**: Move, rotate, and scale objects
- **PathEdit Tool**: Edit path control points directly on canvas for precise adjustments
- **Boolean Operations**: Combine or subtract paths using boolean operations
  - Union: Merge multiple selected paths into one
  - Intersection: Keep only overlapping areas
  - Difference: Subtract one path from another

### CNC Operations
- **Inside Profiling**: Cut inside a closed path with tool radius compensation
- **Outside Profiling**: Cut outside a closed path for part cutout
- **Pocketing**: Remove material from enclosed areas with adaptive clearing
- **Drilling**: Create drilling operations for holes
- **V-Carving**: Generate V-bit toolpaths for engraving and decorative cuts
- **Center Operation**: Follow a path with no offset for engraving and decorative cuts
 - Cutting parameters: depth, step down, stepover on a per operation basis

### Tool Management
- **Tool Library**: Complete tool management system with:
  - Tool parameters: diameter, feed rate, plunge rate
  - Tool types: End Mill, Drill Bit, V-Bit
  - Color-coded tool visualization
  - Add, edit, duplicate, and delete tools
  - Persistent storage in browser localStorage
- **Material Database**: Wood species selection with optimized cutting parameters:
  - Pine, Oak, Maple, Cherry, Walnut, Birch, Poplar, Cedar, Ash, Mahogany
  - Automatic feed rate adjustment based on material density
  - Visual material preview with realistic colors
  - Species-specific feed and speed multipliers
- **Auto Feed Rate Calculator**: Intelligent speed/feed calculation based on tool and material properties

### Workpiece Configuration
- **Workpiece Properties**: Complete workpiece setup panel:
  - Dimensions: width, length, thickness (mm)
  - Wood species selection with material-specific properties
  - Grid settings: size and visibility controls
  - Origin position: 9-position grid selector (corners, edges, center)
  - Workpiece outline visualization
- **Origin System**: Flexible work coordinate system:
  - Visual origin position selector (3×3 grid)
  - Automatic origin recalculation on dimension changes
  - Multiple origin positions: top-left, center, bottom-right, etc.
  - Real-time origin indicator on canvas

### Visualization & Navigation
- **Interactive 2D Canvas**: Responsive 2D canvas with:
  - Smooth zoom and pan controls (mouse wheel to zoom, middle mouse button to pan)
  - Snap-to-grid functionality when grid is visible (1/10 grid size precision)
  - Dynamic viewport centering
  - Real-time path selection and highlighting
  - Resizable panels for optimal workspace
- **3D Visualization**: Real-time 3D cutting simulation with:
  - Interactive 3D camera control (rotate, pan, zoom)
  - Voxel-based material removal visualization
  - Real-time height-map showing material cut away
  - Tool-specific cutting geometry (End Mill, V-Bit, Drill)
  - Play/Pause/Stop simulation controls with variable speed
  - Progress slider for jumping to specific points in the cutting sequence
  - Toggle axes and toolpath visibility
  - Workpiece material preview with realistic colors
- **Toolpath Preview**: Comprehensive toolpath visualization:
  - Color-coded paths by tool
  - Toolpath ordering and optimization
  - Visual depth indicators
  - Show/hide individual toolpaths
  - 2D and 3D simulation playback
- **Grid & Guides**: Alignment and measurement aids:
  - Configurable grid size
  - Workpiece boundary outline
- **Layer Management**: Complete visibility control:
  - Toggle SVG paths visibility
  - Toggle toolpaths visibility
  - Toggle grid, origin, and workpiece display
  - Individual path selection and manipulation

## Technical Architecture

### Core Technologies
- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **3D Graphics**: Three.js v0.181.0 (local ES6 modules) for 3D visualization and simulation
- **UI Framework**: Bootstrap 5 with responsive layout
- **Geometry**: Paper.js for SVG parsing and geometric operations
- **Path Operations**: ClipperJS for offsetting and boolean operations
- **Parametric Shapes**: Maker.js for generating geometric primitives
- **Typography**: OpenType.js for font handling
- **AI Integration**: Google Gemini API for text-to-SVG generation
- **Icons**: Lucide icon system
- **Storage**: Browser localStorage for project persistence

### Key Components
- `js/cnc.js` - Core CNC logic and toolpath generation
- `js/bootstrap-layout.js` - Bootstrap 5 UI implementation and layout management
- `js/vcarve.js` - V-carve specific algorithms and optimization
- `js/3dView.js` - 3D visualization engine with Three.js integration
  - `ToolpathAnimation` - Orchestrates cutting simulation and playback
  - `WorkpieceManager` - 3D workpiece rendering and material preview
  - `ToolpathVisualizer` - Renders toolpath visualization in 3D
- `js/voxels/` - Voxel-based material removal system
  - `VoxelGrid.js` - 2D height-map voxel grid with instance rendering
  - `VoxelMaterialRemover.js` - Tool-specific material removal calculations
- `js/operations/` - Operation system with individual tool implementations
  - `Operation.js` - Base operation class
  - `Select.js` - Selection and manipulation tool
  - `Transform.js` - Move, rotate, scale operations
  - `PathEdit.js` - Control point editing
  - `Workpiece.js` - Workpiece configuration interface
  - `Origin.js` - Origin setting tool
  - `Pan.js` - Canvas navigation
  - `Pen.js`, `Shape.js`, `Text.js`, `Drill.js` - Drawing tools
  - `Boolean.js` - Boolean operations (union, intersection, difference)
  - `Gemini.js` - AI-powered SVG generation
  - `OperationManager.js` - Operation lifecycle and event handling
- `js/CncController.js` - Main controller orchestrating operations and UI
- `js/ToolPropertiesEditor.js` - Dynamic properties panel system
- `js/StepWiseHelpSystem.js` - Contextual help and guidance system
- `js/three.module.js`, `js/three.core.js` - Three.js library (local ES6 modules)

### Data Flow
1. **Import**: SVG files imported and parsed into internal path format using Paper.js
2. **Storage**: Paths stored in `svgpaths[]` array with selection, visibility, and bounding box data
3. **Configuration**: Workpiece dimensions and origin position stored in global `options[]` array
4. **Tool Selection**: Active tool selected from `tools[]` library with material-specific parameters
5. **Operation**: CNC operations generate toolpaths using ClipperJS for tool radius compensation
6. **Optimization**: Toolpaths optimized using Lighten algorithm and stored in `toolpaths[]` array
7. **Export**: G-code generated from toolpaths with proper feed rates, depths, and tool changes
8. **Persistence**: Project state (paths, toolpaths, tools, options) saved to browser localStorage

### Design Patterns
- **Operation System**: Object-oriented operation classes with inheritance
- **Event-Driven**: CncController manages mouse events and operation lifecycle
- **Properties Panel**: Dynamic UI generation from operation properties
- **State Management**: Global state with undo stack (serialized JSON snapshots)
- **Responsive Layout**: Bootstrap grid with resizable panels

## Getting Started

### Quick Start - Online Version
The easiest way to use toGcode is through the hosted version:

**🌐 [Launch toGcode](https://rickmcconney.github.io/toGcode/)**

No installation required - just open the link in a modern web browser and start creating toolpaths!

### Local Development Setup

If you want to run toGcode locally or contribute to development:

#### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Local web server (for development)

#### Installation Steps
1. **Clone the repository**
   ```bash
   git clone https://github.com/rickmcconney/toGcode.git
   cd toGcode
   ```

2. **Start a local web server**
   ```bash
   # Python 3
   python -m http.server 8000

   # Or with Node.js
   npx http-server
   ```

3. **Open in browser**
   Navigate to `http://localhost:8000` in your web browser

### Basic Usage

1. **Configure Workpiece**
   - Click the "Workpiece" tool in the sidebar
   - Set dimensions (width, length, thickness)
   - Choose wood species for optimized cutting parameters
   - Select origin position (typically middle-center)

2. **Import or Draw Paths**
   - Import an SVG file via Import SVG
   - Or use drawing tools (Pen, Polygon, Shape, Text) to create paths
   - Or generate SVG from text using the Gemini AI tool (requires free API key)

3. **Set Up Tools**
   - Switch to Operations panel and add or edit tools in the Tool panel at the bottom
   - Add or edit tools with diameter, feed rates, and depth settings
   - Select the tool you want to use

4. **Generate Toolpaths**
   - Select paths on the canvas
   - Choose an operation (Inside, Outside, Pocket, V-Carve, etc.)
   - Adjust parameters in the properties panel

5. **Export G-code**
   - Review toolpaths in the list
   - Simulate the tool paths with the play button
   - Choose or create a post-processor profile
   - Save the G-code file for your CNC machine

### Using AI-Powered SVG Generation

1. **Get a Gemini API Key** (free)
   - Visit [Google AI Studio](https://aistudio.google.com/apikey)
   - Create a free API key

2. **Generate SVG from Text**
   - Click the "Gemini" tool in the sidebar
   - Enter your API key (stored securely in browser)
   - Type a description (e.g., "a decorative oak leaf", "a geometric mountain range")
   - Click Apply to generate and import the SVG
   - Note: Gemini models have limited training for SVG generation, so results may be basic

3. **Tips for Best Results**
   - Be specific and descriptive
   - Use technical drawing terms (e.g., "line drawing", "outline", "contours")
   - The AI generates stroke-based drawings optimized for CNC
   - Generated SVG is automatically imported and ready for toolpath operations


## Project Structure

```
toGcode/
├── index.html                      # Main application entry point
├── css/
│   └── app.css                     # Application styles and theming
├── js/
│   ├── cnc.js                      # Core CNC logic and toolpath generation
│   ├── bootstrap-layout.js         # Bootstrap 5 UI layout and components
│   ├── vcarve.js                   # V-carve algorithms and optimization
│   ├── CncController.js            # Main controller and event orchestration
│   ├── ToolPropertiesEditor.js     # Dynamic properties panel system
│   ├── StepWiseHelpSystem.js       # Contextual help system
│   ├── 3dView.js                   # 3D visualization with Three.js
│   ├── voxels/                     # Voxel-based material removal system
│   │   ├── VoxelGrid.js            # Height-map voxel grid renderer
│   │   └── VoxelMaterialRemover.js # Tool-specific cutting calculations
│   ├── operations/                 # Operation implementations
│   │   ├── Operation.js            # Base operation class
│   │   ├── Select.js               # Selection tool
│   │   ├── Workpiece.js            # Workpiece configuration
│   │   ├── Origin.js               # Origin setting tool
│   │   ├── Pan.js                  # Pan/navigation tool
│   │   ├── Transform.js            # Transform operations
│   │   ├── Pen.js                  # Freehand drawing
│   │   ├── Shape.js                # Parametric shape library
│   │   ├── Text.js                 # Text tool
│   │   ├── Drill.js                # Drilling operations
│   │   ├── PathEdit.js             # Path control point editing
│   │   ├── Boolean.js              # Boolean operations
│   │   ├── Gemini.js               # AI SVG generation
│   │   └── OperationManager.js     # Operation lifecycle manager
│   ├── simplify.js                 # Path simplification
│   ├── clipperf.js                 # ClipperJS wrapper
│   ├── maker.js                    # Maker.js parametric shapes
│   ├── paper-full.js               # Paper.js library
│   ├── opentype.js                 # OpenType font library
│   ├── lucide.js                   # Lucide icon library
│   ├── three.module.js             # Three.js main module (local ES6)
│   └── three.core.js               # Three.js core implementation (local ES6)
├── icons/                          # Application icons
└── svg/                            # Sample SVG files for testing
```

## Development Status

### Completed Features
- ✅ SVG import and parsing with multi-software support
- ✅ AI-powered SVG generation via Google Gemini API
- ✅ Complete drawing tools suite (Pen, Polygon, Shape, Text, Drill)
- ✅ Path editing with control point manipulation
- ✅ Boolean operations (union, intersection, difference)
- ✅ Core CNC operations (Inside, Outside, Pocket, Center, V-Carve, Drill)
- ✅ 3D visualization with real-time cutting simulation
  - Voxel-based material removal visualization
  - Tool-specific cutting geometry (End Mill, V-Bit, Drill)
  - Interactive playback controls with variable speed
  - Height-map material preview
- ✅ Comprehensive tool management system
- ✅ Tool library with add/edit/duplicate/delete
- ✅ Material database with 10 wood species properties
- ✅ Auto feed rate calculation
- ✅ Workpiece configuration panel
- ✅ Flexible origin positioning system (9 positions)
- ✅ G-code export with post-processor support
- ✅ Interactive 2D canvas with zoom/pan (mouse wheel + middle button)
- ✅ Interactive 3D visualization with Three.js
- ✅ Snap-to-grid functionality
- ✅ Undo/redo functionality
- ✅ Project save/load with localStorage persistence
- ✅ Bootstrap 5 responsive UI
- ✅ Dynamic properties panel system
- ✅ Contextual help system
- ✅ Resizable UI panels
- ✅ Local Three.js library (v0.181.0) with no external CDN dependencies

### In Progress
- 🔄 Enhanced toolpath optimization algorithms
- 🔄 Improved V-carve performance for complex paths
- 🔄 Additional G-code post-processor profiles

### Planned Features
- 📋 Tab/bridge generation for part hold-down
- 📋 Material database expansion (plastics, metals)
- 📋 Advanced roughing strategies (adaptive clearing)

## Use Cases

toGcode is designed for:

- **Woodworkers**: Create sign lettering, decorative inlays, and joinery cuts
- **Makers**: Rapid prototyping from SVG designs to CNC-ready G-code
- **Hobbyists**: Learn CNC programming with visual feedback and intuitive tools
- **Small Shops**: No-cost CAM solution with professional features
- **Educators**: Teach CNC concepts with an accessible, visual interface

## Contributing

This project welcomes contributions! Areas where help is especially needed:

### Development
- Feature implementations and enhancements
- Bug fixes and performance improvements
- Code refactoring and optimization
- Documentation improvements

### Testing
- Testing with various SVG files from different software
- Testing G-code output on different CNC machines, if you create a post processor profile I can add it to the default list.
- Cross-browser compatibility testing
- Performance testing with complex paths

### Feedback
- Bug reports with reproduction steps
- Feature requests with use case descriptions
- User experience feedback and suggestions
- Documentation gaps and unclear instructions

**How to Contribute:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Known Limitations

- Browser-based: Large/complex SVG files may impact performance
- G-code output tested primarily with GRBL-based controllers
- Limited to 2.5D operations (no full 3D machining)
- Requires manual post-processor configuration for specific machines

## Support

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/rickmcconney/toGcode/issues)
- **Discussions**: Ask questions or share projects in [GitHub Discussions](https://github.com/rickmcconney/toGcode/discussions)

## License

This project is open source. Please check the repository for specific license terms.

---

*toGcode - Making CNC accessible for makers, woodworkers, and hobbyists*