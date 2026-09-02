import type { PlatformRole, SeatType, TenantRole, WorkspaceMemberRole } from "@prisma/client";

export const Permissions = {
  PLATFORM_TENANTS_VIEW: "platform.tenants.view",
  PLATFORM_TENANTS_CREATE: "platform.tenants.create",
  PLATFORM_TENANTS_UPDATE: "platform.tenants.update",
  PLATFORM_TENANTS_SUSPEND: "platform.tenants.suspend",
  PLATFORM_COMPANIES_VIEW: "platform.companies.view",
  PLATFORM_USERS_VIEW: "platform.users.view",
  PLATFORM_USERS_MANAGE: "platform.users.manage",
  PLATFORM_SUPPORT_ACCESS: "platform.support.access",

  TENANT_VIEW: "tenant.view",
  TENANT_UPDATE: "tenant.update",
  TENANT_MEMBERS_VIEW: "tenant.members.view",
  TENANT_MEMBERS_INVITE: "tenant.members.invite",
  TENANT_MEMBERS_UPDATE: "tenant.members.update",
  TENANT_MEMBERS_REMOVE: "tenant.members.remove",
  TENANT_COMPANIES_VIEW: "tenant.companies.view",
  TENANT_COMPANIES_CREATE: "tenant.companies.create",
  TENANT_COMPANIES_UPDATE: "tenant.companies.update",
  TENANT_COMPANIES_SUSPEND: "tenant.companies.suspend",
  TENANT_BILLING_VIEW: "tenant.billing.view",
  TENANT_BILLING_MANAGE: "tenant.billing.manage",
  TENANT_LICENSES_VIEW: "tenant.licenses.view",
  TENANT_LICENSES_MANAGE: "tenant.licenses.manage",

  COMPANY_VIEW: "company.view",
  COMPANY_UPDATE: "company.update",
  COMPANY_MEMBERS_VIEW: "company.members.view",
  COMPANY_MEMBERS_INVITE: "company.members.invite",
  COMPANY_MEMBERS_UPDATE: "company.members.update",
  COMPANY_MEMBERS_REMOVE: "company.members.remove",
  COMPANY_ROLES_VIEW: "company.roles.view",
  COMPANY_ROLES_MANAGE: "company.roles.manage",
  CUSTOMER_VIEW: "customer.view",
  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_UPDATE: "customer.update",
  CUSTOMER_ARCHIVE: "customer.archive",
  CUSTOMER_MANAGE: "customer.manage",
  PROJECT_VIEW: "project.view",
  PROJECT_VIEW_ALL: "project.view_all",
  PROJECT_CREATE: "project.create",
  PROJECT_UPDATE: "project.update",
  PROJECT_ARCHIVE: "project.archive",
  PROJECT_DELETE: "project.delete",
  DESIGN_VIEW: "design.view",
  DESIGN_CREATE: "design.create",
  DESIGN_EDIT: "design.edit",
  DESIGN_DELETE: "design.delete",
  DESIGN_EXPORT: "design.export",
  SOLAR_VIEW: "solar.view",
  SOLAR_LOAD: "solar.load",
  SOLAR_ALIGN: "solar.align",
  REPORT_VIEW: "report.view",
  REPORT_GENERATE: "report.generate",
  REPORT_EXPORT: "report.export",
  COMPANY_SETTINGS_VIEW: "company.settings.view",
  COMPANY_SETTINGS_MANAGE: "company.settings.manage"
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const ProductCapabilities = {
  CAD_USE: "cad.use",
  CAD_EDIT: "cad.edit",
  SOLAR_ANALYSIS: "solar.analysis",
  REPORT_GENERATE: "report.generate",
  EXPORT_DESIGN: "export.design",
  SALES_WORKFLOW: "sales.workflow",
  PROJECT_READ: "project.read"
} as const;

export type ProductCapability = (typeof ProductCapabilities)[keyof typeof ProductCapabilities];

const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, Permission[]> = {
  user: [],
  support_admin: [Permissions.PLATFORM_SUPPORT_ACCESS, Permissions.PLATFORM_TENANTS_VIEW, Permissions.PLATFORM_COMPANIES_VIEW, Permissions.PLATFORM_USERS_VIEW],
  super_admin: Object.values(Permissions)
};

const TENANT_ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  owner: [
    Permissions.TENANT_VIEW,
    Permissions.TENANT_UPDATE,
    Permissions.TENANT_MEMBERS_VIEW,
    Permissions.TENANT_MEMBERS_INVITE,
    Permissions.TENANT_MEMBERS_UPDATE,
    Permissions.TENANT_MEMBERS_REMOVE,
    Permissions.TENANT_COMPANIES_VIEW,
    Permissions.TENANT_COMPANIES_CREATE,
    Permissions.TENANT_COMPANIES_UPDATE,
    Permissions.TENANT_COMPANIES_SUSPEND,
    Permissions.TENANT_BILLING_VIEW,
    Permissions.TENANT_BILLING_MANAGE,
    Permissions.TENANT_LICENSES_VIEW,
    Permissions.TENANT_LICENSES_MANAGE
  ],
  admin: [
    Permissions.TENANT_VIEW,
    Permissions.TENANT_MEMBERS_VIEW,
    Permissions.TENANT_MEMBERS_INVITE,
    Permissions.TENANT_MEMBERS_UPDATE,
    Permissions.TENANT_COMPANIES_VIEW,
    Permissions.TENANT_COMPANIES_CREATE,
    Permissions.TENANT_COMPANIES_UPDATE,
    Permissions.TENANT_LICENSES_VIEW
  ],
  billing: [Permissions.TENANT_VIEW, Permissions.TENANT_BILLING_VIEW, Permissions.TENANT_LICENSES_VIEW],
  support: [Permissions.TENANT_VIEW, Permissions.TENANT_MEMBERS_VIEW, Permissions.TENANT_COMPANIES_VIEW],
  member: [Permissions.TENANT_VIEW, Permissions.TENANT_COMPANIES_VIEW]
};

