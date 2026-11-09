-- Breadmaker Prestige has two tiers: Community (the existing plan, code "hub") and Partner (code "partner"),
-- a premium, capped, apply-and-approve tier with a WhatsApp developer agent, hosting on Restart servers,
-- a Kumoda account and priority support. A Partner is also a member, so everything Community members get
-- (is_hub_member, has_course_access) works for them unchanged. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Plans

insert into breadmaker.membership_plans (code, label, description, price_minor, currency, active) values
  ('partner', 'Breadmaker Prestige Partner', 'A private community and an engineering partner on call.', 40000, 'USD', false)
on conflict (code) do nothing;

-- Community starts at $97 a month while it still has the old placeholder price. Change it any time in Studio.
update breadmaker.membership_plans
set price_minor = 9700, currency = 'USD', alt_price_minor = null
where code = 'hub' and price_minor = 500000 and currency = 'NGN';

-- ---------------------------------------------------------------------------
-- Helpers

create or replace function breadmaker.my_email()
returns text
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select lower(email) from auth.users where id = auth.uid();
$$;

-- The signed-in person's active plan code ("hub" or "partner"), or null.
create or replace function breadmaker.my_plan()
returns text
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select m.plan_code
  from breadmaker.memberships m
  where m.email = breadmaker.my_email() and m.current_period_end > now();
$$;

