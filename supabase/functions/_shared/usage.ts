// Prestige Partner agent usage: the monthly reset and the 80% / budget-reached warnings.
//
// Warnings go by email (Resend) and, when WHATSAPP_NOTIFY_URL is set, by WhatsApp through your agent
// gateway: we POST { to, text } there and it sends the message. Each warning goes out once per period.
// Env: RESEND_API_KEY (email), optional WHATSAPP_NOTIFY_URL and WHATSAPP_NOTIFY_SECRET, PUBLIC_SITE_URL.
import { admin, env, siteUrl } from './flutterwave.ts';
import { sendEmail } from './hub.ts';

const dollars = (minor: number) => `$${(minor / 100).toFixed(2)}`;
const dateText = (iso: string) => new Date(iso).toUTCString().slice(0, 16);

async function sendWhatsapp(to: string, text: string): Promise<boolean> {
  const url = env('WHATSAPP_NOTIFY_URL');
  if (!url) return false;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env('WHATSAPP_NOTIFY_SECRET')) headers.Authorization = `Bearer ${env('WHATSAPP_NOTIFY_SECRET')}`;
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ to, text }) });
  if (!response.ok) throw new Error(`WhatsApp notify ${response.status}`);
  return true;
}

/** Starts new 30-day periods that are due. Returns how many members were reset. */
export async function rollBudgetPeriods(): Promise<number> {
  const { data, error } = await admin().rpc('roll_budget_periods');
  if (error) throw error;
  return Number(data ?? 0);
}

/** Sends the warnings that have not gone out yet, and marks each as sent. Returns how many members were told. */
export async function sendUsageAlerts(): Promise<number> {
  const db = admin();
  const { data, error } = await db.rpc('usage_alerts');
  if (error) throw error;
  const link = `${siteUrl()}/membership`;
  let told = 0;
  for (const row of (data ?? []) as { email: string; whatsapp_number: string | null; spent_minor: number; budget_minor: number; kind: 'warn80' | 'limit'; resets_on: string }[]) {
    const limit = row.kind === 'limit';
    const resets = dateText(row.resets_on);
    const used = `${dollars(row.spent_minor)} of ${dollars(row.budget_minor)}`;
    const subject = limit ? 'Your developer has used this month\'s budget' : 'Your developer has used 80% of this month\'s budget';
    const lead = limit
      ? `Your developer has used ${used} of this month's budget, so it is paused until ${resets}. If you need more before then, reply to this email and we will top it up.`
      : `Your developer has used ${used} of this month's budget. It resets on ${resets}. If you expect to need more, reply to this email and we will top it up.`;
    const html = `<p style="line-height:1.6">${lead}</p><p><a href="${link}" style="display:inline-block;background:#1c1a17;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">See your usage</a></p>`;
    try {
      let delivered = false;
      try {
        delivered = await sendEmail(row.email, subject, html, `${lead} ${link}`);
      } catch (failure) {
        console.error('usage alert email failed', row.email, (failure as Error).message);
      }
      if (row.whatsapp_number) {
        try {
          delivered = (await sendWhatsapp(row.whatsapp_number, lead)) || delivered;
        } catch (failure) {
          console.error('usage alert whatsapp failed', row.email, (failure as Error).message);
        }
      }
      // Marked only once something was delivered, so a failure is tried again on the next run.
      if (delivered) {
        const { error: markError } = await db.rpc('mark_usage_alert', { for_email: row.email, for_kind: row.kind });
        if (markError) throw markError;
        told += 1;
      }
    } catch (failure) {
      console.error('usage alert failed', row.email, (failure as Error).message);
    }
  }
  return told;
}
