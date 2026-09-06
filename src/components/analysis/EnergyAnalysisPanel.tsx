import { useState, useEffect, useRef, useMemo } from "react";
import { TrendingUp, Zap, IndianRupee, Gauge, Sun, SlidersHorizontal, ChevronDown, ChevronUp, Loader2, Layers } from "lucide-react";
import { useCadStore } from "../../store/useCadStore";
import type { MapCaptureSettings, RoofObject, SolarPanelObject, SolarRegistration } from "../../types/cad";
import type { TimePeriod } from "../../cad/energy/energyCalculator";
import { calculateAllPeriods, calculateSystemCostEstimate, filterPanelsOnRoofs } from "../../cad/energy/energyCalculator";
import { DEFAULT_ELECTRICITY_RATE_INR, DEFAULT_INSTALL_COST_PER_WATT_INR, ELECTRICITY_RATE_UNIT, formatCurrency, INSTALL_COST_UNIT } from "../../cad/finance/currency";
import type { ProjectSolarDataState } from "../../cad/solar/solarExposureTypes";
import { buildPanelAnnualFluxMap, buildRoofAnnualFluxMap } from "../../cad/solar/solarAnalysis";
import { getFluxCache, hasFluxCache, setFluxCache } from "../../cad/solar/solarFluxCache";
import type { PanelFluxEntry } from "../../cad/solar/solarAnalysis";
import { normalizeSolarRegistration, createSolarGeoTransform } from "../../cad/solar/solarGeoTransform";

const PERIODS = ["today", "week", "month", "year"] as const;

interface Props {
  solarExposure?: ProjectSolarDataState;
  projectId?: string;
  workspaceId?: string;
  mapCapture?: MapCaptureSettings;
  googleApiKey?: string;
  solarRegistration?: Partial<SolarRegistration>;
  /** Called whenever the stable panel index map changes, so the canvas can show badges. */
  onPanelIndexMapChange?: (map: Record<string, number>) => void;
  /** Called on table row hover to drive the cyan highlight ring on the canvas. */
  onHighlightedPanelChange?: (id: string | null) => void;
}

function buildExposureFromCache(
  projectId: string,
  mapCapture: MapCaptureSettings,
  registration?: Partial<SolarRegistration>
): Pick<ProjectSolarDataState, "status" | "annualFlux" | "transform"> | undefined {
  const cached = getFluxCache(projectId);
  if (!cached) return undefined;
  const reg = normalizeSolarRegistration(registration);
  const transform = createSolarGeoTransform(mapCapture, cached.raster, reg);
  return { status: "ready", annualFlux: cached.raster, transform };
}

/** Label shown in the roof tab strip. */
function roofLabel(roof: RoofObject, index: number): string {
  return roof.name?.trim() || `Roof ${index + 1}`;
}

