import type Konva from "konva";
import { jsPDF } from "jspdf";
import { calculateArrayStats } from "../cad/array/array";
import { calculateAllPeriods, calculateSystemCostEstimate, filterPanelsOnRoofs, type EnergyGenerationResult } from "../cad/energy/energyCalculator";
import { DEFAULT_ELECTRICITY_RATE_INR, CURRENCY_CODE, formatCurrency } from "../cad/finance/currency";
import { distance, findContainingRoof, formatFeetInches, midpoint, polygonArea } from "../cad/geometry/geometry";
import { buildPanelAnnualFluxMap, buildRoofAnnualFluxMap } from "../cad/solar/solarAnalysis";
import { getRoofFluxStatistics } from "../cad/solar/solarStatistics";
import { googleStaticMapUrl } from "../services/googleMaps";
import type { MapCaptureSettings, RoofObject, RufsunCadDocument, SolarPanelObject } from "../types/cad";
import type { ProjectSolarDataState } from "../cad/solar/solarExposureTypes";

interface ExportProjectReportParams {
  document: RufsunCadDocument;
  stage?: Konva.Stage | null;
  solarExposure?: ProjectSolarDataState;
}

interface ReportContext {
  document: RufsunCadDocument;
  panels: SolarPanelObject[];
  installedPanels: SolarPanelObject[];
  roofs: RoofObject[];
  mapCapture?: MapCaptureSettings;
  layoutImage: string;
  mapImage: string;
  exposureImage: string;
  productionChart: string;
  financeChart: string;
  energy: Record<"today" | "week" | "month" | "year", EnergyGenerationResult>;
  costEstimate: ReturnType<typeof calculateSystemCostEstimate>;
  solarExposure?: ProjectSolarDataState;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const GREEN = "#16855f";
const DARK = "#17212b";
const MUTED = "#64748b";
const LINE = "#d9e2e7";
const PANEL = "#f7faf9";
const REPORT_IMAGE_W = 900;
const REPORT_IMAGE_H = 558;
const CHART_W = 900;
const CHART_H = 380;
const JPEG_QUALITY = 0.72;

export async function exportProjectReportPdf(params: ExportProjectReportParams) {
  const context = await buildReportContext(params);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setProperties({
    title: `${context.document.name} Solar Design Report`,
    subject: "RufsunCAD solar proposal and technical design report",
    author: "RufsunCAD"
  });

  drawCover(pdf, context);
  addPage(pdf, 2, "Site And Map");
  drawSitePage(pdf, context);
  addPage(pdf, 3, "System Design");
  drawDesignPage(pdf, context);
  addPage(pdf, 4, "Annual Solar Exposure");
  drawExposurePage(pdf, context);
  addPage(pdf, 5, "Energy Production");
  drawEnergyPage(pdf, context);
  addPage(pdf, 6, "Financial Analysis");
  drawFinancePage(pdf, context);
  addPage(pdf, 7, "Technical Appendix");
  drawAppendixPage(pdf, context);

  pdf.save(`${safeFilename(context.document.name)}-solar-report.pdf`);
}

async function buildReportContext({ document, stage, solarExposure }: ExportProjectReportParams): Promise<ReportContext> {
  const panels = document.objects.filter((object): object is SolarPanelObject => object.type === "solarPanel");
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
  const installedPanels = filterPanelsOnRoofs(panels, roofs);
  const annualFluxByPanelId = buildPanelAnnualFluxMap(installedPanels, roofs, solarExposure);
  const annualFluxByRoofId = buildRoofAnnualFluxMap(roofs, solarExposure);
  const energy = calculateAllPeriods({
    panels,
    roofs,
    averageRadiance: 800,
    annualFluxByPanelId,
    annualFluxByRoofId,
    temperatureCorrectionFactor: 0.95,
    sunlightHours: 6,
    electricityRate: DEFAULT_ELECTRICITY_RATE_INR
  });
  const costEstimate = calculateSystemCostEstimate(energy.year.totalCapacity, energy.year.estimatedRevenue);
  const layoutImage = captureObjectLayer(stage) ?? createLayoutPlaceholder(document);
  const mapImage = await loadMapImage(document.mapCapture).catch(() => createMapPlaceholder(document.mapCapture));
  const exposureImage = await createExposureImage(document, roofs, solarExposure, mapImage);
  const productionChart = createProductionChart(energy);
  const financeChart = createFinanceChart(costEstimate);

  return {
    document,
    panels,
    installedPanels,
    roofs,
    mapCapture: document.mapCapture,
    layoutImage,
    mapImage,
    exposureImage,
    productionChart,
    financeChart,
    energy,
    costEstimate,
    solarExposure
  };
}

function drawCover(pdf: jsPDF, context: ReportContext) {
  drawFullBleedHeader(pdf);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("Solar Design Report", MARGIN, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Prepared with RufsunCAD", MARGIN, 40);

  pdf.setTextColor(23, 33, 43);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(context.document.customerName || context.document.name, MARGIN, 67);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  wrapText(pdf, context.document.customerAddress || "Project address not provided", MARGIN, 75, 118, 4.5);
  pdf.text(`Report date: ${new Date().toLocaleDateString()}`, MARGIN, 88);

  addImageCard(pdf, context.layoutImage, MARGIN, 103, 182, 95, "Roof, panel, and map layout");

  const stats = calculateArrayStats(context.panels);
  drawMetricCard(pdf, MARGIN, 215, 42, "System size", `${stats.totalKwp.toFixed(2)} kWp`);
  drawMetricCard(pdf, 60, 215, 42, "Modules", String(context.panels.length));
  drawMetricCard(pdf, 106, 215, 42, "Annual energy", `${context.energy.year.totalEnergyKwh.toLocaleString()} kWh`);
  drawMetricCard(pdf, 152, 215, 42, "Annual savings", formatCurrency(context.energy.year.estimatedRevenue));

  drawSectionTitle(pdf, MARGIN, 250, "Executive Summary");
  const source = context.energy.year.dataSource === "solar-api" ? "Google Solar annual flux data" : "manual irradiance assumptions";
  paragraph(
    pdf,
    `This report summarizes the proposed rooftop solar layout, roof geometry, annual solar exposure, expected energy production, and financial estimate. Calculations use ${source}, panel capacity, roof placement, and a 95% temperature performance factor.`,
    MARGIN,
    259,
    182,
    4.8
  );
  drawFooter(pdf, 1);
}

function drawSitePage(pdf: jsPDF, context: ReportContext) {
  addImageCard(pdf, context.mapImage, MARGIN, 35, 182, 118, "Site map");
  drawSectionTitle(pdf, MARGIN, 170, "Site Information");
  drawTwoColumnTable(pdf, MARGIN, 181, [
    ["Customer", context.document.customerName || "-"],
    ["Address", context.document.customerAddress || "-"],
    ["Latitude", context.mapCapture ? context.mapCapture.latitude.toFixed(6) : "-"],
    ["Longitude", context.mapCapture ? context.mapCapture.longitude.toFixed(6) : "-"],
    ["Map zoom", context.mapCapture ? String(context.mapCapture.zoom) : "-"],
    ["Captured area", context.mapCapture ? `${context.mapCapture.widthM.toFixed(1)} m x ${context.mapCapture.heightM.toFixed(1)} m` : "-"]
  ]);
  drawSectionTitle(pdf, MARGIN, 226, "Site Notes");
  paragraph(
    pdf,
    "The map image is used as the base visual reference for roof tracing and panel layout. Roof measurements and panel placement remain based on the CAD drawing scale and project coordinates stored in the document.",
    MARGIN,
    235,
    182,
    4.8
  );
  drawFooter(pdf, 2);
}

function drawDesignPage(pdf: jsPDF, context: ReportContext) {
  addImageCard(pdf, context.layoutImage, MARGIN, 35, 182, 118, "Roof with proposed panel layout");
  const stats = calculateArrayStats(context.panels);
  drawSectionTitle(pdf, MARGIN, 170, "System Overview");
  drawTwoColumnTable(pdf, MARGIN, 181, [
    ["Total modules", String(context.panels.length)],
    ["Panels inside roof", String(context.installedPanels.length)],
    ["DC capacity", `${stats.totalKwp.toFixed(2)} kWp`],
    ["Module footprint", `${(stats.width / 1000).toFixed(2)} m x ${(stats.height / 1000).toFixed(2)} m`],
    ["Roof count", String(context.roofs.length)],
    ["Total roof area", `${totalRoofArea(context.roofs).toFixed(1)} m2`]
  ]);
  drawSectionTitle(pdf, MARGIN, 226, "Roof Summary");
  drawSimpleTable(
    pdf,
    MARGIN,
    236,
    ["Roof", "Area", "Azimuth", "Tilt"],
    context.roofs.map((roof, index) => [
      roof.name || `Roof ${index + 1}`,
      `${(polygonArea(roof.points) / 1_000_000).toFixed(1)} m2`,
      `${roof.azimuth} deg`,
      `${roof.tilt} deg`
    ]),
    [58, 38, 38, 38]
  );
  drawFooter(pdf, 3);
}

function drawExposurePage(pdf: jsPDF, context: ReportContext) {
  addImageCard(pdf, context.exposureImage, MARGIN, 35, 182, 112, "Annual solar exposure");
  drawExposureLegend(pdf, MARGIN, 155, context);
  drawSectionTitle(pdf, MARGIN, 180, "Roof Irradiance Statistics");
  const rows = context.roofs.map((roof, index) => {
    const stats =
      context.solarExposure?.status === "ready" && context.solarExposure.annualFlux && context.solarExposure.transform
        ? getRoofFluxStatistics(roof, context.solarExposure.annualFlux, context.solarExposure.transform)
        : null;
    return [
      roof.name || `Roof ${index + 1}`,
      stats ? `${stats.average.toLocaleString()} kWh/kW/yr` : "-",
      stats ? `${stats.min.toLocaleString()} - ${stats.max.toLocaleString()}` : "-",
      stats ? String(stats.samples) : "-"
    ];
  });
  drawSimpleTable(pdf, MARGIN, 191, ["Roof", "Average annual flux", "Range", "Samples"], rows, [42, 58, 48, 24]);
  drawSectionTitle(pdf, MARGIN, 246, "Exposure Method");
  paragraph(
    pdf,
    context.solarExposure?.status === "ready"
      ? "Annual flux GeoTIFF data from Google Solar API is decoded, georeferenced to the project map, clipped to roof polygons, and sampled inside each roof shape."
      : "Solar API annual flux has not been loaded for this project. Exposure visuals and calculations fall back to the available CAD layout and default assumptions.",
    MARGIN,
    255,
    182,
    4.8
  );
  drawFooter(pdf, 4);
}

function drawEnergyPage(pdf: jsPDF, context: ReportContext) {
  pdf.addImage(context.productionChart, imageFormat(context.productionChart), MARGIN, 35, 182, 76, undefined, "FAST");
  drawSectionTitle(pdf, MARGIN, 126, "Production Forecast");
  drawSimpleTable(
    pdf,
    MARGIN,
    137,
    ["Period", "Energy", "Savings", "Daily avg", "Source"],
    [
      ["Today", `${context.energy.today.totalEnergyKwh} kWh`, formatCurrency(context.energy.today.estimatedRevenue), `${context.energy.today.averageDailyGeneration} kWh`, sourceLabel(context.energy.today)],
      ["Week", `${context.energy.week.totalEnergyKwh} kWh`, formatCurrency(context.energy.week.estimatedRevenue), `${context.energy.week.averageDailyGeneration} kWh`, sourceLabel(context.energy.week)],
      ["Month", `${context.energy.month.totalEnergyKwh} kWh`, formatCurrency(context.energy.month.estimatedRevenue), `${context.energy.month.averageDailyGeneration} kWh`, sourceLabel(context.energy.month)],
      ["Year", `${context.energy.year.totalEnergyKwh} kWh`, formatCurrency(context.energy.year.estimatedRevenue), `${context.energy.year.averageDailyGeneration} kWh`, sourceLabel(context.energy.year)]
    ],
    [28, 38, 32, 38, 36]
  );
  drawSectionTitle(pdf, MARGIN, 204, "Calculation Basis");
  drawTwoColumnTable(pdf, MARGIN, 215, [
    ["Total capacity", `${context.energy.year.totalCapacity} kWp`],
    ["Performance ratio", `${context.energy.year.performanceRatio}%`],
    ["System efficiency", `${context.energy.year.efficiency}%`],
    ["Peak generation", `${context.energy.month.peakGeneration} kW`],
    ["Daily peak sun hours", `${context.energy.year.dailyPeakSunHours} h/day`],
    ["Annual solar flux", context.energy.year.averageAnnualFlux ? `${context.energy.year.averageAnnualFlux.toLocaleString()} kWh/kW/year` : "Not loaded"]
  ]);
  drawFooter(pdf, 5);
}

function drawFinancePage(pdf: jsPDF, context: ReportContext) {
  pdf.addImage(context.financeChart, imageFormat(context.financeChart), MARGIN, 35, 182, 76, undefined, "FAST");
  drawSectionTitle(pdf, MARGIN, 128, "Cost And Savings");
  drawMetricCard(pdf, MARGIN, 140, 42, "System cost", formatCurrency(context.costEstimate.systemCost));
  drawMetricCard(pdf, 60, 140, 42, "Annual savings", formatCurrency(context.costEstimate.annualSavings));
  drawMetricCard(pdf, 106, 140, 42, "Payback", context.costEstimate.paybackYears === null ? "N/A" : `${context.costEstimate.paybackYears} yr`);
  drawMetricCard(pdf, 152, 140, 42, "First year net", formatCurrency(context.costEstimate.firstYearNet));
  drawSectionTitle(pdf, MARGIN, 178, "Financial Details");
  drawTwoColumnTable(pdf, MARGIN, 189, [
    ["Cost per watt", `${formatCurrency(context.costEstimate.costPerWatt)}/W`],
    ["Installed capacity", `${context.energy.year.totalCapacity} kWp`],
    ["Estimated system cost", formatCurrency(context.costEstimate.systemCost)],
    ["Monthly savings", formatCurrency(context.energy.month.estimatedRevenue)],
    ["Annual savings", formatCurrency(context.energy.year.estimatedRevenue)],
    ["Payback estimate", context.costEstimate.paybackYears === null ? "N/A" : `${context.costEstimate.paybackYears} years`]
  ]);
  drawSectionTitle(pdf, MARGIN, 238, "Assumptions");
  paragraph(
    pdf,
    "Financial values are estimates for proposal comparison. Actual pricing, incentives, utility tariffs, taxes, permitting, interconnection costs, degradation, and site-specific installation conditions should be verified before contract approval.",
    MARGIN,
    247,
    182,
    4.8
  );
  drawFooter(pdf, 6);
}

function drawAppendixPage(pdf: jsPDF, context: ReportContext) {
  drawSectionTitle(pdf, MARGIN, 35, "Module Schedule");
  const moduleGroups = groupPanels(context.panels);
  drawSimpleTable(
    pdf,
    MARGIN,
    46,
    ["Module", "Qty", "Wattage", "Size"],
    moduleGroups.map((group) => [group.name, String(group.count), `${group.wattage} W`, `${group.width} x ${group.height} mm`]),
    [78, 22, 34, 38]
  );

  drawSectionTitle(pdf, MARGIN, 116, "Roof Geometry");
  drawSimpleTable(
    pdf,
    MARGIN,
    127,
    ["Roof", "Area", "Panel count", "Azimuth", "Tilt"],
    context.roofs.map((roof, index) => [
      roof.name || `Roof ${index + 1}`,
      `${(polygonArea(roof.points) / 1_000_000).toFixed(1)} m2`,
      String(context.installedPanels.filter((panel) => getPanelRoofId(panel, context.roofs) === roof.id).length),
      `${roof.azimuth} deg`,
      `${roof.tilt} deg`
    ]),
    [48, 32, 36, 28, 28]
  );

  drawSectionTitle(pdf, MARGIN, 198, "Data Quality");
  drawTwoColumnTable(pdf, MARGIN, 209, [
    ["Solar data status", context.solarExposure?.status || "not loaded"],
    ["Imagery quality", context.solarExposure?.dataLayers?.imageryQuality || "-"],
    ["Solar pixel size", context.solarExposure?.dataLayers ? `${context.solarExposure.dataLayers.pixelSizeMeters} m` : "-"],
    ["Solar radius", context.solarExposure?.dataLayers ? `${context.solarExposure.dataLayers.radiusMeters} m` : "-"],
    ["Loaded at", context.solarExposure?.loadedAt || "-"],
    ["Report generated", new Date().toLocaleString()]
  ]);
  drawFooter(pdf, 7);
}

function addPage(pdf: jsPDF, pageNumber: number, title: string) {
  pdf.addPage();
  drawHeader(pdf, title);
  drawFooter(pdf, pageNumber);
}

function drawHeader(pdf: jsPDF, title: string) {
  pdf.setFillColor(22, 133, 95);
  pdf.rect(0, 0, PAGE_W, 18, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text("RufsunCAD", MARGIN, 12);
  pdf.setFont("helvetica", "normal");
  pdf.text(title, PAGE_W - MARGIN, 12, { align: "right" });
}

function drawFullBleedHeader(pdf: jsPDF) {
  pdf.setFillColor(22, 133, 95);
  pdf.rect(0, 0, PAGE_W, 52, "F");
  pdf.setFillColor(242, 140, 40);
  pdf.rect(0, 50, PAGE_W, 2, "F");
}

function drawFooter(pdf: jsPDF, pageNumber: number) {
  pdf.setDrawColor(217, 226, 231);
  pdf.line(MARGIN, PAGE_H - 15, PAGE_W - MARGIN, PAGE_H - 15);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text("RufsunCAD solar design report", MARGIN, PAGE_H - 9);
  pdf.text(`Page ${pageNumber} of 7`, PAGE_W - MARGIN, PAGE_H - 9, { align: "right" });
}

function drawSectionTitle(pdf: jsPDF, x: number, y: number, title: string) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(22, 33, 43);
  pdf.text(title, x, y);
  pdf.setDrawColor(22, 133, 95);
  pdf.setLineWidth(0.6);
  pdf.line(x, y + 3, x + 22, y + 3);
}

function drawMetricCard(pdf: jsPDF, x: number, y: number, width: number, label: string, value: string) {
  pdf.setFillColor(247, 250, 249);
  pdf.setDrawColor(217, 226, 231);
  pdf.roundedRect(x, y, width, 22, 2, 2, "FD");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text(label, x + 4, y + 7);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(23, 33, 43);
  pdf.text(fitText(value, 18), x + 4, y + 16);
}

function addImageCard(pdf: jsPDF, image: string, x: number, y: number, width: number, height: number, caption: string) {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(217, 226, 231);
  pdf.roundedRect(x, y, width, height, 3, 3, "FD");
  pdf.addImage(image, imageFormat(image), x + 3, y + 3, width - 6, height - 12, undefined, "FAST");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text(caption, x + 4, y + height - 4);
}

function drawTwoColumnTable(pdf: jsPDF, x: number, y: number, rows: Array<[string, string]>) {
  rows.forEach(([label, value], index) => {
    const rowY = y + index * 7;
    if (index % 2 === 0) {
      pdf.setFillColor(247, 250, 249);
      pdf.rect(x, rowY - 4.7, 182, 6.8, "F");
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, x + 3, rowY);
    pdf.setTextColor(23, 33, 43);
    pdf.text(fitText(value, 80), x + 78, rowY);
  });
}

function drawSimpleTable(pdf: jsPDF, x: number, y: number, headers: string[], rows: string[][], widths: number[]) {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  pdf.setFillColor(22, 133, 95);
  pdf.rect(x, y - 5, totalWidth, 8, "F");
  let cursor = x;
  headers.forEach((header, index) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(255, 255, 255);
    pdf.text(header, cursor + 2, y);
    cursor += widths[index];
  });

  if (rows.length === 0) {
    rows = [["No data available", "", "", "", ""].slice(0, headers.length)];
  }

  rows.slice(0, 10).forEach((row, rowIndex) => {
    const rowY = y + 8 + rowIndex * 8;
    if (rowIndex % 2 === 0) {
      pdf.setFillColor(247, 250, 249);
      pdf.rect(x, rowY - 5, totalWidth, 8, "F");
    }
    cursor = x;
    row.forEach((cell, cellIndex) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(23, 33, 43);
      pdf.text(fitText(cell || "-", Math.max(8, widths[cellIndex] - 4)), cursor + 2, rowY);
      cursor += widths[cellIndex];
    });
  });
}

