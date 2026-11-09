import { supabase } from './supabase';

/** The funnel brief written by the build-brief edge function (see supabase/functions/build-brief). */
export interface FunnelBrief {
  summary?: string;
  audience?: string;
  problem?: { statement?: string; cost?: string; outcome?: string };
  icp?: { who?: string; situation?: string; not_for?: string };
  offer?: { headline?: string; subheadline?: string; promise?: string; price_note?: string };
  cta?: { type?: string; label?: string; destination_note?: string };
  sections?: { id?: string; title?: string; body?: string; bullets?: string[] }[];
  faq?: { q?: string; a?: string }[];
  follow_up?: {
    instant_reply?: { whatsapp?: string; email_subject?: string; email_body?: string; sms?: string };
    nurture?: { day?: number; channel?: string; message?: string }[];
  };
  scorecard?: {
    title?: string;
    intro?: string;
    categories?: { id: string; name: string }[];
    questions?: { id: string; category: string; text: string; options: { label: string; points: number }[] }[];
    bands?: { id: 'ready' | 'warming' | 'early'; min: number; title: string; summary: string; next_step: string; cta_label: string }[];
  };
  tracking?: string[];
  missing_info?: string[];
  assumptions?: string[];
  platform_notes?: string;
}

export type BuildStatus = 'queued' | 'brief_ready' | 'building' | 'review' | 'live' | 'failed';

export interface BuildJob {
  id: string;
  applicationId: string;
  platform: string;
  status: BuildStatus;
  brief: FunnelBrief | null;
  briefError: string | null;
  briefGeneratedAt: string | null;
  log: { at: string; step: string; ok: boolean; detail?: string }[];
  outputs: Record<string, unknown>;
  /** The applicant's private link token, and where they are in paying, choosing an address and connecting Kumoda. */
  accessToken: string;
  paidAt: string | null;
  customDomain: string | null;
  domainStatus: string;
  kumodaRequestedAt: string | null;
}

export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  queued: 'Waiting for a brief',
  brief_ready: 'Brief ready',
  building: 'Building',
  review: 'In review',
  live: 'Live',
  failed: 'Failed',
};

/** The build job for one Launchpad application, or null if it has none yet. */
export async function loadBuildJob(applicationId: string): Promise<BuildJob | null> {
  const { data, error } = await supabase
    .from('build_jobs')
    .select('id, application_id, platform, status, brief, brief_error, brief_generated_at, log, outputs, access_token, paid_at, custom_domain, domain_status, kumoda_requested_at')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    applicationId: data.application_id,
    platform: data.platform ?? '',
    status: data.status,
    brief: (data.brief as FunnelBrief | null) ?? null,
    briefError: data.brief_error ?? null,
    briefGeneratedAt: data.brief_generated_at ?? null,
    log: Array.isArray(data.log) ? data.log : [],
    outputs: (data.outputs as Record<string, unknown>) ?? {},
    accessToken: data.access_token,
    paidAt: data.paid_at ?? null,
    customDomain: data.custom_domain ?? null,
    domainStatus: data.domain_status ?? '',
    kumodaRequestedAt: data.kumoda_requested_at ?? null,
  };
}

/** What the build-deploy function reports back. */
export interface SiteResult {
  status: BuildStatus;
  siteUrl: string;
  repoUrl: string;
  placeholders: string[];
}

/** Thrown when the brief still has [placeholder] gaps, so the Studio can ask before going live. */
export class PlaceholdersError extends Error {
  constructor(public placeholders: string[]) {
    super('The brief still has gaps.');
  }
}

/**
 * Builds (or rebuilds) the custom site, or approves it to go live. Team members only.
 * Approving with gaps left throws PlaceholdersError unless allowPlaceholders is set.
 */
export async function runSiteAction(applicationId: string, action: 'build' | 'approve', allowPlaceholders = false): Promise<SiteResult> {
  const { data, error } = await supabase.functions.invoke('build-deploy', {
    body: { application_id: applicationId, action, allow_placeholders: allowPlaceholders },
  });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    if (detail?.placeholders) throw new PlaceholdersError(detail.placeholders);
    throw new Error(detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(String(data.error));
  return { status: data.status, siteUrl: data.site_url, repoUrl: data.repo_url, placeholders: data.placeholders ?? [] };
}

/** Asks the build-brief function to write (or rewrite) the brief. Team members only. */
export async function generateBrief(applicationId: string, force: boolean): Promise<void> {
  const { data, error } = await supabase.functions.invoke('build-brief', { body: { application_id: applicationId, force } });
  if (error) {
    // The function returns a plain message in its JSON body; surface it rather than the generic wrapper text.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(String(data.error));
}
