-- Enquiries from Launchpad funnels: stored first, then delivered, with retry.
--
-- A funnel's enquiry form posts to the funnel-lead edge function, never to Kumoda directly. The function saves
-- the enquiry here (the backup), then forwards it to the customer's Kumoda lead form, or emails the customer if
-- Kumoda is not connected. A delivery that fails is retried every minute with a growing delay, so an outage at
-- Kumoda or at our end loses nothing, and the Kumoda form's address is never exposed in the public page.
--
-- Run after migration 49. Safe to re-run. Switch the retry job on once, by hand (the secret is the same as in
-- migration 48):
--
--   alter database postgres set app.settings.funnel_lead_url = 'https://db.restart.ng/functions/v1/funnel-lead';

-- The public identifier a funnel's form uses to say which funnel an enquiry is for. It is not a secret: it only
-- lets someone send an enquiry to that funnel's owner, the same as filling in the form.
alter table breadmaker.build_jobs
  add column if not exists lead_key text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists build_jobs_lead_key_idx on breadmaker.build_jobs (lead_key);

create table if not exists breadmaker.funnel_leads (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references breadmaker.build_jobs(id) on delete cascade,
  -- What was submitted: name, email, phone, message.
  payload jsonb not null,
  -- Explicit, per-submission WhatsApp consent, with the wording the person saw.
  consent_whatsapp boolean not null default false,
  consent_text text,
  source_url text,
  ip text,
  user_agent text,
  -- pending: waiting to be delivered. sent: delivered to Kumoda. emailed: no Kumoda, the owner was emailed.
  -- failed: gave up after the last retry (the owner is emailed instead, and the row is kept).
  status text not null check (status in ('pending', 'sent', 'emailed', 'failed')) default 'pending',
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists funnel_leads_due_idx on breadmaker.funnel_leads (next_attempt_at) where status = 'pending';
create index if not exists funnel_leads_job_idx on breadmaker.funnel_leads (job_id, created_at desc);

-- Nobody reads these through the API except the funnel's owner, who sees their own enquiries.
alter table breadmaker.funnel_leads enable row level security;

drop policy if exists "Owner read funnel leads" on breadmaker.funnel_leads;
create policy "Owner read funnel leads" on breadmaker.funnel_leads
  for select using (
    exists (
      select 1 from breadmaker.build_jobs j
      join breadmaker.applications a on a.id = j.application_id
      where j.id = funnel_leads.job_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "Team read funnel leads" on breadmaker.funnel_leads;
create policy "Team read funnel leads" on breadmaker.funnel_leads
  for select using (breadmaker.is_team_member());

grant select on breadmaker.funnel_leads to authenticated;

-- Retry: every minute, ask funnel-lead to deliver whatever is due.
create extension if not exists pg_cron;

select cron.unschedule('funnel-lead-drain')
where exists (select 1 from cron.job where jobname = 'funnel-lead-drain');

select cron.schedule(
  'funnel-lead-drain',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.funnel_lead_url', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', current_setting('app.settings.build_brief_secret', true)),
    body := '{"action":"drain"}'::jsonb
  )
  where coalesce(current_setting('app.settings.funnel_lead_url', true), '') <> ''
    and exists (select 1 from breadmaker.funnel_leads where status = 'pending' and next_attempt_at <= now());
  $$
);
