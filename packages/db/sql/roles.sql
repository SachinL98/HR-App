-- Database roles used at runtime. Run once as a superuser (see README).
--  hr_app    : the API's normal connection. Subject to row-level security.
--  hr_system : used ONLY for pre-tenant lookups (login, invite token resolution).
--              BYPASSRLS, so keep its use limited to AuthService.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hr_app') THEN
    CREATE ROLE hr_app LOGIN PASSWORD 'pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hr_system') THEN
    CREATE ROLE hr_system LOGIN PASSWORD 'pw' BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO hr_app, hr_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hr_app, hr_system;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO hr_app, hr_system;
