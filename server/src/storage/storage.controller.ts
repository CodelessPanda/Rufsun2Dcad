import { Body, Controller, Get, Header, Inject, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { StorageService } from "./storage.service";

@Controller("companies/:companyId/assets")
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Body() body: CreateAssetBody) {
    return this.storage.createAsset(user.id, companyId, body);
  }

  @Get(":assetId/download")
  @Header("Cache-Control", "private, no-store")
  async download(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("assetId") assetId: string, @Res() response: Response) {
    const asset = await this.storage.downloadAsset(user.id, companyId, assetId);
    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("Content-Length", String(asset.byteSize));
    response.setHeader("Content-Disposition", `attachment; filename="${asset.filename.replace(/"/g, "")}"`);
    response.send(asset.body);
  }

  @Post(":assetId/signed-url")
  signedUrl(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("assetId") assetId: string) {
    return this.storage.signedUrl(user.id, companyId, assetId);
  }
}

interface CreateAssetBody {
  purpose: string;
  filename: string;
  contentType?: string;
  base64: string;
  projectId?: string;
}
