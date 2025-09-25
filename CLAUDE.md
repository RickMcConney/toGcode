# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

toGcode is a web-based CNC CAM (Computer-Aided Manufacturing) application that converts SVG files into G-code for CNC machines. It provides tools for path generation, toolpath planning, and G-code export for various CNC operations including profiling, pocketing, drilling, and V-carving.

## Architecture

### Core Components

**Main Application Files:**
- `index.html` - Main HTML entry point with UI layout and script loading
- `js/cnc.js` - Core CNC logic, SVG parsing, toolpath generation, and G-code export
- `js/layout.js` - UI layout management using w2ui framework, including toolbar, sidebar, and grids

**Operation System:**
- `js/operations/Operation.js` - Base class for all CNC operations
- `js/operations/OperationManager.js` - Manages operation lifecycle and event handling
- `js/operations/` - Individual operation implementations (Select, Pen, Drill, Polygon, Text, Transform, Origin, Pan)
- `js/CncController.js` - Main controller that orchestrates operations and UI
- `js/vcarve.js` - V-carve specific toolpath algorithms and optimization

**Key Libraries:**
- w2ui 2.0 - UI framework for layout, grids, forms, and popups (being migrated to Bootstrap 5)
- Paper.js - SVG parsing and geometric operations
- ClipperJS - Path offsetting and boolean operations
- OpenType.js - Font handling for text operations
- Bootstrap 5 - Modern UI framework (replacing w2ui gradually)
- Lucide - Icon system for new Bootstrap UI

### Data Flow

1. **SVG Import**: SVG files parsed using Paper.js, converted to internal path format
2. **Path Management**: Paths stored in `svgpaths` array with visibility, selection state, and bounding boxes
3. **Tool Operations**: Users select paths and apply operations (Inside, Outside, Pocket, etc.)
4. **Toolpath Generation**: Operations generate toolpaths using clipper offsetting and path optimization
5. **G-code Export**: Toolpaths converted to G-code with proper feed rates, depths, and tool changes

### Tool System

Tools are defined in `tools` array with properties:
- `diameter`, `feed`, `zfeed` - Tool dimensions and feed rates
- `bit` - Tool type (End Mill, Drill, VBit)
- `depth`, `step`, `stepover` - Cutting parameters
- Stored in localStorage for persistence

### Coordinate System

- Internal coordinates use a scaled system with `viewScale = 10`
- SVG coordinates converted using `svgscale = viewScale * 25.4 / pixelsPerInch`
- Origin point stored in `origin` object, adjustable by user
- Canvas uses 2D context with transform matrix for zoom/pan

## Development Commands

This is a client-side JavaScript application. Development workflow:

1. **Local Development**: Open `index.html` in a web browser or serve via local HTTP server
2. **No Build Process**: All code runs directly in browser, no compilation needed
3. **Testing**: Manual testing through browser - load SVG files, generate toolpaths, export G-code

**Common Development Tasks:**
- Test Bootstrap UI: Open `test-bootstrap.html` for new Bootstrap 5 layout testing
- Icon Management: Icons stored in `icons/` directory, with SVG assets in `svg/`
- Feature Testing: Use SVG files from `svg/` directory for comprehensive toolpath testing

## Code Organization

### Global State Management
- `svgpaths[]` - Imported SVG path geometries
- `toolpaths[]` - Generated CNC toolpaths  
- `tools[]` - Tool library with cutting parameters
- `options[]` - Application settings (grid, units, tolerance, etc.)

### Key Functions
- `parseSvgContent()` - Parse SVG using Paper.js into internal format  
- `newParseSvgContent()` - Robust SVG parser handling multiple element types
- `doInside()`, `doOutside()`, `doPocket()` - Generate specific toolpath types
- `offsetPath()` - Path offsetting using ClipperJS for tool compensation
- `toGcode()` - Convert toolpaths to G-code format

### UI Integration (Bootstrap 5)
- **Layout**: Bootstrap 5 responsive grid with navbar, sidebar, canvas, and bottom tool panel
- **Operations**: Tools and operations integrated via sidebar click handlers
- **Tool Management**: Bootstrap table with inline editing for all tool parameters
- **Modals**: Bootstrap modals for options and help dialogs  
- **Notifications**: Bootstrap toast notifications replace w2ui notifications
- **File Operations**: HTML5 File API with Bootstrap toolbar buttons
- **Canvas**: 2D context rendering with proper transform handling

## Important Notes

- SVG parsing automatically detects Adobe Illustrator vs Inkscape coordinate systems
- Undo system maintains project state snapshots in `undoList[]`
- All measurements internally in mm, with inch display conversion available
- Toolpaths optimized using Lighten algorithm for smoother motion
- V-carve operations use medial axis algorithm for optimal tool paths

## Current Migration Status

The application is undergoing a UI migration from w2ui to Bootstrap 5:
- **Legacy UI**: `js/layout.js` contains w2ui-based layout system
- **New UI**: `js/bootstrap-layout.js` contains Bootstrap 5 implementation
- **Testing**: `test-bootstrap.html` provides preview of new Bootstrap interface
- **Icons**: Migrating from Font Awesome to Lucide icon system
- Both systems coexist during transition period