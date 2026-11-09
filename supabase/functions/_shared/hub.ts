// Breadmaker Hub (the monthly membership): the price the checkout charges, and the renewal emails.
//
// The price and any discount come from breadmaker.membership_plans, never from the browser.
// Env: RESEND_API_KEY, optional HUB_EMAIL_FROM, PUBLIC_SITE_URL.
import { admin, env, pickAmount, siteUrl, WantedCurrency } from './flutterwave.ts';

export interface HubPrice {
  label: string;
  price_minor: number;
  currency: string;
}

/** What one month of the Hub costs right now, with the discount applied while it is running. Null when it is not on sale. */
export async function hubPrice(wanted: WantedCurrency | null = null): Promise<HubPrice | null> {
  const { data, error } = await admin()
    .from('membership_plans')
    .select('label, price_minor, currency, alt_price_minor, discount_pct, discount_ends_at, active')
    .eq('code', 'hub')
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.active || data.price_minor <= 0) return null;
  const discounted = data.discount_pct > 0 && data.discount_ends_at && new Date(data.discount_ends_at).getTime() > Date.now();
  const percentOff = discounted ? data.discount_pct : 0;
  const amount = pickAmount(data, wanted);
  return {
    label: data.label || 'Breadmaker Hub',
    price_minor: Math.round((amount.price_minor * (100 - percentOff)) / 100),
    currency: amount.currency,
  };
}

const FROM = () => env('HUB_EMAIL_FROM', 'Breadmaker Hub <academy@breadmakersystems.com>');

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!env('RESEND_API_KEY')) {
    console.warn('hub: RESEND_API_KEY is not set, email skipped');
    return false;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to, subject, html, text }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
  return true;
}

/** Sends the "ends soon" and "ended" emails that have not gone out yet, and marks each as sent. */
export async function sendMembershipNotices() {
  const db = admin();
  const { data, error } = await db.rpc('membership_notices');
  if (error) throw error;
  const link = `${siteUrl()}/account`;
  let sent = 0;
  for (const row of (data ?? []) as { email: string; current_period_end: string; kind: 'ending' | 'ended' }[]) {
    const date = new Date(row.current_period_end).toUTCString().slice(0, 16);
    const ending = row.kind === 'ending';
    const subject = ending ? `Your Breadmaker Hub membership ends on ${date}` : 'Your Breadmaker Hub membership has ended';
    const lead = ending
      ? `Your Breadmaker Hub membership ends on ${date}. Renew before then and the new month is added to the end of this one.`
      : `Your Breadmaker Hub membership ended on ${date}. Your progress is saved. Renew to open the kits and courses again.`;
    const html = `<p style="line-height:1.6">${lead}</p><p><a href="${link}" style="display:inline-block;background:#1c1a17;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Renew your membership</a></p>`;
    try {
      if (await sendEmail(row.email, subject, html, `${lead} ${link}`)) {
        const { error: markError } = await db.rpc('mark_membership_notice', { for_email: row.email, for_kind: row.kind, for_period_end: row.current_period_end });
        if (markError) throw markError;
        sent += 1;
      }
    } catch (failure) {
      // One bad address must not stop the rest; it is tried again on the next run.
      console.error('hub notice failed', row.email, (failure as Error).message);
    }
  }
  return sent;
}
