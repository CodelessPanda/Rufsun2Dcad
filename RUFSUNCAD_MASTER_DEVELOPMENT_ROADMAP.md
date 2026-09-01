# RufsunCAD Master Development Roadmap

**Project:** RufsunCAD  
**Goal:** Build RufsunCAD into a production-grade, multi-tenant SaaS platform for professional 2D solar design, analysis, proposals, engineering workflows, and distributor-led licensing.

---

## 1. Product Direction

RufsunCAD should evolve into an **Aurora-class solar design SaaS platform**, while remaining fundamentally **2D-first** in the user interface.

The goal is not to clone Aurora Solar's 3D workflow.

Instead, RufsunCAD should become:

> **An engineering-grade, browser-based 2D solar design, analysis, proposal, and workflow platform built for EPCs, installers, designers, solar sales teams, and distributed reseller networks.**

The canvas remains 2D, but the analysis engine may use:

- Satellite imagery
- High-resolution imagery
- DSM data
- LiDAR data
- Elevation data
- Irradiance rasters
- Weather datasets
- Solar simulation
- Optimization
- Artificial intelligence
- Geospatial processing

This means RufsunCAD may remain visually 2D while becoming significantly more advanced computationally.

---

# 2. Core Commercial SaaS Hierarchy

The long-term account structure should be:

```text
Rufsun Platform
│
├── Super Admin
│
├── Tenant / Distributor
│   │
│   ├── Company A
│   │   ├── Company Admin
│   │   ├── Sales Team
│   │   ├── Designers
│   │   └── Viewers
│   │
│   ├── Company B
│   │   └── ...
│   │
│   └── Company C
│
├── Tenant / Distributor 2
│   └── Companies...
│
└── Rufsun Direct Tenant
    └── Direct Customers
```

## Important Architectural Rule

**Tenant is not the same as Company.**

A **Tenant** is the commercial account, reseller, distributor, or master organization buying RufsunCAD licenses.

A **Company** is the actual solar company, EPC, installer, design firm, or sales organization using RufsunCAD.

Example:

```text
Rufsun
   ↓ 500 Designer Licenses

Distributor
   ↓ 20 seats
Solar Company A

   ↓ 15 seats
Solar Company B

   ↓ 50 seats
Solar Company C
```

Rufsun must always retain platform-level control.

---

# 3. Existing RufsunCAD Status

The current application is considered:

# Phase 1 — Existing RufsunCAD Prototype ✅

The existing system already includes:

- React frontend
- TypeScript
- Vite
- Konva / react-konva
- Zustand CAD state
- Dexie / IndexedDB
- NestJS-style backend
- Prisma ORM
- PostgreSQL
- JWT authentication
- Workspaces
- Workspace isolation
- CRM-lite customers
- Cloud projects
- CAD document JSONB storage
- Google Maps workflow
- Google Places
- Google Solar API
- Annual flux GeoTIFF
- Irradiance heatmaps
- Solar alignment tools
- Roof drawing
- Solar panel placement
- Grid generation
- Auto Fill
- Layers
- Snapping
- Energy analysis
- Cost / savings estimates
- PNG export
- RufsunCAD JSON export
- Professional multi-page PDF report
- Frontend tests
- Backend isolation tests

The existing technology stack should be preserved unless a specific technical reason requires a change.

Do not restart the project.

Do not replace React, NestJS, PostgreSQL, Konva, or Zustand simply to modernize the stack.

---

# 4. Phase 2 — Multi-Level SaaS Architecture

## Goal

Create the commercial SaaS foundation:

```text
Platform
 ↓
Tenant
 ↓
Company
 ↓
Team
 ↓
User Membership
 ↓
Customer
 ↓
Project
 ↓
Design
```

The current Workspace concept should evolve into the **Company level**.

Do not destructively rename or delete existing data in one migration.

Existing workspaces should be migrated safely under a default tenant such as:

```text
Tenant:
Rufsun Direct

Company:
<existing workspace>
```

## Build

