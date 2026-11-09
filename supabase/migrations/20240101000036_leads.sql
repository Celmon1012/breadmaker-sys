-- Leads: people who left an email with consent but have not bought.
--
-- One row per email. Leak Test submitters are copied in automatically (they already consented on
-- the test form); the Guides and Tools pages add the rest through the lead-capture edge function.
-- Anon and signed-in callers cannot read or write this table: rows are added by that function
-- (service role) and read by the team. Safe to re-run.

create table if not exists breadmaker.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null default '',
  -- where they came from: guide:<slug>, tools, leak-test, home
  source text not null default 'site' check (length(source) between 1 and 80),
  -- the Leak Test pillar they care about, when known (offer, sales, operations, cash, team, tech)
  pillar text check (pillar in ('offer', 'sales', 'operations', 'cash', 'team', 'tech')),
  consent_text text not null,
  consented_at timestamptz not null default now(),
  unsubscribe_token uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists leads_email_unique on breadmaker.leads (lower(email));
create unique index if not exists leads_unsubscribe_token_idx on breadmaker.leads (unsubscribe_token);
create index if not exists leads_created_idx on breadmaker.leads (created_at desc);

alter table breadmaker.leads enable row level security;

drop policy if exists "Team read leads" on breadmaker.leads;
create policy "Team read leads" on breadmaker.leads
  for select using (breadmaker.is_team_member());

revoke all on breadmaker.leads from anon, authenticated;
grant select on breadmaker.leads to authenticated;
grant all on breadmaker.leads to service_role;

-- Copy Leak Test submitters in (they ticked the consent box on the test form). Re-running adds nothing twice.
insert into breadmaker.leads (email, name, source, consent_text, consented_at)
select distinct on (lower(s.email)) btrim(s.email), left(btrim(s.name), 120), 'leak-test',
  'Leak Test form consent', coalesce(s.consented_at, s.created_at)
from breadmaker.leak_test_submissions s
where s.consent and s.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
order by lower(s.email), s.created_at
on conflict do nothing;

-- Keep doing it for every new Leak Test submission.
create or replace function breadmaker.lead_from_leak_test()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if new.consent and new.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    insert into breadmaker.leads (email, name, source, consent_text, consented_at)
    values (btrim(new.email), left(btrim(new.name), 120), 'leak-test', 'Leak Test form consent', coalesce(new.consented_at, now()))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists leak_test_to_lead on breadmaker.leak_test_submissions;
create trigger leak_test_to_lead
  after insert on breadmaker.leak_test_submissions
  for each row execute function breadmaker.lead_from_leak_test();

-- Stops emails to the person who owns this token. The link in every email carries it. Repeating is harmless.
create or replace function breadmaker.unsubscribe_lead(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  found integer;
begin
  update breadmaker.leads set unsubscribed_at = coalesce(unsubscribed_at, now())
  where unsubscribe_token = p_token;
  get diagnostics found = row_count;
  return found > 0;
end;
$$;

-- Team only: every lead, newest first.
create or replace function breadmaker.list_leads()
returns table (id uuid, email text, name text, source text, pillar text, created_at timestamptz, unsubscribed_at timestamptz)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select l.id, l.email, l.name, l.source, l.pillar, l.created_at, l.unsubscribed_at
  from breadmaker.leads l
  where breadmaker.is_team_member()
  order by l.created_at desc;
$$;

grant execute on function breadmaker.unsubscribe_lead(uuid) to anon, authenticated;
grant execute on function breadmaker.list_leads() to authenticated;
