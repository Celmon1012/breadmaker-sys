import { supabase } from './supabase';
import type { PageData, PageProposal } from './page';
import { functionErrorMessage } from './function-error';
import type { FunnelBrief } from './build-jobs';

/**
 * The applicant's funnel page: the brief, the address, the domain, and what they have paid for.
 * Everything goes through the launchpad-portal edge function, addressed by the access token that came in
 * their email. See supabase/functions/launchpad-portal.
 */

export interface PortalView {
  name: string;
  email: string;
  applicationId: string;
  /** The name the member gave this funnel in the Hub ('' until they do). */
  funnelName: string;
  /** The funnel's build job id (the folder the member's uploaded images go in). */
  jobId: string;
  /** The team chat without a revision limit. */
  unlimited: boolean;
  /** The funnel has a page as blocks (the member has opened the page editor). */
  hasPage: boolean;
  /** Present on the page actions: the page as blocks. */
  page?: PageData;
  /** Present on page_save: the site is being rebuilt from the saved page. */
  rebuilding?: boolean;
  /** Present on page_save when a rebuild was due but did not start. */
  rebuildError?: string;
  /** Present on page_chat: what the model proposes. Nothing is saved until the member publishes. */
  proposal?: PageProposal;
  /** The member has chosen a name or connected a domain. */
  addressSaved: boolean;
  platform: string;
  status: string;
  brief: (FunnelBrief & { problem?: { statement?: string; cost?: string; outcome?: string }; icp?: { who?: string; situation?: string; not_for?: string } }) | null;
  briefGeneratedAt: string | null;
  placeholders: string[];
  paid: boolean;
  deployed: boolean;
  live: boolean;
  slug: string;
  siteHost: string;
  siteUrl: string | null;
  customDomain: string | null;
  domainStatus: '' | 'pending' | 'verified';
  dns: { ip: string; cnameTarget: string };
  freeChangesLeft: number;
  paidChangesLeft: number;
  kumodaRequested: boolean;
  /** True once the Kumoda account exists and the funnel's enquiry form posts into it. */
  kumodaReady: boolean;
  accountReady: boolean;
  checked?: { verified: boolean; found: string[] };
}

export type PortalAction = 'get' | 'change' | 'slug' | 'rename' | 'page' | 'page_save' | 'page_chat' | 'page_reset' | 'domain' | 'check_domain' | 'remove_domain' | 'kumoda';

export async function portal(action: PortalAction, token: string, extra: Record<string, unknown> = {}): Promise<PortalView> {
  const { data, error } = await supabase.functions.invoke('launchpad-portal', { body: { action, token, ...extra } });
  if (error) throw new Error(await functionErrorMessage(error, 'Something went wrong. Please try again.'));
  if (data?.error) throw new Error(String(data.error));
  return data as PortalView;
}

/** The funnel token for a paid Launchpad payment, so the payment page can link to the funnel. Null if there is none. */
export async function tokenForPayment(txRef: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('launchpad-portal', { body: { action: 'by_payment', tx_ref: txRef } });
  if (error || data?.error) return null;
  return (data?.token as string) ?? null;
}

/**
 * The ids of the signed-in member's own applications. Team members can read every applicant's rows, so lists in the
 * Hub filter to these instead of relying on row-level security alone.
 */
export async function myApplicationIds(): Promise<string[]> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return [];
  const { data } = await supabase.from('applications').select('id').eq('user_id', uid);
  return (data ?? []).map((row) => row.id as string);
}

/** The signed-in member's own funnel token (row-level security limits this to their application), or null. */
export async function myFunnelToken(): Promise<string | null> {
  const ids = await myApplicationIds();
  if (!ids.length) return null;
  const { data } = await supabase.from('build_jobs').select('access_token').in('application_id', ids).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data?.access_token as string | undefined) ?? null;
}

/** One of the signed-in member's funnels, as much as the dashboard and the funnel switcher need. */
export interface FunnelSummary {
  id: string;
  token: string;
  /** Kumoda is connected: enquiries land in the member's own workspace. */
  kumodaReady: boolean;
  kumodaRequested: boolean;
  /** The funnel is a scorecard quiz. */
  scorecard: boolean;
  label: string;
  hasBrief: boolean;
  paid: boolean;
  /** The web address is set: a name the member chose, or their own domain. It can still be changed later. */
  addressSet: boolean;
  slug: string | null;
  customDomain: string | null;
  deployed: boolean;
  live: boolean;
}

/** All of the signed-in member's funnels, newest first (row-level security limits this to their own applications). */
export async function myFunnels(): Promise<FunnelSummary[]> {
  const ids = await myApplicationIds();
  if (!ids.length) return [];
  const { data } = await supabase
    .from('build_jobs')
    .select('id, access_token, brief, paid_at, site_slug, custom_domain, outputs, kumoda_requested_at, created_at')
    .in('application_id', ids)
    .order('created_at', { ascending: false });
  return (data ?? []).map((row, index, all) => {
    const outputs = (row.outputs ?? {}) as Record<string, unknown>;
    const brief = row.brief as { offer?: { headline?: string }; summary?: string; scorecard?: unknown } | null;
    const named =
      (typeof outputs.name === 'string' && outputs.name) || (row.site_slug as string | null) || (typeof outputs.slug === 'string' && outputs.slug) || brief?.offer?.headline?.slice(0, 40) || '';
    return {
      id: row.id as string,
      token: row.access_token as string,
      kumodaReady: typeof (outputs.kumoda as { lead_form_url?: unknown } | undefined)?.lead_form_url === 'string',
      kumodaRequested: !!row.kumoda_requested_at,
      scorecard: !!(brief as { scorecard?: unknown } | null)?.scorecard,
      label: named || (all.length > 1 ? `Funnel ${all.length - index}` : 'Your funnel'),
      hasBrief: !!row.brief,
      paid: !!row.paid_at,
      addressSet: !!row.site_slug || !!row.custom_domain,
      slug: (row.site_slug as string | null) ?? (typeof outputs.slug === 'string' ? outputs.slug : null),
      customDomain: (row.custom_domain as string | null) ?? null,
      deployed: typeof outputs.coolify_uuid === 'string',
      live: outputs.indexable === true,
    };
  });
}
