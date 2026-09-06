import type Konva from "konva";
import { jsPDF } from "jspdf";
import { calculateArrayStats } from "../cad/array/array";
import { calculateAllPeriods, calculateSystemCostEstimate, filterPanelsOnRoofs, type EnergyGenerationResult } from "../cad/energy/energyCalculator";
import { DEFAULT_ELECTRICITY_RATE_INR, CURRENCY_CODE, formatCurrency } from "../cad/finance/currency";
import { distance, findContainingRoof, formatFeetInches, midpoint, polygonArea, roofUsablePolygon } from "../cad/geometry/geometry";
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
  coverImage: string;
  productionChart: string;
  financeChart: string;
  dailyCurveChart: string;
  irradianceChart: string;
  savingsBreakdownChart: string;
  energy: Record<"today" | "week" | "month" | "year", EnergyGenerationResult>;
  costEstimate: ReturnType<typeof calculateSystemCostEstimate>;
  solarExposure?: ProjectSolarDataState;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const GREEN = "#16855f";
const ORANGE = "#f28c28";
const INK = "#07111f";
const DARK = "#17212b";
const MUTED = "#64748b";
const LINE = "#d9e2e7";
const REPORT_IMAGE_W = 900;
const REPORT_IMAGE_H = 558;
const CHART_W = 900;
const CHART_H = 380;
const JPEG_QUALITY = 0.72;
const COVER_IMAGE_PATH = "/report-cover-solar.jpg";

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
  const dailyCurveChart = createDailyCurveChart(energy);
  const irradianceChart = createIrradianceChart(roofs, solarExposure);
  const savingsBreakdownChart = createSavingsBreakdownChart(costEstimate, energy);
  const coverBackgroundImage = await loadImageAsDataUrl(COVER_IMAGE_PATH).catch(() => createCoverFallbackImage());
  const coverImage = await createCoverImage(document, coverBackgroundImage);

  return {
    document,
    panels,
    installedPanels,
    roofs,
    mapCapture: document.mapCapture,
    layoutImage,
    mapImage,
    exposureImage,
    coverImage,
    productionChart,
    financeChart,
    dailyCurveChart,
    irradianceChart,
    savingsBreakdownChart,
    energy,
    costEstimate,
    solarExposure
  };
}

function drawCover(pdf: jsPDF, context: ReportContext) {
  pdf.addImage(context.coverImage, imageFormat(context.coverImage), 0, 0, PAGE_W, PAGE_H, undefined, "FAST");
}

function drawSitePage(pdf: jsPDF, context: ReportContext) {
  addImageCard(pdf, context.mapImage, MARGIN, 34, 182, 118, "Satellite context");
  drawSectionTitle(pdf, MARGIN, 170, "Project Location");
  drawTwoColumnTable(pdf, MARGIN, 182, [
    ["Customer", context.document.customerName || "-"],
    ["Address", context.document.customerAddress || "-"],
    ["Map center", context.mapCapture ? `${context.mapCapture.latitude.toFixed(5)}, ${context.mapCapture.longitude.toFixed(5)}` : "-"],
    ["Captured area", context.mapCapture ? `${context.mapCapture.widthM.toFixed(0)} x ${context.mapCapture.heightM.toFixed(0)} m` : "-"],
    ["North reference", `${context.document.site?.northRotation ?? 0} deg`],
    ["Imagery provider", context.document.site?.imagery?.provider ?? (context.mapCapture ? "google" : "-")]
  ]);
  drawNoteBlock(
    pdf,
    MARGIN,
    238,
    182,
    "Site alignment",
    "A clean map reference helps reviewers understand where the system sits on the property before moving into roof geometry and production assumptions.",
  );
  drawFooter(pdf, 2);
}

