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
    id: "generic-large-650",
    manufacturer: "Generic",
    model: "Large Format 650",
    widthMM: 1303,
    heightMM: 2174,
    thicknessMM: 35,
    wattage: 650
  },
  {
    id: "generic-bifacial-470",
    manufacturer: "Generic",
    model: "Bifacial 470",
    widthMM: 1094,
    heightMM: 2094,
    thicknessMM: 30,
    wattage: 470
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
  },
  {
    id: "generic-compact-330",
    manufacturer: "Generic",
    model: "Compact 330",
    widthMM: 1006,
    heightMM: 1670,
    thicknessMM: 30,
    wattage: 330
  }
];
