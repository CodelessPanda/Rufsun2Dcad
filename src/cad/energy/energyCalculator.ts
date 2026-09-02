import { findContainingRoof, roofContainsPanel } from "../geometry/geometry";
import type { SolarPanelObject, RoofObject } from "../../types/cad";
import { DEFAULT_ELECTRICITY_RATE_INR, DEFAULT_INSTALL_COST_PER_WATT_INR } from "../finance/currency";

export type TimePeriod = "today" | "week" | "month" | "year";

export interface EnergyCalculationParams {
  panels: SolarPanelObject[];
  roofs: RoofObject[];
  averageRadiance: number; // W/m², mean daytime irradiance used when no weather data is available
  annualFluxByPanelId?: Record<string, number>; // kWh/kW/year sampled from Google Solar API under each panel
  annualFluxByRoofId?: Record<string, number>; // kWh/kW/year from Google Solar API annual flux layer
  temperatureCorrectionFactor?: number; // Default: 0.95 (accounts for temperature losses)
  sunlightHours?: number; // Default: 6 (average usable sunlight hours per day)
  electricityRate?: number; // Default: INR per kWh
}

export interface EnergyGenerationResult {
  period: TimePeriod;
  totalEnergyKwh: number;
  estimatedRevenue: number;
  averageDailyGeneration: number;
  peakGeneration: number; // kW (instantaneous max output)
  efficiency: number; // % (angle + azimuth factor)
  panelCount: number;
  totalCapacity: number; // kWp
  dailyPeakSunHours: number;
  performanceRatio: number; // % (temperature + angle factor applied to generation)
  dataSource: "solar-api" | "assumption";
  averageAnnualFlux?: number;
}

export interface SystemCostEstimate {
  costPerWatt: number;
  systemCost: number;
  annualSavings: number;
  paybackYears: number | null;
  firstYearNet: number;
}

export interface DummyWeatherData {
  date: string;
  radiance: number; // W/m²
  temperature: number; // Celsius
  cloudCover: number; // 0-100%
}

// Dummy weather data for calculations
const dummyWeatherData: DummyWeatherData[] = [
  { date: "2026-08-14", radiance: 800, temperature: 28, cloudCover: 15 },
  { date: "2026-08-13", radiance: 850, temperature: 26, cloudCover: 10 },
  { date: "2026-08-12", radiance: 780, temperature: 29, cloudCover: 20 },
  { date: "2026-08-11", radiance: 920, temperature: 27, cloudCover: 5 },
  { date: "2026-08-10", radiance: 750, temperature: 30, cloudCover: 25 },
  { date: "2026-08-09", radiance: 880, temperature: 25, cloudCover: 8 },
  { date: "2026-08-08", radiance: 810, temperature: 28, cloudCover: 18 },
];

const DEFAULT_TEMPERATURE_FACTOR = 0.95;
const DEFAULT_SUNLIGHT_HOURS = 6;
const DEFAULT_ELECTRICITY_RATE = DEFAULT_ELECTRICITY_RATE_INR;

/**
 * Calculate panel area in square meters
 */
export function calculatePanelArea(panel: SolarPanelObject): number {
  return (panel.width * panel.height) / 1_000_000; // Convert mm² to m²
}

/**
 * Calculate total system capacity in kWp
 */
export function calculateSystemCapacity(panels: SolarPanelObject[]): number {
  const totalWatts = panels.reduce((sum, panel) => sum + panel.wattage, 0);
  return totalWatts / 1000; // Convert W to kW
}

export function calculateSystemCostEstimate(
  totalCapacityKwp: number,
  annualSavings: number,
  costPerWatt = DEFAULT_INSTALL_COST_PER_WATT_INR
): SystemCostEstimate {
  const systemCost = totalCapacityKwp * 1000 * costPerWatt;
  return {
    costPerWatt: round(costPerWatt),
    systemCost: round(systemCost),
    annualSavings: round(annualSavings),
    paybackYears: annualSavings > 0 ? round(systemCost / annualSavings) : null,
    firstYearNet: round(annualSavings - systemCost)
  };
}

/**
 * Calculate efficiency factor based on angle and azimuth
 * Returns a multiplier (0-1) representing optimal angle efficiency
 */