const COMPANY_ALL_PERMISSIONS = Object.values(Permissions).filter((permission) => !permission.startsWith("platform.") && !permission.startsWith("tenant.")) as Permission[];

const COMPANY_ROLE_PERMISSIONS: Record<WorkspaceMemberRole, Permission[]> = {
  company_owner: COMPANY_ALL_PERMISSIONS,
  company_admin: COMPANY_ALL_PERMISSIONS.filter((permission) => permission !== Permissions.PROJECT_DELETE && permission !== Permissions.COMPANY_ROLES_MANAGE),
  design_manager: [
    Permissions.COMPANY_VIEW,
    Permissions.CUSTOMER_VIEW,
    Permissions.CUSTOMER_CREATE,
    Permissions.CUSTOMER_UPDATE,
    Permissions.PROJECT_VIEW,
    Permissions.PROJECT_VIEW_ALL,
    Permissions.PROJECT_CREATE,
    Permissions.PROJECT_UPDATE,
    Permissions.PROJECT_ARCHIVE,
    Permissions.DESIGN_VIEW,
    Permissions.DESIGN_CREATE,
    Permissions.DESIGN_EDIT,
    Permissions.DESIGN_EXPORT,
    Permissions.SOLAR_VIEW,
    Permissions.SOLAR_LOAD,
    Permissions.SOLAR_ALIGN,
    Permissions.REPORT_VIEW,
    Permissions.REPORT_GENERATE,
    Permissions.REPORT_EXPORT
  ],
  designer: [
    Permissions.COMPANY_VIEW,
    Permissions.CUSTOMER_VIEW,
    Permissions.PROJECT_VIEW,
    Permissions.PROJECT_CREATE,
    Permissions.PROJECT_UPDATE,
    Permissions.DESIGN_VIEW,
    Permissions.DESIGN_CREATE,
    Permissions.DESIGN_EDIT,
    Permissions.DESIGN_EXPORT,
    Permissions.SOLAR_VIEW,
    Permissions.SOLAR_LOAD,
    Permissions.SOLAR_ALIGN,
    Permissions.REPORT_VIEW,
    Permissions.REPORT_GENERATE,
    Permissions.REPORT_EXPORT
  ],
  sales_manager: [
    Permissions.COMPANY_VIEW,
    Permissions.CUSTOMER_VIEW,
    Permissions.CUSTOMER_CREATE,
    Permissions.CUSTOMER_UPDATE,
    Permissions.CUSTOMER_ARCHIVE,
    Permissions.PROJECT_VIEW,
    Permissions.PROJECT_VIEW_ALL,
    Permissions.PROJECT_CREATE,
    Permissions.PROJECT_UPDATE,
    Permissions.REPORT_VIEW
  ],
  sales_rep: [Permissions.COMPANY_VIEW, Permissions.CUSTOMER_VIEW, Permissions.CUSTOMER_CREATE, Permissions.CUSTOMER_UPDATE, Permissions.PROJECT_VIEW, Permissions.PROJECT_CREATE, Permissions.REPORT_VIEW],
  project_viewer: [Permissions.COMPANY_VIEW, Permissions.CUSTOMER_VIEW, Permissions.PROJECT_VIEW, Permissions.DESIGN_VIEW, Permissions.REPORT_VIEW],
  owner: COMPANY_ALL_PERMISSIONS,
  admin: COMPANY_ALL_PERMISSIONS.filter((permission) => permission !== Permissions.PROJECT_DELETE && permission !== Permissions.COMPANY_ROLES_MANAGE),
  sales: [Permissions.COMPANY_VIEW, Permissions.CUSTOMER_VIEW, Permissions.CUSTOMER_CREATE, Permissions.CUSTOMER_UPDATE, Permissions.PROJECT_VIEW, Permissions.PROJECT_CREATE, Permissions.REPORT_VIEW],
  viewer: [Permissions.COMPANY_VIEW, Permissions.CUSTOMER_VIEW, Permissions.PROJECT_VIEW, Permissions.DESIGN_VIEW, Permissions.REPORT_VIEW]
};

const SEAT_CAPABILITIES: Record<SeatType, ProductCapability[]> = {
  designer: Object.values(ProductCapabilities),
  sales: [ProductCapabilities.SALES_WORKFLOW, ProductCapabilities.PROJECT_READ, ProductCapabilities.REPORT_GENERATE],
  viewer: [ProductCapabilities.PROJECT_READ],
  no_seat: []
};

export function platformRolePermissions(role: PlatformRole) {
  return PLATFORM_ROLE_PERMISSIONS[role] ?? [];
}

export function tenantRolePermissions(role: TenantRole) {
  return TENANT_ROLE_PERMISSIONS[role] ?? [];
}

export function companyRolePermissions(role: WorkspaceMemberRole) {
  return COMPANY_ROLE_PERMISSIONS[role] ?? [];
}

export function seatCapabilities(seatType: SeatType) {
  return SEAT_CAPABILITIES[seatType] ?? [];
}

export function hasPermission(permissions: Permission[], permission: Permission) {
  return permissions.includes(permission);
}

export function hasCapability(capabilities: ProductCapability[], capability: ProductCapability) {
  return capabilities.includes(capability);
}
