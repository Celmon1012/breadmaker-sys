-- "Tell me when it's ready": demand for systems that are still in testing.
--
-- Anyone can leave an email against a system (no sign-in). The team reads the counts to decide
-- which system to build and record first. Anon callers can only add a row through the RPC;
-- they cannot read anyone else's. Safe to re-run.

create table if not exists breadmaker.system_interest (
  id uuid primary key default gen_random_uuid(),
  system_id text not null check (length(system_id) between 1 and 80),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null default '',
  -- where they asked from: systems, leak-result, leak-report
  source text not null default 'systems',
  created_at timestamptz not null default now()
);

create unique index if not exists system_interest_unique on breadmaker.system_interest (system_id, lower(email));
create index if not exists system_interest_system_idx on breadmaker.system_interest (system_id);

alter table breadmaker.system_interest enable row level security;

drop policy if exists "Team read system interest" on breadmaker.system_interest;
create policy "Team read system interest" on breadmaker.system_interest
  for select using (breadmaker.is_team_member());

grant select on breadmaker.system_interest to authenticated;
grant all on breadmaker.system_interest to service_role;

-- Adds the caller's email to a system's list. Asking twice is fine and changes nothing.
create or replace function breadmaker.register_system_interest(
  p_system_id text, p_email text, p_name text default '', p_source text default 'systems'
)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if p_system_id is null or btrim(p_system_id) = '' then
    raise exception 'Pick a system.' using errcode = '22023';
  end if;
  if p_email is null or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  insert into breadmaker.system_interest (system_id, email, name, source)
  values (left(btrim(p_system_id), 80), btrim(p_email), left(btrim(coalesce(p_name, '')), 120), left(btrim(coalesce(p_source, 'systems')), 40))
  on conflict (system_id, lower(email)) do nothing;
end;
$$;

-- Team only: how many people asked for each system.
create or replace function breadmaker.system_interest_counts()
returns table (system_id text, people integer, last_asked timestamptz)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select i.system_id, count(*)::integer, max(i.created_at)
  from breadmaker.system_interest i
  where breadmaker.is_team_member()
  group by i.system_id
  order by count(*) desc;
$$;

grant execute on function breadmaker.register_system_interest(text, text, text, text) to anon, authenticated;
grant execute on function breadmaker.system_interest_counts() to authenticated;