export function calculateAngleEfficiency(panel: SolarPanelObject, roofData?: RoofObject): number {
  const optimalAngle = 25; // Typical optimal tilt angle in degrees
  const optimalAzimuth = 180; // South-facing (Northern hemisphere)

  let tiltAngle = panel.rotation;
  let azimuth = optimalAzimuth;

  // If roof data available, use roof orientation
  if (roofData) {
    tiltAngle = roofData.tilt;
    azimuth = roofData.azimuth;
  }

  // Calculate angle efficiency (Gaussian curve, peak at optimal angle)
  const angleDiff = Math.abs(tiltAngle - optimalAngle);
  const angleEfficiency = Math.exp(-Math.pow(angleDiff / 30, 2));

  // Calculate azimuth efficiency (peak at south, -60 to +60° is acceptable)
  const azimuthDiff = Math.abs(azimuth - optimalAzimuth);
  const normalizedAzimuth = Math.min(azimuthDiff, 360 - azimuthDiff);
  const azimuthEfficiency = Math.max(0.7, Math.cos((normalizedAzimuth * Math.PI) / 180));

  return angleEfficiency * azimuthEfficiency;
}

/**
 * Get dummy weather data for a specific date range
 */
export function getDummyWeatherData(startDate: Date, endDate: Date): DummyWeatherData[] {
  const filtered = dummyWeatherData.filter((data) => {
    const date = new Date(data.date);
    return date >= startDate && date <= endDate;
  });
  return filtered.length > 0 ? filtered : [dummyWeatherData[0]];
}

/**
 * Keep only panels whose footprint is fully inside a drawn roof
 */
export function filterPanelsOnRoofs(panels: SolarPanelObject[], roofs: RoofObject[]): SolarPanelObject[] {
  if (roofs.length === 0) return [];
  return panels.filter((panel) => roofContainsPanel(panel, roofs));
}

/**
 * Calculate energy generation for a time period
 *
 * Uses the standard capacity-based model:
 *   Energy (kWh) = System Capacity (kWp) × Peak Sun Hours × Performance Ratio
 * where:
 *   Peak Sun Hours = (mean daytime irradiance / 1000 W/m²) × sunlight hours
 *   Performance Ratio = temperature factor × angle/azimuth efficiency
 */
export function calculateEnergyGeneration(
  params: EnergyCalculationParams,
  period: TimePeriod
): EnergyGenerationResult {
  // Only panels placed inside a drawn roof count towards generation
  const panelsOnRoofs = filterPanelsOnRoofs(params.panels, params.roofs);

  const zeroResult: EnergyGenerationResult = {
    period,
    totalEnergyKwh: 0,
    estimatedRevenue: 0,
    averageDailyGeneration: 0,
    peakGeneration: 0,
    efficiency: 0,
    panelCount: 0,
    totalCapacity: 0,
    dailyPeakSunHours: 0,
    performanceRatio: 0,
    dataSource: "assumption"
  };

  if (panelsOnRoofs.length === 0) {
    return zeroResult;
  }

  const temperatureFactor = params.temperatureCorrectionFactor ?? DEFAULT_TEMPERATURE_FACTOR;
  const sunlightHours = params.sunlightHours ?? DEFAULT_SUNLIGHT_HOURS;
  const electricityRate = params.electricityRate ?? DEFAULT_ELECTRICITY_RATE;
  const systemCapacity = calculateSystemCapacity(panelsOnRoofs);
  const panelCount = panelsOnRoofs.length;

  // Fixed date so the dummy weather data stays consistent across periods
  const now = new Date("2026-08-14");
  const { startDate, daysInPeriod } = periodDateRange(now, period);

  // Average irradiance across the available weather days for this period
  const weatherData = getDummyWeatherData(startDate, now);
  const averageRadiance =
    weatherData.length > 0
      ? weatherData.reduce((sum, data) => sum + data.radiance, 0) / weatherData.length
      : params.averageRadiance;

  // Average angle/azimuth efficiency across all panels, using the roof that
  // geometrically contains each panel for its tilt and azimuth
  const angleEfficiency =
    panelsOnRoofs.reduce(
      (sum, panel) => sum + calculateAngleEfficiency(panel, findContainingRoof(panel, params.roofs)),
      0
    ) / panelCount;

  const solarApiEstimate = calculateSolarApiAnnualEstimate(panelsOnRoofs, params.roofs, params.annualFluxByPanelId, params.annualFluxByRoofId, temperatureFactor);
  if (solarApiEstimate) {
    const totalEnergyKwh = solarApiEstimate.annualEnergyKwh * (daysInPeriod / 365);
    const dailyEnergyKwh = solarApiEstimate.annualEnergyKwh / 365;
    return {
      period,
      totalEnergyKwh: round(totalEnergyKwh),
      estimatedRevenue: round(totalEnergyKwh * electricityRate),
      averageDailyGeneration: round(dailyEnergyKwh),
      peakGeneration: round(systemCapacity * temperatureFactor),
      efficiency: round(angleEfficiency * 100),
      panelCount,
      totalCapacity: round(systemCapacity),
      dailyPeakSunHours: round(solarApiEstimate.averageAnnualFlux / 365),
      performanceRatio: round(temperatureFactor * 100),
      dataSource: "solar-api",
      averageAnnualFlux: round(solarApiEstimate.averageAnnualFlux)
    };
  }

  const peakSunHours = (averageRadiance / 1000) * sunlightHours;
  const performanceRatio = temperatureFactor * angleEfficiency;
  const dailyEnergyKwh = systemCapacity * peakSunHours * performanceRatio;
  const totalEnergyKwh = dailyEnergyKwh * daysInPeriod;

  // Peak instantaneous output under the best recorded irradiance
  const peakRadiance = Math.max(...weatherData.map((data) => data.radiance), params.averageRadiance);
  const peakGeneration = systemCapacity * (peakRadiance / 1000) * performanceRatio;

  const estimatedRevenue = totalEnergyKwh * electricityRate;

  return {
    period,
    totalEnergyKwh: round(totalEnergyKwh),
    estimatedRevenue: round(estimatedRevenue),
    averageDailyGeneration: round(dailyEnergyKwh),
    peakGeneration: round(peakGeneration),
    efficiency: round(angleEfficiency * 100),
    panelCount,
    totalCapacity: round(systemCapacity),
    dailyPeakSunHours: round(peakSunHours),
    performanceRatio: round(performanceRatio * 100),
    dataSource: "assumption"
  };
}

