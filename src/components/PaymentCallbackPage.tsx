import React, { useEffect, useState } from 'react';
import { Check, Clock, TriangleAlert } from 'lucide-react';
import { Route } from '../types';
import { money, verifyPayment } from '../lib/payments';
import { portal, tokenForPayment } from '../lib/portal';
import { BREADMAKER_THEME, FOUNDRY_THEME, LAUNCHPAD_THEME, Label, ProgramFooter, ProgramNav, ProgramTheme, themeStyle } from './program-ui';
import { Button, Loading, Notice } from './lms/lms-ui';

/**
 * Where Flutterwave sends the payer back to. Nothing on this page is trusted
 * from the URL: the reference is verified with Flutterwave before we say a
 * payment went through.
 */

interface PaymentCallbackPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

type State = 'verifying' | 'paid' | 'pending' | 'failed' | 'cancelled';

const THEMES: Record<string, ProgramTheme> = { foundry: FOUNDRY_THEME, launchpad: LAUNCHPAD_THEME };

export default function PaymentCallbackPage({ onNavigate, openPath }: PaymentCallbackPageProps) {
  const params = new URLSearchParams(window.location.search);
  const txRef = (params.get('tx_ref') ?? params.get('txRef') ?? '').trim();
  const returned = (params.get('status') ?? '').toLowerCase();

  const [state, setState] = useState<State>('verifying');
  const [detail, setDetail] = useState<{ amountMinor: number; currency: string; enrollment: string | null; reason: string | null; txRef: string | null; program: string | null; tier: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Paid through Lago, the payer comes back with Lago's reference, which says nothing about the
  // program, so the verifier's answer wins over parsing the reference (bm-<program>-<tier>-<stamp>-<noise>).
  const ref = detail?.txRef || txRef;
  const program = detail?.program || (ref.split('-')[1] ?? '');
  // A Business Leak Test report: the result is in ?s=<id>&t=<token>, kept off the Academy paths.
  const isReport = program === 'leaktest';
  // A kit: the tier is the system id, which is also the kit course's slug.
  const isKit = program === 'kit';
  // The Breadmaker Hub monthly membership.
  const isHub = program === 'membership';
  // A Launchpad build: paying confirms the funnel brief and starts the automatic build.
  const isLaunchpad = program === 'launchpad';
  const [funnelToken, setFunnelToken] = useState<string | null>(null);
  useEffect(() => {
    if (state !== 'paid' || !isLaunchpad || !ref) return;
    void tokenForPayment(ref).then(setFunnelToken);
  }, [state, isLaunchpad, ref]);
  const kitSlug = isKit ? (detail?.tier || ref.split('-').slice(2, -2).join('-')) : '';
  const resultQuery = `s=${encodeURIComponent(params.get('s') ?? '')}&t=${encodeURIComponent(params.get('t') ?? '')}`;
  const theme = THEMES[program] ?? BREADMAKER_THEME;

  const check = async () => {
    if (!txRef) {
      setError('This link is missing its payment reference. If you were charged, reply to your confirmation email and we will sort it out.');
      setState('failed');
      return;
    }
    setState('verifying');
    try {
      const result = await verifyPayment(txRef);
      setDetail(result);
      if (result.status === 'successful') setState('paid');
      else if (result.status === 'cancelled') setState('cancelled');
      else if (result.status === 'failed') setState('failed');
      else setState('pending');
    } catch (err) {
      const message = (err as Error).message ?? '';
      // If we cannot reach the verifier, the payment may still have gone through:
      // say so instead of telling someone their money failed.
      if (/non-2xx|Failed to fetch|NetworkError|does not exist|schema cache/i.test(message)) {
        setError('We could not reach the payment service from this browser. If you completed the payment, it is safe — check again in a moment, or email us the reference below.');
        setState('pending');
      } else {
        setError(message);
        setState('failed');
      }
    }
  };

  useEffect(() => {
    if (returned === 'cancelled') {
      setState('cancelled');
      return;
    }
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txRef]);

  return (
    <div style={themeStyle(theme)} className="flex min-h-screen flex-col bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased">
      <ProgramNav
        announcement={false}
        brand="Breadmaker"
        accentWord={program === 'foundry' ? 'Foundry' : program === 'launchpad' ? 'Launchpad' : 'Systems'}
        links={[]}
        onBrand={() => onNavigate('home')}
        ctaLabel="Back to the site"
        onCta={() => onNavigate('home')}
      />

      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-16 sm:px-6 lg:py-24">
        {state === 'verifying' ? (
          <div>
            <Label>Payment</Label>
            <h1 className="mt-6 font-editorial text-[36px] font-bold leading-[1.06] tracking-[-0.02em] sm:text-[46px]">Checking your payment…</h1>
            <p className="mt-5 text-[17px] leading-[1.6] text-[var(--pg-body)]">
              We are confirming transaction <span className="font-label text-[14px]">{txRef || 'unknown'}</span> with Flutterwave. This takes a few seconds.
            </p>
            <div className="mt-8"><Loading label="Talking to Flutterwave…" /></div>
          </div>
        ) : (
          <div>
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
                state === 'paid' ? 'bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]' : 'bg-[var(--pg-alt)] text-[var(--pg-ink)]'
              }`}
            >
              {state === 'paid' ? <Check className="h-6 w-6" /> : state === 'pending' ? <Clock className="h-6 w-6" /> : <TriangleAlert className="h-6 w-6" />}
            </span>

            <h1 className="mt-6 font-editorial text-[36px] font-bold leading-[1.06] tracking-[-0.02em] sm:text-[46px]">
              {state === 'paid' && (isReport ? 'Paid. Your report is unlocked.' : isKit ? 'Paid. Your kit is unlocked.' : isLaunchpad ? 'Paid. Your funnel build has started.' : 'Paid. You are in.')}
              {state === 'pending' && 'Almost there.'}
              {state === 'cancelled' && 'Payment cancelled.'}
              {state === 'failed' && 'That payment did not go through.'}
            </h1>

            <p className="mt-5 max-w-[560px] text-[17px] leading-[1.6] text-[var(--pg-body)]">
              {state === 'paid' && isReport &&
                `We have your payment${detail ? ` of ${money(detail.amountMinor, detail.currency)}` : ''}. Your full Business Leak Test report is ready to open, and we have emailed you the link.`}
              {state === 'paid' && isKit &&
                `We have your payment${detail ? ` of ${money(detail.amountMinor, detail.currency)}` : ''}. Every session, checklist and the definition of done are open in the Academy now.`}
              {state === 'paid' && isHub &&
                `We have your payment${detail ? ` of ${money(detail.amountMinor, detail.currency)}` : ''}. Your Breadmaker Prestige membership is active. Sign in with the same email address and every kit and course is open.`}
              {state === 'paid' && isLaunchpad &&
                `We have your payment${detail ? ` of ${money(detail.amountMinor, detail.currency)}` : ''}. The brief you approved is now being built into your funnel. Your preview link appears on your funnel page and in your email, usually within a few minutes.`}
              {state === 'paid' && !isReport && !isKit && !isHub && !isLaunchpad &&
                `We have your payment${detail ? ` of ${money(detail.amountMinor, detail.currency)}` : ''}. Create an account (or sign in) with the same email address and your program opens in the Academy straight away.`}
              {state === 'pending' && (error ?? 'Flutterwave has not confirmed this transaction yet. If you completed the payment, check again in a moment — nothing is lost.')}
              {state === 'cancelled' && 'Nothing was charged. You can start the payment again whenever you are ready.'}
              {state === 'failed' && (error ?? 'Flutterwave reported that the transaction did not complete. Nothing was enrolled.')}
            </p>

            {state === 'paid' && !isReport && !isHub && !isLaunchpad && detail?.enrollment === 'no-account' && (
              <div className="mt-6">
                <Notice tone="info">
                  Your payment is safe. Create your account with the same email address and the program will be waiting.
                </Notice>
              </div>
            )}
            {state === 'failed' && detail?.reason === 'amount-mismatch' && (
              <div className="mt-6">
                <Notice tone="error">
                  The amount paid did not match the price, so we have not enrolled anyone. Email us and we will reconcile it by hand.
                </Notice>
              </div>
            )}

            <dl className="mt-8 max-w-[520px] space-y-3 border-t border-[var(--pg-line-soft)] pt-6 text-[15.5px]">
              <div className="flex gap-4">
                <dt className="w-[140px] shrink-0 font-label font-medium text-[12.5px] uppercase tracking-[0.06em] text-[var(--pg-body)]">Reference</dt>
                <dd className="font-label text-[14px]">{ref || '—'}</dd>
              </div>
              {detail && (
                <div className="flex gap-4">
                  <dt className="w-[140px] shrink-0 font-label font-medium text-[12.5px] uppercase tracking-[0.06em] text-[var(--pg-body)]">Amount</dt>
                  <dd>{money(detail.amountMinor, detail.currency)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-9 flex flex-wrap gap-3">
              {state === 'paid' && isReport && (
                <Button onClick={() => openPath(`/leak-test/report?${resultQuery}`)}>Open my report</Button>
              )}
              {state === 'paid' && isKit && kitSlug && (
                <Button onClick={() => openPath(`/course/${kitSlug}`)}>Open my kit</Button>
              )}
              {state === 'paid' && isHub && (
                <>
                  <Button onClick={() => openPath('/membership')}>Open Prestige</Button>
                  <Button variant="ghost" onClick={() => onNavigate('signin')}>Sign in</Button>
                </>
              )}
              {state === 'paid' && isLaunchpad && (
                <>
                  <Button disabled={!funnelToken} onClick={() => openPath(`/launchpad/brief/${funnelToken}`)}>See my funnel</Button>
                  <Button variant="ghost" onClick={() => onNavigate('dashboard')}>Go to my Hub</Button>
                </>
              )}
              {state === 'paid' && !isReport && !isKit && !isHub && !isLaunchpad && (
                <>
                  <Button onClick={() => onNavigate('dashboard')}>Go to my learning</Button>
                  <Button variant="ghost" onClick={() => onNavigate('signin')}>Sign in</Button>
                </>
              )}
              {state === 'pending' && (
                <>
                  <Button onClick={() => void check()}>Check again</Button>
                  {!isReport && <Button variant="ghost" onClick={() => onNavigate('dashboard')}>Go to my learning</Button>}
                </>
              )}
              {(state === 'cancelled' || state === 'failed') && (
                <>
                  <Button onClick={() => openPath(isReport ? `/leak-test/result?${resultQuery}` : program === 'launchpad' ? '/launchpad/apply' : program === 'foundry' ? '/foundry/apply' : isKit ? '/systems' : isHub ? '/courses' : '/contact')}>
                    Try again
                  </Button>
                  <Button variant="ghost" onClick={() => onNavigate('contact')}>Talk to us</Button>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <ProgramFooter onNavigate={onNavigate} />
    </div>
  );
}
