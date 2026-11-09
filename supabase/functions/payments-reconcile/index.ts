// Settles Lago-billed payments that were paid but never confirmed, for example when the payer closed
// the tab before returning to the site. Run every couple of minutes by pg_cron (see migration 25).
//
//   POST (header x-cron-secret: <CRON_SECRET>)  ->  { checked, settled, waiting }
//
// Env: CRON_SECRET, FLUTTERWAVE_SECRET_KEY, LAGO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { env, json } from '../_shared/flutterwave.ts';
import { confirmLagoPayment, pendingLagoPayments } from '../_shared/reconcile.ts';
import { sendMembershipNotices } from '../_shared/hub.ts';
import { rollBudgetPeriods, sendUsageAlerts } from '../_shared/usage.ts';

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not authorised.' }, 401);

  try {
    const pending = await pendingLagoPayments();
    let settled = 0;
    for (const payment of pending) {
      try {
        const result = await confirmLagoPayment(payment);
        if (result?.settled) settled += 1;
      } catch (error) {
        // One bad payment must not stop the rest.
        console.error('payments-reconcile', payment.tx_ref, (error as Error).message);
      }
    }
    // Same two-minute run also sends the Breadmaker Hub "ends soon" / "ended" emails, once each per period.
    let reminders = 0;
    try {
      reminders = await sendMembershipNotices();
    } catch (error) {
      console.error('payments-reconcile: membership notices failed', (error as Error).message);
    }
    // And the Prestige Partner agent budgets: start new 30-day periods, then send any 80% / limit warnings still due.
    let budgetReset = 0;
    let budgetWarned = 0;
    try {
      budgetReset = await rollBudgetPeriods();
      budgetWarned = await sendUsageAlerts();
    } catch (error) {
      console.error('payments-reconcile: agent usage step failed', (error as Error).message);
    }
    console.log(`payments-reconcile: ${pending.length} checked, ${settled} settled, ${reminders} member emails, ${budgetReset} budgets reset, ${budgetWarned} usage warnings`);
    return json({ checked: pending.length, settled, waiting: pending.length - settled, reminders });
  } catch (error) {
    console.error('payments-reconcile failed', error);
    return json({ error: (error as Error).message }, 500);
  }
});
