# RufsunCAD

RufsunCAD is an early browser-based 2D engineering/CAD prototype for solar PV layout and infrastructure planning. It keeps engineering geometry in millimeters, uses Konva only as the rendering and interaction layer, and stores projects locally in IndexedDB.

## Technology Stack

- React, TypeScript, Vite
- Konva.js and react-konva for 2D canvas rendering
- Zustand for CAD state, selection, tools, history, and viewport
- Zod for RufsunCAD project import validation
- Dexie / IndexedDB for local autosave
- Vitest for geometry and snapping tests

## Installation

```bash
npm install
npm run dev
```

## Project Architecture

```text
src/
  cad/
    array/        solar array generation and statistics
    document/     blank and demo document creation
    geometry/     reusable CAD math in millimeters
    objects/      object factory helpers
    snapping/     grid/object/panel snapping
    viewport/     world/screen coordinate conversion
  components/
    canvas/       Konva workspace, grid, draft overlays, renderers
    layout/       top bar, toolbar, status bar, context menu
    panels/       properties, layers, snap/grid settings
  persistence/    Dexie autosave
  schemas/        Zod document schema
  store/          Zustand CAD store
  types/          CAD document and object types
```

The data flow is:

```text
CAD Document -> Zustand -> Geometry / Snap Engine -> React -> Konva rendering
```

Konva nodes are not the source of truth. Object dimensions and positions are stored as engineering-world millimeters.

## Coordinate System

All persistent CAD objects use millimeters. The viewport stores pan and zoom separately and converts between world and screen coordinates through `worldToScreen` and `screenToWorld`.

At 100% zoom, the prototype uses `0.1 px/mm`, so a 1134 x 2278 mm solar module renders at a practical desktop editing size without changing its physical dimensions.

## Working Features

- CAD grid with minor and major lines
- Mouse-centered wheel zoom, reset zoom, zoom controls
- Pan tool and spacebar/middle-button panning
- Select, shift multi-select, marquee select, Delete/Escape behavior
- Draw line, rectangle, circle, polygon, roof, text, dimensions, and measure previews
- Reusable solar module renderer with frame, cells, busbars, and warnings
- Solar panel placement using generic sample module catalog
- Magnetic solar panel snapping with exact module gap
- Alignment guides during panel snapping
- Solar array generator with rows, columns, gaps, and orientation
- Contextual properties panel with numeric CAD inputs
- Layer visibility, locking, and active layer selection
- Undo/redo, copy/paste, duplicate, z-order, object lock/unlock
- Local autosave and restore through IndexedDB
- Import/export `.rufcad` JSON with Zod validation
- PNG and PDF export
- Demo drawing with roof, modules, dimension, and annotation

## Keyboard Shortcuts

- `V` Select
- `Space` Pan while held
- `L` Line
- `R` Rectangle
- `C` Circle
- `G` Polygon
- `F` Roof
- `P` Solar panel
- `D` Dimension
- `M` Measure
- `T` Text
- `Delete` / `Backspace` Delete selected objects
- `Ctrl+C` Copy
- `Ctrl+V` Paste
- `Ctrl+D` Duplicate
- `Ctrl+Z` Undo
- `Ctrl+Shift+Z` / `Ctrl+Y` Redo
- `Escape` Cancel current operation or deselect
- `Enter` Finish polygon or roof drawing

## Adding CAD Object Types

1. Add a typed object interface in `src/types/cad.ts`.
2. Add validation in `src/schemas/documentSchema.ts`.
3. Add geometry support in `src/cad/geometry/geometry.ts`.
4. Add a renderer under `src/components/canvas/renderers/`.
5. Add factory/tool behavior in `src/cad/objects/factory.ts` and `src/components/canvas/CadCanvas.tsx`.

## Adding Tools

Tools are represented by `CadTool`. Add the tool id to the type, add a toolbar item, then handle its transient draft state and final document command in `CadCanvas`. Temporary previews should stay in draft state and never be saved into the document.

## Persistence

The editor autosaves the most recent project to IndexedDB after a short debounce. Reloading the browser restores the last valid RufsunCAD document.

## Known Prototype Limitations

- Polygon setback visualization is an approximate inward visual offset, not a robust geometric polygon offset.
- Panel containment checks are based on panel corners and roof polygons.
- Dimension objects are standalone and not yet associated with source geometry.
- Transformer support is strongest for rectangular, circular, text, and solar objects.
- This prototype is intentionally local-only and has no authentication, backend, collaboration, billing, or cloud storage.
