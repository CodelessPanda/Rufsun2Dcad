# RufsunCAD Phase 3 - Identity, Roles, Permissions, And Licensing Foundation

Updated: 2026-09-02

## 1. Phase 2 Architecture Detected

Phase 2 established the SaaS hierarchy:

```text
Rufsun Platform
  -> Tenant / Distributor
  -> Company
  -> Users, Customers, Projects, CAD Documents
```

The existing physical `workspaces` table remains the Company table through Prisma mapping. The existing `workspace_members` table remains the CompanyMembership table. This preserves compatibility with older workspace data while allowing the app to use Company terminology.

Detected implementation:

- `User` is global identity and owns auth/session records.
- `Tenant` stores distributor/direct/enterprise organizations.
- `TenantMembership` connects a User to a Tenant.
- `Company` is mapped to `workspaces`.
- `CompanyMembership` is mapped to `workspace_members`.
- Customers, projects, and project documents are scoped by `companyId`, physically stored as `workspace_id`.
- JWT payload remains minimal and does not carry tenant/company roles or permissions.
- Refresh sessions already existed and were extended instead of replaced.

## 2. Database Changes

Changed enums:

- `UserStatus`: added `suspended`.
- `PlatformRole`: added `support_admin`.
- `WorkspaceMemberRole`: added `company_owner`, `company_admin`, `design_manager`, `sales_manager`, `sales_rep`, `project_viewer`.
- `WorkspaceMemberStatus`: added `suspended`, `removed`.

New enums:

- `TenantRole`: `owner`, `admin`, `billing`, `support`, `member`.
- `SeatType`: `designer`, `sales`, `viewer`.
- `InvitationScope`: `tenant`, `company`.

Changed models:

- `User`: verification/reset/invitation relations.
- `TenantMembership`: typed tenant role, status, invited-by, joined-at.
- `CompanyMembership`: seat type.
- `RefreshSession`: last-used time, user agent, IP address.

New models:

- `Invitation`
- `EmailVerificationToken`
- `PasswordResetToken`

New migrations:

- `20260902010000_phase3_identity_roles_licensing`
- `20260902011000_phase3_role_backfill`
- `20260902012000_phase3_schema_alignment`

Indexes and constraints:

- Unique invitation, verification, and reset token hashes.
- Invitation indexes by email, tenant, company, and expiry.
- Membership uniqueness remains `tenantId + userId` and `companyId + userId`.
- Invitation tenant/company/accepted-user relations use `ON DELETE SET NULL`; inviter remains required.

## 3. Identity

Registration now normalizes email with trim/lowercase, creates a global User, supports direct signup, and can accept an invitation token during signup. In local development/test, email verification is easier because accounts are marked verified and the verification URL can be returned; production still has hashed verification token architecture.

Password reset uses secure random raw tokens, stores only token hashes, expires tokens, marks them used after reset, and revokes refresh sessions after a successful reset. Reset request responses do not reveal whether the email exists.

Password change requires the current password, validates the new password through the existing DTO pipeline, updates the bcryptjs hash, and revokes refresh sessions.

Refresh sessions can be listed and revoked. Session metadata now includes last-used time, user agent, and IP address. IP is stored as metadata only, not treated as identity.

Suspended or disabled users are blocked by authentication and permission services.

## 4. Roles

Platform roles:

| Role | Intent |
| --- | --- |
| `user` | Normal RufsunCAD user |
| `support_admin` | Future limited support role |
| `super_admin` | Full platform administrator |

Tenant roles:

| Role | Intent |
| --- | --- |
| `owner` | Highest tenant authority |
| `admin` | Tenant administration without full billing ownership |
| `billing` | Future billing visibility/management foundation |
| `support` | Tenant support/member inspection foundation |
| `member` | Basic tenant association |

Company roles:

| Role | Intent |
| --- | --- |
| `company_owner` | Full company ownership and role control |
| `company_admin` | Broad operational admin, excluding owner-only role management/delete |
| `design_manager` | Project/design/solar/report management |
| `designer` | CAD design, solar analysis, report/export work |
| `sales_manager` | Customer and sales-facing project work |
| `sales_rep` | Limited customer/project workflow |
| `project_viewer` | Read-only project/design access |

Legacy roles `owner`, `admin`, `sales`, and `viewer` are still present for compatibility and are mapped conservatively.

## 5. Permissions

Backend permissions are centralized in `server/src/common/permissions.ts`. Controllers and services now ask for permission keys rather than comparing role names directly.

Implemented permission families:

- Platform: `platform.tenants.*`, `platform.companies.view`, `platform.users.*`, `platform.support.access`
- Tenant: `tenant.view`, `tenant.update`, `tenant.members.*`, `tenant.companies.*`, `tenant.billing.*`, `tenant.licenses.*`
- Company: `company.view`, `company.update`, `company.members.*`, `company.roles.*`
- Customer: `customer.view`, `customer.create`, `customer.update`, `customer.archive`, `customer.manage`
- Project: `project.view`, `project.view_all`, `project.create`, `project.update`, `project.archive`, `project.delete`
- Design: `design.view`, `design.create`, `design.edit`, `design.delete`, `design.export`
- Solar: `solar.view`, `solar.load`, `solar.align`
- Report: `report.view`, `report.generate`, `report.export`
- Settings: `company.settings.view`, `company.settings.manage`

