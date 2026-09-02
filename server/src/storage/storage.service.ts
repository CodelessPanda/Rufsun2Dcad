import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AccessControlService } from "../common/access-control.service";
import { Permissions } from "../common/permissions";
import { createObjectStorageProvider } from "./object-storage.provider";

const ALLOWED_PURPOSES = new Set(["pdf_report", "png_export", "company_logo", "project_image", "solar_asset", "customer_upload", "proposal_asset"]);

@Injectable()
export class StorageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService
  ) {}

  async createAsset(userId: string, companyId: string, input: CreateAssetInput) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_UPDATE);
    const tenant = await this.access.resolveCompanyTenant(companyId);
    if (input.projectId) await this.access.requireProject(userId, companyId, input.projectId);
    if (!ALLOWED_PURPOSES.has(input.purpose)) throw new BadRequestException("Unsupported asset purpose.");
    const buffer = Buffer.from(input.base64, "base64");
    if (buffer.length === 0) throw new BadRequestException("Asset content is empty.");
    if (buffer.length > maxUploadBytes()) throw new BadRequestException("Asset is larger than the configured upload limit.");

    const provider = createObjectStorageProvider();
    const key = storageKey(companyId, input.projectId, input.purpose, input.filename);
    await provider.put(key, { body: buffer, contentType: input.contentType || "application/octet-stream" });
    return this.prisma.fileAsset.create({
      data: {
        tenantId: tenant.id,
        companyId,
        projectId: input.projectId,
        createdById: userId,
        purpose: input.purpose,
        filename: cleanFilename(input.filename),
        contentType: input.contentType || "application/octet-stream",
        byteSize: buffer.length,
        storageDriver: provider.driver,
        storageBucket: provider.bucket,
        storageKey: key,
        checksumSha256: createHash("sha256").update(buffer).digest("hex"),
        visibility: "private"
      } as Prisma.FileAssetUncheckedCreateInput
    });
  }

  async downloadAsset(userId: string, companyId: string, assetId: string) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_VIEW);
    const asset = await this.prisma.fileAsset.findFirst({ where: { id: assetId, companyId, archivedAt: null } });
    if (!asset) throw new NotFoundException("Asset not found");
    if (asset.projectId) await this.access.requireProject(userId, companyId, asset.projectId);
    const provider = createObjectStorageProvider();
    const body = await provider.get(asset.storageKey);
    return {
      body,
      filename: asset.filename,
      contentType: asset.contentType,
      byteSize: asset.byteSize
    };
  }

  async signedUrl(userId: string, companyId: string, assetId: string) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_VIEW);
    const asset = await this.prisma.fileAsset.findFirst({ where: { id: assetId, companyId, archivedAt: null } });
    if (!asset) throw new NotFoundException("Asset not found");
    if (asset.projectId) await this.access.requireProject(userId, companyId, asset.projectId);
    const provider = createObjectStorageProvider();
    const signed = provider.createSignedUrl ? await provider.createSignedUrl(asset.storageKey, 300) : undefined;
    return {
      url: signed ?? `/api/companies/${companyId}/assets/${assetId}/download`,
      expiresInSeconds: 300,
      signed: Boolean(signed),
      filename: asset.filename
    };
  }
}

export interface CreateAssetInput {
  purpose: string;
  filename: string;
  contentType?: string;
  base64: string;
  projectId?: string;
}

function storageKey(companyId: string, projectId: string | undefined, purpose: string, filename: string) {
  const scope = projectId ? `${companyId}/${projectId}` : companyId;
  return `${scope}/${purpose}/${randomUUID()}-${cleanFilename(filename)}`;
}

function cleanFilename(filename: string) {
  const clean = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || "asset.bin";
}

function maxUploadBytes() {
  const configured = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024);
  return Number.isFinite(configured) && configured > 0 ? configured : 25 * 1024 * 1024;
}
