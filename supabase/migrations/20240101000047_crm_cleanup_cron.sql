-- Daily at 03:30 UTC, run the crm-cleanup edge function: it deletes the empty anonymous contacts the CRM chat widget
-- creates for visitors who never chatted (no email, phone or conversation, random widget name, older than a day).
-- Reuses the crm-sync secret. One-time setting:
--   alter database postgres set app.settings.crm_cleanup_url = 'https://db.restart.ng/functions/v1/crm-cleanup';

select cron.unschedule(jobid) from cron.job where jobname = 'crm-cleanup';
select cron.schedule(
  'crm-cleanup',
  '30 3 * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.crm_cleanup_url', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', current_setting('app.settings.crm_sync_secret', true)),
    body := '{}'::jsonb
  )
  where current_setting('app.settings.crm_cleanup_url', true) is not null;
  $$
);