- Tenant database model
- Company database model
- Tenant memberships
- Company memberships
- Tenant context
- Company context
- Company switching
- Tenant switching for authorized users
- Platform-level Super Admin
- Tenant status
- Company status
- Ownership rules
- Database migrations
- Server-side scope guards
- API-level tenant isolation
- API-level company isolation
- Isolation integration tests
- Migration path from current workspaces

Where appropriate, business records should become scoped using:

```text
tenantId
companyId
```

## Phase Gate

Company A must never be able to query or access:

- Company B customers
- Company B projects
- Company B CAD documents
- Company B reports
- Company B files
- Company B assets
- Company B users
- Company B API credentials

This isolation must be enforced server-side.

---

# 5. Phase 3 — Identity, Roles, Permissions & Licensing

## Goal

Turn current authentication into a proper multi-level enterprise identity and permissions system.

## Role Hierarchy

### Platform Roles

```text
SUPER_ADMIN
SUPPORT_ADMIN
```

### Tenant Roles

```text
TENANT_OWNER
TENANT_ADMIN
TENANT_BILLING
TENANT_SUPPORT
```

### Company Roles

```text
COMPANY_OWNER
COMPANY_ADMIN
DESIGN_MANAGER
DESIGNER
SALES_MANAGER
SALES_REP
PROJECT_VIEWER
```

Do not build all authorization logic around role names.

Create a permission-based system.

Example permissions:

```text
project.create
project.delete
project.view_all

design.create
design.edit
design.export

proposal.create
proposal.approve

customer.manage

company.users.manage
company.billing.view
```

## Build

- Permission registry
- Role-to-permission mappings
- Customizable role architecture
- Invitations
- Email verification
- Password reset
- Session management
- Forced logout
- Account suspension
- User deactivation
- Team system
- Team project access
- MFA-ready architecture
- Seat assignment
- Designer licenses
- Sales licenses
- Viewer/basic licenses

## Important Concept

Separate:

```text
License / Entitlement
```

from:

```text
Role / Permission
```

A license determines which product capability a user may access.

A role determines what that user is allowed to do inside that capability.

---

# 6. Phase 4 — Plans, Billing, Entitlements & Distributor Licensing

## Goal

Turn RufsunCAD into a product that can actually be commercially sold.

Do not hard-code plan names directly into feature checks.

Avoid patterns such as:

```ts
if (plan === 'PRO')
```

Create an entitlement system.

## Example Entitlements

```text
CAD_DESIGN
SOLAR_IRRADIANCE
ADVANCED_REPORT
AUTO_LAYOUT
ELECTRICAL_DESIGN
BATTERY_DESIGN
WEB_PROPOSAL
API_ACCESS
WHITE_LABEL
CUSTOM_ROLES
```

## Example Plans

```text
Starter
Professional
Business
Enterprise
Distributor
```

Plans should grant entitlements.

## Distributor Licensing

Example:

```text
Rufsun
Tenant allocation: 1,000 seats

Distributor ABC
Allocated: 1,000

Company 1 → 50
Company 2 → 100
Company 3 → 25

Available → 825
```

## Support

- Pooled licenses
- Per-company allocations
- Seat limits
- Designer seat limits
- Sales seat limits
- Viewer limits
- Project limits
- API quotas
- Google Solar API usage quotas
- Storage quotas
- Report generation quotas
- Monthly usage
- Trial plans
- Credits
- Grace periods
- Suspension
- Renewals
- Upgrades
- Downgrades
- Manual overrides
- Enterprise custom plans

## Billing Architecture

Billing providers should sit behind an abstraction layer.

Possible providers may include:

- Cashfree
- Razorpay
- Stripe
- Other future gateways

The business domain must not depend directly on one gateway.

---

# 7. Phase 5 — Super Admin, Distributor & Company Control Centers

## Goal

Create three distinct administrative experiences.

---

## Rufsun Super Admin

Super Admin should be able to manage:

```text
Tenants
Companies
Users
Subscriptions
Licenses
Revenue
Usage
Projects
Solar API Consumption
Storage
Feature Flags
Errors
Audit Events
```

### Actions

- Create tenant
- Suspend tenant
- Activate tenant
- Assign plan
- Allocate licenses
- Add credits
- Override entitlements
- View tenant companies
- Disable users
- Reset sessions
- Inspect usage
- Inspect billing
- Enter support mode
- Safely impersonate users
- Inspect system health

