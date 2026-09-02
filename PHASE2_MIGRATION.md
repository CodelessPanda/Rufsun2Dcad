# RufsunCAD Phase 2 Migration Notes

Updated: 2026-09-02

## Architecture

Phase 2 changes the commercial hierarchy from the original workspace-only model into:

```text
Rufsun Platform
  -> Tenant
    -> Company
      -> Customers
      -> Projects
      -> Project Documents
```

Users remain global identities. A user can have a platform role, tenant memberships, and company memberships.

## Old Model

```text
User
  -> WorkspaceMembership
  -> Workspace
    -> Customer
    -> Project
    -> ProjectDocument
```

The original `Workspace` represented the solar organization using the CAD system.

## New Model

```text
User
  -> TenantMembership
  -> CompanyMembership

Tenant
  -> Company

Company
  -> Customer
  -> Project
  -> ProjectDocument
```

`Tenant` is the commercial customer, distributor, reseller, enterprise account, or the reserved direct Rufsun account.

`Company` is the actual solar organization operating RufsunCAD. The prior Workspace concept now maps to Company.

## Compatibility Decision

The migration uses a compatibility mapping instead of physically renaming every existing table immediately.

Prisma model names moved toward the Phase 2 domain:

- `Company`
- `CompanyMembership`
- `Tenant`
- `TenantMembership`

The existing database tables remain intact:

- `Company` maps to the existing `workspaces` table.
- `CompanyMembership` maps to the existing `workspace_members` table.
- Existing `workspace_id` columns remain physically named `workspace_id`, but are exposed through Prisma as `companyId`.

This preserves existing data, foreign keys, project documents, and local/cloud behavior while allowing new APIs and UI to use Company terminology.

## Rufsun Direct

The migration and seed create an idempotent default tenant:

```text
Name: Rufsun Direct
Slug: rufsun-direct
Type: direct
Status: active
```

Existing workspaces are assigned to this tenant. Self-service direct company creation still uses the existing `/api/workspaces` compatibility endpoint, but it creates a Company under Rufsun Direct and ensures the creator has both tenant and company ownership.

## Platform Super Admin

Platform-level authorization is stored on `User.platformRole`.

Current values:

- `user`
- `super_admin`

The seed creates a development super admin:

```text
Email: admin@rufsun.local
Password: Admin12345
```

Super admins can list, create, inspect, and update tenants without fake tenant memberships. Platform admins can also inspect companies through admin/company paths without ordinary company membership.

## Database Changes

New enums:

- `PlatformRole`
- `TenantType`
- `TenantStatus`

Updated enum:

- `WorkspaceStatus` now includes `suspended`, because the existing physical workspace table is the Company table during compatibility.

New table:

- `tenants`
- `tenant_memberships`

Modified existing tables:

- `users.platform_role`
- `workspaces.tenant_id`
- `workspaces.archived_at`

Mapped Prisma models:

- `Company @@map("workspaces")`
- `CompanyMembership @@map("workspace_members")`
- `Customer.companyId @map("workspace_id")`
- `Project.companyId @map("workspace_id")`
- `ProjectDocument.companyId @map("workspace_id")`

Important constraints and indexes:

- `tenants.slug` unique
- `workspaces` unique on `tenant_id, slug`
- `tenant_memberships` unique on `tenant_id, user_id`
- `workspace_members` unique on `workspace_id, user_id`
- indexes on tenant, company, customer, project, and document ownership columns

Migration file:

```text
server/prisma/migrations/20260902000000_phase2_tenant_company/migration.sql
```

## Migration Behavior

The migration:

