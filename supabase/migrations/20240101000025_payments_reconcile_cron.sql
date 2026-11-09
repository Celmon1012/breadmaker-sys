-- Every two minutes, settle Lago-billed payments that were paid but not confirmed (payer closed the tab,
-- or Lago left the invoice pending). Same pg_cron + pg_net wiring and shared secret as the console's
-- scheduled functions. Idempotent: re-running replaces the schedule. Set the URL once, by hand:
--
--   alter database postgres set app.settings.payments_reconcile_url =
--     'https://db.restart.ng/functions/v1/payments-reconcile';
--
-- app.settings.console_cron_secret is already set for the console jobs; the function reads CRON_SECRET.

create extension if not exists pg_cron;

select cron.unschedule('payments-reconcile')
where exists (select 1 from cron.job where jobname = 'payments-reconcile');

select cron.schedule(
  'payments-reconcile',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.payments_reconcile_url', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', current_setting('app.settings.console_cron_secret', true)),
    body := '{}'::jsonb
  );
  $$
);