function drawExposureLegend(pdf: jsPDF, x: number, y: number, context: ReportContext) {
  const colors = ["#0c1b91", "#0063ff", "#00beff", "#00cd52", "#ffe600", "#ff7b00", "#e60000"];
  const swatchWidth = 182 / colors.length;
  colors.forEach((color, index) => {
    pdf.setFillColor(color);
    pdf.rect(x + index * swatchWidth, y, swatchWidth, 8, "F");
  });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Lower annual exposure", x, y + 14);
  pdf.text("Higher annual exposure", x + 182, y + 14, { align: "right" });
  const raster = context.solarExposure?.annualFlux;
  if (raster) {
    pdf.text(`${Math.round(raster.min).toLocaleString()} to ${Math.round(raster.max).toLocaleString()} kWh/kW/year`, x + 91, y + 14, { align: "center" });
  }
}

function paragraph(pdf: jsPDF, text: string, x: number, y: number, width: number, lineHeight: number) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(71, 85, 105);
  wrapText(pdf, text, x, y, width, lineHeight);
}

function wrapText(pdf: jsPDF, text: string, x: number, y: number, width: number, lineHeight: number) {
  const lines = pdf.splitTextToSize(text, width) as string[];
  lines.forEach((line, index) => pdf.text(line, x, y + index * lineHeight));
}

