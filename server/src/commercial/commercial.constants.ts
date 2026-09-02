import type { PlanCode, SeatType } from "@prisma/client";

export const Entitlements = {
  CAD_ACCESS: "cad.access",
  CAD_EDIT: "cad.edit",
  SOLAR_IRRADIANCE: "solar.irradiance",
  LAYOUT_AUTO_FILL: "layout.auto_fill",
  REPORTS_BASIC: "reports.basic",
  REPORTS_ADVANCED: "reports.advanced",
  COMPANIES_MAX: "companies.max",
  PROJECTS_MAX: "projects.max",
  SOLAR_REQUESTS_MONTH: "solar.requests.month",
  SEAT_DESIGNER: "seat.designer",
  SEAT_SALES: "seat.sales",
  SEAT_VIEWER: "seat.viewer"
} as const;

export type EntitlementKey = (typeof Entitlements)[keyof typeof Entitlements];

export const COMMERCIAL_SEATS: SeatType[] = ["designer", "sales", "viewer"];

export const PLAN_DEFINITIONS: Array<{
  code: PlanCode;
  name: string;
  description: string;
  entitlements: Array<{ key: EntitlementKey; enabled?: boolean; limit?: number | null }>;
}> = [
  {
    code: "starter",
    name: "Starter",
    description: "Entry plan for small solar teams.",
    entitlements: [
      enabled(Entitlements.CAD_ACCESS),
      enabled(Entitlements.CAD_EDIT),
      enabled(Entitlements.REPORTS_BASIC),
      limit(Entitlements.COMPANIES_MAX, 1),
      limit(Entitlements.PROJECTS_MAX, 25),
      limit(Entitlements.SOLAR_REQUESTS_MONTH, 0),
      limit(Entitlements.SEAT_DESIGNER, 2),
      limit(Entitlements.SEAT_SALES, 1),
      enabled(Entitlements.SEAT_VIEWER)
    ]
  },
  {
    code: "professional",
    name: "Professional",
    description: "Full design workflow with solar irradiance.",
    entitlements: [
      enabled(Entitlements.CAD_ACCESS),
      enabled(Entitlements.CAD_EDIT),
      enabled(Entitlements.SOLAR_IRRADIANCE),
      enabled(Entitlements.LAYOUT_AUTO_FILL),
      enabled(Entitlements.REPORTS_BASIC),
      enabled(Entitlements.REPORTS_ADVANCED),
      limit(Entitlements.COMPANIES_MAX, 2),
      limit(Entitlements.PROJECTS_MAX, 250),
      limit(Entitlements.SOLAR_REQUESTS_MONTH, 100),
      limit(Entitlements.SEAT_DESIGNER, 10),
      limit(Entitlements.SEAT_SALES, 5),
      enabled(Entitlements.SEAT_VIEWER)
    ]
  },
  {
    code: "business",
    name: "Business",
    description: "Multi-company operating plan.",
    entitlements: [
      enabled(Entitlements.CAD_ACCESS),
      enabled(Entitlements.CAD_EDIT),
      enabled(Entitlements.SOLAR_IRRADIANCE),
      enabled(Entitlements.LAYOUT_AUTO_FILL),
      enabled(Entitlements.REPORTS_BASIC),
      enabled(Entitlements.REPORTS_ADVANCED),
      limit(Entitlements.COMPANIES_MAX, 10),
      limit(Entitlements.PROJECTS_MAX, 1000),
      limit(Entitlements.SOLAR_REQUESTS_MONTH, 500),
      limit(Entitlements.SEAT_DESIGNER, 50),
      limit(Entitlements.SEAT_SALES, 25),
      enabled(Entitlements.SEAT_VIEWER)
    ]
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "Manual enterprise agreement with broad capacity.",
    entitlements: [
      enabled(Entitlements.CAD_ACCESS),
      enabled(Entitlements.CAD_EDIT),
      enabled(Entitlements.SOLAR_IRRADIANCE),
      enabled(Entitlements.LAYOUT_AUTO_FILL),
      enabled(Entitlements.REPORTS_BASIC),
      enabled(Entitlements.REPORTS_ADVANCED),
      limit(Entitlements.COMPANIES_MAX, null),
      limit(Entitlements.PROJECTS_MAX, null),
      limit(Entitlements.SOLAR_REQUESTS_MONTH, null),
      limit(Entitlements.SEAT_DESIGNER, null),
      limit(Entitlements.SEAT_SALES, null),
      enabled(Entitlements.SEAT_VIEWER)
    ]
  },
  {
    code: "distributor",
    name: "Distributor",
    description: "Distributor license pool for allocating seats to companies.",
    entitlements: [
      enabled(Entitlements.CAD_ACCESS),
      enabled(Entitlements.CAD_EDIT),
      enabled(Entitlements.SOLAR_IRRADIANCE),
      enabled(Entitlements.LAYOUT_AUTO_FILL),
      enabled(Entitlements.REPORTS_BASIC),
      enabled(Entitlements.REPORTS_ADVANCED),
      limit(Entitlements.COMPANIES_MAX, null),
      limit(Entitlements.PROJECTS_MAX, null),
      limit(Entitlements.SOLAR_REQUESTS_MONTH, 2000),
      limit(Entitlements.SEAT_DESIGNER, 100),
      limit(Entitlements.SEAT_SALES, 50),
      enabled(Entitlements.SEAT_VIEWER)
    ]
  },
  {
    code: "internal",
    name: "Internal",
    description: "Development and internal RufsunCAD access.",
    entitlements: [
      enabled(Entitlements.CAD_ACCESS),
      enabled(Entitlements.CAD_EDIT),
      enabled(Entitlements.SOLAR_IRRADIANCE),
      enabled(Entitlements.LAYOUT_AUTO_FILL),
      enabled(Entitlements.REPORTS_BASIC),
      enabled(Entitlements.REPORTS_ADVANCED),
      limit(Entitlements.COMPANIES_MAX, null),
      limit(Entitlements.PROJECTS_MAX, null),
      limit(Entitlements.SOLAR_REQUESTS_MONTH, null),
      limit(Entitlements.SEAT_DESIGNER, null),
      limit(Entitlements.SEAT_SALES, null),
      enabled(Entitlements.SEAT_VIEWER)
    ]
  }
];

function enabled(key: EntitlementKey) {
  return { key, enabled: true, limit: null };
}

function limit(key: EntitlementKey, value: number | null) {
  return { key, enabled: true, limit: value };
}
