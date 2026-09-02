-- Phase 3 identity, roles, permissions, invitations, and seat foundation.
-- This migration preserves the Phase 2 compatibility mapping where workspaces are Companies.

ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'support_admin';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantRole') THEN
    CREATE TYPE "TenantRole" AS ENUM ('owner', 'admin', 'billing', 'support', 'member');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SeatType') THEN
    CREATE TYPE "SeatType" AS ENUM ('designer', 'sales', 'viewer');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvitationScope') THEN
    CREATE TYPE "InvitationScope" AS ENUM ('tenant', 'company');
  END IF;
END $$;

ALTER TYPE "WorkspaceMemberRole" ADD VALUE IF NOT EXISTS 'company_owner';
ALTER TYPE "WorkspaceMemberRole" ADD VALUE IF NOT EXISTS 'company_admin';
ALTER TYPE "WorkspaceMemberRole" ADD VALUE IF NOT EXISTS 'design_manager';
ALTER TYPE "WorkspaceMemberRole" ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE "WorkspaceMemberRole" ADD VALUE IF NOT EXISTS 'sales_rep';
ALTER TYPE "WorkspaceMemberRole" ADD VALUE IF NOT EXISTS 'project_viewer';

ALTER TYPE "WorkspaceMemberStatus" ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE "WorkspaceMemberStatus" ADD VALUE IF NOT EXISTS 'removed';

ALTER TABLE "tenant_memberships"
  ADD COLUMN IF NOT EXISTS "status" "WorkspaceMemberStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "invited_by" UUID,
  ADD COLUMN IF NOT EXISTS "joined_at" TIMESTAMP(3);

UPDATE "tenant_memberships"
SET "joined_at" = COALESCE("joined_at", "created_at")
WHERE "status" = 'active';

ALTER TABLE "tenant_memberships"
  ALTER COLUMN "role" TYPE "TenantRole" USING (
    CASE
      WHEN "role" = 'owner' THEN 'owner'
      WHEN "role" = 'admin' THEN 'admin'
      WHEN "role" = 'billing' THEN 'billing'
      WHEN "role" = 'support' THEN 'support'
      ELSE 'member'
    END
  )::"TenantRole",
  ALTER COLUMN "role" SET DEFAULT 'member';

ALTER TABLE "workspace_members"
  ADD COLUMN IF NOT EXISTS "seat_type" "SeatType" NOT NULL DEFAULT 'designer';

ALTER TABLE "refresh_sessions"
  ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "user_agent" TEXT,
  ADD COLUMN IF NOT EXISTS "ip_address" TEXT;

UPDATE "refresh_sessions"
SET "last_used_at" = COALESCE("last_used_at", "created_at");

CREATE TABLE IF NOT EXISTS "invitations" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "scope" "InvitationScope" NOT NULL,
  "tenant_id" UUID,
  "company_id" UUID,
  "tenant_role" "TenantRole",
  "company_role" "WorkspaceMemberRole",
  "seat_type" "SeatType",
  "token_hash" TEXT NOT NULL,
  "invited_by_user_id" UUID NOT NULL,
  "accepted_by_user_id" UUID,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "invitations_email_idx" ON "invitations"("email");
CREATE INDEX IF NOT EXISTS "invitations_tenant_id_idx" ON "invitations"("tenant_id");
CREATE INDEX IF NOT EXISTS "invitations_company_id_idx" ON "invitations"("company_id");
CREATE INDEX IF NOT EXISTS "invitations_expires_at_idx" ON "invitations"("expires_at");

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_invited_by_user_id_fkey"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_accepted_by_user_id_fkey"
  FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
