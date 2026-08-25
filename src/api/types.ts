import type { RufsunCadDocument } from "../types/cad";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  status: string;
  emailVerifiedAt?: string | null;
}

export interface Workspace {
  id: string;
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
  role?: WorkspaceRole;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceRole = "owner" | "admin" | "designer" | "sales" | "viewer";

export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  status: string;
  joinedAt?: string | null;
  user: Pick<ApiUser, "id" | "name" | "email" | "avatarUrl">;
}

export interface WorkspaceSummary {
  customers: number;
  projects: number;
  activeProjects: number;
  totalDesignedCapacityKw: number;
}

export interface Customer {
  id: string;
  workspaceId: string;
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
  workspaceId: string;
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
  workspaceId: string;
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
  radiusMeters: number;
  pixelSizeMeters: number;
  annualFluxDownloadUrl: string;
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
