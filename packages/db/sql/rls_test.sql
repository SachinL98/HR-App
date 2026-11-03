-- Run as hr_app. Expects two tenants, each sees only its own rows.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL app.tenant_id = '00000000-0000-0000-0000-00000000000a';
INSERT INTO "Tenant"(id,slug,"legalName","displayName",country,"timeZone",currency,"workWeek","updatedAt")
  VALUES ('00000000-0000-0000-0000-00000000000a','acme','Acme Ltd','Acme','GB','Europe/London','GBP','{1,2,3,4,5}',now());
INSERT INTO "Department"(id,"tenantId",name) VALUES (gen_random_uuid(),'00000000-0000-0000-0000-00000000000a','Engineering');
COMMIT;
BEGIN;
SET LOCAL app.tenant_id = '00000000-0000-0000-0000-00000000000b';
INSERT INTO "Tenant"(id,slug,"legalName","displayName",country,"timeZone",currency,"workWeek","updatedAt")
  VALUES ('00000000-0000-0000-0000-00000000000b','lanka','Lanka Pvt','Lanka','LK','Asia/Colombo','LKR','{1,2,3,4,5}',now());
INSERT INTO "Department"(id,"tenantId",name) VALUES (gen_random_uuid(),'00000000-0000-0000-0000-00000000000b','Finance');
SELECT 'tenant B sees departments: ' || string_agg(name, ',') FROM "Department";
COMMIT;
BEGIN;
SET LOCAL app.tenant_id = '00000000-0000-0000-0000-00000000000a';
SELECT 'tenant A sees departments: ' || string_agg(name, ',') FROM "Department";
SELECT 'tenant A sees tenants: ' || count(*) FROM "Tenant";
COMMIT;
SELECT 'no tenant set sees departments: ' || count(*) FROM "Department";
