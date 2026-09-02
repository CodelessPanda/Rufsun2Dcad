# RufsunCAD Phase 4 - Commercial Foundation

Updated: 2026-09-02

## Architecture Added

Phase 4 adds the minimum sellable SaaS commercial foundation on top of Phase 3 identity and authorization.

Commercial model:

```text
Plan
  -> Entitlements
  -> Subscription
  -> Tenant Seat Capacity
  -> Company Seat Allocation
  -> User Seat
  -> Permission + Capability
```

Added database-driven plans:

- Starter
- Professional
- Business
- Enterprise
- Distributor
- Internal

Added entitlements:

- `cad.access`
- `cad.edit`
- `solar.irradiance`
- `layout.auto_fill`
- `reports.basic`
- `reports.advanced`
- `companies.max`
- `projects.max`
- `solar.requests.month`
- `seat.designer`
- `seat.sales`
- `seat.viewer`

Subscriptions support manual billing mode, trial/active/grace/suspended/canceled/expired statuses, start/end/trial/grace dates, and notes.

Rufsun Direct protection:

- Normal commercial tenants use tenant-level subscriptions.
- Direct companies can receive company-scoped subscriptions.
- This prevents one shared Rufsun Direct tenant subscription from unintentionally unlocking every unrelated direct company.

Seat model:

- Tenant capacity limits total company allocations.
- Company allocation limits assigned active user seats.
- Viewer can be unlimited without fake large numbers.
- `no_seat` exists for users who should keep identity/membership without consuming product access.

Usage/quota:

- Successful new Solar API data-layer requests are tracked monthly.
- Cached Solar API data does not increment usage.
- Over-quota requests are blocked before an external Google Solar API call.

## Backend Enforcement

Added `CommercialService` and `CommercialController`.

Commercial checks now apply to:

- CAD document open: requires `cad.access`.
- CAD document save: requires `cad.edit` plus Phase 3 Designer capability.
- Project creation: respects `projects.max`.
- Solar irradiance loading: requires `solar.irradiance`, Phase 3 Solar capability, and monthly quota.
- Company member seat assignment: cannot exceed company allocation.
- Tenant company allocation: cannot exceed tenant capacity.

Phase 3 permission checks remain in place. Phase 4 extends them rather than replacing them.

## UI Changed

Super Admin:

- Platform page now acts as a commercial control center.
- Shows tenant plan, subscription status, companies, seat capacity, allocations, and project/member counts.
- Super Admin can assign/change plan, change subscription status, set tenant seat capacity, and create companies.

Tenant:

- Tenant page now includes License Management.
- Shows plan/status, tenant capacity cards, and company allocation table.
- Tenant admins can edit company allocations within tenant capacity.

Company:

- Team page now shows Company Licensing.
- Displays allocated, assigned, and available Designer/Sales/Viewer seats.
- Member seat changes are still performed from the member list and enforced by the backend.

Designer:

- Solar loading shows a clean entitlement error if the company lacks Solar Irradiance.
- Advanced PDF report export is gated by `reports.advanced`.
- Auto Fill is gated by `layout.auto_fill`.

## Migrations

Created migration:

- `20260902020000_phase4_commercial_foundation`

Added:

- `plans`
- `plan_entitlements`
- `subscriptions`
- `tenant_seat_capacities`
- `company_seat_allocations`
- `usage_meters`

Also added:

- `SeatType.no_seat`
- `PlanCode`
- `SubscriptionStatus`
- `BillingMode`
- `SubscriptionScope`

The database was migrated in place. No reset was used.

## Tests

Required Phase 4 backend tests are covered in `server/test/api.test.ts`:

- Tenant allocation limit
- Company seat assignment limit
- Solar entitlement gate
- Solar monthly quota
- Tenant commercial isolation
- Company member/seat isolation
- Existing entitled CAD document open/save regression

Backend test result:

```text
24 tests passed
```

## Validation

Validation completed:

```bash
npm run test
npm run build
npm run server:test
npm run server:build
npm --prefix server run prisma:generate
npm run server:migrate
npm run server:seed
```

Note: frontend build still reports the existing large chunk warning. The build succeeds.

## Remaining Work For Later Phases

Left for Phase 5 and beyond:

- advanced Super Admin control centers
- distributor/company operational dashboards
- billing provider integration
- checkout
- invoices
- payment webhooks
- usage billing
- trial automation
- renewal automation
- public pricing pages
- advanced audit logging
- notification workflows
- production email provider integration
- production-grade entitlement caching