export function EnergyAnalysisPanel({
  solarExposure, projectId, workspaceId, mapCapture, googleApiKey, solarRegistration,
  onPanelIndexMapChange, onHighlightedPanelChange,
}: Props) {
  const document = useCadStore((state) => state.document);
  const selectOnly = useCadStore((state) => state.selectOnly);
  const selectedIds = useCadStore((state) => state.selectedIds);
  const clearSelection = useCadStore((state) => state.clearSelection);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("month");
  const [selectedRoofId, setSelectedRoofId] = useState<string>("all");
  const [electricityRate, setElectricityRate] = useState(DEFAULT_ELECTRICITY_RATE_INR);
  const [averageRadiance, setAverageRadiance] = useState(800);
  const [sunlightHours, setSunlightHours] = useState(6);
  const [costPerWatt, setCostPerWatt] = useState(DEFAULT_INSTALL_COST_PER_WATT_INR);
  const [showPanelBreakdown, setShowPanelBreakdown] = useState(false);
  const tableRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [fluxLoading, setFluxLoading] = useState(false);
  const loadAttemptedRef = useRef(false);

  const allPanels = document.objects.filter((object): object is SolarPanelObject => object.type === "solarPanel");
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");

  // ── Stable panel index map (position order: top→bottom, left→right) ───────
  // This map covers ALL panels on ANY roof — not scoped to the selected roof —
  // so badge numbers are globally consistent on the canvas.
  const panelIndexMap = useMemo(() => {
    const onRoofs = filterPanelsOnRoofs(allPanels, roofs);
    const sorted = [...onRoofs].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
    const map: Record<string, number> = {};
    sorted.forEach((p, i) => { map[p.id] = i + 1; });
    return map;
  }, [allPanels, roofs]);

  // Notify parent so it can pass panelIndexMap down to CadCanvas
  useEffect(() => {
    onPanelIndexMapChange?.(panelIndexMap);
  }, [panelIndexMap, onPanelIndexMapChange]);

  // Reset selected roof when roofs change (e.g. roof deleted) so we never point
  // at a stale ID.
  useEffect(() => {
    if (selectedRoofId !== "all" && !roofs.some((r) => r.id === selectedRoofId)) {
      setSelectedRoofId("all");
    }
  }, [roofs, selectedRoofId]);

  // ── React to canvas panel tap: auto-expand table and scroll to the row ───
  useEffect(() => {
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];
    const obj = document.objects.find((o) => o.id === id);
    if (obj?.type !== "solarPanel") return;
    // Auto-open Panel Details so the row is visible
    setShowPanelBreakdown(true);
    // Give React a tick to render the rows before scrolling
    requestAnimationFrame(() => {
      tableRowRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [selectedIds, document.objects]);

  // ── Sync flux cache from solarExposure when the heatmap layer is ready ──────
  useEffect(() => {
    if (
      solarExposure?.status === "ready" &&
      solarExposure.annualFlux &&
      solarExposure.transform &&
      projectId
    ) {
      setFluxCache(projectId, solarExposure.annualFlux, solarExposure.transform);
    }
  }, [solarExposure, projectId]);

  // ── Background flux loader (last-resort only) ─────────────────────────────
  useEffect(() => {
    if (loadAttemptedRef.current) return;
    if (!projectId || !workspaceId || !mapCapture) return;
    if (solarExposure?.status === "ready") return;
    if (hasFluxCache(projectId)) return;

    loadAttemptedRef.current = true;
    setFluxLoading(true);

    import("../../services/googleSolar")
      .then(({ loadFluxOnly }) =>
        loadFluxOnly({ workspaceId, projectId, mapCapture, googleApiKey, registration: solarRegistration })
      )
      .finally(() => setFluxLoading(false));
  }, [projectId, workspaceId, mapCapture, googleApiKey, solarRegistration, solarExposure?.status]);

  // Reset load attempt when project changes
  useEffect(() => {
    loadAttemptedRef.current = false;
  }, [projectId]);

  // ── Scoped data: filter to the selected roof (or all roofs) ───────────────
  const activeRoofs = selectedRoofId === "all" ? roofs : roofs.filter((r) => r.id === selectedRoofId);
  const allPanelsOnRoofs = filterPanelsOnRoofs(allPanels, roofs);        // for empty-state checks
  const panels = filterPanelsOnRoofs(allPanels, activeRoofs);            // scoped to selection
  const visiblePanelCount = selectedRoofId === "all" ? allPanels.length : panels.length;

  // ── Effective solar exposure ───────────────────────────────────────────────
  const effectiveExposure =
    solarExposure?.status === "ready"
      ? solarExposure
      : projectId && mapCapture
        ? buildExposureFromCache(projectId, mapCapture, solarRegistration)
        : undefined;

  const exposureForSampling = effectiveExposure as ProjectSolarDataState | undefined;
  const annualFluxByPanelId = buildPanelAnnualFluxMap(panels, activeRoofs, exposureForSampling);
  const annualFluxByRoofId = buildRoofAnnualFluxMap(activeRoofs, exposureForSampling);

  // ── Empty states ──────────────────────────────────────────────────────────
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

  if (allPanelsOnRoofs.length === 0) {
    return (
      <aside className="properties-panel analysis-panel">
        <section className="panel-section">
          <h2>Energy Analysis</h2>
          <p className="info-message">
            {allPanels.length} panel{allPanels.length === 1 ? "" : "s"} drawn, but none are fully inside the usable roof area. Move panels inside the roof and setback line to view energy generation estimates.
          </p>
        </section>
      </aside>
    );
  }

  // ── Calculations ──────────────────────────────────────────────────────────
  const results = calculateAllPeriods({
    panels, roofs: activeRoofs, averageRadiance, annualFluxByPanelId, annualFluxByRoofId,
    temperatureCorrectionFactor: 0.95, sunlightHours, electricityRate
  });

  const current = results[selectedPeriod];
  const costEstimate = calculateSystemCostEstimate(current.totalCapacity, results.year.estimatedRevenue, costPerWatt);

  const panelFluxEntries: Array<{ panel: SolarPanelObject; entry: PanelFluxEntry }> = panels
    .filter((p) => annualFluxByPanelId?.[p.id])
    .map((p) => ({ panel: p, entry: annualFluxByPanelId![p.id] }));

  const fluxValues = panelFluxEntries.map((e) => e.entry.flux);
  const avgFlux = fluxValues.length > 0 ? fluxValues.reduce((a, b) => a + b, 0) / fluxValues.length : 0;
  const bestEntry = panelFluxEntries.length > 0 ? panelFluxEntries.reduce((a, b) => (a.entry.flux > b.entry.flux ? a : b)) : null;
  const worstEntry = panelFluxEntries.length > 0 ? panelFluxEntries.reduce((a, b) => (a.entry.flux < b.entry.flux ? a : b)) : null;

  // Per-panel annual kWh map — used for savings % share column
  const panelAnnualKwhMap: Record<string, number> = {};
  for (const { panel, entry } of panelFluxEntries) {
    panelAnnualKwhMap[panel.id] = (panel.wattage / 1000) * entry.flux * 0.95;
  }
  const totalAnnualKwh = Object.values(panelAnnualKwhMap).reduce((a, b) => a + b, 0);

  // CO₂ offset — India grid emission factor 0.82 kg CO₂/kWh (CEA 2023)
  const co2AnnualKg = Math.round(results.year.totalEnergyKwh * 0.82);
  const co2LifetimeT = ((results.year.totalEnergyKwh * 0.82 * 25) / 1000).toFixed(1);

  // Panels that should be relocated: flux < 60% of average (stricter than weak threshold)
  const relocatePanelIds = new Set(
    panelFluxEntries
      .filter(({ entry }) => avgFlux > 0 && entry.flux < avgFlux * 0.6)
      .map(({ panel }) => panel.id)
  );

  // Roof area for the selected scope
  const selectedRoof = selectedRoofId !== "all" ? roofs.find((r) => r.id === selectedRoofId) : null;

  // ── Focused panel (from canvas tap) ───────────────────────────────────────
  const focusedPanelId = selectedIds.length === 1
    ? (() => { const o = document.objects.find((x) => x.id === selectedIds[0]); return o?.type === "solarPanel" ? o.id : null; })()
    : null;
  const focusedPanelEntry = focusedPanelId ? panelFluxEntries.find((e) => e.panel.id === focusedPanelId) : null;
  const focusedAnnualKwh  = focusedPanelId ? (panelAnnualKwhMap[focusedPanelId] ?? 0) : 0;
  const focusedBadgeNum   = focusedPanelId ? panelIndexMap[focusedPanelId] : undefined;

  return (
    <aside className="properties-panel analysis-panel">
      <section className="panel-section">
        <h2>Energy Analysis</h2>
        <p className="fine-print">
          Projections use {current.panelCount} production-ready panel{current.panelCount === 1 ? "" : "s"}
          {current.panelCount !== visiblePanelCount ? ` out of ${visiblePanelCount} total drawn` : ""} and {current.dataSource === "solar-api" ? "Google Solar annual flux" : "dummy weather data"}.
        </p>
        <DataSourceBadge confidence={current.fluxConfidence} loading={fluxLoading} />
      </section>

      {/* ── Focused panel card (shown when a panel is tapped on the canvas) ── */}
      {focusedPanelId && (
        <section className="panel-section focused-panel-card">
          <div className="focused-panel-header">
            <span className="focused-panel-title">
              {focusedBadgeNum !== undefined ? `Panel P${focusedBadgeNum}` : "Selected Panel"}
            </span>
            <button className="focused-panel-dismiss" onClick={() => clearSelection()} title="Deselect panel">✕</button>
          </div>
          {focusedPanelEntry ? (
            <div className="focused-panel-stats">
              <div className="focused-panel-stat">
                <span className="fp-val">{focusedPanelEntry.entry.flux.toLocaleString()}</span>
                <span className="fp-lbl">kWh/kW/yr flux</span>
              </div>
              <div className="focused-panel-stat">
                <span className="fp-val">{Math.round(focusedAnnualKwh).toLocaleString()}</span>
                <span className="fp-lbl">kWh/year output</span>
              </div>
              <div className="focused-panel-stat">
                <span className="fp-val">{formatCurrency(Math.round(focusedAnnualKwh * electricityRate))}</span>
                <span className="fp-lbl">savings/year</span>
              </div>
              <div className="focused-panel-stat">
                <span className="fp-val">{totalAnnualKwh > 0 ? ((focusedAnnualKwh / totalAnnualKwh) * 100).toFixed(1) : "—"}%</span>
                <span className="fp-lbl">of system total</span>
              </div>
              <div className="focused-panel-method">
                <span className={`flux-method flux-method-${focusedPanelEntry.entry.method.replace("-", "")}`}>{focusedPanelEntry.entry.method}</span>
                {relocatePanelIds.has(focusedPanelId) && (
                  <span className="relocate-banner" style={{ marginTop: 6 }}>⚠ Low output — consider relocating this panel</span>
                )}
              </div>
            </div>
          ) : (
            <p className="fine-print" style={{ marginTop: 6 }}>No solar flux data for this panel yet. Load solar data first.</p>
          )}
        </section>
      )}

      {/* ── Roof selector (only shown when there are 2+ roofs) ───────────── */}
      {roofs.length > 1 && (
        <section className="panel-section">
          <h3><Layers size={12} style={{ verticalAlign: "-1px" }} /> Roof Scope</h3>
          <div className="roof-selector">
            <button
              className={`roof-tab ${selectedRoofId === "all" ? "active" : ""}`}
              onClick={() => setSelectedRoofId("all")}
              title="Show all roofs combined"
            >
              All Roofs
            </button>
            {roofs.map((roof, i) => (
              <button
                key={roof.id}
                className={`roof-tab ${selectedRoofId === roof.id ? "active" : ""}`}
                onClick={() => setSelectedRoofId(roof.id)}
                title={`Filter to ${roofLabel(roof, i)} only`}
              >
                {roofLabel(roof, i)}
              </button>
            ))}
          </div>
          {selectedRoof && (
            <p className="fine-print">
              {panels.length} panel{panels.length === 1 ? "" : "s"} on this roof
              {selectedRoof.name ? ` — ${selectedRoof.name}` : ""}
              {" "}· {selectedRoof.tilt}° tilt · {selectedRoof.azimuth}° azimuth
            </p>
          )}
          {selectedRoofId === "all" && (
            <p className="fine-print">{panels.length} panel{panels.length === 1 ? "" : "s"} across {roofs.length} roofs</p>
          )}
        </section>
      )}

      {/* Single-roof summary line */}
      {roofs.length === 1 && (
        <section className="panel-section">
          <p className="fine-print">
            {panels.length} panel{panels.length === 1 ? "" : "s"} · {roofs[0].tilt}° tilt · {roofs[0].azimuth}° azimuth
          </p>
        </section>
      )}

      {/* ── No panels on this specific roof ──────────────────────────────── */}
      {panels.length === 0 && selectedRoofId !== "all" && (
        <section className="panel-section">
          <p className="info-message">No panels placed on this roof yet.</p>
        </section>
      )}

      {panels.length > 0 && (
        <>
          {bestEntry && worstEntry && bestEntry.panel.id !== worstEntry.panel.id && (
            <section className="panel-section">
              <div className="flux-callout">
                <span className="flux-callout-best">⚡ Best: {bestEntry.entry.flux.toLocaleString()} kWh/kW/yr</span>
                <span className="flux-callout-worst">
                  ⚠ Weakest: {worstEntry.entry.flux.toLocaleString()} kWh/kW/yr
                  {bestEntry.entry.flux > 0 && ` (${Math.round(((worstEntry.entry.flux - bestEntry.entry.flux) / bestEntry.entry.flux) * 100)}%)`}
                </span>
              </div>
            </section>
          )}

          <section className="panel-section">
            <h3>Time Period</h3>
            <div className="period-selector">
              {PERIODS.map((period) => (
                <button key={period} className={`period-btn ${selectedPeriod === period ? "active" : ""}`} onClick={() => setSelectedPeriod(period)}>
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <h3>System Overview</h3>
            <Stat icon={<Zap />} label="Total Capacity" value={`${current.totalCapacity} kWp`} />
            <Stat icon={<Gauge />} label="Panel Count" value={visiblePanelCount} />
            {current.panelCount !== visiblePanelCount && <Stat label="Used in Production" value={current.panelCount} />}
            <Stat icon={<TrendingUp />} label="System Efficiency" value={`${current.efficiency}%`} />
            <Stat icon={<Sun />} label="Peak Sun Hours" value={`${current.dailyPeakSunHours} h/day`} />
            {current.averageAnnualFlux && <Stat label="Annual Solar Flux" value={`${current.averageAnnualFlux.toLocaleString()} kWh/kW/yr`} />}
          </section>

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

          {/* ── CO₂ Offset card ─────────────────────────────────────────── */}
          {co2AnnualKg > 0 && (
            <section className="panel-section">
              <h3>🌱 Carbon Offset</h3>
              <div className="co2-card">
                <div className="co2-stat">
                  <span className="co2-value">{co2AnnualKg.toLocaleString()}</span>
                  <span className="co2-unit">kg CO₂/year</span>
                </div>
                <div className="co2-stat">
                  <span className="co2-value">{co2LifetimeT}</span>
                  <span className="co2-unit">tonnes over 25 yrs</span>
                </div>
              </div>
              <p className="fine-print">Based on India grid factor 0.82 kg CO₂/kWh (CEA 2023)</p>
            </section>
          )}

          {panelFluxEntries.length > 0 && (
            <section className="panel-section">
              <button className="collapsible-header" onClick={() => setShowPanelBreakdown((v) => !v)} aria-expanded={showPanelBreakdown}>
                <h3>Panel Details</h3>
                {showPanelBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {/* Relocate suggestion banner */}
              {relocatePanelIds.size > 0 && (
                <div className="relocate-banner">
                  ⚠ {relocatePanelIds.size} panel{relocatePanelIds.size > 1 ? "s are" : " is"} generating less than 60% of average output.
                  Consider repositioning {relocatePanelIds.size > 1 ? "them" : "it"} away from shaded areas.
                </div>
              )}

              {showPanelBreakdown && (
                <div className="comparison-table panel-detail-table">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Flux<br /><em>kWh/kW/yr</em></th>
                        <th>Output/yr<br /><em>kWh</em></th>
                        <th>Savings/yr<br /><em>₹</em></th>
                        <th>Share<br /><em>%</em></th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...panelFluxEntries].sort((a, b) => b.entry.flux - a.entry.flux).map(({ panel, entry }) => {
                        const annualKwh = panelAnnualKwhMap[panel.id] ?? 0;
                        const annualSavings = annualKwh * electricityRate;
                        const sharePercent = totalAnnualKwh > 0 ? ((annualKwh / totalAnnualKwh) * 100).toFixed(1) : "—";
                        const isWeak = avgFlux > 0 && entry.flux < avgFlux * 0.7;
                        const shouldRelocate = relocatePanelIds.has(panel.id);
                        const badgeNum = panelIndexMap[panel.id];
                        const isFocused = panel.id === focusedPanelId;
                        return (
                          <tr
                            key={panel.id}
                            ref={(el) => { tableRowRefs.current[panel.id] = el; }}
                            className={`panel-detail-row ${isFocused ? "panel-row-focused" : shouldRelocate ? "flux-row-relocate" : isWeak ? "flux-row-weak" : ""}`}
                            title="Click to locate this panel on the canvas"
                            onClick={() => selectOnly(panel.id)}
                            onMouseEnter={() => onHighlightedPanelChange?.(panel.id)}
                            onMouseLeave={() => onHighlightedPanelChange?.(null)}
                          >
                            <td>
                              {badgeNum !== undefined
                                ? <span className="panel-badge-num">P{badgeNum}</span>
                                : "—"}
                              {shouldRelocate && <span className="relocate-dot" title="Relocate suggested">●</span>}
                            </td>
                            <td>{entry.flux.toLocaleString()}{isWeak && " ⚠"}</td>
                            <td>{Math.round(annualKwh).toLocaleString()}</td>
                            <td>{formatCurrency(Math.round(annualSavings))}</td>
                            <td>{sharePercent}%</td>
                            <td><span className={`flux-method flux-method-${entry.method.replace("-", "")}`}>{entry.method}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {panelFluxEntries.length > 1 && (
                      <tfoot>
                        <tr className="panel-detail-total">
                          <td colSpan={2}>Total</td>
                          <td>{Math.round(totalAnnualKwh).toLocaleString()} kWh</td>
                          <td>{formatCurrency(Math.round(totalAnnualKwh * electricityRate))}</td>
                          <td>100%</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </section>
          )}

          <section className="panel-section">
            <h3>Cost vs Savings</h3>
            <div className="finance-compare">
              <div><IndianRupee size={18} /><span>System cost</span><strong>{formatCurrency(costEstimate.systemCost)}</strong></div>
              <div><TrendingUp size={18} /><span>{selectedPeriod} savings</span><strong>{formatCurrency(current.estimatedRevenue)}</strong></div>
            </div>
            <Stat label="Annual Savings" value={formatCurrency(costEstimate.annualSavings)} />
            <Stat label="Payback Estimate" value={costEstimate.paybackYears === null ? "N/A" : `${costEstimate.paybackYears} years`} />
            <Stat label="First Year Net" value={formatCurrency(costEstimate.firstYearNet)} />
          </section>

          <section className="panel-section">
            <h3>Period Comparison</h3>
            <div className="comparison-table">
              <table>
                <thead><tr><th>Period</th><th>Energy (kWh)</th><th>Savings</th></tr></thead>
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

          <section className="panel-section">
            <h3><SlidersHorizontal size={12} style={{ verticalAlign: "-1px" }} /> Assumptions</h3>
            <NumberField label="Rate" value={electricityRate} suffix={ELECTRICITY_RATE_UNIT} min={0} step={0.01} onChange={setElectricityRate} />
            {current.dataSource === "assumption" && (
              <>
                <NumberField label="Irradiance" value={averageRadiance} suffix="W/m²" min={0} step={10} onChange={setAverageRadiance} />
                <NumberField label="Sunlight" value={sunlightHours} suffix="h/day" min={0} step={0.5} onChange={setSunlightHours} />
              </>
            )}
            <NumberField label="Install cost" value={costPerWatt} suffix={INSTALL_COST_UNIT} min={0} step={0.05} onChange={setCostPerWatt} />
          </section>

          <section className="panel-section compact">
            <h3>Notes</h3>
            <ul className="notes-list">
              <li>{current.dataSource === "solar-api" ? "Energy = Capacity × real annual solar flux × temperature factor" : "Energy = Capacity × Peak Sun Hours × Performance Ratio"}</li>
              <li>Temperature loss factor: 95%</li>
              <li>{current.dataSource === "solar-api" ? "Per-panel flux from Google Solar API — pixel-accurate, accounts for shading" : "Irradiance and sunlight hours are configurable estimates"}</li>
              <li>Rate: configurable (default INR 8/kWh)</li>
            </ul>
          </section>
        </>
      )}
    </aside>
  );
}

function DataSourceBadge({ confidence, loading }: { confidence: string; loading: boolean }) {
  if (loading) return <div className="data-source-badge data-source-loading"><Loader2 size={12} className="spin" /> Loading real solar data…</div>;
  if (confidence === "high") return <div className="data-source-badge data-source-high">🟢 Real Solar Data — per-panel pixel accuracy</div>;
  if (confidence === "medium") return <div className="data-source-badge data-source-medium">🟡 Partial Solar Data — some panels used center-point sampling</div>;
  if (confidence === "low") return <div className="data-source-badge data-source-low">🟠 Low Confidence — some panels used roof-average fallback</div>;
  return <div className="data-source-badge data-source-none">🔴 Estimated Data — no location-specific solar data available</div>;
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

function NumberField({ label, value, suffix, min, step, onChange }: {
  label: string; value: number; suffix?: string; min?: number; step?: number; onChange: (value: number) => void;
}) {
  return (
    <label className="field number-field">
      <span>{label}</span>
      <div>
        <input type="number" min={min} step={step} value={value} onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed) && (min === undefined || parsed >= min)) onChange(parsed);
        }} />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}
