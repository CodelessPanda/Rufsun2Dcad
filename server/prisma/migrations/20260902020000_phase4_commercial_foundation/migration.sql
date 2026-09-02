-- Phase 4 commercial foundation: plans, subscriptions, entitlements, allocations, and usage.

ALTER TYPE "SeatType" ADD VALUE IF NOT EXISTS 'no_seat';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanCode') THEN
    CREATE TYPE "PlanCode" AS ENUM ('starter', 'professional', 'business', 'enterprise', 'distributor', 'internal');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'grace_period', 'suspended', 'canceled', 'expired');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingMode') THEN
    CREATE TYPE "BillingMode" AS ENUM ('manual', 'external');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionScope') THEN
    CREATE TYPE "SubscriptionScope" AS ENUM ('tenant', 'company');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "plans" (
  "id" UUID NOT NULL,
  "code" "PlanCode" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plans_code_key" ON "plans"("code");

CREATE TABLE IF NOT EXISTS "plan_entitlements" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "limit" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_entitlements_plan_id_key_key" ON "plan_entitlements"("plan_id", "key");
CREATE INDEX IF NOT EXISTS "plan_entitlements_key_idx" ON "plan_entitlements"("key");

ALTER TABLE "plan_entitlements" DROP CONSTRAINT IF EXISTS "plan_entitlements_plan_id_fkey";
ALTER TABLE "plan_entitlements"
  ADD CONSTRAINT "plan_entitlements_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" UUID NOT NULL,
  "scope" "SubscriptionScope" NOT NULL DEFAULT 'tenant',
  "tenant_id" UUID,
  "company_id" UUID,
  "plan_id" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
  "billing_mode" "BillingMode" NOT NULL DEFAULT 'manual',
  "trial_starts_at" TIMESTAMP(3),
  "trial_ends_at" TIMESTAMP(3),
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "grace_ends_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_tenant_id_scope_key" ON "subscriptions"("tenant_id", "scope");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_company_id_key" ON "subscriptions"("company_id");
CREATE INDEX IF NOT EXISTS "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_tenant_id_fkey";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_company_id_fkey";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_plan_id_fkey";
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "tenant_seat_capacities" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "seat_type" "SeatType" NOT NULL,
  "total" INTEGER,
  "unlimited" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_seat_capacities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_seat_capacities_tenant_id_seat_type_key" ON "tenant_seat_capacities"("tenant_id", "seat_type");
CREATE INDEX IF NOT EXISTS "tenant_seat_capacities_seat_type_idx" ON "tenant_seat_capacities"("seat_type");

ALTER TABLE "tenant_seat_capacities" DROP CONSTRAINT IF EXISTS "tenant_seat_capacities_tenant_id_fkey";
ALTER TABLE "tenant_seat_capacities"
  ADD CONSTRAINT "tenant_seat_capacities_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "company_seat_allocations" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "seat_type" "SeatType" NOT NULL,
  "allocated" INTEGER,
  "unlimited" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_seat_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_seat_allocations_company_id_seat_type_key" ON "company_seat_allocations"("company_id", "seat_type");
CREATE INDEX IF NOT EXISTS "company_seat_allocations_seat_type_idx" ON "company_seat_allocations"("seat_type");

ALTER TABLE "company_seat_allocations" DROP CONSTRAINT IF EXISTS "company_seat_allocations_company_id_fkey";
ALTER TABLE "company_seat_allocations"
  ADD CONSTRAINT "company_seat_allocations_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "usage_meters" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "company_id" UUID,
  "key" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_meters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "usage_meters_tenant_id_company_id_key_period_start_key" ON "usage_meters"("tenant_id", "company_id", "key", "period_start");
CREATE INDEX IF NOT EXISTS "usage_meters_key_idx" ON "usage_meters"("key");
CREATE INDEX IF NOT EXISTS "usage_meters_period_start_idx" ON "usage_meters"("period_start");

ALTER TABLE "usage_meters" DROP CONSTRAINT IF EXISTS "usage_meters_tenant_id_fkey";
ALTER TABLE "usage_meters" DROP CONSTRAINT IF EXISTS "usage_meters_company_id_fkey";
ALTER TABLE "usage_meters"
  ADD CONSTRAINT "usage_meters_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_meters"
  ADD CONSTRAINT "usage_meters_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