All support and impersonation actions must be audited.

---

## Distributor / Tenant Portal

Tenant administrators should be able to manage:

- Companies
- Company creation
- Company suspension
- Company admins
- License allocation
- License availability
- Usage
- Subscription
- Billing
- Branding
- Allowed features
- Component catalog
- Proposal defaults
- Company onboarding
- Company limits

---

## Company Admin Portal

Company administrators should control:

- Users
- Teams
- Customers
- Projects
- Designs
- Settings
- Branding
- Tariffs
- Pricing
- Components
- Templates
- Proposal defaults
- Company-specific rules

---

# 8. Phase 6 — Production SaaS Infrastructure

## Goal

Move the current prototype infrastructure toward production readiness.

## Build

- Production email service
- Object storage
- S3-compatible file storage
- Redis
- Job queues
- Report-generation queues
- GeoTIFF processing queues
- Thumbnail generation
- Retry handling
- Rate limiting
- Structured logs
- Audit logging
- API request IDs
- Error monitoring
- Security headers
- CORS policy
- CSRF policy where applicable
- Server-side CAD validation
- Database backups
- Asset retention
- Database indexes
- Soft deletion
- Data restore strategy
- Background task monitoring
- Expiring asset URLs
- Signed downloads
- Secure storage access

Move generated files such as:

```text
PDFs
PNGs
Maps
Solar Assets
Customer Uploads
Company Logos
Proposal Assets
```

into managed cloud storage.

---

# 9. Phase 7 — Engineering-Grade 2D Geometry Engine

## Goal

Replace approximate geometry logic with engineering-grade polygon processing.

## Required Capabilities

- Concave roofs
- Complex polygons
- Polygon holes
- Polygon unions
- Polygon differences
- Robust polygon offsets
- Per-edge setbacks
- Roof clipping
- Obstruction clipping
- Intersection detection
- Invalid polygon detection
- Self-intersection prevention
- Minimum distance checks
- Fire pathways
- Walkway zones
- Usable-area calculations
- Edge classifications
- Associative dimensions

This phase becomes the geometry foundation for later AutoDesigner, electrical, compliance, and permit workflows.

---

# 10. Phase 8 — Advanced 2D Site & Roof Modeling

## Goal

Create a high-information site model while keeping the application visually 2D.

Suggested object hierarchy:

```text
Site
 ├── Structure
 │    ├── Roof Face
 │    ├── Roof Face
 │    └── Roof Face
 │
 ├── Obstruction
 ├── Tree
 ├── Equipment
 ├── Pathway
 └── Restricted Area
```

## Roof Face Data

Each roof face may contain:

- Azimuth
- Pitch
- Elevation metadata
- Roof type
- Roof material
- Usable area
- Ridge
- Hip
- Valley
- Eave
- Rake
- Setback rules

## Build

- Multi-building projects
- North orientation
- Scale calibration
- Imagery switching
- Imagery opacity
- Better image registration
- Better georeferencing
- Imagery-provider abstraction
- Roof edge classification
- Roof-face grouping
- Obstructions
- Restricted zones
- Trees
- Equipment zones

## Analysis Data

The application may consume:

```text
DSM
LiDAR
Elevation
Terrain
Surface Height
Shading Rasters
```

without rendering the property as a 3D model.

---

# 11. Phase 9 — Professional PV Layout Engine

## Goal

Turn current panel placement and Auto Fill into a serious photovoltaic layout engine.

## Component Catalog

```text
Modules
Inverters
Microinverters
Optimizers
Racking
Batteries
Electrical Components
```

Catalog hierarchy:

```text
Rufsun Global Catalog
   ↓
Tenant Allowed Components
   ↓
Company Allowed Components
```

## Module Placement

Support:

- Portrait orientation
- Landscape orientation
- Mixed orientations
- Row spacing
- Column spacing
- Table spacing
- Roof-specific orientation
- Module rotation
- Restricted regions
- Automatic setbacks
- Obstructions
- Walkways
- Panel grouping
- Subarrays
- Locking arrays
- Moving arrays
- Duplicating arrays
- Layout validation