function drawDesignPage(pdf: jsPDF, context: ReportContext) {
  const stats = calculateArrayStats(context.panels);
  addImageCard(pdf, context.layoutImage, MARGIN, 34, 182, 112, "Roof faces and proposed panel layout");
  drawKpiRow(pdf, MARGIN, 162, [
    ["DC size", `${stats.totalKwp.toFixed(2)} kWp`],
    ["Modules", String(context.panels.length)],
    ["Inside roof", String(context.installedPanels.length)],
    ["Roof area", `${totalRoofArea(context.roofs).toFixed(1)} m2`]
  ]);
  drawSectionTitle(pdf, MARGIN, 205, "Roof Summary");
  drawSimpleTable(
    pdf,
    MARGIN,
    216,
    ["Roof face", "Area", "Usable", "Azimuth", "Pitch"],
    context.roofs.map((roof, index) => [
      roof.name || `Roof ${index + 1}`,
      `${(polygonArea(roof.points) / 1_000_000).toFixed(1)} m2`,
      `${(polygonAreaPreview(roof) / 1_000_000).toFixed(1)} m2`,
      `${roof.azimuth} deg`,
      `${roof.pitch ?? roof.tilt} deg`
    ]),
    [48, 32, 32, 30, 30]
  );
  drawNoteBlock(pdf, MARGIN, 264, 182, "Design note", `The module footprint is ${(stats.width / 1000).toFixed(2)} m x ${(stats.height / 1000).toFixed(2)} m. Panel placement is reported against roof boundaries and usable setback geometry.`);
  drawFooter(pdf, 3);
}

function drawExposurePage(pdf: jsPDF, context: ReportContext) {
  addImageCard(pdf, context.exposureImage, MARGIN, 34, 182, 112, "Roof-clipped annual solar exposure");
  drawExposureLegend(pdf, MARGIN, 154, context);
  pdf.addImage(context.irradianceChart, imageFormat(context.irradianceChart), MARGIN, 178, 86, 50, undefined, "FAST");
  drawNoteBlock(pdf, 106, 178, 90, "Exposure basis", "Warm colors indicate stronger annual solar flux. When Solar API data is loaded, production is calculated from annual flux sampled under the actual panel footprint.");
  drawSectionTitle(pdf, MARGIN, 244, "Roof Irradiance Statistics");
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
  drawSimpleTable(pdf, MARGIN, 255, ["Roof", "Average annual flux", "Range", "Samples"], rows, [42, 58, 48, 24]);
  drawFooter(pdf, 4);
}

function drawEnergyPage(pdf: jsPDF, context: ReportContext) {
  pdf.addImage(context.productionChart, imageFormat(context.productionChart), MARGIN, 34, 182, 70, undefined, "FAST");
  drawKpiRow(pdf, MARGIN, 118, [
    ["Annual energy", `${context.energy.year.totalEnergyKwh.toLocaleString()} kWh`],
    ["Daily average", `${context.energy.year.averageDailyGeneration} kWh`],
    ["Capacity", `${context.energy.year.totalCapacity} kWp`],
    ["Source", sourceLabel(context.energy.year)]
  ]);
  pdf.addImage(context.dailyCurveChart, imageFormat(context.dailyCurveChart), MARGIN, 166, 86, 48, undefined, "FAST");
  drawNoteBlock(pdf, 106, 166, 90, "Calculation basis", context.energy.year.dataSource === "solar-api" ? "Energy uses panel capacity multiplied by annual Solar API flux sampled under the module footprint, then applies the temperature performance factor." : "Energy uses installed capacity, peak sun hours, temperature factor, and roof azimuth/pitch assumptions.");
  drawSectionTitle(pdf, MARGIN, 230, "Production Forecast");
  drawSimpleTable(
    pdf,
    MARGIN,
    241,
    ["Period", "Energy", "Savings", "Daily avg", "Source"],
    [
      ["Today", `${context.energy.today.totalEnergyKwh} kWh`, formatCurrency(context.energy.today.estimatedRevenue), `${context.energy.today.averageDailyGeneration} kWh`, sourceLabel(context.energy.today)],
      ["Week", `${context.energy.week.totalEnergyKwh} kWh`, formatCurrency(context.energy.week.estimatedRevenue), `${context.energy.week.averageDailyGeneration} kWh`, sourceLabel(context.energy.week)],
      ["Month", `${context.energy.month.totalEnergyKwh} kWh`, formatCurrency(context.energy.month.estimatedRevenue), `${context.energy.month.averageDailyGeneration} kWh`, sourceLabel(context.energy.month)],
      ["Year", `${context.energy.year.totalEnergyKwh} kWh`, formatCurrency(context.energy.year.estimatedRevenue), `${context.energy.year.averageDailyGeneration} kWh`, sourceLabel(context.energy.year)]
    ],
    [28, 38, 32, 38, 36]
  );
  drawFooter(pdf, 5);
}