function captureObjectLayer(stage?: Konva.Stage | null) {
  if (!stage) return null;
  const layers = stage.getLayers();
  const previousVisibility = layers.map((layer) => layer.visible());
  try {
    layers.forEach((layer, index) => layer.visible(index === 1));
    stage.batchDraw();
    return stage.toDataURL({ pixelRatio: 1, mimeType: "image/jpeg", quality: JPEG_QUALITY });
  } catch {
    return null;
  } finally {
    layers.forEach((layer, index) => layer.visible(previousVisibility[index]));
    stage.batchDraw();
  }
}

async function loadMapImage(mapCapture?: MapCaptureSettings) {
  const apiKey = localStorage.getItem("rufsun.googleMapsApiKey") ?? "";
  if (!mapCapture || !apiKey) return createMapPlaceholder(mapCapture);
  return loadImageAsDataUrl(googleStaticMapUrl(mapCapture, apiKey));
}

function loadImageAsDataUrl(src: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = window.document.createElement("canvas");
      canvas.width = image.naturalWidth || 900;
      canvas.height = image.naturalHeight || 520;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    image.onerror = () => reject(new Error("Map image unavailable"));
    image.src = src;
  });
}

function createMapPlaceholder(mapCapture?: MapCaptureSettings) {
  return createCanvasImage(REPORT_IMAGE_W, REPORT_IMAGE_H, (context, width, height) => {
    fillBackground(context, width, height);
    drawGridPattern(context, width, height);
    context.fillStyle = GREEN;
    context.font = "bold 34px Arial";
    context.fillText("Site Map", 48, 72);
    context.fillStyle = MUTED;
    context.font = "22px Arial";
    context.fillText(mapCapture ? `${mapCapture.latitude.toFixed(5)}, ${mapCapture.longitude.toFixed(5)}` : "Map capture not available", 48, 112);
    drawCompass(context, width - 110, 86);
  });
}