## AutoDesigner Goals

User may choose:

```text
Max Panels
Max Capacity
Target kW
Target Energy
Target Consumption Offset
Best Irradiance
Lowest Cost
```

RufsunCAD should calculate an optimized layout.

---

# 12. Phase 10 — Electrical Design & BOM

## Goal

Add professional electrical system design.

Conceptual flow:

```text
PV Modules
 ↓
Strings
 ↓
MPPT
 ↓
Inverter
 ↓
AC System
```

## Support

- String inverters
- Microinverters
- Optimizers
- MPPT assignment
- Automatic stringing
- Manual stringing
- String voltage validation
- Current validation
- Temperature correction
- DC/AC ratio
- Inverter clipping
- Component compatibility
- Electrical warnings
- Design validation

## Generate

- Bill of Materials
- Equipment schedule
- String schedule
- Electrical summary
- Inverter summary
- Module summary

## Future Output

Automatic 2D single-line diagram.

---

# 13. Phase 11 — Advanced Irradiance, Shading & Production

## Goal

Transform the existing Solar API integration into a serious solar analysis engine.

## Build

- Automatic raster registration
- Alignment confidence checks
- Improved coordinate transforms
- Roof-level irradiance
- Panel-level irradiance
- Shade percentage
- Solar access
- Annual production
- Monthly production
- Daily production
- System losses
- Inverter efficiency
- Clipping losses
- Temperature losses
- Wiring losses
- Mismatch losses
- Soiling
- Availability
- Degradation

Example panel analysis:

```text
Panel #184

Annual irradiation: 1,742 kWh/m²
Solar access: 94%
Estimated output: 508 kWh/year
```

Designers should be able to automatically remove or flag low-performing modules.

---

# 14. Phase 12 — Tariffs, Consumption, Storage & Financial Modeling

## Goal

Move from simple production calculations into customer-level financial analysis.

## Consumption Profiles

```text
Monthly Bills
Monthly kWh
Interval Data
CSV Imports
Estimated Profiles
```

## Tariffs

Support:

- Import rates
- Export rates
- Net metering
- Time-of-use
- Fixed charges
- Escalation

## Financial Scenarios

- Cash
- Loan
- Lease / PPA later
- Incentives
- Subsidies
- Taxes
- Discounts
- Adders
- Margins

## Metrics

```text
System Cost
Energy Savings
Payback
ROI
IRR
NPV
Lifetime Savings
Cost per Watt
LCOE
```

## Battery / Storage

Support:

- Battery catalog
- Battery capacity
- Usable capacity
- Efficiency
- Backup reserve
- Self-consumption
- Peak shaving
- Dispatch simulation

---

# 15. Phase 13 — CRM, Sales & Proposal Platform

## Goal

Turn the existing CRM-lite layer into an end-to-end solar sales platform.

Suggested workflow:

```text
Lead
↓
Qualified
↓
Site Survey
↓
Design
↓
Proposal
↓
Negotiation
↓
Won
↓
Engineering
↓
Installation
↓
Commissioned
```

## CRM Features

- Lead owner
- Opportunity value
- Tasks
- Notes
- Activities
- Follow-up dates
- Project stages
- Design revisions
- Quote revisions
- Proposal revisions
- Lost reasons
- Sales pipeline
- Sales reporting

## Proposal Builder

Build configurable proposal templates.

Possible sections:

```text
Cover
Customer Information
System Design
Irradiance
Production
Savings
Financing
Environmental Impact
Custom Content
Terms
```

## Support

- Drag-and-drop sections
- Company templates
- Tenant templates
- Distributor templates
- Custom logo
- Brand colors
- Custom pricing
- Custom disclaimers
- PDF proposals
- Public web proposals
- Proposal expiry
- Acceptance tracking
- Proposal views
- Eventually e-signature

---

# 16. Phase 14 — Revisions, Collaboration & Approval Workflows

## Goal

Make RufsunCAD suitable for professional teams.

The data model should evolve from one project document toward:

```text
Project
   ├── Design v1
   ├── Design v2
   └── Design v3
```

## Build

