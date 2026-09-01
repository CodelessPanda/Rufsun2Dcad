# RufsunCAD Project Brief

Updated: 2026-09-02

## 1. Project Overview

RufsunCAD is a browser-based 2D solar CAD and proposal prototype for rooftop solar design. The project began as an interactive designer for drawing roof boundaries and placing solar panels, then expanded into a Phase 1 SaaS-style product with authentication, workspaces, CRM-lite customer management, cloud project storage, Google Maps address workflow, Google Solar API irradiance data, and professional PDF reporting.

The current product has two major areas:

- Main SaaS workspace area for dashboard, customers, projects, team, and settings.
- Designer area for CAD drawing, solar panel layout, solar exposure review, energy analysis, and exports.

The application stores all CAD geometry in millimeters. Konva is used for rendering and interaction, but the persistent source of truth is the RufsunCAD document JSON stored in application state, IndexedDB cache, and PostgreSQL JSONB.

## 2. Technology Stack

Frontend:

- React 18
- TypeScript
- Vite
- Konva and react-konva for canvas rendering
- Zustand for CAD state, history, selection, tools, viewport, layers, and object operations
- Dexie / IndexedDB for local project cache and offline safety
- Zod for RufsunCAD document validation
- jsPDF for PDF generation
- Lucide React for icons
- Poppins as the application font
- Vitest for frontend tests

Backend:

- NestJS-style TypeScript server
- Prisma ORM
- PostgreSQL
- JWT access and refresh authentication
- bcryptjs password hashing
- Workspace-scoped access control
- Google Solar API data-layer proxy
- Vitest and Supertest for backend tests

Important setup files:

- `package.json`
- `server/package.json`
- `server/.env.example`
- `docker-compose.yml`
- `vite.config.ts`
- `server/prisma/schema.prisma`

## 3. Current App Flow

The app now opens into an authenticated SaaS shell rather than directly into the designer.

Current flow:

1. User logs in or registers.
2. User selects or creates a workspace.
3. User can navigate Dashboard, Customers, Projects, Team, and Settings.
4. User creates or opens a project from the Projects area.
5. The designer opens for that selected project.
6. Designer changes autosave locally first, then sync to the cloud document API.

Seed login:

```text
Email: demo@rufsun.local
Password: Demo12345
```

## 4. SaaS Phase 1 Work Completed

Authentication:

- Login screen.
- Registration screen.
- Logout flow.
- Session restore on app boot.
- JWT access token handling on the frontend.
- Refresh session model on the backend.

Workspace system:

- Workspace onboarding if a user has no workspace.
- Workspace switching.
- Workspace settings screen.
- Workspace summary metrics.
- Workspace member list.
- Tenant isolation through backend membership checks.

CRM-lite:

- Customer list.
- Customer creation.
- Customer update.
- Customer archive.
- Customer detail page.
- Customer-linked projects.
- Customer fields include name, company, type, email, phone, address, coordinates, place ID, and notes.

Projects:

- Cloud project listing.
- New project flow.
- Project open flow.
- Project delete/archive action with confirmation alert.
- Project metadata includes customer, address, coordinates, place ID, status, system size, panel count, created/updated timestamps.
- Project CAD document is saved as JSONB in PostgreSQL.
- Local IndexedDB cache remains as safety/offline storage.

Important files:

- `src/App.tsx`
- `src/api/client.ts`
- `src/api/types.ts`
- `src/components/auth/AuthScreen.tsx`
- `src/components/workspace/WorkspaceShell.tsx`
- `src/components/workspace/WorkspaceOnboarding.tsx`
- `src/components/workspace/WorkspaceSettingsPage.tsx`
- `src/components/dashboard/DashboardPage.tsx`
- `src/components/customers/CustomersPage.tsx`
- `src/components/customers/CustomerDetailPage.tsx`
- `src/components/projects/ProjectsPage.tsx`
- `src/persistence/db.ts`
- `server/src/auth/*`
- `server/src/workspaces/*`
- `server/src/customers/*`
- `server/src/projects/*`
- `server/src/documents/*`
- `server/src/common/workspace-access.service.ts`

## 5. Database And Persistence

Cloud database:

- PostgreSQL is the authoritative cloud database.
- Prisma models now cover users, refresh sessions, workspaces, workspace members, customers, projects, and project documents.
- CAD document JSON is stored in `project_documents.document_json`.
- Project summaries are derived from the document and stored on the project record, including panel count and system size.

