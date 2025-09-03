# toGcode

A web-based CNC CAM (Computer-Aided Manufacturing) application that converts SVG files into G-code for CNC machines. Designed with a focus on woodworking and maker-friendly CNC operations.

## 🚧 Work in Progress

This project is actively under development. Features and interfaces may change as the application evolves. Currently undergoing a UI migration from w2ui to Bootstrap 5 for improved usability and modern design.

## Current Functionality

### File Operations
- **SVG Import**: Parse and import SVG files with support for various drawing software (Adobe Illustrator, Inkscape)
- **G-code Export**: Generate standard G-code with proper feed rates, depths, and tool changes
- **Project Management**: Save/load project state with undo/redo functionality

### Drawing Tools
- **Pen Tool**: Freehand drawing for custom paths
- **Polygon Tool**: Create multi-sided geometric shapes
- **Text Tool**: Add text with font support (using OpenType.js)
- **Selection Tool**: Select and manipulate imported paths
- **Transform Tools**: Move, rotate, and scale objects

### CNC Operations
- **Inside Profiling**: Cut inside a closed path with tool radius compensation
- **Outside Profiling**: Cut outside a closed path for part cutout
- **Pocketing**: Remove material from enclosed areas with adaptive clearing
- **Drilling**: Create drilling operations for holes
- **V-Carving**: Generate V-bit toolpaths for engraving and decorative cuts
- **Center Operation**: Follow a path with no offset for engraving and decorative cuts

### Tool Management
- **Tool Library**: Manage cutting tools with parameters:
  - Tool diameter, feed rate, plunge rate
  - Cutting depth, step down, stepover
  - Tool types: End Mill, Drill Bit, V-Bit
- **Material Settings**: Wood species selection with optimized cutting parameters
- **Feed Rate Calculator**: Automatic speed/feed calculation based on tool and material

### Visualization & Navigation
- **2D Canvas**: Interactive canvas with zoom, pan, and selection
- **Toolpath Preview**: Visual representation of generated toolpaths
- **Origin Setting**: Configurable work coordinate system origin
- **Grid Display**: Optional grid overlay for alignment
- **Layer Management**: Control visibility of imported paths and generated toolpaths

## Technical Architecture

### Core Technologies
- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **UI Framework**: Bootstrap 5 (migrating from w2ui 2.0)
- **Geometry**: Paper.js for SVG parsing and geometric operations
- **Path Operations**: ClipperJS for offsetting and boolean operations
- **Typography**: OpenType.js for font handling
- **Icons**: Lucide icon system

### Key Components
- `js/cnc.js` - Core CNC logic and toolpath generation
- `js/layout.js` - Legacy UI layout (w2ui-based)
- `js/bootstrap-layout.js` - New Bootstrap 5 UI implementation
- `js/vcarve.js` - V-carve specific algorithms and optimization
- `js/operations/` - Operation system with individual tool implementations

### Data Flow
1. SVG files imported and parsed into internal path format
2. Paths stored in `svgpaths[]` array with selection and visibility state
3. CNC operations generate toolpaths using ClipperJS for tool compensation
4. Toolpaths optimized and stored in `toolpaths[]` array
5. G-code generated from toolpaths with proper machine commands

## Getting Started

### Prerequisites
- Modern web browser with HTML5 Canvas support
- Local web server (recommended) or file:// protocol access

### Running the Application
The application can be run from the github link https://rickmcconney.github.io/toGcode/
or you can clne the project.
1. Clone or download the repository
2. Serve the directory with a local HTTP server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js (with http-server)
   npx http-server
   ```
3. Navigate to the served URL in your browser


## Project Structure

```
toGcode/
├── index.html              # Main application entry point
├── css/
│   ├── app.css            # Application styles
│   └── w2ui-2.0.css       # Legacy UI framework styles
├── js/
│   ├── cnc.js             # Core CNC logic and toolpath generation
│   ├── layout.js          # Legacy w2ui layout system
│   ├── bootstrap-layout.js # New Bootstrap 5 layout
│   ├── vcarve.js          # V-carve algorithms
│   └── operations/        # Individual CNC operation implementations
└── svg/                   # Sample SVG files for testing
```

## Development Status

### Completed Features
- ✅ SVG import and parsing
- ✅ Basic drawing tools
- ✅ Core CNC operations (profile, pocket, drill, v-carve)
- ✅ Tool management system
- ✅ G-code export
- ✅ Canvas visualization

### In Progress
- 🔄 UI migration from w2ui to Bootstrap 5
- 🔄 Enhanced tool management interface
- 🔄 Improved user experience and workflow

### Planned Features
- 📋 Tab/bridge generation for part hold-down
- 📋 Material database expansion
- 📋 Advanced roughing strategies

## Contributing

This project welcomes contributions! Areas where help is especially needed:
- UI/UX improvements
- Testing with various SVG files and CNC machines
- Bug reports and feature requests

## License

This project is open source. Please check the repository for specific license terms.

---

*toGcode - Making CNC accessible for makers, woodworkers, and hobbyists*