- Design revision history
- Duplicate design
- Compare revisions
- Restore revisions
- Comments
- Mentions
- Assignments
- Design locking
- Approval status
- Reviewer workflow
- Notifications
- Activity feed
- Audit trail

## Real-Time Collaboration

Later add:

- Presence indicators
- Who is editing
- WebSocket synchronization
- Optimistic updates
- Conflict management
- Collaborative comments

---

# 17. Phase 15 — Public API, Webhooks & Integrations

## Goal

Allow enterprise customers and distributors to integrate RufsunCAD with external software.

Suggested API:

```text
/api/v1/
```

## API Resources

- Companies
- Users
- Customers
- Projects
- Designs
- Simulations
- Proposals
- Reports
- Components

API credentials must be tenant/company scoped.

## Webhooks

Example events:

```text
project.created
project.updated
design.completed
proposal.created
proposal.viewed
proposal.accepted
customer.updated
report.generated
```

## Build

- API keys
- Tenant-scoped credentials
- Company-scoped credentials
- OAuth applications later
- Webhook signing
- Retry queues
- Rate limits
- API logs
- Sandbox environment
- Developer documentation

## Integrations

Potential integration categories:

- CRM
- ERP
- Financing
- Lead platforms
- Installers
- Monitoring systems
- Sales platforms
- Customer portals

---

# 18. Phase 16 — Engineering & Permit Outputs

## Goal

Move RufsunCAD from a design/proposal tool toward a solar engineering platform.

## Generate

- Site plan
- Roof plan
- Array layout
- Module dimensions
- Setbacks
- Pathways
- Roof dimensions
- Attachment plan later
- BOM
- Equipment schedule
- String schedule
- Single-line diagram
- Technical notes
- Labels
- Calculation sheets

## Export

```text
PDF
PNG
SVG
DXF
CSV
JSON
.rufcad
```

## Jurisdiction / Code Templates

Potential future support:

```text
India
USA
Australia
Other Regions
```

RufsunCAD outputs should be described as design and engineering assistance unless reviewed or stamped by qualified professionals where required.

---

# 19. Phase 17 — Rufsun Intelligence / AI Automation

## Goal

Introduce AI only after geometry, tenancy, validation, and analysis are trustworthy.

## Roof Intelligence

From imagery:

```text
Detect Building
Detect Roof Boundary
Suggest Roof Faces
Detect Obstructions
Detect Vegetation
```

All AI-generated geometry should require user review before becoming authoritative.

## AutoDesign

Example input:

```text
10 kW
Module XYZ
Maximize Production
```

Possible output:

- Roof eligibility
- Panel placement
- Setbacks
- Layout
- Inverter choice
- Stringing
- Production
- BOM

## Design QA

AI and rule engines should identify:

```text
Panel outside roof
Setback violation
Low irradiance panel
Bad string voltage
Oversized inverter
Missing roof pitch
Suspicious map registration
Invalid geometry
Incomplete electrical data
```

---

# 20. Phase 18 — Enterprise & Commercial Launch Hardening

## Goal

Prepare RufsunCAD for larger enterprise customers and scaled commercial deployment.

## Build

- SAML / SSO
- Enterprise identity integration
- SCIM later
- Configurable data retention
- Account export
- Account deletion
- Security reports
- Audit reports
- Backup verification
- Disaster recovery
- Observability
- Uptime monitoring
- Queue monitoring
- Database monitoring
- Load testing
- CDN
- Caching
- Frontend code splitting
- Feature flags
- Staged rollouts
- Sandbox tenants
- Demo mode
- Onboarding flows
- Product tours
- Documentation
- Support tooling
- Usage analytics

At this phase RufsunCAD should behave as a production-grade SaaS platform rather than simply a web application with authentication.

---

# 21. Long-Term Product Data Architecture

The mature hierarchy should resemble:

```text
PLATFORM
│
├── Tenant
│   │
│   ├── Subscription
│   ├── Entitlements
│   ├── License Pool
│   ├── Branding
│   ├── Catalog
│   │
│   └── Companies
│       │
│       ├── Users
│       ├── Teams
│       ├── Roles
│       ├── Customers
│       │   │
│       │   └── Sites
│       │       │
│       │       └── Projects
│       │           │
│       │           ├── Design v1
│       │           ├── Design v2
│       │           ├── Design v3
│       │           │
│       │           ├── Simulations
│       │           ├── Quotes
│       │           ├── Proposals
│       │           ├── Reports
│       │           └── Assets
│       │
│       └── Settings
│
└── Audit / Billing / Usage / Platform Services
```