function drawFinancePage(pdf: jsPDF, context: ReportContext) {
  pdf.addImage(context.financeChart, imageFormat(context.financeChart), MARGIN, 34, 182, 70, undefined, "FAST");
  drawKpiRow(pdf, MARGIN, 118, [
    ["System cost", formatCurrency(context.costEstimate.systemCost)],
    ["Annual savings", formatCurrency(context.costEstimate.annualSavings)],
    ["Payback", context.costEstimate.paybackYears === null ? "N/A" : `${context.costEstimate.paybackYears} yr`],
    ["First year net", formatCurrency(context.costEstimate.firstYearNet)]
  ]);
  pdf.addImage(context.savingsBreakdownChart, imageFormat(context.savingsBreakdownChart), MARGIN, 166, 86, 48, undefined, "FAST");
  drawNoteBlock(pdf, 106, 166, 90, "Financial note", "Values are planning estimates for comparing cost and savings. Tariffs, incentives, taxes, permitting, and installation conditions should be verified before contract approval.");
  drawSectionTitle(pdf, MARGIN, 230, "Financial Details");
  drawTwoColumnTable(pdf, MARGIN, 242, [
    ["Cost per watt", `${formatCurrency(context.costEstimate.costPerWatt)}/W`],
    ["Installed capacity", `${context.energy.year.totalCapacity} kWp`],
    ["Estimated system cost", formatCurrency(context.costEstimate.systemCost)],
    ["Monthly savings", formatCurrency(context.energy.month.estimatedRevenue)],
    ["Annual savings", formatCurrency(context.energy.year.estimatedRevenue)],
    ["Payback estimate", context.costEstimate.paybackYears === null ? "N/A" : `${context.costEstimate.paybackYears} years`]
  ]);
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
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_W, 22, "F");
  pdf.setDrawColor(217, 226, 231);
  pdf.line(MARGIN, 22, PAGE_W - MARGIN, 22);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(22, 133, 95);
  pdf.text("RufsunCAD", MARGIN, 12);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.text(title, PAGE_W - MARGIN, 12, { align: "right" });
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
  pdf.setFontSize(10);
  pdf.setTextColor(22, 33, 43);
  pdf.text(title, x, y);
  pdf.setDrawColor(22, 133, 95);
  pdf.setLineWidth(0.45);
  pdf.line(x, y + 3, x + 18, y + 3);
}

function drawKpiRow(pdf: jsPDF, x: number, y: number, items: Array<[string, string]>) {
  const gap = 4;
  const width = (182 - gap * (items.length - 1)) / items.length;
  items.forEach(([label, value], index) => {
    const left = x + index * (width + gap);
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(217, 226, 231);
    pdf.roundedRect(left, y, width, 28, 2, 2, "FD");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, left + 4, y + 8);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(value.length > 16 ? 9 : 11);
    pdf.setTextColor(23, 33, 43);
    pdf.text(fitText(value, value.length > 16 ? 18 : 14), left + 4, y + 20);
  });
}

function drawNoteBlock(pdf: jsPDF, x: number, y: number, width: number, title: string, body: string) {
  const bodyLines = pdf.splitTextToSize(body, width - 10) as string[];
  const height = Math.max(26, 15 + bodyLines.length * 3.8);
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(x, y, width, height, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(22, 33, 43);
  pdf.text(title, x + 5, y + 7);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(71, 85, 105);
  bodyLines.forEach((line, index) => pdf.text(line, x + 5, y + 14 + index * 3.8));
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

async function createCoverImage(document: RufsunCadDocument, backgroundImage: string) {
  const image = await loadHtmlImage(backgroundImage);
  return createCanvasImage(1200, 1697, (context, width, height) => {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceW = image.naturalWidth;
    let sourceH = image.naturalHeight;

    if (imageRatio > canvasRatio) {
      sourceW = image.naturalHeight * canvasRatio;
      sourceX = (image.naturalWidth - sourceW) / 2;
    } else {
      sourceH = image.naturalWidth / canvasRatio;
      sourceY = (image.naturalHeight - sourceH) / 2;
    }

    context.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);

    const shade = context.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, "rgba(7, 17, 31, 0.68)");
    shade.addColorStop(0.45, "rgba(7, 17, 31, 0.24)");
    shade.addColorStop(1, "rgba(7, 17, 31, 0.74)");
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#ffffff";
    context.font = "700 34px Poppins, Arial, sans-serif";
    context.fillText("Rufsun Solar CAD", 84, 112);

    context.font = "700 92px Poppins, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("Solar Made,", width / 2, 794);
    context.fillText("Easy.", width / 2, 902);

    context.textAlign = "left";
    context.font = "600 36px Poppins, Arial, sans-serif";
    context.fillText(document.customerName || "Customer", 84, height - 104);
  });
}

