# RufsunCAD

RufsunCAD is an early browser-based 2D engineering/CAD prototype for solar PV layout and infrastructure planning. It keeps engineering geometry in millimeters, uses Konva only as the rendering and interaction layer, and now includes the Phase 1 SaaS foundation around the existing CAD designer.

## Technology Stack

- React, TypeScript, Vite
- Konva.js and react-konva for 2D canvas rendering
- Zustand for CAD state, selection, tools, history, and viewport
- Zod for RufsunCAD project import validation
- Dexie / IndexedDB for local autosave
- NestJS backend in `server/`
- PostgreSQL and Prisma for cloud storage
- JWT authentication and workspace-scoped APIs
- Vitest for geometry and snapping tests

## Frontend Setup

```bash
npm install
npm run dev
```

Optional frontend environment:

```bash
VITE_API_URL=http://localhost:4000/api
```

If `VITE_API_URL` is not set, the frontend uses `http://localhost:4000/api`.

## Backend Setup

The backend lives in `server/` and uses NestJS, Prisma, and PostgreSQL.

1. Create a PostgreSQL database, for example `rufsun_cad`.
2. Copy the backend env example:

```bash
cd server
copy .env.example .env
```

3. Edit `server/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rufsun_cad?schema=public"
JWT_SECRET="replace-with-a-long-random-access-token-secret"
JWT_REFRESH_SECRET="replace-with-a-long-random-refresh-token-secret"
FRONTEND_URL="http://localhost:5173"
PORT=4000
GOOGLE_MAPS_BROWSER_KEY=""
GOOGLE_SOLAR_API_KEY=""
```

4. Install and initialize:

```bash
cd server
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Seed login:

```text
Email: demo@rufsun.local
Password: Demo12345
```

`GOOGLE_SOLAR_API_KEY` is used server-side for Google Solar API `dataLayers:get` and GeoTIFF download proxying. The browser still uses the Maps key for Places/Maps UI during development.

Useful backend commands:

```bash
npm run build
npm run test
npm run prisma:migrate
npm run prisma:seed
```

## Project Architecture

```text
src/
  api/            central frontend API client and SaaS types
  cad/
    array/        solar array generation and statistics
    document/     blank and demo document creation
    geometry/     reusable CAD math in millimeters
    objects/      object factory helpers
    snapping/     grid/object/panel snapping
    viewport/     world/screen coordinate conversion
  components/
    auth/         login/register screens
    canvas/       Konva workspace, grid, draft overlays, renderers
    customers/    CRM-lite customer list and detail pages
    dashboard/    workspace dashboard
    home/         new project dialog with customer + map workflow
    layout/       top bar, toolbar, status bar, context menu
    panels/       properties, layers, snap/grid settings
    projects/     cloud project list
    workspace/    workspace shell, onboarding, team, settings
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

Cloud persistence flow:

```text
Authenticated User
  -> Workspace
  -> Customer
  -> Project
  -> CAD Document JSON
  -> Dexie local cache + debounced PostgreSQL sync
```

Backend structure:

```text
server/
  prisma/         Prisma schema and seed data
  src/
    auth/         register, login, refresh, logout, current user
    common/       JWT guard and workspace access checks
    customers/    workspace-scoped CRM-lite customer API
    documents/    JSONB CAD document API
    projects/     workspace/customer project API
    workspaces/   workspace, members, summary API
```

## Coordinate System

All persistent CAD objects use millimeters. The viewport stores pan and zoom separately and converts between world and screen coordinates through `worldToScreen` and `screenToWorld`.

At 100% zoom, the prototype uses `0.1 px/mm`, so a 1134 x 2278 mm solar module renders at a practical desktop editing size without changing its physical dimensions.

## Working Features

- CAD grid with minor and major lines
- Mouse-centered wheel zoom, reset zoom, zoom controls
- Pan tool and spacebar/middle-button panning
- Select, shift multi-select, marquee select, Delete/Escape behavior
- Draw roof, solar panels, and text with the simplified production toolbar
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
- Register/login/logout
- Workspace onboarding and workspace switching
- CRM-lite customers with create, edit, open, and archive
- Cloud projects scoped to workspace and customer
- CAD document JSON stored in PostgreSQL JSONB
- Dexie retained as local cache/offline safety layer
- Debounced cloud autosave with subtle top bar save status
- Basic team and workspace settings screens
- Google Solar API Annual Solar Exposure layer for selected roof polygons
- GeoTIFF annual flux decoding, map-aligned heatmap rendering, and roof min/max/average statistics

## Keyboard Shortcuts

- `V` Select
- `Space` Pan while held
- `F` Roof
- `P` Solar panel
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

PostgreSQL is the authoritative cloud database for users, workspaces, customers, projects, and project CAD documents. CAD documents are stored as JSONB in `project_documents.document_json`; individual Konva/CAD primitives are not split into relational rows.

Dexie/IndexedDB remains in the frontend as a local cache and offline safety layer. During designer edits, RufsunCAD saves locally first, then debounces cloud document sync so dragging and canvas work stay responsive.

Tenant isolation is enforced by backend membership checks. Workspace-owned customer, project, and document queries are always scoped by `workspace_id` and authenticated membership.

## Known Prototype Limitations

- Polygon setback visualization is an approximate inward visual offset, not a robust geometric polygon offset.
- Panel containment checks are based on panel corners and roof polygons.
- Dimension objects are standalone and not yet associated with source geometry.
- Transformer support is strongest for rectangular, circular, text, and solar objects.
- Real-time collaboration, billing, proposals, advanced CRM, lead pipelines, and subscriptions are intentionally not part of this phase.
- Google Maps browser keys are still accepted in the UI for development continuity. Production should provide restricted browser keys safely and keep server-side credentials in backend environment variables.
- Solar API data-layer URLs are temporary. RufsunCAD requests fresh data through the backend, decodes the annual flux GeoTIFF for the current session, and does not store raw Solar API raster data in project documents.
