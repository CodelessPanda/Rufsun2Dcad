import { useState } from "react";
import { TrendingUp, Zap, IndianRupee, Gauge, Sun, SlidersHorizontal } from "lucide-react";
import { useCadStore } from "../../store/useCadStore";
import type { RoofObject, SolarPanelObject } from "../../types/cad";
import type { TimePeriod } from "../../cad/energy/energyCalculator";
import { calculateAllPeriods, calculateSystemCostEstimate, filterPanelsOnRoofs } from "../../cad/energy/energyCalculator";
import { DEFAULT_ELECTRICITY_RATE_INR, DEFAULT_INSTALL_COST_PER_WATT_INR, ELECTRICITY_RATE_UNIT, formatCurrency, INSTALL_COST_UNIT } from "../../cad/finance/currency";
import type { ProjectSolarDataState } from "../../cad/solar/solarExposureTypes";
import { buildRoofAnnualFluxMap } from "../../cad/solar/solarAnalysis";

const PERIODS = ["today", "week", "month", "year"] as const;

interface Props {
  solarExposure?: ProjectSolarDataState;
}

export function EnergyAnalysisPanel({ solarExposure }: Props) {
  const document = useCadStore((state) => state.document);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("month");
  const [electricityRate, setElectricityRate] = useState(DEFAULT_ELECTRICITY_RATE_INR);
  const [averageRadiance, setAverageRadiance] = useState(800);
  const [sunlightHours, setSunlightHours] = useState(6);
  const [costPerWatt, setCostPerWatt] = useState(DEFAULT_INSTALL_COST_PER_WATT_INR);

  const allPanels = document.objects.filter((object): object is SolarPanelObject => object.type === "solarPanel");
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
  const panels = filterPanelsOnRoofs(allPanels, roofs);
  const annualFluxByRoofId = buildRoofAnnualFluxMap(roofs, solarExposure);

  if (allPanels.length === 0) {
    return (
      <aside className="properties-panel analysis-panel">
        <section className="panel-section">
          <h2>Energy Analysis</h2>
          <p className="info-message">Add solar panels to your design to view energy generation estimates.</p>
        </section>
      </aside>
    );
  }

  if (panels.length === 0) {
    return (
      <aside className="properties-panel analysis-panel">
        <section className="panel-section">
          <h2>Energy Analysis</h2>
          <p className="info-message">
            Draw a roof and place the solar panels inside it to view energy generation estimates.
          </p>
        </section>
      </aside>
    );
  }

  const results = calculateAllPeriods({
    panels,
    roofs,
    averageRadiance,
    annualFluxByRoofId,
    temperatureCorrectionFactor: 0.95,
    sunlightHours,
    electricityRate
  });

  const current = results[selectedPeriod];
  const costEstimate = calculateSystemCostEstimate(current.totalCapacity, results.year.estimatedRevenue, costPerWatt);

  return (
    <aside className="properties-panel analysis-panel">
      <section className="panel-section">
        <h2>Energy Analysis</h2>
        <p className="fine-print">
          Projections based on {panels.length} installed panel{panels.length === 1 ? "" : "s"} and {current.dataSource === "solar-api" ? "Google Solar annual flux" : "dummy weather data"}.
        </p>
      </section>

      {/* Time Period Selection */}
      <section className="panel-section">
        <h3>Time Period</h3>
        <div className="period-selector">
          {PERIODS.map((period) => (
            <button
              key={period}
              className={`period-btn ${selectedPeriod === period ? "active" : ""}`}
              onClick={() => setSelectedPeriod(period)}
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {/* System Summary */}
      <section className="panel-section">
        <h3>System Overview</h3>
        <Stat icon={<Zap />} label="Total Capacity" value={`${current.totalCapacity} kWp`} />
        <Stat icon={<Gauge />} label="Panel Count" value={current.panelCount} />
        <Stat icon={<TrendingUp />} label="System Efficiency" value={`${current.efficiency}%`} />
        <Stat icon={<Sun />} label="Peak Sun Hours" value={`${current.dailyPeakSunHours} h/day`} />
        {current.averageAnnualFlux && <Stat label="Annual Solar Flux" value={`${current.averageAnnualFlux.toLocaleString()} kWh/kW/year`} />}
      </section>

      {/* Energy Generation */}
      <section className="panel-section">
        <h3>Energy Generation</h3>
        <div className="energy-stat-large">
          <div className="value">{current.totalEnergyKwh}</div>
          <div className="label">kWh for {selectedPeriod}</div>
        </div>
        <Stat label="Daily Average" value={`${current.averageDailyGeneration} kWh`} />
        <Stat label="Peak Generation" value={`${current.peakGeneration} kW`} />
        <Stat label="Performance Ratio" value={`${current.performanceRatio}%`} />
      </section>

      {/* Financial Projection */}
      <section className="panel-section">
        <h3>Cost vs Savings</h3>
        <div className="finance-compare">
          <div>
            <IndianRupee size={18} />
            <span>System cost</span>
            <strong>{formatCurrency(costEstimate.systemCost)}</strong>
          </div>
          <div>
            <TrendingUp size={18} />
            <span>{selectedPeriod} savings</span>
            <strong>{formatCurrency(current.estimatedRevenue)}</strong>
          </div>
        </div>
        <Stat label="Annual Savings" value={formatCurrency(costEstimate.annualSavings)} />
        <Stat label="Payback Estimate" value={costEstimate.paybackYears === null ? "N/A" : `${costEstimate.paybackYears} years`} />
        <Stat label="First Year Net" value={formatCurrency(costEstimate.firstYearNet)} />
      </section>

      {/* Period Comparison Table */}
      <section className="panel-section">
        <h3>Period Comparison</h3>
        <div className="comparison-table">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Energy (kWh)</th>
                <th>Savings</th>
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((period) => (
                <tr key={period} className={selectedPeriod === period ? "highlighted" : ""}>
                  <td>{period.charAt(0).toUpperCase() + period.slice(1)}</td>
                  <td>{results[period].totalEnergyKwh}</td>
                  <td>{formatCurrency(results[period].estimatedRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Configurable assumptions */}
      <section className="panel-section">
        <h3>
          <SlidersHorizontal size={12} style={{ verticalAlign: "-1px" }} /> Assumptions
        </h3>
        <NumberField
          label="Rate"
          value={electricityRate}
          suffix={ELECTRICITY_RATE_UNIT}
          min={0}
          step={0.01}
          onChange={setElectricityRate}
        />
        {current.dataSource === "assumption" && (
          <>
            <NumberField
              label="Irradiance"
              value={averageRadiance}
              suffix="W/m²"
              min={0}
              step={10}
              onChange={setAverageRadiance}
            />
            <NumberField
              label="Sunlight"
              value={sunlightHours}
              suffix="h/day"
              min={0}
              step={0.5}
              onChange={setSunlightHours}
            />
          </>
        )}
        <NumberField
          label="Install cost"
          value={costPerWatt}
          suffix={INSTALL_COST_UNIT}
          min={0}
          step={0.05}
          onChange={setCostPerWatt}
        />
      </section>

      {/* Notes */}
      <section className="panel-section compact">
        <h3>Notes</h3>
        <ul className="notes-list">
          <li>{current.dataSource === "solar-api" ? "Energy = Capacity × annual Solar API flux × temperature factor" : "Energy = Capacity × Peak Sun Hours × Performance Ratio"}</li>
          <li>Temperature loss factor: 95%</li>
          <li>{current.dataSource === "solar-api" ? "Solar API data replaces manual irradiance and sunlight assumptions" : "Efficiency based on angle and azimuth"}</li>
          <li>Rate: configurable (default INR 8/kWh)</li>
          <li>Weather data: dummy forecast (API-ready)</li>
        </ul>
      </section>
    </aside>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="stat-row">
      {icon && <span className="stat-icon">{icon}</span>}
      <div>
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  suffix,
  min,
  step,
  onChange
}: {
  label: string;
  value: number;
  suffix?: string;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed) && (min === undefined || parsed >= min)) onChange(parsed);
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}
