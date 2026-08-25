import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { WorkspaceAccessService } from "../common/workspace-access.service";

const SOLAR_DATA_RADIUS_METERS = 50;
const SOLAR_PIXEL_SIZE_METERS = 0.1;
const SOLAR_CACHE_TTL_MS = 50 * 60 * 1000;

export interface SolarDataLayersResponse {
  imageryDate?: { year: number; month: number; day: number };
  imageryProcessedDate?: { year: number; month: number; day: number };
  dsmUrl?: string;
  rgbUrl?: string;
  maskUrl?: string;
  annualFluxUrl?: string;
  monthlyFluxUrl?: string;
  hourlyShadeUrls?: string[];
  imageryQuality?: "HIGH" | "MEDIUM" | "BASE";
}

interface CachedLayers {
  projectId: string;
  latitude: number;
  longitude: number;
  loadedAt: number;
  data: SolarDataLayersResponse;
}

@Injectable()
export class SolarService {
  private readonly cache = new Map<string, CachedLayers>();

  constructor(@Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService) {}

  async getDataLayers(userId: string, workspaceId: string, projectId: string, clientGoogleApiKey?: string) {
    const project = await this.access.requireProject(userId, workspaceId, projectId);
    const latitude = project.latitude;
    const longitude = project.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      throw new BadRequestException("Project installation location is missing coordinates.");
    }

    const cached = this.cache.get(projectId);
    if (
      cached &&
      Date.now() - cached.loadedAt < SOLAR_CACHE_TTL_MS &&
      nearlySame(cached.latitude, latitude) &&
      nearlySame(cached.longitude, longitude)
    ) {
      return this.toClientResponse(workspaceId, projectId, cached.data, cached.loadedAt);
    }

    const apiKey = resolveGoogleSolarApiKey(clientGoogleApiKey);

    const params = new URLSearchParams({
      "location.latitude": String(latitude),
      "location.longitude": String(longitude),
      radiusMeters: String(SOLAR_DATA_RADIUS_METERS),
      view: "IMAGERY_AND_ANNUAL_FLUX_LAYERS",
      requiredQuality: "BASE",
      exactQualityRequired: "false",
      pixelSizeMeters: String(SOLAR_PIXEL_SIZE_METERS),
      key: apiKey
    });

    const response = await fetch(`https://solar.googleapis.com/v1/dataLayers:get?${params.toString()}`);
    const data = (await response.json().catch(() => ({}))) as SolarDataLayersResponse & { error?: { message?: string; status?: string } };
    if (!response.ok) {
      if (response.status === 404) throw new NotFoundException("Solar exposure data is not available for this location.");
      throw new BadRequestException(data.error?.message || "Unable to load Solar API data.");
    }
    if (!data.annualFluxUrl) throw new NotFoundException("Annual solar flux layer is not available for this location.");

    this.cache.set(projectId, { projectId, latitude, longitude, loadedAt: Date.now(), data });
    return this.toClientResponse(workspaceId, projectId, data, Date.now());
  }

  async downloadAnnualFlux(userId: string, workspaceId: string, projectId: string, clientGoogleApiKey?: string) {
    const layers = await this.getRawDataLayers(userId, workspaceId, projectId, clientGoogleApiKey);
    if (!layers.annualFluxUrl) throw new NotFoundException("Annual solar flux layer is not available for this location.");
    const apiKey = resolveGoogleSolarApiKey(clientGoogleApiKey);

    const response = await fetch(prepareGeoTiffUrl(layers.annualFluxUrl, apiKey));
    if (!response.ok) {
      if (response.status === 404) throw new NotFoundException("Solar exposure GeoTIFF is no longer available. Refresh solar data.");
      throw new BadRequestException("Unable to download annual solar flux GeoTIFF.");
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: response.headers.get("content-type") || "image/tiff"
    };
  }

  private async getRawDataLayers(userId: string, workspaceId: string, projectId: string, clientGoogleApiKey?: string) {
    await this.getDataLayers(userId, workspaceId, projectId, clientGoogleApiKey);
    const cached = this.cache.get(projectId);
    if (!cached) throw new NotFoundException("Solar data cache is unavailable.");
    return cached.data;
  }

  private toClientResponse(workspaceId: string, projectId: string, data: SolarDataLayersResponse, loadedAt: number) {
    return {
      imageryDate: data.imageryDate,
      imageryProcessedDate: data.imageryProcessedDate,
      imageryQuality: data.imageryQuality,
      hasAnnualFlux: Boolean(data.annualFluxUrl),
      radiusMeters: SOLAR_DATA_RADIUS_METERS,
      pixelSizeMeters: SOLAR_PIXEL_SIZE_METERS,
      annualFluxDownloadUrl: `/api/workspaces/${workspaceId}/projects/${projectId}/solar/annual-flux.tiff`,
      loadedAt: new Date(loadedAt).toISOString()
    };
  }
}

function resolveGoogleSolarApiKey(clientGoogleApiKey?: string) {
  const apiKey = (process.env.GOOGLE_SOLAR_API_KEY || clientGoogleApiKey || "").trim();
  if (!apiKey) {
    throw new InternalServerErrorException("Google Solar API key is not configured. Add it in Settings or server .env.");
  }
  return apiKey;
}

function prepareGeoTiffUrl(url: string, apiKey: string) {
  if (!url.includes("solar.googleapis.com")) return url;
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("key", apiKey);
  return nextUrl.toString();
}

function nearlySame(a: number, b: number) {
  return Math.abs(a - b) < 0.000001;
}
