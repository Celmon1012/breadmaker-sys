-- Launchpad build jobs: one row per Launchpad application, holding the funnel brief that the
-- build-brief edge function writes from the applicant's onboarding answers, and the state of the
-- automated build that follows (custom site first, then WordPress).
--
-- Phase 1 (this migration): the job row, the brief, and a trigger that asks build-brief to draft the
-- brief as soon as an application is accepted or paid. The Studio can also generate or regenerate it
-- by hand. The build steps themselves (deploy, Kumoda connection) come in later phases and use the
-- `status`, `log` and `outputs` columns, so they need no further migration.
--
-- Safe to re-run. To switch on the automatic draft, set these once, by hand (the secret is the same
-- CRON_SECRET as migration 43's app.settings.crm_sync_secret):
--
--   alter database postgres set app.settings.build_brief_url =
--     'https://db.restart.ng/functions/v1/build-brief';
--   alter database postgres set app.settings.build_brief_secret = '<CRON_SECRET>';
--
-- Without them nothing breaks: jobs are still created and the brief is generated from the Studio.

create table if not exists breadmaker.build_jobs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references breadmaker.applications(id) on delete cascade,
  -- shopify | wordpress | custom, copied from the applicant's choice.
  platform text not null default '',
  -- queued: waiting for a brief. brief_ready: drafted. building / review / live: later phases. failed: see log.
  status text not null check (status in ('queued', 'brief_ready', 'building', 'review', 'live', 'failed')) default 'queued',
  -- The funnel brief (headline, offer, sections, FAQ, follow-up messages, what is still missing).
  brief jsonb,
  brief_error text,
  brief_generated_at timestamptz,
  -- Step-by-step record of what the automation did, newest last: [{at, step, ok, detail}].
  log jsonb not null default '[]'::jsonb,
  -- Where the finished build lives: {site_url, repo_url, kumoda_workspace, ...}.
  outputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists build_jobs_status_idx on breadmaker.build_jobs (status, created_at desc);

-- A job for every Launchpad application, new and existing.
create or replace function breadmaker.build_job_create()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if new.program = 'launchpad' then
    insert into breadmaker.build_jobs (application_id, platform)
    values (new.id, lower(coalesce(new.answers->>'platform', '')))
    on conflict (application_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists build_job_create on breadmaker.applications;
create trigger build_job_create after insert on breadmaker.applications
  for each row execute function breadmaker.build_job_create();

insert into breadmaker.build_jobs (application_id, platform)
select a.id, lower(coalesce(a.answers->>'platform', ''))
from breadmaker.applications a
where a.program = 'launchpad'
on conflict (application_id) do nothing;

-- Ask build-brief to draft the brief when an application is accepted or paid. Never blocks the status
-- change: if the settings are missing or the call fails, the brief is generated from the Studio instead.
create or replace function breadmaker.build_brief_request()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_url text := current_setting('app.settings.build_brief_url', true);
  v_secret text := current_setting('app.settings.build_brief_secret', true);
begin
  if new.program = 'launchpad' and coalesce(v_url, '') <> '' and coalesce(v_secret, '') <> '' then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('application_id', new.id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists build_brief_request on breadmaker.applications;
create trigger build_brief_request after update on breadmaker.applications
  for each row
  when (old.status is distinct from new.status and new.status in ('accepted', 'paid'))
  execute function breadmaker.build_brief_request();

-- Row level security: the team reads and edits; nobody else sees anything. The edge function uses the
-- service role.
alter table breadmaker.build_jobs enable row level security;

drop policy if exists "Team read build jobs" on breadmaker.build_jobs;
create policy "Team read build jobs" on breadmaker.build_jobs
  for select using (breadmaker.is_team_member());
drop policy if exists "Team update build jobs" on breadmaker.build_jobs;
create policy "Team update build jobs" on breadmaker.build_jobs
  for update using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

grant select, update on breadmaker.build_jobs to authenticated;