function createLayoutPlaceholder(document: RufsunCadDocument) {
  return createCanvasImage(REPORT_IMAGE_W, REPORT_IMAGE_H, (context, width, height) => {
    fillBackground(context, width, height);
    drawGridPattern(context, width, height);
    context.fillStyle = GREEN;
    context.font = "bold 34px Arial";
    context.fillText("Solar Layout", 48, 72);
    context.fillStyle = DARK;
    context.font = "22px Arial";
    context.fillText(document.name, 48, 112);
    context.strokeStyle = GREEN;
    context.lineWidth = 8;
    context.strokeRect(230, 170, 540, 270);
    context.fillStyle = "#1d4ed8";
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        context.fillRect(280 + col * 72, 215 + row * 58, 54, 40);
      }
    }
  });
}

async function createExposureImage(
  document: RufsunCadDocument,
  roofs: RoofObject[],
  solarExposure: ProjectSolarDataState | undefined,
  mapImage: string
) {
  if (roofs.length === 0) return createExposurePlaceholder("Draw a roof to generate the roof exposure visual.");
  if (solarExposure?.status !== "ready" || !solarExposure.heatmapCanvas || !solarExposure.transform) {
    return createExposurePlaceholder("Load Solar API data to show annual exposure inside the roof.");
  }

  const map = document.mapCapture;
  const mapWorld = map
    ? { x: 0, y: 0, width: map.widthM * 1000, height: map.heightM * 1000 }
    : worldBoundsFromRoofs(roofs, 8000);
  const crop = cropAroundRoofs(roofs, mapWorld, REPORT_IMAGE_W / REPORT_IMAGE_H);
  const baseImage = await loadHtmlImage(mapImage);
  const heatmap = solarExposure.heatmapCanvas;
  const transform = solarExposure.transform;

  return createCanvasImage(REPORT_IMAGE_W, REPORT_IMAGE_H, (context, width, height) => {
    const scaleX = width / crop.width;
    const scaleY = height / crop.height;
    const worldToCanvas = (x: number, y: number) => ({
      x: (x - crop.x) * scaleX,
      y: (y - crop.y) * scaleY
    });

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    if (map) {
      const sourceX = (crop.x / mapWorld.width) * baseImage.naturalWidth;
      const sourceY = (crop.y / mapWorld.height) * baseImage.naturalHeight;
      const sourceW = (crop.width / mapWorld.width) * baseImage.naturalWidth;
      const sourceH = (crop.height / mapWorld.height) * baseImage.naturalHeight;
      context.drawImage(baseImage, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);
    } else {
      fillBackground(context, width, height);
      drawGridPattern(context, width, height);
    }

    context.save();
    context.beginPath();
    roofs.forEach((roof) => {
      roof.points.forEach((point, index) => {
        const canvasPoint = worldToCanvas(point.x, point.y);
        if (index === 0) context.moveTo(canvasPoint.x, canvasPoint.y);
        else context.lineTo(canvasPoint.x, canvasPoint.y);
      });
      context.closePath();
    });
    context.clip();
    const heatmapRect = transform.rasterWorldRect;
    const heatmapTopLeft = worldToCanvas(heatmapRect.x, heatmapRect.y);
    context.drawImage(heatmap, heatmapTopLeft.x, heatmapTopLeft.y, heatmapRect.width * scaleX, heatmapRect.height * scaleY);
    context.restore();

    drawReportRoofOutlines(context, roofs, worldToCanvas, scaleX);
    drawReportRoofLabels(context, roofs, worldToCanvas);
  });
}