create or replace function breadmaker.is_partner(check_email text)
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select exists (
    select 1 from breadmaker.memberships m
    where m.email = lower(check_email) and m.plan_code = 'partner' and m.current_period_end > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables

create table if not exists breadmaker.member_services (
  email text primary key,
  whatsapp_number text,
  whatsapp_verified_at timestamptz,
  agent_status text not null default 'none' check (agent_status in ('none', 'provisioning', 'active', 'paused')),
  agent_budget_minor integer not null default 2000 check (agent_budget_minor >= 0),
  agent_spent_minor integer not null default 0 check (agent_spent_minor >= 0),
  budget_period_start date not null default current_date,
  kumoda_status text not null default 'none' check (kumoda_status in ('none', 'requested', 'active', 'suspended')),
  kumoda_url text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists breadmaker.member_repos (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  status text not null default 'requested' check (status in ('requested', 'connected', 'removed')),
  created_at timestamptz not null default now(),
  unique (email, repo)
);

create table if not exists breadmaker.member_projects (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  domain text not null default '',
  status text not null default 'deploying' check (status in ('deploying', 'running', 'degraded', 'down')),
  uptime_30d numeric(5, 2) check (uptime_30d between 0 and 100),
  console_url text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists member_projects_email_idx on breadmaker.member_projects (email);

create table if not exists breadmaker.partner_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 5 and 200),
  phone text not null default '',
  business text not null default '',
  needs text not null default '' check (char_length(needs) <= 3000),
  status text not null default 'new' check (status in ('new', 'approved', 'declined')),
  created_at timestamptz not null default now()
);

alter table breadmaker.member_services enable row level security;
alter table breadmaker.member_repos enable row level security;
alter table breadmaker.member_projects enable row level security;
alter table breadmaker.partner_applications enable row level security;

-- Members read their own rows; the team reads everything; owners and coaches write.
drop policy if exists "Read own services" on breadmaker.member_services;
create policy "Read own services" on breadmaker.member_services for select to authenticated
  using (email = breadmaker.my_email() or breadmaker.is_team_member());
drop policy if exists "Team write services" on breadmaker.member_services;
create policy "Team write services" on breadmaker.member_services for all to authenticated
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Read own repos" on breadmaker.member_repos;
create policy "Read own repos" on breadmaker.member_repos for select to authenticated
  using (email = breadmaker.my_email() or breadmaker.is_team_member());
drop policy if exists "Team write repos" on breadmaker.member_repos;
create policy "Team write repos" on breadmaker.member_repos for all to authenticated
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Read own projects" on breadmaker.member_projects;
create policy "Read own projects" on breadmaker.member_projects for select to authenticated
  using (email = breadmaker.my_email() or breadmaker.is_team_member());
drop policy if exists "Team write projects" on breadmaker.member_projects;
create policy "Team write projects" on breadmaker.member_projects for all to authenticated
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Anyone can apply" on breadmaker.partner_applications;
create policy "Anyone can apply" on breadmaker.partner_applications for insert to anon, authenticated
  with check (status = 'new');
drop policy if exists "Team read applications" on breadmaker.partner_applications;
create policy "Team read applications" on breadmaker.partner_applications for select to authenticated
  using (breadmaker.is_team_member());
drop policy if exists "Team update applications" on breadmaker.partner_applications;
create policy "Team update applications" on breadmaker.partner_applications for update to authenticated
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

grant select, insert, update, delete on breadmaker.member_services, breadmaker.member_repos, breadmaker.member_projects to authenticated;
grant insert on breadmaker.partner_applications to anon, authenticated;
grant select, update on breadmaker.partner_applications to authenticated;
grant select, insert, update on breadmaker.member_services, breadmaker.member_repos, breadmaker.member_projects, breadmaker.partner_applications to service_role;

-- ---------------------------------------------------------------------------
-- What a member can do for themselves

create or replace function breadmaker.set_my_whatsapp(new_number text)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  me text := breadmaker.my_email();
  cleaned text := regexp_replace(coalesce(new_number, ''), '[\s()-]', '', 'g');
begin
  if me is null or not exists (select 1 from breadmaker.memberships where email = me and current_period_end > now()) then
    raise exception 'Only active members can add a WhatsApp number.' using errcode = '42501';
  end if;
  if cleaned !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the international format, for example +2348012345678.' using errcode = '22023';
  end if;
  insert into breadmaker.member_services (email, whatsapp_number, whatsapp_verified_at)
  values (me, cleaned, null)
  on conflict (email) do update
    set whatsapp_number = excluded.whatsapp_number,
        whatsapp_verified_at = case when breadmaker.member_services.whatsapp_number = excluded.whatsapp_number then breadmaker.member_services.whatsapp_verified_at else null end,
        updated_at = now();
end;
$$;

create or replace function breadmaker.request_repo(new_repo text)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  me text := breadmaker.my_email();
  cleaned text := regexp_replace(trim(coalesce(new_repo, '')), '^(https?://)?(www\.)?github\.com/', '');
begin
  if me is null or not breadmaker.is_partner(me) then
    raise exception 'Repositories are connected for Partner members.' using errcode = '42501';
  end if;
  cleaned := regexp_replace(cleaned, '(\.git)?/?$', '');
  if cleaned !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then
    raise exception 'Use owner/repository, for example acme/website.' using errcode = '22023';
  end if;
  insert into breadmaker.member_repos (email, repo) values (me, cleaned)
  on conflict (email, repo) do update set status = 'requested' where breadmaker.member_repos.status = 'removed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Team: move a member between plans (they keep their current end date)

create or replace function breadmaker.set_member_plan(for_email text, new_plan text)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can change a member''s plan.' using errcode = '42501';
  end if;
  if new_plan not in ('hub', 'partner') then
    raise exception 'Unknown plan.' using errcode = '22023';
  end if;
  update breadmaker.memberships set plan_code = new_plan, updated_at = now() where email = lower(trim(for_email));
  if not found then
    raise exception 'That email is not a member yet.' using errcode = 'P0002';
  end if;
  if new_plan = 'partner' then
    insert into breadmaker.member_services (email) values (lower(trim(for_email))) on conflict (email) do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Priority support for Partner members

alter table breadmaker.support_tickets add column if not exists priority text not null default 'standard' check (priority in ('standard', 'priority'));

create or replace function breadmaker.set_ticket_priority()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  new.priority := case when breadmaker.is_partner(new.email) then 'priority' else 'standard' end;
  return new;
end;
$$;

drop trigger if exists support_ticket_priority on breadmaker.support_tickets;
create trigger support_ticket_priority before insert on breadmaker.support_tickets
  for each row execute function breadmaker.set_ticket_priority();

grant execute on function breadmaker.my_email() to authenticated;
grant execute on function breadmaker.my_plan() to authenticated;
grant execute on function breadmaker.is_partner(text) to authenticated;
grant execute on function breadmaker.set_my_whatsapp(text) to authenticated;
grant execute on function breadmaker.request_repo(text) to authenticated;
grant execute on function breadmaker.set_member_plan(text, text) to authenticated;
