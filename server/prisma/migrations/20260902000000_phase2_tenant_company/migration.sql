-- Phase 2 multi-level SaaS migration.
-- Existing workspace tables are preserved physically and become the Company storage layer.

CREATE TYPE "PlatformRole" AS ENUM ('user', 'super_admin');
CREATE TYPE "TenantType" AS ENUM ('direct', 'distributor', 'enterprise');
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'archived');

ALTER TYPE "WorkspaceStatus" ADD VALUE IF NOT EXISTS 'suspended';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "platform_role" "PlatformRole" NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS "tenants" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "type" "TenantType" NOT NULL DEFAULT 'direct',
  "status" "TenantStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants"("slug");

INSERT INTO "tenants" ("id", "name", "slug", "type", "status", "created_at", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000001', 'Rufsun Direct', 'rufsun-direct', 'direct', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "status" = EXCLUDED."status",
  "updated_at" = CURRENT_TIMESTAMP;

ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID;

UPDATE "workspaces"
SET "tenant_id" = (SELECT "id" FROM "tenants" WHERE "slug" = 'rufsun-direct')
WHERE "tenant_id" IS NULL;

ALTER TABLE "workspaces"
  ALTER COLUMN "tenant_id" SET NOT NULL;

ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

UPDATE "workspaces"
SET "archived_at" = COALESCE("archived_at", "updated_at")
WHERE "status" = 'archived';

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "workspaces_tenant_id_idx" ON "workspaces"("tenant_id");

DROP INDEX IF EXISTS "workspaces_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_tenant_id_slug_key" ON "workspaces"("tenant_id", "slug");

CREATE TABLE IF NOT EXISTS "tenant_memberships" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_memberships_tenant_id_user_id_key" ON "tenant_memberships"("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "tenant_memberships_tenant_id_idx" ON "tenant_memberships"("tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

INSERT INTO "tenant_memberships" ("id", "tenant_id", "user_id", "role", "created_at", "updated_at")
SELECT DISTINCT
  md5("tenant_id"::text || ':' || "created_by"::text)::uuid,
  "tenant_id",
  "created_by",
  'owner',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces"
ON CONFLICT ("tenant_id", "user_id") DO NOTHING;

INSERT INTO "tenant_memberships" ("id", "tenant_id", "user_id", "role", "created_at", "updated_at")
SELECT DISTINCT
  md5(w."tenant_id"::text || ':' || wm."user_id"::text)::uuid,
  w."tenant_id",
  wm."user_id",
  CASE WHEN wm."role" IN ('owner', 'admin') THEN wm."role"::text ELSE 'member' END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspace_members" wm
JOIN "workspaces" w ON w."id" = wm."workspace_id"
WHERE wm."status" = 'active'
ON CONFLICT ("tenant_id", "user_id") DO UPDATE SET
  "role" = CASE
    WHEN "tenant_memberships"."role" = 'owner' THEN 'owner'
    WHEN EXCLUDED."role" = 'owner' THEN 'owner'
    WHEN "tenant_memberships"."role" = 'admin' THEN 'admin'
    WHEN EXCLUDED."role" = 'admin' THEN 'admin'
    ELSE 'member'
  END,
  "updated_at" = CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "workspace_members_workspace_id_idx" ON "workspace_members"("workspace_id");