function createExposurePlaceholder(message = "Load Solar API data to replace this default exposure visual.") {
  return createCanvasImage(REPORT_IMAGE_W, REPORT_IMAGE_H, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    ["#0c1b91", "#0063ff", "#00beff", "#00cd52", "#ffe600", "#ff7b00", "#e60000"].forEach((color, index, colors) => {
      gradient.addColorStop(index / (colors.length - 1), color);
    });
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(255,255,255,0.92)";
    context.fillRect(44, 44, width - 88, 126);
    context.fillStyle = DARK;
    context.font = "bold 34px Arial";
    context.fillText("Annual Solar Exposure", 76, 94);
    context.fillStyle = MUTED;
    context.font = "22px Arial";
    context.fillText(message, 76, 134);
  });
}

function drawReportRoofOutlines(
  context: CanvasRenderingContext2D,
  roofs: RoofObject[],
  worldToCanvas: (x: number, y: number) => { x: number; y: number },
  scale: number
) {
  roofs.forEach((roof) => {
    const points = roof.points.map((point) => worldToCanvas(point.x, point.y));
    if (points.length < 3) return;
    context.save();
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.strokeStyle = "#00d084";
    context.lineWidth = Math.max(5, 7 * scale);
    context.stroke();
    context.setLineDash([5, 5]);
    context.strokeStyle = "#0086ff";
    context.lineWidth = Math.max(2, 3 * scale);
    context.stroke();
    context.restore();
  });
}

