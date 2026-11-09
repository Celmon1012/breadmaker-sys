-- Launchpad portal: the applicant's private funnel page, address and domain, and the automatic hand-offs.
--
-- The flow this supports:
--   1. An application arrives -> launchpad-start creates the applicant's Hub account, drafts the funnel brief
--      and emails them a private link (the access_token below).
--   2. They review the brief at /launchpad/brief/<token> (or in the Hub at /funnel), ask for changes, pick
--      their address and pay to build.
--   3. A successful payment marks the application paid and asks build-deploy to build and deploy the preview.
--
-- Run after migration 48. Safe to re-run. Switch the automatic steps on once, by hand (same secret as 48):
--
--   alter database postgres set app.settings.launchpad_start_url = 'https://db.restart.ng/functions/v1/launchpad-start';
--   alter database postgres set app.settings.build_deploy_url    = 'https://db.restart.ng/functions/v1/build-deploy';
--
-- (build_brief_secret from migration 48 is reused as the shared secret.) Without them nothing breaks: the team
-- can still start each step from the Studio.

alter table breadmaker.build_jobs
  add column if not exists access_token uuid not null default gen_random_uuid(),
  -- The address the preview and live site use: <site_slug>.<SITES_DOMAIN>. Set by the applicant, or generated.
  add column if not exists site_slug text,
  -- A domain the applicant owns and wants the funnel on, and whether its DNS has been checked: '' | pending | verified.
  add column if not exists custom_domain text,
  add column if not exists domain_status text not null default '',
  -- Changes asked for before payment (two are free) and after (a few are included).
  add column if not exists free_changes_used integer not null default 0,
  add column if not exists paid_changes_used integer not null default 0,
  add column if not exists change_log jsonb not null default '[]'::jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists welcomed_at timestamptz,
  add column if not exists kumoda_requested_at timestamptz;

create unique index if not exists build_jobs_access_token_idx on breadmaker.build_jobs (access_token);
create unique index if not exists build_jobs_site_slug_idx on breadmaker.build_jobs (lower(site_slug)) where site_slug is not null;
create unique index if not exists build_jobs_custom_domain_idx on breadmaker.build_jobs (lower(custom_domain)) where custom_domain is not null and custom_domain <> '';

-- A signed-in applicant can read their own build job (the Hub's "My funnel" page). Everything that changes
-- it goes through the launchpad-portal function, which checks the access token.
drop policy if exists "Owner read build job" on breadmaker.build_jobs;
create policy "Owner read build job" on breadmaker.build_jobs
  for select using (
    exists (select 1 from breadmaker.applications a where a.id = build_jobs.application_id and a.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Application received -> start the account, the brief and the email.

create or replace function breadmaker.launchpad_start_request()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_url text := current_setting('app.settings.launchpad_start_url', true);
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

-- Named to sort after build_job_create, so the job row exists when launchpad-start runs.
drop trigger if exists launchpad_start_request on breadmaker.applications;
create trigger launchpad_start_request after insert on breadmaker.applications
  for each row execute function breadmaker.launchpad_start_request();

-- ---------------------------------------------------------------------------
-- Payment confirmed -> mark the application paid and ask build-deploy to build the preview.

create or replace function breadmaker.launchpad_paid()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_url text := current_setting('app.settings.build_deploy_url', true);
  v_secret text := current_setting('app.settings.build_brief_secret', true);
begin
  if new.application_id is null or new.status <> 'successful' then
    return new;
  end if;
  if not exists (select 1 from breadmaker.applications a where a.id = new.application_id and a.program = 'launchpad') then
    return new;
  end if;

  update breadmaker.applications
     set status = 'paid', updated_at = now()
   where id = new.application_id and status in ('new', 'reviewed', 'accepted', 'invoiced');

  update breadmaker.build_jobs
     set paid_at = coalesce(paid_at, now()), updated_at = now()
   where application_id = new.application_id;

  if coalesce(v_url, '') <> '' and coalesce(v_secret, '') <> '' then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('application_id', new.application_id, 'action', 'build')
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists launchpad_paid on breadmaker.payments;
create trigger launchpad_paid after insert or update of status on breadmaker.payments
  for each row when (new.status = 'successful') execute function breadmaker.launchpad_paid();

-- Payments already made for Launchpad applications are carried over.
update breadmaker.build_jobs j
   set paid_at = coalesce(j.paid_at, p.paid)
  from (
    select application_id, min(coalesce(paid_at, updated_at, created_at)) as paid
      from breadmaker.payments
     where status = 'successful' and application_id is not null
     group by application_id
  ) p
 where p.application_id = j.application_id;