1. Creates platform, tenant type, and tenant status enums.
2. Adds the `suspended` company status value.
3. Adds `platform_role` to users.
4. Creates the `tenants` table.
5. Creates or updates the reserved Rufsun Direct tenant.
6. Adds `tenant_id` to existing workspaces.
7. Backfills every existing workspace to Rufsun Direct.
8. Makes `workspaces.tenant_id` required.
9. Adds workspace/company archive timestamp support.
10. Replaces global workspace slug uniqueness with per-tenant company slug uniqueness.
11. Creates tenant memberships.
12. Backfills tenant memberships from workspace creators and active workspace members.
13. Preserves existing customers, projects, and project documents without rewriting CAD JSON.

No `prisma migrate reset` is required or used.

## Backend Changes

Added a central access layer:

```text
server/src/common/access-control.service.ts
```

It resolves:

- platform admin access
- tenant membership
- tenant admin access
- company membership
- company admin access
- company-to-tenant ownership
- customer ownership
- project ownership

New API areas:

- `GET /api/tenants`
- `GET /api/tenants/:tenantId/companies`
- `POST /api/tenants/:tenantId/companies`
- `GET /api/admin/tenants`
- `POST /api/admin/tenants`
- `GET /api/admin/tenants/:tenantId`
- `PATCH /api/admin/tenants/:tenantId`
- `GET /api/companies/:companyId`
- `PATCH /api/companies/:companyId`

Company-scoped resources now support explicit company routes:

- `/api/companies/:companyId/customers`
- `/api/companies/:companyId/projects`
- `/api/companies/:companyId/projects/:projectId/document`
- `/api/companies/:companyId/projects/:projectId/solar/...`

Legacy workspace routes remain as compatibility adapters where useful.

## Frontend Changes

The app now tracks:

- authenticated user
- available tenants
- active tenant
- available companies
- active company

Session restore validates the last tenant/company against the backend response. Invalid stale local storage selections are cleared or replaced with the first accessible context.

Navigation now has three scopes:

- Platform admin for super admins
- Tenant companies for tenant owners/admins
- Company dashboard/customers/projects/team/settings for normal company work

The existing designer and CAD document format stay outside the SaaS ownership model. Ownership remains in PostgreSQL relations, not inside `.rufcad` geometry JSON.

## Security Rules

Normal company operations require:

```text
authenticated user
  -> active CompanyMembership
  -> active Company
  -> active Tenant
  -> requested resource belongs to that Company
```

Customer, project, document, and Solar API routes are scoped server-side by `companyId`.

The server rejects projects created in one company with a customer from another company.

Suspended companies and suspended tenants block normal operational access. Platform super admins retain platform visibility.

## IndexedDB Compatibility

Existing local CAD cache behavior is preserved. Project IDs are UUIDs and remain globally unique, so existing project cache keys are not rewritten during this phase.

No CAD document JSON migration is required for Phase 2.

## Validation Run

Validated commands:

```bash
npm run test
npm run build
npm run server:test
npm run server:build
npm --prefix server run prisma:generate
npm run server:migrate
npm run server:seed
```

There are no dedicated `lint` or `typecheck` scripts in the current `package.json` files. TypeScript validation is covered by `npm run build` and `npm run server:build`.

Local migration note: the first migration attempt failed because no PostgreSQL service was listening on `localhost:5432`. Starting the project database with `npm run db:up` fixed that, and the Phase 2 migration applied successfully.

## Tests

Backend Phase 2 tests cover:

- authentication restore and login behavior
- company customer/project/document/Solar API isolation
- customer/project cross-company rejection
- platform super admin tenant management
- platform super admin company inspection
- tenant admin company creation inside own tenant only
- company switching without scoped data leaks
- suspended tenant enforcement
- suspended company enforcement

Frontend/domain tests still cover:

- CAD geometry
- solar geotransform math
- solar statistics
- energy calculations

## Intentionally Deferred

Phase 2 does not implement:

- billing
- subscriptions
- payments
- plan entitlements
- license allocation
- full custom RBAC
- invitations
- teams
- audit log UI
- white-labeling
- public API
- webhooks
- real-time collaboration

Those belong in Phase 3 and later product phases.
