DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FileVisibility') THEN
    CREATE TYPE "FileVisibility" AS ENUM ('private', 'public');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BackgroundJobStatus') THEN
    CREATE TYPE "BackgroundJobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "file_assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID,
    "created_by" UUID,
    "purpose" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_driver" TEXT NOT NULL,
    "storage_bucket" TEXT,
    "storage_key" TEXT NOT NULL,
    "checksum_sha256" TEXT,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "background_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "company_id" UUID,
    "project_id" UUID,
    "created_by" UUID,
    "type" TEXT NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "file_assets_tenant_id_idx" ON "file_assets"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "file_assets_company_id_idx" ON "file_assets"("company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "file_assets_project_id_idx" ON "file_assets"("project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "file_assets_purpose_idx" ON "file_assets"("purpose");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "file_assets_created_at_idx" ON "file_assets"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "background_jobs_tenant_id_idx" ON "background_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "background_jobs_company_id_idx" ON "background_jobs"("company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "background_jobs_project_id_idx" ON "background_jobs"("project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "background_jobs_status_idx" ON "background_jobs"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "background_jobs_type_idx" ON "background_jobs"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "background_jobs_queued_at_idx" ON "background_jobs"("queued_at");
