import { v4 as uuid } from "uuid";
import type { SolarPanelObject } from "../../types/cad";

export interface ArraySettings {
  rows: number;
  columns: number;
  horizontalGap: number;
  verticalGap: number;
  orientation: "portrait" | "landscape";
}

export function buildSolarArray(seed: SolarPanelObject, settings: ArraySettings): SolarPanelObject[] {
  const width = settings.orientation === seed.orientation ? seed.width : seed.height;
  const height = settings.orientation === seed.orientation ? seed.height : seed.width;
  const panels: SolarPanelObject[] = [];

  for (let row = 0; row < settings.rows; row += 1) {
    for (let column = 0; column < settings.columns; column += 1) {
      panels.push({
        ...seed,
        id: uuid(),
        x: seed.x + column * (width + settings.horizontalGap),
        y: seed.y + row * (height + settings.verticalGap),
        width,
        height,
        orientation: settings.orientation,
        moduleGap: Math.max(settings.horizontalGap, settings.verticalGap)
      });
    }
  }
  return panels;
}

export function calculateArrayStats(panels: SolarPanelObject[]) {
  const totalWatts = panels.reduce((sum, panel) => sum + panel.wattage, 0);
  const xs = panels.flatMap((panel) => [panel.x, panel.x + panel.width]);
  const ys = panels.flatMap((panel) => [panel.y, panel.y + panel.height]);
  return {
    modules: panels.length,
    totalWatts,
    totalKwp: totalWatts / 1000,
    width: panels.length ? Math.max(...xs) - Math.min(...xs) : 0,
    height: panels.length ? Math.max(...ys) - Math.min(...ys) : 0
  };
}
