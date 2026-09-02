-- Backfill legacy Phase 2 workspace roles after the Phase 3 enum values are committed.

UPDATE "workspace_members"
SET "role" = (
  CASE
    WHEN "role" = 'owner' THEN 'company_owner'
    WHEN "role" = 'admin' THEN 'company_admin'
    WHEN "role" = 'designer' THEN 'designer'
    WHEN "role" = 'sales' THEN 'sales_rep'
    WHEN "role" = 'viewer' THEN 'project_viewer'
    ELSE "role"::text
  END
)::"WorkspaceMemberRole";

UPDATE "workspace_members"
SET "seat_type" = (
  CASE
    WHEN "role" IN ('sales_manager', 'sales_rep') THEN 'sales'
    WHEN "role" = 'project_viewer' THEN 'viewer'
    ELSE 'designer'
  END
)::"SeatType";
