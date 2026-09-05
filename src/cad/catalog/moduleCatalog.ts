export type CellTechnology =
  | "mono-perc"
  | "bifacial"
  | "topcon"
  | "hjt"
  | "polycrystalline"
  | "thin-film";

export interface SolarModuleItem {
  id: string;
  manufacturer: string;
  model: string;
  wattage: number;
  widthMM: number;
  heightMM: number;
  thicknessMM: number;
  cellType: CellTechnology;
  vOc?: number; // Open circuit voltage (V)
  iSc?: number; // Short circuit current (A)
  vMp?: number; // Voltage at max power (V)
  iMp?: number; // Current at max power (A)
  tempCoeffPmax?: number; // % / deg C (typically -0.35 to -0.28)
  efficiency?: number; // %
  isCustom?: boolean;
}

export const BUILTIN_SOLAR_MODULES: SolarModuleItem[] = [
  {
    id: "longi-himo6-550",
    manufacturer: "LONGi",
    model: "Hi-MO 6 Explorer 550W",
    wattage: 550,
    widthMM: 1134,
    heightMM: 2278,
    thicknessMM: 35,
    cellType: "mono-perc",
    vOc: 49.8,
    iSc: 13.98,
    vMp: 41.95,
    iMp: 13.12,
    tempCoeffPmax: -0.34,
    efficiency: 21.3
  },
  {
    id: "jinko-tiger-neo-580",
    manufacturer: "JinkoSolar",
    model: "Tiger Neo N-type 580W",
    wattage: 580,
    widthMM: 1134,
    heightMM: 2278,
    thicknessMM: 35,
    cellType: "topcon",
    vOc: 51.5,
    iSc: 14.28,
    vMp: 42.97,
    iMp: 13.5,
    tempCoeffPmax: -0.3,
    efficiency: 22.45
  },
  {
    id: "canadian-hiku7-650",
    manufacturer: "Canadian Solar",
    model: "HiKu7 Mono PERC 650W",
    wattage: 650,
    widthMM: 1303,
    heightMM: 2384,
    thicknessMM: 35,
    cellType: "mono-perc",
    vOc: 45.4,
    iSc: 18.39,
    vMp: 38.3,
    iMp: 16.98,
    tempCoeffPmax: -0.34,
    efficiency: 20.9
  },
  {
    id: "trina-vertex-s-430",
    manufacturer: "Trina Solar",
    model: "Vertex S Residential 430W",
    wattage: 430,
    widthMM: 1134,
    heightMM: 1762,
    thicknessMM: 30,
    cellType: "mono-perc",
    vOc: 43.2,
    iSc: 12.72,
    vMp: 36.1,
    iMp: 11.92,
    tempCoeffPmax: -0.34,
    efficiency: 21.5
  },
  {
    id: "ja-bifacial-545",
    manufacturer: "JA Solar",
    model: "DeepBlue 3.0 Bifacial 545W",
    wattage: 545,
    widthMM: 1134,
    heightMM: 2279,
    thicknessMM: 30,
    cellType: "bifacial",
    vOc: 49.75,
    iSc: 13.93,
    vMp: 41.8,
    iMp: 13.04,
    tempCoeffPmax: -0.35,
    efficiency: 21.0
  },
  {
    id: "generic-mono-550",
    manufacturer: "Generic",
    model: "Standard Mono 550W",
    wattage: 550,
    widthMM: 1134,
    heightMM: 2278,
    thicknessMM: 35,
    cellType: "mono-perc",
    vOc: 49.6,
    iSc: 14.0,
    vMp: 41.7,
    iMp: 13.2,
    tempCoeffPmax: -0.35,
    efficiency: 21.28
  },
  {
    id: "generic-residential-400",
    manufacturer: "Generic",
    model: "Residential Compact 400W",
    wattage: 400,
    widthMM: 1134,
    heightMM: 1722,
    thicknessMM: 30,
    cellType: "mono-perc",
    vOc: 41.2,
    iSc: 12.2,
    vMp: 34.2,
    iMp: 11.7,
    tempCoeffPmax: -0.35,
    efficiency: 20.48
  }
];

const STORAGE_KEY = "rufsun.custom_modules";

export function getCustomModules(): SolarModuleItem[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(isValidModuleItem).map((item) => ({ ...item, isCustom: true }));
    }
  } catch {
    // Ignore JSON parsing errors
  }
  return [];
}

export function saveCustomModule(item: Omit<SolarModuleItem, "isCustom">): SolarModuleItem {
  const fullItem: SolarModuleItem = { ...item, isCustom: true };
  const current = getCustomModules().filter((m) => m.id !== item.id);
  const updated = [fullItem, ...current];
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return fullItem;
}

export function deleteCustomModule(id: string): void {
  const current = getCustomModules().filter((m) => m.id !== id);
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }
}

export function getAllSolarModules(): SolarModuleItem[] {
  const custom = getCustomModules();
  return [...custom, ...BUILTIN_SOLAR_MODULES];
}

export function findModuleById(id: string): SolarModuleItem {
  const all = getAllSolarModules();
  return all.find((m) => m.id === id) ?? BUILTIN_SOLAR_MODULES[0];
}

function isValidModuleItem(item: unknown): item is SolarModuleItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.manufacturer === "string" &&
    typeof candidate.model === "string" &&
    typeof candidate.wattage === "number" &&
    candidate.wattage > 0 &&
    typeof candidate.widthMM === "number" &&
    candidate.widthMM > 0 &&
    typeof candidate.heightMM === "number" &&
    candidate.heightMM > 0
  );
}
