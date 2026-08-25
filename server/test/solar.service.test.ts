import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { SolarService } from "../src/solar/solar.service";

describe("SolarService", () => {
  const access = {
    requireProject: vi.fn()
  };
  let service: SolarService;

  beforeEach(() => {
    vi.restoreAllMocks();
    access.requireProject.mockResolvedValue({ id: "project-a", latitude: 28.6, longitude: 77.2 });
    service = new SolarService(access as never);
    process.env.GOOGLE_SOLAR_API_KEY = "solar-key";
  });

  it("returns safe metadata for a valid Solar API response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { annualFluxUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=abc", imageryQuality: "HIGH" })));

    const result = await service.getDataLayers("user-a", "workspace-a", "project-a");

    expect(access.requireProject).toHaveBeenCalledWith("user-a", "workspace-a", "project-a");
    expect(result).toMatchObject({
      hasAnnualFlux: true,
      imageryQuality: "HIGH",
      radiusMeters: 50,
      pixelSizeMeters: 0.1,
      annualFluxDownloadUrl: "/api/workspaces/workspace-a/projects/project-a/solar/annual-flux.tiff"
    });
  });

  it("rejects projects without coordinates before calling Google", async () => {
    access.requireProject.mockResolvedValue({ id: "project-a", latitude: null, longitude: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(service.getDataLayers("user-a", "workspace-a", "project-a")).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a configured Google Solar API key", async () => {
    delete process.env.GOOGLE_SOLAR_API_KEY;
    await expect(service.getDataLayers("user-a", "workspace-a", "project-a")).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("uses the browser settings key when the server-side key is not configured", async () => {
    delete process.env.GOOGLE_SOLAR_API_KEY;
    const fetchMock = vi.fn(async () => jsonResponse(200, { annualFluxUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=abc", imageryQuality: "HIGH" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await service.getDataLayers("user-a", "workspace-a", "project-a", "browser-maps-solar-key");

    expect(result.hasAnnualFlux).toBe(true);
    const firstSolarUrl = String((fetchMock.mock.calls as unknown as Array<[unknown]>)[0]?.[0]);
    expect(firstSolarUrl).toContain("key=browser-maps-solar-key");
  });

  it("maps unavailable coverage and missing annual flux to friendly errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, { error: { message: "not found" } })));
    await expect(service.getDataLayers("user-a", "workspace-a", "project-a")).rejects.toBeInstanceOf(NotFoundException);

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { imageryQuality: "BASE" })));
    await expect(service.getDataLayers("user-a", "workspace-a", "project-a")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("downloads the annual flux GeoTIFF through the resolved Google key", async () => {
    delete process.env.GOOGLE_SOLAR_API_KEY;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { annualFluxUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=abc", imageryQuality: "HIGH" }))
      .mockResolvedValueOnce({
        ok: true,
        headers: new Map([["content-type", "image/tiff"]]),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await service.downloadAnnualFlux("user-a", "workspace-a", "project-a", "browser-maps-solar-key");

    expect(fetchMock.mock.calls[1][0]).toContain("key=browser-maps-solar-key");
    expect(result.contentType).toBe("image/tiff");
    expect(result.body.length).toBe(3);
  });
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}