Local browser database:

- Dexie / IndexedDB caches project documents locally.
- Designer edits save locally first for responsiveness.
- Cloud sync is debounced so dragging and CAD interactions do not block on network requests.
- Local-only project import support exists for old browser projects that were created before the cloud flow.

Tenant security:

- Backend APIs are scoped by `workspaceId`.
- Access checks confirm the authenticated user is a member of the workspace.
- Cross-workspace customer, project, and document access is blocked.

Important files:

- `server/prisma/schema.prisma`
- `server/prisma/seed.ts`
- `src/persistence/db.ts`
- `server/src/documents/documents.service.ts`
- `server/src/projects/projects.service.ts`
- `server/src/common/workspace-access.service.ts`

## 6. Google Maps And Address Workflow

Project creation now supports an address-first workflow.

Completed:

- Google Maps API key can be entered from the settings area.
- API key is stored in browser `localStorage` for prototype use.
- New project dialog can use Google Places autocomplete for complete addresses.
- User can select or change location on the map.
- Reverse geocoding can convert a picked map location back into an address.
- Map capture metadata is saved into the RufsunCAD document.
- Static map image can be used as a designer underlay.
- The map image is not resizable or draggable in the designer.
- Roofs can be drawn over the map underlay.
- Map capture keeps scale metadata so roof dimensions can match the real house more closely.

Map capture stores:

- Latitude
- Longitude
- Zoom
- Captured width and height in meters
- Image width and height in pixels
- Map type

Google APIs discussed/enabled:

- Maps JavaScript API
- Maps Static API
- Places API
- Places API (New)
- Address Validation API
- Solar API
- Places Aggregate API

Additional API note:

- Reverse geocoding requires the Geocoding API. If reverse address lookup fails, this API should be enabled and billing/restrictions should be checked.

Licensing note:

- Google Static Maps returns raster imagery, commonly PNG or JPEG depending on request parameters and service behavior.
- Before production use, confirm Google Maps Platform terms for storing, exporting, enhancing, printing, or reusing map imagery in customer reports.

Important files:

- `src/services/googleMaps.ts`
- `src/components/home/NewProjectDialog.tsx`
- `src/cad/document/defaultDocument.ts`
- `src/components/canvas/renderers/BasicRenderers.tsx`

## 7. CAD Document Model

RufsunCAD documents currently use version `0.2`.

Document data includes:

- Project name
- Customer name
- Customer address
- Optional map capture metadata
- Optional solar registration/alignment data
- Units, currently millimeters
- CAD objects
- Layers
- Grid settings
- Snap settings
- Active layer
- Created and updated timestamps

Object types currently supported by the document model:

- Line
- Rectangle
- Circle
- Polygon
- Roof
- Map image
- Text
- Dimension
- Solar panel

Default layers:

- Map
- Roof
- Solar
- Dimensions
- Annotations
- General

Important files:

- `src/types/cad.ts`
- `src/schemas/documentSchema.ts`
- `src/cad/document/defaultDocument.ts`

## 8. Designer UI Work Completed

Top bar:

- Removed old New, Demo, and Open buttons from the designer.
- Project management now happens in the main Projects area.
- Project name is editable directly in the designer top bar.
- Back to Projects button remains in the designer top bar.
- Export text was removed; export is icon-only with a dropdown.
- Solar Exposure, Snapping, and Export dropdowns are grouped in the top bar.
- Dropdown order is Solar Exposure, Snapping, Export.
- Dropdowns are viewport-aware and clamp inside the screen to avoid cropping on small screens.
- Dropdowns use max height and internal scrolling where needed.
- Zoom percentage was removed from the top bar.

Left toolbar:

- Main designer tools are simplified to:
  - Select
  - Roof Boundary
  - Solar Panel
  - Text
- Editor and Analysis mode buttons were moved into the left toolbar above the drawing tools.
- Undo, Redo, Zoom In, Zoom Out, and Reset Zoom were moved into the left toolbar after the Text tool.
- Dividers separate mode buttons, drawing tools, and command buttons.
- Clicking a drawing tool while in Analysis switches back to Editor.

Right sidebar:

- Project section presentation was improved.
- Layers section text was reduced.
- Solar array tools only appear when the Solar tool is active.
- Create Grid and Auto Fill buttons were made smaller.
- Panel selector text size was reduced to 12px.
- Grid settings were moved out of the designer sidebar and into the main settings area.
- Snapping and Solar Exposure settings were removed from the right sidebar and placed into top dropdown controls.