`PermissionService` is the backend authority for platform, tenant, and company permission checks.

## 6. Invitations

Company and tenant invitations are supported.

Invitation security:

- raw token is generated with secure randomness
- only `hash(token)` is stored
- token expires
- invitation can be revoked
- invitation is single-use
- email is normalized
- accepting user email must match invited email
- duplicate memberships are prevented with upsert
- tokens are redacted from API responses

Development email handling is abstracted through `EmailService`. Without production email provider configuration, invitation/reset/verification URLs are logged or returned only in development-safe contexts.

## 7. Licensing Foundation

Phase 3 separates role permissions from product capability.

Seat types:

- `designer`
- `sales`
- `viewer`

Capabilities:

- `cad.use`
- `cad.edit`
- `solar.analysis`
- `report.generate`
- `export.design`
- `sales.workflow`
- `project.read`

`LicenseCapabilityService` enforces seat capability separately from role permission. A user can have a role that includes `design.edit`, but still be blocked from CAD mutation if their seat does not include `cad.edit`.

Phase 4 can extend this with plans, subscription entitlements, tenant license pools, seat counts, trials, quotas, and billing without redesigning identity or authorization.

## 8. Backend Authorization

Authorization evaluates:

1. authenticated active user
2. active tenant/company status
3. active membership status
4. role-to-permission mapping
5. company/tenant resource scope
6. seat capability when product features require it

Customer, project, document, and Solar API routes remain company-scoped. Cross-company IDOR attempts are rejected because resource lookup includes company scope and active membership checks.

## 9. Frontend

Added or improved:

- permission-aware navigation
- Team/member management screen
- tenant member management
- invite forms
- pending invitation display and revoke action
- role and seat selectors
- member suspend/reactivate/remove actions
- final-owner protection surfaced through backend errors
- user profile page
- password change UI
- session list and revoke-other-sessions UI
- invite, reset-password, and verify-email routes/screens

The frontend hides unavailable navigation/actions for common cases, but the backend remains authoritative.

## 10. Migration

Legacy company role mapping:

| Old role | New role |
| --- | --- |
| `owner` | `company_owner` |
| `admin` | `company_admin` |
| `designer` | `designer` |
| `sales` | `sales_rep` |
| `viewer` | `project_viewer` |

Default seat backfill:

| Role after mapping | Seat |
| --- | --- |
| `sales_manager`, `sales_rep` | `sales` |
| `project_viewer` | `viewer` |
| all other existing company members | `designer` |

This keeps existing active CAD users operational and does not reset or delete existing data.

## 11. Security

Implemented protections:

- cross-tenant checks through active tenant membership/status
- cross-company checks through company-scoped queries
- IDOR protection for customers, projects, documents, and Solar API
- no plaintext invitation, verification, or reset tokens in storage
- wrong-email invitation acceptance blocked
- duplicate invitation acceptance blocked
- revoked/expired invitation handling
- user suspension blocks auth and access
- tenant/company/member suspension blocks scoped operations
- seat bypass blocked for CAD document save and Solar API data loading
- final company owner and final tenant owner cannot be removed/demoted into an ownerless state

## 12. Tests

Backend tests cover:

- registration/login/auth-me
- company-scoped isolation for customers/projects/documents/solar
- cross-company customer/project rejection
- super admin tenant/company administration
- tenant admin tenant isolation
- company switching isolation
- suspended tenant/company behavior
- role permission plus seat capability enforcement
- invitation wrong-email and duplicate acceptance
- password reset flow and enumeration protection
- final company owner protection
- Solar API metadata and GeoTIFF proxy behavior

Frontend/domain tests cover:

- geometry helpers
- energy calculator
- solar geotransform
- solar statistics

Validation commands run successfully:

```bash
npm run test
npm run build
npm run server:test
npm run server:build
npm --prefix server run prisma:generate
npm run server:migrate
npm run server:seed
```

## 13. Regression Validation

Validated by automated tests/build:

- login
- registration
- protected session restore endpoint
- company switching and isolation
- customers
- projects
- CAD document save access
- Solar API backend access
- energy/solar calculation helpers

Not manually browser-clicked in this pass:

- full CAD drawing interactions
- autosave/IndexedDB in a live browser
- Maps UI
- heatmap alignment UI
- PDF/PNG/.rufcad export UI

Those areas were not structurally rewritten in Phase 3, but they should still be smoke-tested in the browser before a production handoff.

## 14. Phase 4 Boundary

Deliberately not implemented in Phase 3:

- commercial subscription plans
- paid checkout
- payment providers
- invoices
- recurring billing
- distributor license purchasing
- tenant license pools
- company seat allocation pools
- quotas
- trial management
- renewal lifecycle
- usage billing
- payment webhooks

Phase 3 only adds the identity, permission, invitation, and seat/capability foundation that Phase 4 can consume.
