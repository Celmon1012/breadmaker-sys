// Where a visitor came from, kept in the browser and sent to the CRM with their form.
//
// On the first page load we record the campaign tags (utm_*), the referring site and the landing
// page. The first touch is kept; the last touch is replaced when a new campaign or referrer shows
// up. After a form is sent, reportTouch(email) stores both against that email (migration 44) and
// crm-sync copies them onto the contact. Nothing here ever blocks or fails a form.
import { supabase } from './supabase';

const KEY = 'bm_touch_v1';

type Touch = { source?: string; medium?: string; campaign?: string; term?: string; content?: string; referrer?: string; landing?: string; at?: string };
type Stored = { first: Touch; last: Touch };

const read = (): Stored | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
};

const write = (value: Stored) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: attribution is a nice-to-have.
  }
};

/** Reads the current page's tags. Returns null when the visit carries no marketing signal. */
function currentTouch(): Touch | null {
  const params = new URLSearchParams(window.location.search);
  let referrer = '';
  try {
    const url = document.referrer ? new URL(document.referrer) : null;
    if (url && url.hostname !== window.location.hostname) referrer = url.hostname.replace(/^www\./, '');
  } catch {
    referrer = '';
  }
  const touch: Touch = {
    source: params.get('utm_source') ?? undefined,
    medium: params.get('utm_medium') ?? undefined,
    campaign: params.get('utm_campaign') ?? undefined,
    term: params.get('utm_term') ?? undefined,
    content: params.get('utm_content') ?? undefined,
    referrer: referrer || undefined,
    landing: window.location.pathname,
    at: new Date().toISOString(),
  };
  const hasSignal = touch.source || touch.medium || touch.campaign || touch.referrer;
  return hasSignal ? touch : null;
}

/** Call once at start-up. */
export function captureTouch(): void {
  if (typeof window === 'undefined') return;
  const stored = read();
  const seen = currentTouch();
  if (!stored) {
    const direct: Touch = { source: 'direct', landing: window.location.pathname, at: new Date().toISOString() };
    const first = seen ?? direct;
    write({ first, last: first });
    return;
  }
  if (seen) write({ first: stored.first, last: seen });
}

/** Call after a form succeeded. Fire and forget. */
export function reportTouch(email: string): void {
  try {
    const stored = read();
    if (!stored || !email) return;
    // The RPC keeps the first touch it ever saw for this email and replaces the last one, so
    // sending the visitor's first touch on their first form and the last touch afterwards is right.
    void supabase.rpc('record_touch', { p_email: email.trim().toLowerCase(), p_touch: { ...stored.last } }).then(() => undefined, () => undefined);
  } catch {
    // never block a form
  }
}
