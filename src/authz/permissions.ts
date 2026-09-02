import type { CompanyRole, SeatType } from "../api/types";

export const UiPermissions = {
  CUSTOMERS_VIEW: "customer.view",
  PROJECTS_VIEW: "project.view",
  TEAM_VIEW: "company.members.view",
  SETTINGS_VIEW: "company.settings.view",
  COMPANY_UPDATE: "company.update",
  MEMBERS_INVITE: "company.members.invite",
  MEMBERS_UPDATE: "company.members.update",
  MEMBERS_REMOVE: "company.members.remove",
  DESIGN_EDIT: "design.edit"
} as const;

export type UiPermission = (typeof UiPermissions)[keyof typeof UiPermissions];

const ALL: UiPermission[] = Object.values(UiPermissions);

const ROLE_PERMISSIONS: Record<CompanyRole, UiPermission[]> = {
  company_owner: ALL,
  company_admin: ALL,
  design_manager: [UiPermissions.CUSTOMERS_VIEW, UiPermissions.PROJECTS_VIEW, UiPermissions.DESIGN_EDIT],
  designer: [UiPermissions.CUSTOMERS_VIEW, UiPermissions.PROJECTS_VIEW, UiPermissions.DESIGN_EDIT],
  sales_manager: [UiPermissions.CUSTOMERS_VIEW, UiPermissions.PROJECTS_VIEW],
  sales_rep: [UiPermissions.CUSTOMERS_VIEW, UiPermissions.PROJECTS_VIEW],
  project_viewer: [UiPermissions.PROJECTS_VIEW],
  owner: ALL,
  admin: ALL,
  sales: [UiPermissions.CUSTOMERS_VIEW, UiPermissions.PROJECTS_VIEW],
  viewer: [UiPermissions.PROJECTS_VIEW],
  member: [UiPermissions.PROJECTS_VIEW]
};

const SEAT_CAPABILITIES: Record<SeatType, string[]> = {
  designer: ["cad.use", "cad.edit", "solar.analysis", "report.generate"],
  sales: ["sales.workflow", "project.read", "report.generate"],
  viewer: ["project.read"],
  no_seat: []
};

export function can(role: CompanyRole | undefined, permission: UiPermission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasCapability(seatType: SeatType | undefined, capability: string) {
  if (!seatType) return false;
  return SEAT_CAPABILITIES[seatType]?.includes(capability) ?? false;
}

export function roleLabel(role: CompanyRole) {
  return ROLE_LABELS[role] ?? role;
}

export function seatLabel(seat: SeatType) {
  if (seat === "no_seat") return "No Seat";
  return `${seat.charAt(0).toUpperCase()}${seat.slice(1)} Seat`;
}

export const ROLE_LABELS: Record<CompanyRole, string> = {
  company_owner: "Company Owner",
  company_admin: "Company Admin",
  design_manager: "Design Manager",
  designer: "Designer",
  sales_manager: "Sales Manager",
  sales_rep: "Sales Rep",
  project_viewer: "Project Viewer",
  owner: "Company Owner",
  admin: "Company Admin",
  sales: "Sales Rep",
  viewer: "Project Viewer",
  member: "Project Viewer"
};