function createCoverFallbackImage() {
  return createCanvasImage(1200, 1697, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#17212b");
    gradient.addColorStop(1, "#16855f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
}

function createDailyCurveChart(energy: ReportContext["energy"]) {
  const total = Math.max(0, energy.year.averageDailyGeneration);
  const points = Array.from({ length: 13 }, (_, index) => {
    const hour = 6 + index;
    const daylightPosition = index / 12;
    const curve = Math.sin(Math.PI * daylightPosition);
    return {
      label: `${hour}:00`,
      value: Number((total * curve * 0.18).toFixed(2))
    };
  });
  return createCanvasImage(900, 520, (context, width, height) => {
    fillBackground(context, width, height);
    context.fillStyle = INK;
    context.font = "700 25px Poppins, Arial";
    context.fillText("Daily Generation Curve", 36, 52);
    context.fillStyle = MUTED;
    context.font = "16px Poppins, Arial";
    context.fillText("Typical clear-day shape from sunrise to evening output.", 36, 80);
    drawLineChart(context, points, {
      x: 72,
      y: 118,
      width: width - 124,
      height: height - 192,
      lineColor: ORANGE,
      fillColor: "rgba(242, 140, 40, 0.10)",
      valueSuffix: " kWh"
    });
  });
}

function createIrradianceChart(roofs: RoofObject[], solarExposure?: ProjectSolarDataState) {
  const data = roofs.map((roof, index) => {
    const stats =
      solarExposure?.status === "ready" && solarExposure.annualFlux && solarExposure.transform
        ? getRoofFluxStatistics(roof, solarExposure.annualFlux, solarExposure.transform)
        : null;
    return {
      label: roof.name || `R${index + 1}`,
      value: stats?.average ?? 0
    };
  });
  return createCanvasImage(900, 520, (context, width, height) => {
    fillBackground(context, width, height);
    context.fillStyle = INK;
    context.font = "700 25px Poppins, Arial";
    context.fillText("Roof Irradiance", 36, 52);
    context.fillStyle = MUTED;
    context.font = "16px Poppins, Arial";
    context.fillText(solarExposure?.status === "ready" ? "Average annual flux by roof face." : "Load Solar API data to populate measured flux.", 36, 80);
    drawBarChart(context, data.length ? data : [{ label: "No data", value: 0 }], 62, 122, width - 118, height - 180, GREEN);
  });
}

function createSavingsBreakdownChart(cost: ReportContext["costEstimate"], energy: ReportContext["energy"]) {
  const annualSavings = Math.max(0, cost.annualSavings);
  const systemCost = Math.max(1, cost.systemCost);
  const recoveredPercent = Math.min(100, (annualSavings / systemCost) * 100);
  return createCanvasImage(760, 640, (context, width, height) => {
    fillBackground(context, width, height);
    context.fillStyle = INK;
    context.font = "700 25px Poppins, Arial";
    context.fillText("Savings Snapshot", 36, 56);
    drawDonut(context, 190, 316, 108, 34, recoveredPercent, ORANGE, "#e8edf1");
    context.fillStyle = INK;
    context.font = "700 38px Poppins, Arial";
    context.textAlign = "center";
    context.fillText(`${Math.round(recoveredPercent)}%`, 190, 326);
    context.font = "500 16px Poppins, Arial";
    context.fillStyle = MUTED;
    context.fillText("cost recovered in year 1", 190, 356);
    context.textAlign = "left";
    drawChartStat(context, 366, 196, "Annual savings", formatCurrency(annualSavings));
    drawChartStat(context, 366, 310, "Monthly savings", formatCurrency(energy.month.estimatedRevenue));
    drawChartStat(context, 366, 424, "System cost", formatCurrency(systemCost));
  });
}

function polygonAreaPreview(roof: RoofObject) {
  return polygonArea(roofUsablePolygon(roof));
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
    context.font = "700 24px Poppins, Arial";
    context.fillText("Monthly Production Trend", 34, 50);
    drawLineChart(context, data, {
      x: 58,
      y: 78,
      width: width - 94,
      height: height - 132,
      lineColor: GREEN,
      fillColor: "rgba(22, 133, 95, 0.10)",
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
    context.font = "700 24px Poppins, Arial";
    context.fillText("Cumulative Cash Flow", 34, 50);
    drawLineChart(context, data, {
      x: 58,
      y: 78,
      width: width - 94,
      height: height - 132,
      lineColor: cost.paybackYears === null ? "#315b8f" : GREEN,
      fillColor: "rgba(49, 91, 143, 0.09)",
      valuePrefix: `${CURRENCY_CODE} `
    });
    if (cost.paybackYears !== null) {
      context.fillStyle = GREEN;
      context.font = "700 16px Poppins, Arial";
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
  context.lineWidth = 1.5;
  context.fillStyle = MUTED;
  context.font = "13px Poppins, Arial";
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
  context.lineWidth = 1.8;
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
  context.lineWidth = 3.2;
  context.stroke();

  data.forEach((item, index) => {
    const x = xFor(index);
    const y = yFor(item.value);
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = options.lineColor;
    context.lineWidth = 2.2;
    context.stroke();
    if (index === 0 || index === data.length - 1 || index % 2 === 1) {
      context.fillStyle = DARK;
      context.font = "13px Poppins, Arial";
      context.fillText(item.label, x - 14, options.y + options.height + 28);
    }
  });

  const last = data[data.length - 1];
  if (last) {
    const x = xFor(data.length - 1);
    const y = yFor(last.value);
    context.fillStyle = DARK;
    context.font = "700 16px Poppins, Arial";
    context.fillText(formatChartValue(last.value, options), Math.min(x - 120, options.x + options.width - 155), Math.max(options.y + 22, y - 16));
  }
  context.restore();
}

function drawBarChart(
  context: CanvasRenderingContext2D,
  data: Array<{ label: string; value: number }>,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));
  const gap = 18;
  const barWidth = Math.max(24, (width - gap * (data.length - 1)) / data.length);
  context.save();
  context.strokeStyle = "#edf2f7";
  context.lineWidth = 1.5;
  context.fillStyle = MUTED;
  context.font = "15px Poppins, Arial";
  for (let i = 0; i <= 4; i += 1) {
    const guideY = y + height - (height * i) / 4;
    context.beginPath();
    context.moveTo(x, guideY);
    context.lineTo(x + width, guideY);
    context.stroke();
  }
  data.forEach((item, index) => {
    const barX = x + index * (barWidth + gap);
    const barHeight = (item.value / maxValue) * height;
    const barY = y + height - barHeight;
    context.fillStyle = color;
    roundRect(context, barX, barY, barWidth, barHeight, 6);
    context.fill();
    context.fillStyle = INK;
    context.font = "600 14px Poppins, Arial";
    context.fillText(Math.round(item.value).toLocaleString("en-IN"), barX, Math.max(y + 18, barY - 12));
    context.fillStyle = MUTED;
    context.font = "500 13px Poppins, Arial";
    context.fillText(fitText(item.label, 8), barX, y + height + 34);
  });
  context.restore();
}

function drawDonut(context: CanvasRenderingContext2D, x: number, y: number, radius: number, thickness: number, percent: number, color: string, background: string) {
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * (Math.max(0, Math.min(100, percent)) / 100);
  context.save();
  context.lineCap = "round";
  context.strokeStyle = background;
  context.lineWidth = thickness;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = color;
  context.beginPath();
  context.arc(x, y, radius, start, end);
  context.stroke();
  context.restore();
}

function drawChartStat(context: CanvasRenderingContext2D, x: number, y: number, label: string, value: string) {
  context.fillStyle = "#ffffff";
  roundRect(context, x, y, 236, 78, 8);
  context.fill();
  context.strokeStyle = LINE;
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = MUTED;
  context.font = "600 14px Poppins, Arial";
  context.fillText(label.toUpperCase(), x + 18, y + 28);
  context.fillStyle = INK;
  context.font = value.length > 12 ? "700 24px Poppins, Arial" : "700 30px Poppins, Arial";
  context.fillText(value, x + 18, y + 60);
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4
) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  lines.slice(0, maxLines).forEach((line, index) => {
    const suffix = index === maxLines - 1 && lines.length > maxLines ? "." : "";
    context.fillText(`${line}${suffix}`, x, y + index * lineHeight);
  });
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