Styling:

- Application font changed to Poppins.
- Navbar controls near the logo were reduced earlier.
- Footer/status text was reduced.
- Favicon added.
- General UI polish applied across home, project list, settings, dialogs, toolbar, dropdowns, and side panels.

Important files:

- `src/components/layout/TopBar.tsx`
- `src/components/layout/LeftToolbar.tsx`
- `src/components/layout/StatusBar.tsx`
- `src/components/panels/PropertiesPanel.tsx`
- `src/styles.css`
- `public/favicon.svg`
- `index.html`

## 9. Roof Drawing Work Completed

The roof drawing workflow was simplified into one primary Roof Boundary tool.

Completed behavior:

- Roof is drawn as connected line segments.
- User places points one by one.
- The roof closes when the line meets the starting endpoint/dot.
- Endpoint dots act as line matchup targets.
- Roof line lengths display during drawing.
- Roof line lengths remain visible after drawing.
- Measurements are formatted in feet and inches.
- Measurement labels resize and reposition based on zoom so they remain readable.
- Lines maintain horizontal/vertical straightness until the pointer moves far enough away from that straight path.
- Endpoint alignment guides help join distant dots along exact X/Y paths.
- Low zoom grid notation clutter was reduced.
- A bug that forced an 18 ft x 14 ft roof into an unwanted 30 ft x 30 ft shape was fixed by removing automatic roof scale normalization.

Important files:

- `src/components/canvas/CadCanvas.tsx`
- `src/components/canvas/DraftLayer.tsx`
- `src/components/canvas/renderers/BasicRenderers.tsx`
- `src/cad/geometry/geometry.ts`
- `src/cad/snapping/snapping.ts`

## 10. Solar Panel Placement Work Completed

Manual panel behavior:

- Solar panel drag stability was improved.
- Panels are selectable.
- Panels are not meant to be resized directly.
- Panels can be moved and positioned on roofs.
- Individual panel rotation can follow roof azimuth.
- Panel placement respects active layers better than before.
- User can add panels without needing to click outside the roof shape first.

Snapping and alignment:

- Panels snap to grid when enabled.
- Panels snap/align to nearby panels.
- Default panel spacing is 20 mm.
- Snapping settings now live in a top dropdown.

Panel arrays:

- Create Grid can generate rows and columns.
- Auto Fill can populate a roof area based on available roof geometry.
- When placing a grid, the whole grid rotates according to the roof azimuth rather than rotating each panel independently.
- Auto Fill and Create Grid only appear when the Solar tool is active.
- Auto Fill uses roof containment checks so panels must remain inside the usable roof area and not touch/cross the setback line.
- Existing occupied spaces are skipped to avoid overlapping panels.

Important files:

- `src/components/panels/PropertiesPanel.tsx`
- `src/components/canvas/CadCanvas.tsx`
- `src/components/canvas/renderers/SolarPanelRenderer.tsx`
- `src/cad/array/array.ts`
- `src/cad/geometry/geometry.ts`
- `src/cad/snapping/snapping.ts`
- `src/data/sampleSolarModules.ts`

## 11. Layers And Selection Work Completed

Completed:

- Default layer set was added.
- Active layer is stored in document settings.
- Objects respect visible and locked layer behavior.
- Map layer is treated as an underlay.
- Map image is not selectable/resizable in the designer.
- Layer-aware object interaction helpers exist.
- Marquee selection was adjusted so selecting panels over a roof does not automatically select the roof underneath when layer behavior should keep them separate.
- Preferred layer logic helps roof objects go to the Roof layer and panel objects go to the Solar layer.

Important files:

- `src/store/useCadStore.ts`
- `src/components/canvas/CadCanvas.tsx`
- `src/components/panels/PropertiesPanel.tsx`
- `src/cad/document/defaultDocument.ts`

## 12. Zoom, Grid, And Canvas Performance

Completed:

- Mouse wheel zoom works around the pointer.
- Delayed/smoothed zoom behavior was adjusted back toward immediate wheel response after feedback.
- Zoom performance was improved after panels caused lag.
- Grid notation clutter at 10% zoom was reduced.
- Grid layer is separate from object layers.
- Export routines can hide non-object layers where appropriate.
- Rulers and labels adjust based on viewport scale.

Important files:

- `src/components/canvas/CadCanvas.tsx`
- `src/components/canvas/GridLayer.tsx`
- `src/cad/viewport/viewport.ts`

## 13. Google Solar API And Irradiance Work Completed

Backend Solar API:

- Added backend routes under workspace/project solar endpoints.
- Server calls Google Solar API `dataLayers:get`.
- Server can download annual flux GeoTIFF.
- Server can proxy optional RGB, DSM, and building mask GeoTIFF layers.
- Server caches data-layer metadata in memory for the project.
- Server can use `GOOGLE_SOLAR_API_KEY` from env, with prototype support for a client-provided Google key header.
- Server returns safe metadata and app-relative download URLs.

Frontend solar loading:

- Designer can load Solar API data for projects with coordinates.
- Annual flux GeoTIFF is decoded in the browser.
- Optional RGB, DSM, and mask rasters can be decoded for diagnostics/debugging.
- Annual flux heatmap is rendered as a canvas.
- Heatmap colors were made stronger/solid for usability.
- Heatmap has a persistent show/hide checkbox.
- Heatmap no longer depends on keeping the roof selected after it is loaded.
- Roof-specific irradiance statistics are calculated from sampled raster pixels.
- The energy analysis uses Google annual flux values when they are available.
- If Solar API data is missing, calculations fall back to manual/default irradiance assumptions.

Alignment and diagnostics:

- Solar raster is georeferenced to the project map.
- Solar registration stores east/west offset, north/south offset, rotation, scale, and calibrated status.
- Solar exposure dropdown includes debug layers and alignment controls.
- User can nudge and save solar alignment.
- Diagnostics can show CRS, raster size, pixel resolution, WGS84 bounds, pointer lat/lng, raster pixel, and annual flux sample.

Important files:

- `server/src/solar/solar.controller.ts`
- `server/src/solar/solar.service.ts`
- `src/services/googleSolar.ts`
- `src/components/panels/SolarExposurePanel.tsx`
- `src/components/canvas/SolarExposureLayer.tsx`
- `src/cad/solar/solarFlux.ts`
- `src/cad/solar/solarRaster.ts`
- `src/cad/solar/solarGeoTransform.ts`
- `src/cad/solar/solarHeatmap.ts`
- `src/cad/solar/solarPalette.ts`
- `src/cad/solar/solarStatistics.ts`
- `src/cad/solar/solarAnalysis.ts`

## 14. Energy Analysis Work Completed

Completed:

- Designer includes an Analysis mode.
- Energy analysis calculates production across today, week, month, and year.
- System capacity is calculated from placed solar panels.
- Panels are filtered by whether they are on valid roof areas.
- Roof tilt and azimuth are used for angle efficiency.
- Google annual flux values are used when available for more accurate yearly production.
- Manual/default assumptions are used when Solar API data is not loaded.
- A system cost estimate was added.
- Cost and savings can be compared side by side.
- Payback-style estimate is included.

Current assumptions include:

- Temperature/performance correction factor.
- Electricity rate.
- Default irradiance/sunlight fallback when Solar API data is unavailable.
- Cost per watt for system cost estimate.

Important files:

- `src/components/analysis/EnergyAnalysisPanel.tsx`
- `src/cad/energy/energyCalculator.ts`
- `src/cad/solar/solarAnalysis.ts`
- `src/cad/energy/energyCalculator.test.ts`

## 15. Export And Reporting Work Completed

Document export:

- `.rufcad` JSON export remains available under the export dropdown as Default.
- Document validation uses Zod.

PNG export:

- PNG export adds a pure white background before export.
- PNG export excludes the grid so the exported/printed image is clean.

PDF report:

- PDF report export exists.
- Report was expanded into a professional 7-page design report.
- Report uses compressed JPEG images to reduce output size.
- Report includes default placeholder images when project imagery is unavailable.
- Report page 4 focuses on annual solar exposure over roof areas rather than full-screen heatmap coverage.
- Report includes line charts:
  - Monthly production trend
  - Cumulative cash flow
- Report includes map image, layout image, exposure image, roof data, panel data, energy data, financial data, and technical appendix.
- Drawing is kept on the left/visual side where appropriate and metrics are kept compact.
- Data-line spacing was reduced.
- Drawing is fitted by aspect ratio rather than squeezed.
- Report output size was reduced from earlier large output, targeting a more practical export size.

Current report pages:

1. Cover / Executive Summary
2. Site And Map
3. System Design
4. Annual Solar Exposure
5. Energy Production
6. Financial Analysis
7. Technical Appendix

