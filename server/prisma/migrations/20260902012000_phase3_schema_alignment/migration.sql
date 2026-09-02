-- Align manual Phase 3 SQL with the Prisma datamodel so migrate dev is non-interactive.

ALTER TABLE "tenants" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "tenant_memberships" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "invitations" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_tenant_id_fkey";
ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_company_id_fkey";
ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_accepted_by_user_id_fkey";

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_accepted_by_user_id_fkey"
  FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
