import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Circle, ExternalLink, Globe, LoaderCircle } from 'lucide-react';
import { PortalAction, PortalView, portal } from '../../lib/portal';
import { TierPrice, loadTierPrices } from '../../lib/programs';
import { money, paymentsEnabled, startCheckout } from '../../lib/payments';
import { usePrice } from '../../lib/use-price';
import { errorMessage } from '../../lib/lms';
import { Button, CARD, Chip, Field, Loading, Notice, TextArea, TextInput } from './lms-ui';

/**
 * A small live picture of the funnel: the real site in a frame, scaled down so the whole desktop page shows. It is
 * the site itself rather than a saved image, so it is always current (after a publish, once the rebuild finishes).
 * Before the site is built it says so.
 */
function SitePreview({ url, host }: { url: string | null; host: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setScale(el.clientWidth / 1280));
    watch.observe(el);
    setScale(el.clientWidth / 1280);
    return () => watch.disconnect();
  }, [url]);

  return (
    <div className="w-full lg:w-[400px] lg:shrink-0">
      <div className="overflow-hidden rounded-[12px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)]">
        <div className="flex items-center gap-1.5 border-b border-[var(--pg-line-soft)] bg-[var(--pg-alt)]/60 px-3 py-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-[#e5736b]" /><span className="h-2 w-2 rounded-full bg-[#e7b94d]" /><span className="h-2 w-2 rounded-full bg-[#6fbf73]" />
          <span className="ml-2 truncate text-[11px] text-[var(--pg-body)]">{host}</span>
        </div>
        <div ref={box} className="relative w-full overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
          {url ? (
            <>
              <iframe
                src={url}
                title="Preview of your funnel"
                loading="lazy"
                tabIndex={-1}
                sandbox="allow-scripts allow-same-origin"
                style={{ width: 1280, height: 800, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none', background: '#fff' }}
              />
              <a href={url} target="_blank" rel="noreferrer" aria-label="Open your live site" className="group absolute inset-0 flex items-end justify-end p-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pg-ink)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--pg-bg)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Open site <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </a>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-[14px] leading-[1.5] text-[var(--pg-body)]">
              Your page appears here once your site is built.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// The editor (Puck) is large, so it loads only when someone opens it.
const PageEditor = lazy(() => import('./PageEditor'));

const LABEL = 'font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]';

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-editorial text-[22px] font-semibold leading-[1.2]">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * A funnel's whole story for its owner: the brief, a way to ask for changes, the address, a domain, and the
 * payment that confirms the brief and starts the build. Shown on the public brief page (by token) and inside
 * the Hub ("My funnel"), so it is the same page in both.
 */
export default function FunnelPortal({ token }: { token: string; key?: React.Key }) {
  const { resolve: resolveAmount } = usePrice();
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [price, setPrice] = useState<TierPrice | null>(null);
  const [change, setChange] = useState('');
  const [slug, setSlug] = useState('');
  const [funnelName, setFunnelName] = useState('');
  const [domain, setDomain] = useState('');
  const [updateOpen, setUpdateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // The Hub page puts a slot in its header for the Update funnel button; the public brief page has none.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById('funnel-header-action'));
  }, [view?.brief]);
  useEffect(() => {
    if (!updateOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setUpdateOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [updateOpen]);

  useEffect(() => {
    let cancelled = false;
    portal('get', token)
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setSlug(next.slug);
        setFunnelName(next.funnelName || next.slug);
        setDomain(next.customDomain ?? '');
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!paymentsEnabled) return;
    loadTierPrices()
      .then((rows) => setPrice(rows.find((row) => row.program === 'launchpad' && row.tier === 'done-with-you') ?? null))
      .catch(() => setPrice(null));
  }, []);

  const run = async (name: string, action: PortalAction, extra: Record<string, unknown> = {}, done?: string) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      const next = await portal(action, token, extra);
      setView(next);
      setSlug(next.slug);
      setFunnelName(next.funnelName || next.slug);
      if (action === 'change') {
        setChange('');
        setUpdateOpen(false);
      }
      if (action === 'check_domain') {
        setNotice(
          next.checked?.verified
            ? 'Your domain points to us. It is connected.'
            : 'We cannot see the records yet. DNS can take a few minutes to an hour to update, so try again shortly.',
        );
      } else if (done) {
        setNotice(done);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const pay = async () => {
    if (!view || !price) return;
    setBusy('pay');
    setError(null);
    try {
      const result = await startCheckout({ program: 'launchpad', tier: price.tier, name: view.name, email: view.email, applicationId: view.applicationId, redirectPath: '/payment/callback' });
      window.location.assign(result.link);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  if (!view) return error ? <Notice tone="error">{error}</Notice> : <Loading label="Opening your funnel…" />;

  const brief = view.brief;
  const steps = [
    { label: 'Brief drafted', done: !!brief },
    { label: 'Approve and deploy', done: view.paid },
    { label: 'Preview built', done: view.deployed },
    { label: 'Live', done: view.live },
  ];
  const current = steps.findIndex((step) => !step.done);
  const shown = price ? resolveAmount(price) : null;
  const changesLeft = view.paid ? view.paidChangesLeft : view.freeChangesLeft;

  // A funnel with a page is changed in the page editor (by hand or by chat); one without it, by rewriting the brief.
  const openUpdate = () => (view.hasPage && !brief?.scorecard ? setEditing(true) : setUpdateOpen(true));
  const updateButton = brief ? (
    <Button variant="ghost" onClick={openUpdate}>
      Update funnel · {changesLeft} {changesLeft === 1 ? 'revision' : 'revisions'} left
    </Button>
  ) : null;

  return (
    <div className="grid gap-6">
      {updateButton && (slot ? createPortal(updateButton, slot) : <div className="flex justify-end">{updateButton}</div>)}

      {editing && (
        <Suspense fallback={null}>
          <PageEditor token={token} onClose={() => setEditing(false)} onChanged={(next) => setView(next)} />
        </Suspense>
      )}

      {updateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setUpdateOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Update funnel" className={`${CARD} w-full max-w-[560px] p-6 sm:p-8`} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-editorial text-[24px] font-semibold leading-[1.2]">Update your funnel</h2>
              <Chip>{changesLeft} {changesLeft === 1 ? 'revision' : 'revisions'} left{view.paid ? '' : ' free'}</Chip>
            </div>
            {changesLeft > 0 ? (
              <>
                <div className="mt-4">
                  <Field label="What should be different?" hint={view.paid && view.deployed ? 'We rewrite the brief, keep what you did not mention, and rebuild your site.' : 'We rewrite the brief and keep what you did not mention.'}>
                    <TextArea rows={4} value={change} onChange={(event) => setChange(event.target.value)} placeholder="Write it the way you would tell a colleague." autoFocus />
                  </Field>
                </div>
                {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button busy={busy === 'change'} disabled={change.trim().length < 10} onClick={() => void run('change', 'change', { note: change }, 'Done. Your brief has been rewritten.')}>
                    Rewrite my brief
                  </Button>
                  <Button variant="ghost" onClick={() => setUpdateOpen(false)}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-[15px] leading-[1.6] text-[var(--pg-body)]">
                  {view.paid ? 'You have used the revisions included in your build. Contact us if you need more.' : 'You have used your free revisions. Approve and deploy, and your build includes more.'}
                </p>
                <div className="mt-4"><Button variant="ghost" onClick={() => setUpdateOpen(false)}>Close</Button></div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Where things stand */}
      <section className={`${CARD} flex flex-col gap-6 px-6 py-5 lg:flex-row lg:items-start lg:justify-between`} aria-label="Progress">
        <div className="min-w-0 flex-1">
        <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Your funnel</p>
        <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px]">
          {steps.map((step, index) => (
            <li key={step.label} className={`flex items-center gap-2 ${step.done ? 'text-[var(--pg-ink)]' : index === current ? 'font-medium text-[var(--pg-ink)]' : 'text-[var(--pg-body)]'}`}>
              {step.done ? <Check className="h-4 w-4 text-[var(--pg-accent)]" aria-hidden="true" /> : index === current && busy === 'pay' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
              {step.label}
            </li>
          ))}
        </ol>
        {(view.addressSaved || view.deployed) && (
          <p className="mt-4 flex flex-wrap items-center gap-x-2 text-[14.5px]">
            <span className="text-[var(--pg-body)]">Your address</span>
            {view.deployed && view.siteUrl ? (
              <a href={view.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-[var(--pg-accent)] underline underline-offset-4">
                {view.siteHost} <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : (
              <span className="font-medium">{view.siteHost} <span className="font-normal text-[var(--pg-body)]">(goes live once it is built)</span></span>
            )}
          </p>
        )}
        </div>
        {brief && <SitePreview url={view.deployed ? view.siteUrl : null} host={view.siteHost} />}
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {!brief ? (
        <Card title="Your brief is on its way">
          <p className="text-[15.5px] leading-[1.6] text-[var(--pg-body)]">We are drafting it now and will email you the moment it is ready. You can refresh this page in a minute.</p>
        </Card>
      ) : (
        <>
          {/* The one problem and the one customer */}
          <Card title="What your funnel is built on" aside={<Chip tone="accent">One problem, one customer</Chip>}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className={LABEL}>The one problem</p>
                <p className="mt-1.5 font-semibold">{brief.problem?.statement ?? brief.summary}</p>
                {brief.problem?.cost && <p className="mt-1.5 text-[14.5px] text-[var(--pg-body)]">{brief.problem.cost}</p>}
                {brief.problem?.outcome && <p className="mt-1.5 text-[14.5px]">When solved: {brief.problem.outcome}</p>}
              </div>
              <div>
                <p className={LABEL}>The one customer</p>
                <p className="mt-1.5 font-semibold">{brief.icp?.who ?? brief.audience}</p>
                {brief.icp?.situation && <p className="mt-1.5 text-[14.5px] text-[var(--pg-body)]">{brief.icp.situation}</p>}
                {brief.icp?.not_for && <p className="mt-1.5 text-[14.5px] text-[var(--pg-body)]">Not for: {brief.icp.not_for}</p>}
              </div>
            </div>
            <p className="mt-5 text-[14px] leading-[1.55] text-[var(--pg-body)]">
              A funnel that speaks to one person about one problem is the one that converts. Every part of the page below serves this problem and this customer.
            </p>
          </Card>

          {!brief.scorecard && (
            <Card title="Your page" aside={view.hasPage ? <Chip tone="accent">Edited as a page</Chip> : undefined}>
              <p className="text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                {view.hasPage
                  ? 'Your page is a set of blocks you can edit by hand or by chatting. Your site is built from it.'
                  : 'Turn this brief into a page you can edit: change the words, reorder sections, or ask for a change in chat.'}
              </p>
              <div className="mt-4"><Button variant={view.hasPage ? 'ghost' : 'accent'} onClick={() => setEditing(true)}>{view.hasPage ? 'Open the page editor' : 'Edit as a page'}</Button></div>
            </Card>
          )}

          <Card title="Your offer and page">
            {brief.offer && (
              <div>
                <p className="font-editorial text-[24px] font-semibold leading-[1.15]">{brief.offer.headline}</p>
                {brief.offer.subheadline && <p className="mt-1.5 text-[var(--pg-body)]">{brief.offer.subheadline}</p>}
                {brief.cta?.label && <p className="mt-3 text-[14.5px]"><span className="font-semibold">{brief.cta.label}</span> <span className="text-[var(--pg-body)]">({brief.cta.type})</span></p>}
              </div>
            )}
            <ol className="mt-5 space-y-3">
              {(brief.sections ?? []).map((section, index) => (
                <li key={`${section.id}-${index}`} className="rounded-[10px] border border-[var(--pg-line-soft)] bg-[var(--pg-alt)]/40 p-4">
                  <p className="font-semibold">{section.title}</p>
                  {section.body && <p className="mt-1 text-[14.5px] leading-[1.55]">{section.body}</p>}
                  {!!section.bullets?.length && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14.5px]">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                </li>
              ))}
            </ol>
            {!!brief.faq?.length && (
              <div className="mt-5">
                <p className={LABEL}>Questions answered on the page</p>
                <dl className="mt-2 space-y-2 text-[14.5px]">
                  {brief.faq.map((item) => (
                    <div key={item.q}><dt className="font-semibold">{item.q}</dt><dd className="text-[var(--pg-body)]">{item.a}</dd></div>
                  ))}
                </dl>
              </div>
            )}
            {brief.follow_up?.instant_reply?.whatsapp && (
              <div className="mt-5">
                <p className={LABEL}>The instant reply every enquiry gets</p>
                <p className="mt-1.5 text-[14.5px] leading-[1.55] text-[var(--pg-body)]">{brief.follow_up.instant_reply.whatsapp}</p>
              </div>
            )}
          </Card>

          {!!brief.missing_info?.length && (
            <Card title="Still needed from you">
              <ul className="list-disc space-y-1 pl-5 text-[14.5px]">{brief.missing_info.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="mt-3 text-[14px] text-[var(--pg-body)]">Tell us these with Update funnel, or after you approve. They do not hold up your build.</p>
            </Card>
          )}

          {/* Address */}
          <Card title="Your web address">
            <div className="mb-5">
              <Field label="Funnel name" hint="Only you see this. It labels the funnel in your Hub.">
                <div className="flex flex-wrap items-center gap-2">
                  <TextInput value={funnelName} onChange={(event) => setFunnelName(event.target.value)} maxLength={60} className="max-w-[340px]" aria-label="Funnel name" />
                  <Button variant="ghost" busy={busy === 'rename'} disabled={funnelName.trim().length < 2 || funnelName.trim() === (view.funnelName || view.slug)} onClick={() => void run('rename', 'rename', { name: funnelName }, 'Name saved.')}>Save name</Button>
                </div>
              </Field>
            </div>
            <Field label="Choose the name before .breadmaker.site" hint="3 to 30 letters, numbers or hyphens. You can change it any time.">
              <div className="flex flex-wrap items-center gap-2">
                <TextInput value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} className="max-w-[260px]" aria-label="Address name" />
                <span className="text-[15px] text-[var(--pg-body)]">.{view.siteHost.split('.').slice(1).join('.')}</span>
                <Button variant="ghost" busy={busy === 'slug'} disabled={slug === view.slug} onClick={() => void run('slug', 'slug', { slug }, 'Address saved.')}>Save address</Button>
              </div>
            </Field>
          </Card>

          {/* Domain */}
          <Card title="Use your own domain" aside={view.domainStatus ? <Chip tone={view.domainStatus === 'verified' ? 'accent' : 'neutral'}>{view.domainStatus === 'verified' ? 'Connected' : 'Waiting for DNS'}</Chip> : undefined}>
            {!view.customDomain ? (
              <>
                <p className="text-[14.5px] leading-[1.6] text-[var(--pg-body)]">Already own a domain such as yourbusiness.com? Connect it. If you do not, your funnel works on its free address above, and you can connect a domain later from this page.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <TextInput value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="yourbusiness.com" className="max-w-[300px]" aria-label="Your domain" />
                  <Button variant="ghost" busy={busy === 'domain'} disabled={!domain.trim()} onClick={() => void run('domain', 'domain', { domain })}>Add domain</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[15px]"><Globe className="mr-1.5 inline h-4 w-4" aria-hidden="true" />{view.customDomain}</p>
                {view.domainStatus !== 'verified' && (
                  <>
                    <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--pg-body)]">At the company where you bought the domain, add this DNS record. If you use Cloudflare, switch the orange cloud off so it shows DNS only.</p>
                    <dl className="mt-3 grid gap-x-6 gap-y-1 rounded-[10px] border border-[var(--pg-line-soft)] bg-[var(--pg-alt)]/40 p-4 text-[14.5px] sm:grid-cols-[auto_1fr]">
                      <dt className={LABEL}>Type</dt><dd>A</dd>
                      <dt className={LABEL}>Name</dt><dd>@ (or {view.customDomain.split('.').length > 2 ? view.customDomain.split('.')[0] : 'www'} for a subdomain)</dd>
                      <dt className={LABEL}>Value</dt><dd className="font-mono">{view.dns.ip}</dd>
                    </dl>
                  </>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {view.domainStatus !== 'verified' && <Button busy={busy === 'check_domain'} onClick={() => void run('check_domain', 'check_domain')}>Check my domain</Button>}
                  <Button variant="ghost" busy={busy === 'remove_domain'} onClick={() => void run('remove_domain', 'remove_domain', {}, 'Domain removed.')}>Remove</Button>
                </div>
                {view.domainStatus === 'verified' && !view.deployed && <p className="mt-3 text-[14px] text-[var(--pg-body)]">Your domain is ready and will be attached as soon as your funnel is built.</p>}
              </>
            )}
          </Card>

          {/* Approve and pay, then manage: last, after the member has filled everything in */}
          {!view.paid ? (
            <Card title="Approve, build and deploy">
              <p className="text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                Approving confirms this brief as it stands, takes payment, and starts building and deploying your funnel automatically. You can ask for updates afterwards.
              </p>
              {paymentsEnabled && price && shown ? (
                <Button className="mt-4" busy={busy === 'pay'} onClick={() => void pay()}>
                  Approve and deploy · {money(shown.priceMinor ?? 0, shown.currency)}
                </Button>
              ) : (
                <p className="mt-3 text-[14.5px] text-[var(--pg-body)]">Payment is not open yet. Reply to the email we sent you and we will arrange it.</p>
              )}
            </Card>
          ) : (
            <Card title="Manage your funnel">
              {view.deployed && view.siteUrl ? (
                <p className="text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                  {view.live ? 'Your funnel is live.' : 'Your preview is built. We review it before it goes live to search engines.'} Change the brief, your address or your domain above at any time, and we rebuild it for you.
                </p>
              ) : (
                <p className="text-[15.5px] leading-[1.6] text-[var(--pg-body)]">Your payment is in and your funnel is being built from this brief. Your preview link appears at the top of this page and in your email, usually within a few minutes.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {view.deployed && view.siteUrl && (
                  <a href={view.siteUrl} target="_blank" rel="noreferrer" className="inline-flex">
                    <Button>Open my funnel <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden="true" /></Button>
                  </a>
                )}
                <Button variant="ghost" onClick={openUpdate}>
                  Update funnel · {changesLeft} {changesLeft === 1 ? 'revision' : 'revisions'} left
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