function drawReportRoofLabels(
  context: CanvasRenderingContext2D,
  roofs: RoofObject[],
  worldToCanvas: (x: number, y: number) => { x: number; y: number }
) {
  roofs.forEach((roof, roofIndex) => {
    const points = roof.points.map((point) => worldToCanvas(point.x, point.y));
    if (points.length < 3) return;
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    drawLabel(
      context,
      roof.name || `Roof ${roofIndex + 1}`,
      `Area: ${(polygonArea(roof.points) / 1_000_000).toFixed(1)} m2`,
      minX + 12,
      minY - 18,
      26
    );

    roof.points.forEach((point, index) => {
      const next = roof.points[(index + 1) % roof.points.length];
      const center = midpoint(point, next);
      const canvasCenter = worldToCanvas(center.x, center.y);
      const canvasStart = worldToCanvas(point.x, point.y);
      const canvasEnd = worldToCanvas(next.x, next.y);
      const labelPoint = offsetCanvasSegmentLabel(canvasStart, canvasEnd, canvasCenter, 24);
      drawLabel(context, formatFeetInches(distance(point, next)), "", labelPoint.x, labelPoint.y, 20);
    });
  });
}

function drawLabel(context: CanvasRenderingContext2D, primary: string, secondary: string, x: number, y: number, fontSize: number) {
  context.save();
  context.font = `700 ${fontSize}px Arial`;
  const text = secondary ? `${primary}  ${secondary}` : primary;
  const width = context.measureText(text).width + 18;
  const height = fontSize + 14;
  const left = Math.max(8, Math.min(REPORT_IMAGE_W - width - 8, x - width / 2));
  const top = Math.max(8, Math.min(REPORT_IMAGE_H - height - 8, y - height / 2));
  roundRect(context, left, top, width, height, 7);
  context.fillStyle = "rgba(255,255,255,0.95)";
  context.fill();
  context.strokeStyle = "rgba(20, 94, 71, 0.25)";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#155e47";
  context.fillText(text, left + 9, top + fontSize + 2);
  context.restore();
}