Important files:

- `src/reports/projectReport.ts`
- `src/components/layout/TopBar.tsx`
- `src/cad/energy/energyCalculator.ts`
- `src/cad/solar/solarStatistics.ts`
- `src/cad/solar/solarAnalysis.ts`

## 16. Tests Added Or Maintained

Frontend/domain tests:

- Geometry tests.
- Energy calculator tests.
- Solar geotransform tests.
- Solar statistics tests.

Backend tests:

- API isolation test for workspaces, customers, projects, and documents.
- Solar service tests for data-layer metadata, missing coordinates, missing API key, client-provided API key, unavailable annual flux, and GeoTIFF download behavior.

Important files:

- `src/cad/geometry/geometry.test.ts`
- `src/cad/energy/energyCalculator.test.ts`
- `src/cad/solar/solarGeoTransform.test.ts`
- `src/cad/solar/solarStatistics.test.ts`
- `server/test/api.test.ts`
- `server/test/solar.service.test.ts`

Useful commands:

```bash
npm run test
npm run build
npm run server:test
npm run server:build
```

## 17. How To Run Locally

Start database:

```bash
npm run db:up
```

Prepare backend:

```bash
cd server
copy .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Prepare frontend in another terminal:

```bash
cd E:\xampp\htdocs\Rufsun2Dcad
npm install
npm run dev
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`
- PostgreSQL: `localhost:5432`

Backend `.env` values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rufsun_cad?schema=public"
JWT_SECRET="replace-with-a-long-random-access-token-secret"
JWT_REFRESH_SECRET="replace-with-a-long-random-refresh-token-secret"
FRONTEND_URL="http://localhost:5173"
PORT=4000
GOOGLE_MAPS_BROWSER_KEY=""
GOOGLE_SOLAR_API_KEY=""
```

## 18. Key User Requests Addressed

- Stabilized solar panel drag behavior.
- Improved smooth wheel zoom and panel-related zoom lag.
- Removed grid from PNG export.
- Added pure white PNG export background.
- Added panel snapping and panel-to-panel alignment.
- Added default 20 mm panel spacing.
- Prevented panels from overlapping existing panels.
- Prevented Auto Fill panels from crossing or touching roof setback boundaries.
- Fixed grid array rotation so the full grid follows roof azimuth.
- Simplified visible drawing tools to Select, Roof, Solar, and Text.
- Added one roof tool for line-based roof creation.
- Added endpoint/dot closure for roof polygons.
- Added live and persistent line measurements.
- Formatted line measurements in feet and inches.
- Added straight-line path behavior and distant X/Y endpoint alignment.
- Reduced low-zoom grid notation clutter.
- Improved layer behavior and layer-aware selection.
- Added editable project name.
- Added project list/home/workspace screens.
- Added customer name and address during project creation.
- Added project deletion with warning.
- Added Back to Projects from designer.
- Moved designer project management out of old New/Demo/Open buttons.
- Added export dropdown with Default, PNG, and PDF.
- Added favicon.
- Changed font to Poppins.
- Added Google Places autocomplete and map capture.
- Allowed choosing location on map and deriving address.
- Made designer map underlay fixed/non-resizable.
- Allowed roof drawing over the map.
- Fixed unwanted roof auto-resizing issue.
- Added Google Solar API annual flux loading.
- Added visible, strong-color solar heatmap.
- Added heatmap show/hide control.
- Added solar irradiance in analysis calculations.
- Added professional 7-page PDF report.
- Added report line charts.
- Reduced report image/PDF size through JPEG compression.
- Moved Solar, Snapping, and Export dropdowns to top bar.
- Made dropdowns larger and less mistake-prone.
- Removed export text.
- Moved Editor/Analysis, Undo/Redo, and Zoom controls into left toolbar.
- Made dropdowns viewport-aware so they do not crop on small screens.

## 19. Known Prototype Limitations And Risks

CAD geometry:

- Setback polygon logic is still approximate and should be hardened with a robust polygon offset library before engineering-grade use.
- Panel containment currently uses corner and edge-intersection checks against usable roof polygons.
- Complex concave roofs, holes, obstructions, and fire pathways may need more advanced geometry.
- Dimension objects are not fully associative with source lines/roof edges.
- Some older CAD tool ids remain in types for compatibility even though the visible toolbar is simplified.

Solar/API:

