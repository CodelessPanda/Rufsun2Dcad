export interface SolarModuleCatalogItem {
  id: string;
  manufacturer: string;
  model: string;
  widthMM: number;
  heightMM: number;
  thicknessMM: number;
  wattage: number;
}

export const sampleSolarModules: SolarModuleCatalogItem[] = [
  {
    id: "generic-mono-550",
    manufacturer: "Generic",
    model: "Mono 550",
    widthMM: 1134,
    heightMM: 2278,
    thicknessMM: 35,
    wattage: 550
  },
  {
    id: "generic-mono-450",
    manufacturer: "Generic",
    model: "Mono 450",
    widthMM: 1134,
    heightMM: 1909,
    thicknessMM: 35,
    wattage: 450
  },
  {
    id: "generic-residential-400",
    manufacturer: "Generic",
    model: "Residential 400",
    widthMM: 1134,
    heightMM: 1722,
    thicknessMM: 30,
    wattage: 400
  }
];