function offsetCanvasSegmentLabel(
  start: { x: number; y: number },
  end: { x: number; y: number },
  center: { x: number; y: number },
  offset: number
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return {
    x: center.x + (-dy / length) * offset,
    y: center.y + (dx / length) * offset
  };
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function createProductionChart(energy: ReportContext["energy"]) {
  const monthlyWeights = [0.065, 0.072, 0.085, 0.092, 0.098, 0.096, 0.094, 0.091, 0.085, 0.079, 0.069, 0.074];
  const totalWeight = monthlyWeights.reduce((sum, value) => sum + value, 0);
  const data = monthlyWeights.map((weight, index) => ({
    label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index],
    value: (energy.year.totalEnergyKwh * weight) / totalWeight
  }));
  return createCanvasImage(CHART_W, CHART_H, (context, width, height) => {
    fillBackground(context, width, height);
    context.fillStyle = DARK;
    context.font = "bold 28px Arial";
    context.fillText("Monthly Production Trend", 34, 50);
    drawLineChart(context, data, {
      x: 58,
      y: 78,
      width: width - 94,
      height: height - 132,
      lineColor: GREEN,
      fillColor: "rgba(22, 133, 95, 0.16)",
      valueSuffix: " kWh"
    });
  });
}

function createFinanceChart(cost: ReportContext["costEstimate"]) {
  const annualSavings = Math.max(0, cost.annualSavings);
  const data = Array.from({ length: 25 }, (_, index) => ({
    label: `Y${index + 1}`,
    value: annualSavings * (index + 1) - cost.systemCost
  }));
  return createCanvasImage(CHART_W, CHART_H, (context, width, height) => {
    fillBackground(context, width, height);
    context.fillStyle = DARK;
    context.font = "bold 28px Arial";
    context.fillText("Cumulative Cash Flow", 34, 50);
    drawLineChart(context, data, {
      x: 58,
      y: 78,
      width: width - 94,
      height: height - 132,
      lineColor: cost.paybackYears === null ? "#315b8f" : GREEN,
      fillColor: "rgba(49, 91, 143, 0.14)",
      valuePrefix: `${CURRENCY_CODE} `
    });
    if (cost.paybackYears !== null) {
      context.fillStyle = GREEN;
      context.font = "bold 18px Arial";
      context.fillText(`Estimated payback: ${cost.paybackYears} years`, 58, height - 34);
    }
  });
}

function cropAroundRoofs(roofs: RoofObject[], bounds: { x: number; y: number; width: number; height: number }, aspectRatio: number) {
  const roofBounds = worldBoundsFromRoofs(roofs, 9000);
  const centerX = roofBounds.x + roofBounds.width / 2;
  const centerY = roofBounds.y + roofBounds.height / 2;
  let width = Math.max(roofBounds.width, roofBounds.height * aspectRatio);
  let height = width / aspectRatio;
  if (height < roofBounds.height) {
    height = roofBounds.height;
    width = height * aspectRatio;
  }
  width = Math.min(bounds.width, width);
  height = Math.min(bounds.height, height);
  let x = centerX - width / 2;
  let y = centerY - height / 2;
  x = Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, x));
  y = Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, y));
  return { x, y, width, height };
}

function worldBoundsFromRoofs(roofs: RoofObject[], padding: number) {
  const points = roofs.flatMap((roof) => roof.points);
  if (points.length === 0) return { x: 0, y: 0, width: 100000, height: 62000 };
  const minX = Math.min(...points.map((point) => point.x)) - padding;
  const minY = Math.min(...points.map((point) => point.y)) - padding;
  const maxX = Math.max(...points.map((point) => point.x)) + padding;
  const maxY = Math.max(...points.map((point) => point.y)) + padding;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function loadHtmlImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Report image unavailable"));
    image.src = src;
  });
}

