-- Let the edge functions (which use the service role) read and write the tables
-- created after the first migration.
--
-- 20240101000002_lms_and_auth.sql granted the service role everything that existed
-- at that moment. Tables created later (payments, applications, program_tiers,
-- leak_test_submissions and so on) were never granted, so the Flutterwave and
-- Business Leak Test functions failed with "permission denied" and the leak-test
-- checkout answered "We could not find that result."
--
-- The service role bypasses row level security, so this only adds the table
-- privileges it was missing. Public (anon) access is unchanged. Safe to re-run.

grant usage on schema breadmaker to service_role;
grant all on all tables in schema breadmaker to service_role;
grant all on all sequences in schema breadmaker to service_role;

-- Tables created by later migrations get the same grant automatically.
alter default privileges in schema breadmaker grant all on tables to service_role;
alter default privileges in schema breadmaker grant all on sequences to service_role;