function calculateSolarApiAnnualEstimate(
  panels: SolarPanelObject[],
  roofs: RoofObject[],
  annualFluxByPanelId: Record<string, number> | undefined,
  annualFluxByRoofId: Record<string, number> | undefined,
  temperatureFactor: number
) {
  if (!annualFluxByPanelId && !annualFluxByRoofId) return null;
  let annualEnergyKwh = 0;
  let capacityWithFlux = 0;
  let weightedFlux = 0;

  for (const panel of panels) {
    const roof = findContainingRoof(panel, roofs);
    if (!roof) continue;
    const annualFlux = annualFluxByPanelId?.[panel.id] ?? annualFluxByRoofId?.[roof.id];
    if (typeof annualFlux !== "number" || !Number.isFinite(annualFlux) || annualFlux <= 0) continue;
    const capacityKwp = panel.wattage / 1000;
    annualEnergyKwh += capacityKwp * annualFlux * temperatureFactor;
    capacityWithFlux += capacityKwp;
    weightedFlux += annualFlux * capacityKwp;
  }

  if (annualEnergyKwh <= 0 || capacityWithFlux <= 0) return null;
  return {
    annualEnergyKwh,
    averageAnnualFlux: weightedFlux / capacityWithFlux
  };
}

function periodDateRange(now: Date, period: TimePeriod): { startDate: Date; daysInPeriod: number } {
  const startDate = new Date(now);
  switch (period) {
    case "today":
      return { startDate, daysInPeriod: 1 };
    case "week":
      startDate.setDate(now.getDate() - 6);
      return { startDate, daysInPeriod: 7 };
    case "month":
      startDate.setDate(1);
      return { startDate, daysInPeriod: 30 };
    case "year":
      startDate.setMonth(0);
      startDate.setDate(1);
      return { startDate, daysInPeriod: 365 };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate energy for all time periods
 */
export function calculateAllPeriods(
  params: EnergyCalculationParams
): Record<TimePeriod, EnergyGenerationResult> {
  return {
    today: calculateEnergyGeneration(params, "today"),
    week: calculateEnergyGeneration(params, "week"),
    month: calculateEnergyGeneration(params, "month"),
    year: calculateEnergyGeneration(params, "year")
  };
}