---

# 22. Important Future Data Model Change

The current architecture should eventually evolve away from:

```text
Project
 ↓
Single CAD Document
```

toward:

```text
Customer
   ↓
Site
   ↓
Project
   ↓
Design
   ↓
Design Revision
```

A real-world solar project may contain multiple alternatives:

```text
12 kW Proposal
10 kW Proposal
8 kW Budget Option
10 kW + Battery Option
Final Engineering Design
```

All of these may belong to the same customer, property, and project.

This change should be designed carefully rather than introduced as a destructive migration.

---

# 23. Codex Development Rules

Every future Codex phase prompt should follow these rules.

## Codex Must

1. Inspect the existing implementation before changing architecture.
2. Preserve the existing React / NestJS / PostgreSQL / Konva / Zustand stack.
3. Preserve working functionality unless a replacement is explicitly required.
4. Use safe Prisma migrations.
5. Never reset production-style data just to make a migration easier.
6. Preserve older `.rufcad` documents through schema migration/versioning.
7. Implement frontend, backend, and database changes together where required.
8. Enforce authorization server-side.
9. Never rely only on hidden UI controls for security.
10. Add unit tests.
11. Add integration tests.
12. Add tenant isolation tests.
13. Add company isolation tests.
14. Keep API contracts typed.
15. Preserve backwards compatibility where practical.
16. Avoid building future phases prematurely.
17. Stop at the defined phase boundary.
18. Update project documentation after completing a phase.
19. Run all existing checks.
20. Report migrations, files changed, tests added, and known follow-up items.

## Required Validation Commands

At minimum, Codex should run the project's existing equivalent of:

```bash
npm run test
npm run build
npm run server:test
npm run server:build
```

Additional lint, typecheck, migration, or E2E commands should be run when available.

---

# 24. Recommended Development Order

The recommended sequence is:

```text
Phase 1   Existing Prototype ✅

Phase 2   Multi-Level SaaS Architecture
Phase 3   Identity, Roles, Permissions & Licensing
Phase 4   Plans, Billing, Entitlements & Distributor Licensing
Phase 5   Super Admin / Tenant / Company Control Centers
Phase 6   Production SaaS Infrastructure

Phase 7   Engineering-Grade Geometry
Phase 8   Advanced Site & Roof Modeling
Phase 9   Professional PV Layout Engine
Phase 10  Electrical Design & BOM
Phase 11  Irradiance, Shading & Production
Phase 12  Tariffs, Consumption, Storage & Finance

Phase 13  CRM, Sales & Proposal Platform
Phase 14  Revisions, Collaboration & Approvals
Phase 15  Public API, Webhooks & Integrations
Phase 16  Engineering & Permit Outputs
Phase 17  Rufsun Intelligence / AI Automation
Phase 18  Enterprise & Commercial Launch Hardening
```

---

# 25. Immediate Next Step

The next implementation phase should be:

# Phase 2 — Multi-Level SaaS Architecture

Priority:

```text
Super Admin
    ↓
Tenant / Distributor
    ↓
Company
    ↓
Users / Teams / Customers / Projects
```

This architecture should be completed before another major CAD feature is introduced.

The commercial tenancy model will affect:

- Authentication
- Authorization
- Billing
- Licensing
- Feature availability
- Customers
- Projects
- CAD documents
- Reports
- Storage
- API access
- Distributor sales
- Enterprise support

Therefore, it should become the foundation for all future RufsunCAD development.

---

# 26. Product Principle

RufsunCAD should not simply become:

> "A drawing application with SaaS accounts."

The intended end state is:

> **A multi-tenant solar design, engineering, analysis, proposal, sales, and automation platform where Rufsun controls the platform, distributors manage companies and license pools, and companies operate independent solar design businesses inside isolated environments.**

That principle should guide all future architectural decisions.
