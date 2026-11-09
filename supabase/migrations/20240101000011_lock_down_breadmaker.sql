-- Lock down the breadmaker schema.
--
-- Before this migration:
--   * breadmaker.profiles was readable by anyone holding the public anon key
--     (emails, phone numbers, saved payment tokens).
--   * breadmaker.courses allowed anyone to insert, update and delete rows.
--   * anon held INSERT/UPDATE/DELETE on every breadmaker table.
--
-- Scope: only the breadmaker schema. It does not touch auth.users triggers,
-- the restart schema, or anything else the Restart console relies on on this
-- shared Supabase instance. Safe to re-run.

-- Admin check that bypasses RLS on profiles, so policies on profiles can call it
-- without recursing.
create or replace function breadmaker.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select exists (
    select 1 from breadmaker.profiles where id = check_user_id and role = 'admin'
  );
$$;

revoke all on function breadmaker.is_admin(uuid) from public;
grant execute on function breadmaker.is_admin(uuid) to anon, authenticated;

-- The contact form writes here. Some databases never got 20240101000001, so create it if missing.
create table if not exists breadmaker.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  size text,
  interests jsonb,
  message text,
  created_at timestamptz default now()
);

-- Every table in the schema gets RLS. Tables with no policy become unreadable
-- through the API, which is the safe default; the service role still bypasses RLS.
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'breadmaker' loop
    execute format('alter table breadmaker.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Profiles: a user sees their own row; admins see everyone.
drop policy if exists "Public profiles are viewable by everyone." on breadmaker.profiles;
drop policy if exists "Users view own profile" on breadmaker.profiles;
create policy "Users view own profile" on breadmaker.profiles
  for select using (id = auth.uid() or breadmaker.is_admin());

-- Legacy courses table (if present): public read, admin-only writes.
do $$
begin
  if to_regclass('breadmaker.courses') is not null then
    drop policy if exists "Service role can insert courses." on breadmaker.courses;
    drop policy if exists "Admins manage legacy courses" on breadmaker.courses;
    create policy "Admins manage legacy courses" on breadmaker.courses
      for all using (breadmaker.is_admin()) with check (breadmaker.is_admin());
  end if;
end $$;

-- The anonymous role never writes directly, except the public forms below.
revoke insert, update, delete, truncate on all tables in schema breadmaker from anon;

-- Waitlist (if present): anyone can join, only admins can read.
do $$
begin
  if to_regclass('breadmaker.waitlist') is not null then
    drop policy if exists "Anyone can join the waitlist" on breadmaker.waitlist;
    create policy "Anyone can join the waitlist" on breadmaker.waitlist
      for insert to anon, authenticated with check (true);
    drop policy if exists "Admins read the waitlist" on breadmaker.waitlist;
    create policy "Admins read the waitlist" on breadmaker.waitlist
      for select using (breadmaker.is_admin());
    grant insert on breadmaker.waitlist to anon, authenticated;
  end if;
end $$;

-- Contact messages and program applications: anyone can send, only admins can read.
drop policy if exists "Anyone can send a message" on breadmaker.contact_messages;
create policy "Anyone can send a message" on breadmaker.contact_messages
  for insert to anon, authenticated with check (true);
drop policy if exists "Admins read messages" on breadmaker.contact_messages;
create policy "Admins read messages" on breadmaker.contact_messages
  for select using (breadmaker.is_admin());
grant insert on breadmaker.contact_messages to anon, authenticated;