- Google Solar API availability varies by location.
- Solar data-layer URLs are temporary and should be refreshed when needed.
- Raw Solar API rasters are not stored in documents.
- Alignment between Google map imagery and Solar API rasters can require manual calibration.
- Production deployment should use properly restricted keys and keep server keys on the backend.
- Google Maps imagery licensing must be reviewed before production export/enhancement/report usage.

Reporting:

- PDF report values are estimates, not stamped engineering output.
- Financial assumptions need real tariffs, incentives, taxes, permits, and local installation pricing.
- Report image quality and file size are balanced through JPEG compression; exact size depends on map/layout content.

SaaS/product:

- Real-time collaboration is not implemented.
- Billing/subscriptions are not implemented.
- Advanced CRM pipeline and proposal approval workflow are not implemented.
- Role-based permissions exist conceptually, but UI-level permission restrictions can be expanded.
- Server-side validation of uploaded CAD document JSON can be made stricter.

## 20. Recommended Next Steps

High priority:

- Add robust polygon offset/setback handling for production-safe roof setbacks.
- Add obstruction objects and fire pathway rules.
- Add visual validation for panels that violate setback, roof, or overlap rules.
- Add server-side CAD document schema validation before saving JSONB.
- Move Google Maps browser key handling into a more production-ready settings model.
- Add stronger API key restriction guidance in Settings.

Medium priority:

- Code-split large report/GeoTIFF/map libraries to reduce frontend bundle size.
- Add visual regression tests or Playwright checks for designer layout/dropdowns.
- Add project-level report settings for rates, cost per watt, incentives, and currency.
- Add PDF branding settings from workspace profile.
- Add saved solar alignment presets per project.
- Improve mobile/small-screen designer layout.

Future product expansion:

- Proposal management.
- Customer lead stages.
- Quote versioning.
- Team roles and invitations.
- Audit log.
- Cloud asset storage for generated reports.
- Obstruction/shading modeling.
- AHJ/code-rule templates.
- Permit-ready plan set exports.

## 21. Main File Map

Frontend app:

- `src/App.tsx`
- `src/main.tsx`
- `src/styles.css`

CAD state and types:

- `src/types/cad.ts`
- `src/store/useCadStore.ts`
- `src/schemas/documentSchema.ts`

CAD logic:

- `src/cad/geometry/geometry.ts`
- `src/cad/snapping/snapping.ts`
- `src/cad/viewport/viewport.ts`
- `src/cad/array/array.ts`
- `src/cad/document/defaultDocument.ts`

Designer UI:

- `src/components/canvas/CadCanvas.tsx`
- `src/components/canvas/GridLayer.tsx`
- `src/components/canvas/DraftLayer.tsx`
- `src/components/canvas/SolarExposureLayer.tsx`
- `src/components/canvas/renderers/*`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/LeftToolbar.tsx`
- `src/components/layout/StatusBar.tsx`
- `src/components/layout/ContextMenu.tsx`
- `src/components/panels/PropertiesPanel.tsx`
- `src/components/panels/SolarExposurePanel.tsx`
- `src/components/analysis/EnergyAnalysisPanel.tsx`

SaaS UI:

- `src/components/auth/AuthScreen.tsx`
- `src/components/workspace/*`
- `src/components/dashboard/DashboardPage.tsx`
- `src/components/customers/*`
- `src/components/projects/ProjectsPage.tsx`
- `src/components/home/NewProjectDialog.tsx`

API and services:

- `src/api/client.ts`
- `src/api/types.ts`
- `src/services/googleMaps.ts`
- `src/services/googleSolar.ts`

Reports:

- `src/reports/projectReport.ts`

Backend:

- `server/src/main.ts`
- `server/src/app.module.ts`
- `server/src/auth/*`
- `server/src/workspaces/*`
- `server/src/customers/*`
- `server/src/projects/*`
- `server/src/documents/*`
- `server/src/solar/*`
- `server/src/common/*`
- `server/prisma/schema.prisma`

## 22. Current Status Summary

RufsunCAD is now a working Phase 1 SaaS/CAD prototype with authenticated workspaces, customers, cloud projects, a browser CAD designer, Google map-based project setup, roof drawing, solar panel layout, Solar API irradiance overlays, energy and cost analysis, and PDF/PNG exports.

The main remaining work is hardening: more robust geometry for setbacks and complex roofs, production-grade API key/security handling, stronger validation, deeper report configurability, and performance/bundle optimization.
