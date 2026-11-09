-- Evo CRM sync: every form submission is queued here and the crm-sync edge function pushes it
-- into the CRM (contact + custom attributes + a deal card), so no lead is lost if the CRM is down.
--
-- Entry points covered: Guides/Tools newsletter leads, the contact form, programme applications
-- (Foundry, Launchpad, done-with-you), cohort waitlists, the Business Leak Test (and its paid
-- reports), Prestige Partner applications, "tell me when it's ready" requests, and successful
-- payments. Status changes on applications, partner applications and leak reports queue a second
-- event so the deal card moves along.
--
-- The triggers never block the form: a failure to queue is swallowed. Secrets (access tokens,
-- unsubscribe tokens, raw gateway payloads, quiz answers) are stripped before anything is queued.
-- Safe to re-run. Set the function URL once, by hand (same wiring as migration 25):
--
--   alter database postgres set app.settings.crm_sync_url =
--     'https://db.restart.ng/functions/v1/crm-sync';

create table if not exists breadmaker.crm_outbox (
  id bigserial primary key,
  source_table text not null,
  source_id text not null,
  -- insert | update
  event text not null check (event in ('insert', 'update')),
  payload jsonb not null,
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_outbox_pending_idx on breadmaker.crm_outbox (id) where sent_at is null;

alter table breadmaker.crm_outbox enable row level security;
revoke all on breadmaker.crm_outbox from anon, authenticated;
grant all on breadmaker.crm_outbox to service_role;
grant usage, select on sequence breadmaker.crm_outbox_id_seq to service_role;

-- What is safe to send, per table.
create or replace function breadmaker.crm_payload(p_table text, p_row jsonb)
returns jsonb
language sql
immutable
as $$
  select case p_table
    when 'leak_test_submissions' then p_row - 'access_token' - 'code' - 'answers' - 'pillar_scores'
    when 'leads' then p_row - 'unsubscribe_token'
    when 'payments' then p_row - 'raw'
    else p_row
  end;
$$;

create or replace function breadmaker.crm_enqueue()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  begin
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload)
    values (tg_table_name, new.id::text, lower(tg_op), breadmaker.crm_payload(tg_table_name, to_jsonb(new)));
  exception when others then
    -- Never block a form submission because the queue failed.
    raise warning 'crm_enqueue failed for %: %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;

-- New submissions.
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'contact_messages', 'applications', 'cohort_waitlist',
                           'leak_test_submissions', 'partner_applications', 'system_interest'] loop
    if to_regclass('breadmaker.' || t) is not null then
      execute format('drop trigger if exists crm_sync_insert on breadmaker.%I', t);
      execute format('create trigger crm_sync_insert after insert on breadmaker.%I for each row execute function breadmaker.crm_enqueue()', t);
    end if;
  end loop;
end $$;

-- Later changes that move a deal along or change consent.
drop trigger if exists crm_sync_status on breadmaker.applications;
create trigger crm_sync_status after update on breadmaker.applications
  for each row when (old.status is distinct from new.status) execute function breadmaker.crm_enqueue();

drop trigger if exists crm_sync_status on breadmaker.partner_applications;
create trigger crm_sync_status after update on breadmaker.partner_applications
  for each row when (old.status is distinct from new.status) execute function breadmaker.crm_enqueue();

drop trigger if exists crm_sync_paid on breadmaker.leak_test_submissions;
create trigger crm_sync_paid after update on breadmaker.leak_test_submissions
  for each row when (old.paid_tier is distinct from new.paid_tier and new.paid_tier is not null)
  execute function breadmaker.crm_enqueue();

drop trigger if exists crm_sync_consent on breadmaker.leads;
create trigger crm_sync_consent after update on breadmaker.leads
  for each row when (old.unsubscribed_at is distinct from new.unsubscribed_at
                     or old.newsletter_consented_at is distinct from new.newsletter_consented_at)
  execute function breadmaker.crm_enqueue();

-- Payments: queue when one becomes successful, whether it was inserted that way or updated.
drop trigger if exists crm_sync_payment_insert on breadmaker.payments;
create trigger crm_sync_payment_insert after insert on breadmaker.payments
  for each row when (new.status = 'successful') execute function breadmaker.crm_enqueue();

drop trigger if exists crm_sync_payment_update on breadmaker.payments;
create trigger crm_sync_payment_update after update on breadmaker.payments
  for each row when (old.status is distinct from new.status and new.status = 'successful')
  execute function breadmaker.crm_enqueue();

-- One-time backfill of what already exists, so past leads land in the CRM too. Skipped once the
-- outbox has any row, so re-running this file never queues everything twice.
do $$
begin
  if not exists (select 1 from breadmaker.crm_outbox) then
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'leads', id::text, 'insert', breadmaker.crm_payload('leads', to_jsonb(x)), created_at from breadmaker.leads x;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'contact_messages', id::text, 'insert', breadmaker.crm_payload('contact_messages', to_jsonb(x)), coalesce(created_at, now()) from breadmaker.contact_messages x;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'applications', id::text, 'insert', breadmaker.crm_payload('applications', to_jsonb(x)), created_at from breadmaker.applications x;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'cohort_waitlist', id::text, 'insert', breadmaker.crm_payload('cohort_waitlist', to_jsonb(x)), created_at from breadmaker.cohort_waitlist x;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'leak_test_submissions', id::text, 'insert', breadmaker.crm_payload('leak_test_submissions', to_jsonb(x)), created_at from breadmaker.leak_test_submissions x;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'partner_applications', id::text, 'insert', breadmaker.crm_payload('partner_applications', to_jsonb(x)), created_at from breadmaker.partner_applications x;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'system_interest', id::text, 'insert', breadmaker.crm_payload('system_interest', to_jsonb(x)), created_at from breadmaker.system_interest x;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'payments', id::text, 'insert', breadmaker.crm_payload('payments', to_jsonb(x)), created_at from breadmaker.payments x where x.status = 'successful';
  end if;
end $$;

-- Every minute, drain the queue. Same pg_cron + pg_net wiring as payments-reconcile, but with its own
-- setting so this job does not depend on app.settings.console_cron_secret. Set it once, by hand, to the
-- edge-functions CRON_SECRET:
--   alter database postgres set app.settings.crm_sync_secret = '<CRON_SECRET>';
create extension if not exists pg_cron;

select cron.unschedule('crm-sync')
where exists (select 1 from cron.job where jobname = 'crm-sync');

select cron.schedule(
  'crm-sync',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.crm_sync_url', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', current_setting('app.settings.crm_sync_secret', true)),
    body := '{}'::jsonb
  );
  $$
);
