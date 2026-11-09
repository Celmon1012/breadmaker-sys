import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Globe, Sparkles } from 'lucide-react';
import { BUILD_STATUS_LABEL, BuildJob, PlaceholdersError, generateBrief, loadBuildJob, runSiteAction } from '../../lib/build-jobs';
import { errorMessage } from '../../lib/lms';
import { Button, Chip, Loading, Notice } from './lms-ui';

const LABEL = 'font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]';

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={LABEL}>{title}</p>
      <div className="mt-1.5 text-[14.5px] leading-[1.55]">{children}</div>
    </div>
  );
}

/**
 * The funnel brief for one Launchpad application: the draft the build starts from. Opens with the saved
 * brief, and the team can write it, or rewrite it after the applicant's details change.
 */
export default function BuildBriefPanel({ applicationId, canEdit }: { applicationId: string; canEdit: boolean }) {
  const [job, setJob] = useState<BuildJob | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const refresh = async () => {
    try {
      setJob(await loadBuildJob(applicationId));
    } catch (err) {
      setError(errorMessage(err));
      setJob(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, [applicationId]);

  const write = async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await generateBrief(applicationId, force);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const site = async (action: 'build' | 'approve') => {
    setBusy(true);
    setError(null);
    try {
      try {
        await runSiteAction(applicationId, action);
      } catch (err) {
        // Gaps left in the brief: let the team decide, with the gaps in front of them.
        if (!(err instanceof PlaceholdersError)) throw err;
        const go = window.confirm(`The brief still has gaps:\n\n${err.placeholders.join('\n')}\n\nGo live anyway?`);
        if (!go) return;
        await runSiteAction(applicationId, action, true);
      }
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  /** The private brief page the applicant was emailed, for sending by hand if the email never arrived. */
  const copyLink = async () => {
    if (!job) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/launchpad/brief/${job.accessToken}`);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const copy = async () => {
    if (!job?.brief) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(job.brief, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  const brief = job?.brief;

  return (
    <section className="mt-6 border-t border-[var(--pg-line-soft)] pt-6" aria-label="Funnel brief">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Funnel brief</p>
        {job && <Chip tone={job.status === 'queued' || job.status === 'failed' ? 'neutral' : 'accent'}>{BUILD_STATUS_LABEL[job.status]}</Chip>}
        {job?.platform && <span className="text-[13px] capitalize text-[var(--pg-body)]">{job.platform}</span>}
        {job?.paidAt && <Chip tone="accent">Paid</Chip>}
        <div className="ml-auto flex flex-wrap gap-2">
          {job && (
            <Button variant="ghost" onClick={() => void copyLink()}>
              {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {linkCopied ? 'Copied' : 'Applicant link'}
            </Button>
          )}
          {brief && (
            <Button variant="ghost" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          )}
          {canEdit && (
            <Button variant={brief ? 'ghost' : 'accent'} busy={busy} onClick={() => void write(!!brief)}>
              <Sparkles className="h-4 w-4" /> {brief ? 'Rewrite brief' : 'Write the brief'}
            </Button>
          )}
        </div>
      </div>

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {!error && job?.briefError && !brief && <div className="mt-4"><Notice tone="error">The last attempt failed: {job.briefError}</Notice></div>}
      {job === undefined && <Loading label="Loading the brief…" />}
      {job === null && !error && <p className="mt-3 text-[14.5px] text-[var(--pg-body)]">No build job for this application yet.</p>}
      {job && !brief && !job.briefError && (
        <p className="mt-3 text-[14.5px] text-[var(--pg-body)]">
          No brief yet. It is drafted automatically once the application is accepted or paid, or you can write it now.
        </p>
      )}

      {brief && job && (
        <div className="mt-5 rounded-[12px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-5">
          <p className={LABEL}>Website</p>
          {job.platform && job.platform !== 'custom' ? (
            <p className="mt-1.5 text-[14.5px] text-[var(--pg-body)]">Automatic builds cover custom sites for now. This one is {job.platform}, so it is built by hand from the brief.</p>
          ) : (
            <>
              {typeof job.outputs.site_url === 'string' ? (
                <p className="mt-1.5 text-[14.5px]">
                  <a href={job.outputs.site_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-[var(--pg-accent)] underline underline-offset-4">
                    {job.outputs.site_url.replace('https://', '')} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <span className="ml-2 text-[var(--pg-body)]">{job.status === 'live' ? 'Live and indexable.' : 'Preview only: hidden from search until you approve.'}</span>
                </p>
              ) : (
                <p className="mt-1.5 text-[14.5px] text-[var(--pg-body)]">No site yet. Building creates a private repository and deploys a preview on its own address.</p>
              )}
              {Array.isArray(job.outputs.placeholders) && job.outputs.placeholders.length > 0 && (
                <p className="mt-2 text-[13.5px] text-[var(--pg-body)]">Gaps in the brief: {(job.outputs.placeholders as string[]).join(', ')}</p>
              )}
              {canEdit && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant={job.outputs.site_url ? 'ghost' : 'accent'} busy={busy || job.status === 'building'} onClick={() => void site('build')}>
                    <Globe className="h-4 w-4" /> {job.outputs.site_url ? 'Rebuild from the brief' : 'Build the site'}
                  </Button>
                  {typeof job.outputs.coolify_uuid === 'string' && job.status !== 'live' && (
                    <Button variant="dark" busy={busy} onClick={() => void site('approve')}>
                      <Check className="h-4 w-4" /> Approve and go live
                    </Button>
                  )}
                </div>
              )}
              {job.log.length > 0 && (
                <ul className="mt-4 space-y-0.5 text-[12.5px] text-[var(--pg-body)]">
                  {job.log.slice(-5).map((entry, index) => (
                    <li key={index}>
                      {new Date(entry.at).toLocaleString()} · {entry.step}: {entry.ok ? '' : 'failed, '}{entry.detail}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {brief && (
        <div className="mt-5 grid gap-5">
          {brief.summary && <p className="text-[15.5px] leading-[1.55]">{brief.summary}</p>}

          {(brief.problem || brief.icp) && (
            <div className="grid gap-5 sm:grid-cols-2">
              {brief.problem && (
                <Block title="The one problem">
                  <p className="font-semibold">{brief.problem.statement}</p>
                  {brief.problem.cost && <p className="text-[var(--pg-body)]">{brief.problem.cost}</p>}
                </Block>
              )}
              {brief.icp && (
                <Block title="The one customer">
                  <p className="font-semibold">{brief.icp.who}</p>
                  {brief.icp.not_for && <p className="text-[var(--pg-body)]">Not for: {brief.icp.not_for}</p>}
                </Block>
              )}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            {brief.offer && (
              <Block title="Offer">
                <p className="font-semibold">{brief.offer.headline}</p>
                {brief.offer.subheadline && <p className="text-[var(--pg-body)]">{brief.offer.subheadline}</p>}
                {brief.offer.promise && <p className="mt-2">{brief.offer.promise}</p>}
                {brief.offer.price_note && <p className="mt-2 text-[var(--pg-body)]">Price: {brief.offer.price_note}</p>}
              </Block>
            )}
            {brief.cta && (
              <Block title="Call to action">
                <p className="font-semibold">{brief.cta.label} <span className="font-normal text-[var(--pg-body)]">({brief.cta.type})</span></p>
                {brief.cta.destination_note && <p className="text-[var(--pg-body)]">{brief.cta.destination_note}</p>}
              </Block>
            )}
          </div>

          {brief.audience && <Block title="Audience">{brief.audience}</Block>}

          {!!brief.missing_info?.length && (
            <Block title="Still needed from the applicant">
              <ul className="list-disc space-y-1 pl-5">{brief.missing_info.map((item) => <li key={item}>{item}</li>)}</ul>
            </Block>
          )}

          {!!brief.sections?.length && (
            <Block title="Page sections">
              <ol className="space-y-3">
                {brief.sections.map((section, index) => (
                  <li key={`${section.id}-${index}`} className="rounded-[10px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-4">
                    <p className="font-semibold">{section.title} <span className="font-normal text-[var(--pg-body)]">· {section.id}</span></p>
                    {section.body && <p className="mt-1">{section.body}</p>}
                    {!!section.bullets?.length && <ul className="mt-2 list-disc space-y-0.5 pl-5">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                  </li>
                ))}
              </ol>
            </Block>
          )}

          {!!brief.faq?.length && (
            <Block title="FAQ">
              <dl className="space-y-2">
                {brief.faq.map((item) => (
                  <div key={item.q}>
                    <dt className="font-semibold">{item.q}</dt>
                    <dd className="text-[var(--pg-body)]">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </Block>
          )}

          {brief.follow_up && (
            <Block title="Follow-up">
              {brief.follow_up.instant_reply && (
                <div className="space-y-1">
                  <p><span className="font-semibold">Instant reply, WhatsApp:</span> {brief.follow_up.instant_reply.whatsapp}</p>
                  <p><span className="font-semibold">Email:</span> {brief.follow_up.instant_reply.email_subject}</p>
                  <p className="whitespace-pre-line text-[var(--pg-body)]">{brief.follow_up.instant_reply.email_body}</p>
                  <p><span className="font-semibold">SMS:</span> {brief.follow_up.instant_reply.sms}</p>
                </div>
              )}
              {!!brief.follow_up.nurture?.length && (
                <ul className="mt-3 space-y-1">
                  {brief.follow_up.nurture.map((item, index) => (
                    <li key={index}><span className="font-semibold">Day {item.day} · {item.channel}:</span> {item.message}</li>
                  ))}
                </ul>
              )}
            </Block>
          )}

          {!!brief.tracking?.length && <Block title="Tracking">{brief.tracking.join(', ')}</Block>}
          {!!brief.assumptions?.length && (
            <Block title="Assumptions to check">
              <ul className="list-disc space-y-1 pl-5">{brief.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
            </Block>
          )}
          {brief.platform_notes && <Block title="Platform notes">{brief.platform_notes}</Block>}
        </div>
      )}
    </section>
  );
}
