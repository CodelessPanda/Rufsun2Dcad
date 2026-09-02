import type { RufsunCadDocument } from "../types/cad";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  status: string;
  platformRole?: PlatformRole;
  emailVerifiedAt?: string | null;
}

export type PlatformRole = "user" | "support_admin" | "super_admin";
export type TenantType = "direct" | "distributor" | "enterprise";
export type TenantStatus = "active" | "suspended" | "archived";
export type CompanyStatus = "active" | "suspended" | "archived";
export type TenantRole = "owner" | "admin" | "billing" | "support" | "member" | "super_admin";
export type CompanyRole = "company_owner" | "company_admin" | "design_manager" | "designer" | "sales_manager" | "sales_rep" | "project_viewer" | "owner" | "admin" | "sales" | "viewer" | "member";
export type SeatType = "designer" | "sales" | "viewer" | "no_seat";
export type PlanCode = "starter" | "professional" | "business" | "enterprise" | "distributor" | "internal";
export type SubscriptionStatus = "trialing" | "active" | "grace_period" | "suspended" | "canceled" | "expired";
export type BillingMode = "manual" | "external";
export type MembershipStatus = "active" | "invited" | "suspended" | "removed" | "disabled";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  status: TenantStatus;
  role?: TenantRole;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  companies?: Company[];
  _count?: { companies?: number; memberships?: number };
}

export interface Company {
  id: string;
  tenantId: string;
  tenant?: Tenant;
  name: string;
  slug: string;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  role?: CompanyRole;
  seatType?: SeatType;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  workspaceId?: string;
  _count?: { customers?: number; projects?: number; members?: number };
}

export type Workspace = Company;
export type WorkspaceRole = CompanyRole;

export interface CompanyMember {
  id: string;
  companyId: string;
  role: CompanyRole;
  seatType?: SeatType;
  status: MembershipStatus;
  joinedAt?: string | null;
  user: Pick<ApiUser, "id" | "name" | "email" | "avatarUrl" | "emailVerifiedAt">;
}

export type WorkspaceMember = CompanyMember;

export interface TenantMember {
  id: string;
  tenantId: string;
  role: TenantRole;
  status: MembershipStatus;
  joinedAt?: string | null;
  user: Pick<ApiUser, "id" | "name" | "email" | "avatarUrl" | "emailVerifiedAt">;
}

export interface Invitation {
  id: string;
  email: string;
  scope: "tenant" | "company";
  tenantId?: string | null;
  companyId?: string | null;
  tenantRole?: TenantRole | null;
  companyRole?: CompanyRole | null;
  seatType?: SeatType | null;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  invitationUrl?: string;
  tenant?: Tenant | null;
  company?: Company | null;
}

export interface MembersResponse {
  members: CompanyMember[];
  invitations: Invitation[];
}

export interface TenantMembersResponse {
  members: TenantMember[];
  invitations: Invitation[];
}

export interface UserSession {
  id: string;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface Plan {
  id: string;
  code: PlanCode;
  name: string;
  description?: string | null;
  entitlements?: PlanEntitlement[];
}

export interface PlanEntitlement {
  id?: string;
  key: string;
  enabled: boolean;
  limit?: number | null;
}

export interface SubscriptionSummary {
  id: string;
  scope: "tenant" | "company";
  status: SubscriptionStatus;
  billingMode: BillingMode;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  graceEndsAt?: string | null;
  canceledAt?: string | null;
  notes?: string | null;
}

export interface SeatSummary {
  seatType: Exclude<SeatType, "no_seat">;
  total?: number | null;
  allocated?: number | null;
  unlimited: boolean;
  assigned?: number;
  available?: number | null;
}

export interface CommercialCompanySummary {
  id: string;
  name: string;
  status: CompanyStatus;
  allocations: SeatSummary[];
  memberCount: number;
  projectCount: number;
}

export interface TenantCommercialSummary {
  tenantId: string;
  subscription: SubscriptionSummary | null;
  plan: Pick<Plan, "id" | "code" | "name" | "description"> | null;
  subscriptionValid: boolean;
  entitlements: Record<string, { enabled: boolean; limit: number | null }>;
  capacities: SeatSummary[];
  companies: CommercialCompanySummary[];
}

export interface CompanyCommercialSummary {
  companyId: string;
  tenantId: string;
  subscription: SubscriptionSummary | null;
  plan: Pick<Plan, "id" | "code" | "name" | "description"> | null;
  subscriptionValid: boolean;
  entitlements: Record<string, { enabled: boolean; limit: number | null }>;
  seats: SeatSummary[];
  usage: {
    solarRequestsMonth: {
      used: number;
      periodStart: string;
    };
  };
}

export interface WorkspaceSummary {
  customers: number;
  projects: number;
  activeProjects: number;
  totalDesignedCapacityKw: number;
}

export interface Customer {
  id: string;
  companyId: string;
  workspaceId?: string;
  customerType: "individual" | "business";
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  _count?: { projects: number };
  projects?: CloudProject[];
}

export interface CloudProject {
  id: string;
  companyId: string;
  workspaceId?: string;
  customerId: string;
  customer?: Pick<Customer, "id" | "name" | "companyName" | "phone" | "email">;
  name: string;
  description?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  status: "draft" | "active" | "completed" | "archived";
  systemSizeKw?: number | null;
  panelCount?: number | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  document?: { updatedAt: string; schemaVersion: string };
}

export interface CloudDocument {
  id: string;
  companyId: string;
  workspaceId?: string;
  projectId: string;
  documentJson: RufsunCadDocument;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface SolarDataLayers {
  imageryDate?: { year: number; month: number; day: number };
  imageryProcessedDate?: { year: number; month: number; day: number };
  imageryQuality?: "HIGH" | "MEDIUM" | "BASE";
  hasAnnualFlux: boolean;
  hasRgb?: boolean;
  hasDsm?: boolean;
  hasMask?: boolean;
  radiusMeters: number;
  pixelSizeMeters: number;
  annualFluxDownloadUrl: string;
  rgbDownloadUrl?: string;
  dsmDownloadUrl?: string;
  maskDownloadUrl?: string;
  loadedAt: string;
}

export interface CreateCustomerInput {
  customerType?: "individual" | "business";
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  address?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

export interface CreateProjectInput {
  customerId: string;
  name: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  documentJson?: RufsunCadDocument;
  schemaVersion?: string;
}
