import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BadRequestException, NotImplementedException, NotFoundException } from "@nestjs/common";
import { readServerEnvironment } from "../common/env";

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface ObjectStorageProvider {
  readonly driver: "local" | "s3";
  readonly bucket?: string;
  put(key: string, object: StoredObject): Promise<void>;
  get(key: string): Promise<Buffer>;
  createSignedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}

export function createObjectStorageProvider(): ObjectStorageProvider {
  const env = readServerEnvironment();
  if (env.storageDriver === "s3") {
    return new S3CompatibleStorageProvider();
  }
  return new LocalObjectStorageProvider(env.localStoragePath);
}

export class LocalObjectStorageProvider implements ObjectStorageProvider {
  readonly driver = "local" as const;

  constructor(private readonly root: string) {}

  async put(key: string, object: StoredObject) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, object.body);
  }

  async get(key: string) {
    return readFile(this.resolve(key)).catch(() => {
      throw new NotFoundException("Asset not found");
    });
  }

  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    const base = path.resolve(this.root);
    if (!target.startsWith(base)) throw new BadRequestException("Invalid storage key.");
    return target;
  }
}

export class S3CompatibleStorageProvider implements ObjectStorageProvider {
  readonly driver = "s3" as const;
  readonly bucket = process.env.S3_BUCKET;

  async put(_key: string, _object: StoredObject): Promise<void> {
    throw new NotImplementedException("S3-compatible storage is configured but no provider adapter is installed.");
  }

  async get(_key: string): Promise<Buffer> {
    throw new NotImplementedException("S3-compatible storage is configured but no provider adapter is installed.");
  }

  async createSignedUrl(_key: string, _expiresInSeconds: number): Promise<string> {
    throw new NotImplementedException("S3-compatible signed URLs require a provider adapter.");
  }
}
