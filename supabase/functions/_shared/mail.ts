// Transactional email for the Launchpad flow, sent through Resend from the Breadmaker address.
// Never throws: an email that fails must not fail the step that sent it. Returns whether it was accepted.
//
// Env: RESEND_API_KEY; optional BREADMAKER_EMAIL_FROM, TEAM_NOTIFY_EMAIL (default CRM_ALERT_EMAIL, then adeusuf@restart.ng).
import { env } from './flutterwave.ts';

export const teamEmail = () => env('TEAM_NOTIFY_EMAIL') || env('CRM_ALERT_EMAIL', 'adeusuf@restart.ng');

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A small branded HTML email: a heading, paragraphs, and an optional button. */
export function emailHtml(heading: string, paragraphs: string[], button?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1b16">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-weight:700;font-size:18px;margin:0 0 24px">Breadmaker <span style="color:#1D6A58">Launchpad</span></p>
<div style="background:#fefdf8;border:1px solid #e3dccb;border-radius:14px;padding:28px">
<h1 style="font-size:22px;line-height:1.25;margin:0 0 16px">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px;color:#57534a">${esc(p)}</p>`).join('')}
${button ? `<p style="margin:22px 0 4px"><a href="${esc(button.url)}" style="background:#1D6A58;color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px;display:inline-block">${esc(button.label)}</a></p>` : ''}
</div>
<p style="font-size:13px;color:#8a8576;margin:18px 4px 0">Breadmaker Systems · breadmakersystems.com</p>
</div></body></html>`;
}

export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = env('RESEND_API_KEY');
  if (!key || !to) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('BREADMAKER_EMAIL_FROM', 'Breadmaker Academy <academy@breadmakersystems.com>'), to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) console.warn('mail refused', response.status, await response.text().catch(() => ''));
    return response.ok;
  } catch (error) {
    console.warn('mail failed', (error as Error).message);
    return false;
  }
}
