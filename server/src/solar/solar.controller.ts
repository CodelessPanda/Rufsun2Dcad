import { Controller, Get, Header, Headers, Inject, Param, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { SolarService, type SolarLayerKind } from "./solar.service";

@Controller(["workspaces/:companyId/projects/:projectId/solar", "companies/:companyId/projects/:projectId/solar"])
@UseGuards(JwtAuthGuard)
export class SolarController {
  constructor(@Inject(SolarService) private readonly solar: SolarService) {}

  @Get("data-layers")
  dataLayers(
    @CurrentUser() user: RequestUser,
    @Param("companyId") companyId: string,
    @Param("projectId") projectId: string,
    @Headers("x-google-maps-api-key") googleApiKey?: string
  ) {
    return this.solar.getDataLayers(user.id, companyId, projectId, googleApiKey);
  }

  @Get("annual-flux.tiff")
  @Header("Cache-Control", "no-store")
  async annualFlux(
    @CurrentUser() user: RequestUser,
    @Param("companyId") companyId: string,
    @Param("projectId") projectId: string,
    @Headers("x-google-maps-api-key") googleApiKey: string | undefined,
    @Res() response: Response
  ) {
    const tiff = await this.solar.downloadAnnualFlux(user.id, companyId, projectId, googleApiKey);
    response.setHeader("Content-Type", tiff.contentType);
    response.send(tiff.body);
  }

  @Get("layers/:layer.tiff")
  @Header("Cache-Control", "no-store")
  async layer(
    @CurrentUser() user: RequestUser,
    @Param("companyId") companyId: string,
    @Param("projectId") projectId: string,
    @Param("layer") layer: SolarLayerKind,
    @Headers("x-google-maps-api-key") googleApiKey: string | undefined,
    @Res() response: Response
  ) {
    const tiff = await this.solar.downloadLayer(user.id, companyId, projectId, layer, googleApiKey);
    response.setHeader("Content-Type", tiff.contentType);
    response.send(tiff.body);
  }
}