function drawLineChart(
  context: CanvasRenderingContext2D,
  data: Array<{ label: string; value: number }>,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    lineColor: string;
    fillColor: string;
    valuePrefix?: string;
    valueSuffix?: string;
  }
) {
  const minValue = Math.min(0, ...data.map((item) => item.value));
  const maxValue = Math.max(1, ...data.map((item) => item.value));
  const range = Math.max(1, maxValue - minValue);
  const xFor = (index: number) => options.x + (index / Math.max(1, data.length - 1)) * options.width;
  const yFor = (value: number) => options.y + options.height - ((value - minValue) / range) * options.height;

  context.save();
  context.strokeStyle = LINE;
  context.lineWidth = 2;
  context.fillStyle = MUTED;
  context.font = "15px Arial";
  for (let i = 0; i <= 4; i += 1) {
    const value = minValue + (range * i) / 4;
    const y = yFor(value);
    context.beginPath();
    context.moveTo(options.x, y);
    context.lineTo(options.x + options.width, y);
    context.stroke();
    context.fillText(formatChartValue(value, options), 8, y + 5);
  }

  const zeroY = yFor(0);
  context.strokeStyle = "#9fb3bf";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(options.x, zeroY);
  context.lineTo(options.x + options.width, zeroY);
  context.stroke();

  context.beginPath();
  data.forEach((item, index) => {
    const x = xFor(index);
    const y = yFor(item.value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.lineTo(xFor(data.length - 1), options.y + options.height);
  context.lineTo(xFor(0), options.y + options.height);
  context.closePath();
  context.fillStyle = options.fillColor;
  context.fill();

  context.beginPath();
  data.forEach((item, index) => {
    const x = xFor(index);
    const y = yFor(item.value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = options.lineColor;
  context.lineWidth = 5;
  context.stroke();

  data.forEach((item, index) => {
    const x = xFor(index);
    const y = yFor(item.value);
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = options.lineColor;
    context.lineWidth = 4;
    context.stroke();
    if (index === 0 || index === data.length - 1 || index % 2 === 1) {
      context.fillStyle = DARK;
      context.font = "15px Arial";
      context.fillText(item.label, x - 14, options.y + options.height + 28);
    }
  });

  const last = data[data.length - 1];
  if (last) {
    const x = xFor(data.length - 1);
    const y = yFor(last.value);
    context.fillStyle = DARK;
    context.font = "bold 20px Arial";
    context.fillText(formatChartValue(last.value, options), Math.min(x - 120, options.x + options.width - 155), Math.max(options.y + 22, y - 16));
  }
  context.restore();
}

function formatChartValue(value: number, options: { valuePrefix?: string; valueSuffix?: string }) {
  const rounded = Math.round(value);
  const absolute = Math.abs(rounded).toLocaleString("en-IN");
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${options.valuePrefix || ""}${absolute}${options.valueSuffix || ""}`;
}

function createCanvasImage(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  draw(context, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function imageFormat(dataUrl: string): "JPEG" | "PNG" {
  return dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
}

function fillBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = PANEL;
  context.fillRect(0, 0, width, height);
}

function drawGridPattern(context: CanvasRenderingContext2D, width: number, height: number) {
  context.strokeStyle = "#dce7ed";
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawCompass(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = GREEN;
  context.beginPath();
  context.moveTo(x, y - 44);
  context.lineTo(x + 18, y + 24);
  context.lineTo(x, y + 12);
  context.lineTo(x - 18, y + 24);
  context.closePath();
  context.fill();
  context.fillStyle = DARK;
  context.font = "bold 22px Arial";
  context.fillText("N", x - 8, y - 56);
}

function groupPanels(panels: SolarPanelObject[]) {
  const groups = new Map<string, { name: string; count: number; wattage: number; width: number; height: number }>();
  panels.forEach((panel) => {
    const key = `${panel.manufacturer}-${panel.model}-${panel.wattage}-${panel.width}-${panel.height}`;
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, { name: `${panel.manufacturer} ${panel.model}`, count: 1, wattage: panel.wattage, width: panel.width, height: panel.height });
  });
  return Array.from(groups.values());
}

function getPanelRoofId(panel: SolarPanelObject, roofs: RoofObject[]) {
  return findContainingRoof(panel, roofs)?.id;
}

function totalRoofArea(roofs: RoofObject[]) {
  return roofs.reduce((sum, roof) => sum + polygonArea(roof.points), 0) / 1_000_000;
}

function sourceLabel(result: EnergyGenerationResult) {
  return result.dataSource === "solar-api" ? "Solar API" : "Assumption";
}

function fitText(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 1))}.` : value;
}

function safeFilename(value: string) {
  return (value || "rufsun-project").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "rufsun-project";
}
