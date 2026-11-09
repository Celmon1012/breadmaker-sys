import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, Mail, UserPlus, Wallet } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../lib/currency';
import { money } from '../../lib/payments';
import { ReferralSummary, earnedCurrencies, loadReferralSummary, owedIn, referralLink } from '../../lib/referrals';
import { Button, CARD, LearnerLayout, Loading, Notice, PageContainer } from './lms-ui';

interface ReferralsPageProps {
  onNavigate: (route: Route) => void;
}

const dateOnly = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The slider's range for what the people you refer pay in total, in the visitor's currency (minor units). */
const SLIDER = {
  USD: { min: 10_000, max: 500_000, step: 10_000, start: 100_000 },
  NGN: { min: 5_000_000, max: 500_000_000, step: 5_000_000, start: 100_000_000 },
} as const;

/** "$200" or "$200 and ₦1,000", or a dash when there is nothing. */
const list = (amounts: { currency: string; amountMinor: number }[]) =>
  amounts.filter((item) => item.amountMinor > 0).map((item) => money(item.amountMinor, item.currency)).join(' and ') || '—';

const STEPS = [
  { icon: Link2, title: 'Share your link', body: 'Send it to people who would get more done with Breadmaker systems.' },
  { icon: UserPlus, title: 'They create an account', body: 'Anyone who signs up through your link, and has not bought from us before, is counted as your referral.' },
  { icon: Wallet, title: 'You earn on what they pay', body: 'Every successful payment they make for the next {months} months earns you {rate}%, in the currency they paid in.' },
];

/** Share a link, earn a commission on what the people you refer pay. */
export default function ReferralsPage({ onNavigate }: ReferralsPageProps) {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [spend, setSpend] = useState<number>(SLIDER[currency].start);
  const timer = useRef<number>(undefined);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadReferralSummary()
      .then((value) => !cancelled && setSummary(value))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Changing the currency changes the slider's range, so start again from its default.
  useEffect(() => setSpend(SLIDER[currency].start), [currency]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const range = SLIDER[currency];
  const rate = summary?.ratePct ?? 0;
  const months = summary?.windowMonths ?? 0;
  const link = summary ? referralLink(summary.code) : '';
  const per1000 = currency === 'USD' ? 100_000 : 100_000_000;
  const commission = (minor: number) => Math.floor((minor * rate) / 100);
  // Until the rate is known (loading, or the program not set up) show a dash, never "Free".
  const earn = (minor: number) => (rate ? money(commission(minor), currency) : '—');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is selectable in the box, so copying by hand still works */
    }
  };

  const inviteHref = `mailto:?subject=${encodeURIComponent('Breadmaker: systems for your business')}&body=${encodeURIComponent(
    `I have been using Breadmaker to set up the systems my business runs on. You can join here:\n\n${link}\n`,
  )}`;

  const currencies = summary ? earnedCurrencies(summary) : [];
  const owed = summary ? currencies.map((code) => ({ currency: code, amountMinor: owedIn(summary, code) })) : [];
  const hasOwed = owed.some((item) => item.amountMinor > 0);

  return (
    <LearnerLayout active="referrals" onNavigate={onNavigate}>
    <PageContainer>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
        <div>
          <h1 className="font-editorial text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[52px]">
            {summary ? `Earn ${rate}% of what your referrals pay` : 'Earn a share of what your referrals pay'}
          </h1>
          <p className="mt-5 max-w-[520px] text-[16.5px] leading-[1.6] text-[var(--pg-body)]">
            {summary ? (
              <>
                For {months} months after they join, with no cap. Every kit, program and membership they buy counts.
              </>
            ) : (
              'Every kit, program and membership they buy counts.'
            )}
          </p>

          <div className="mt-9">
            <p className="text-[14.5px] font-medium">Your referral link</p>
            {failed ? (
              <div className="mt-2.5">
                <Notice tone="error">The referral program is not available yet. Please try again shortly.</Notice>
              </div>
            ) : !summary ? (
              <Loading label="Getting your link…" />
            ) : (
              <>
                <div className="mt-2.5 flex items-center gap-2 rounded-[14px] bg-[var(--pg-alt)] p-1.5 pl-4">
                  <input
                    readOnly
                    value={link}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Your referral link"
                    className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
                  />
                  <button
                    onClick={copy}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--pg-card)] px-4 py-2 text-[14px] font-medium transition-colors hover:bg-white cursor-pointer"
                  >
                    {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <a
                  href={inviteHref}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--pg-ink)] px-5 py-3 text-[14.5px] font-medium text-[var(--pg-bg)] transition-opacity hover:opacity-90"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" /> Invite by email
                </a>
              </>
            )}
          </div>
        </div>

        <aside className={`${CARD} p-6 sm:p-7`} aria-labelledby="ref-calc">
          <h2 id="ref-calc" className="text-[16px] font-medium">What you could earn</h2>
          <p className="mt-4 break-words font-editorial text-[44px] font-semibold leading-none tracking-[-0.02em] sm:text-[48px]">{earn(spend)}</p>
          <p className="mt-2 text-[14.5px] text-[var(--pg-body)]">{rate ? `${rate}% of what they pay` : 'a share of what they pay'}</p>

          <dl className="mt-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
            <div>
              <dt className="text-[13.5px] text-[var(--pg-body)]">They pay us</dt>
              <dd className="mt-1 font-editorial text-[22px] font-semibold">{money(spend, currency)}</dd>
            </div>
            <div>
              <dt className="text-[13.5px] text-[var(--pg-body)]">Of every {money(per1000, currency)}</dt>
              <dd className="mt-1 font-editorial text-[22px] font-semibold">{earn(per1000)}</dd>
            </div>
          </dl>

          <input
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={spend}
            onChange={(event) => setSpend(Number(event.target.value))}
            aria-label="What the people you refer pay in total"
            className="mt-7 w-full cursor-pointer accent-[var(--pg-accent)]"
          />
          <p className="mt-2 text-[13.5px] text-[var(--pg-body)]">Refer people who pay {money(spend, currency)} in total</p>
        </aside>
      </div>

      {summary && (
        <section className="mt-14" aria-labelledby="ref-yours">
          <h2 id="ref-yours" className="text-[15px] font-medium text-[var(--pg-body)]">Your referrals</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'People who joined', value: String(summary.referrals.length) },
              { label: 'You have earned', value: list(summary.earned) },
              { label: 'Paid out to you', value: list(summary.paid) },
              { label: 'Owed to you now', value: list(owed) },
            ].map((tile) => (
              <div key={tile.label} className={`${CARD} px-5 py-4`}>
                <dt className="text-[13.5px] text-[var(--pg-body)]">{tile.label}</dt>
                <dd className="mt-1 font-editorial text-[26px] font-semibold leading-tight">{tile.value}</dd>
              </div>
            ))}
          </dl>

          {summary.referrals.length > 0 ? (
            <ul className={`${CARD} mt-3 divide-y divide-[var(--pg-line-soft)]`}>
              {summary.referrals.map((person, index) => (
                <li key={`${person.joinedAt}-${index}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5">
                  <span>
                    <span className="block font-medium">Joined {dateOnly(person.joinedAt)}</span>
                    <span className="block text-[13px] text-[var(--pg-body)]">{person.earned.length ? 'Has paid' : 'Has not paid yet'}</span>
                  </span>
                  <span className="text-[15px] font-medium">{list(person.earned)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[14.5px] text-[var(--pg-body)]">Nobody has joined through your link yet. People appear here, without their names, as they sign up.</p>
          )}

          {hasOwed && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="dark" onClick={() => onNavigate('support')}>Ask for a payout</Button>
              <p className="text-[13.5px] text-[var(--pg-body)]">Open a ticket under Billing and we will pay you by bank transfer.</p>
            </div>
          )}
        </section>
      )}

      <section className="mt-14" aria-labelledby="ref-how">
        <h2 id="ref-how" className="text-[15px] font-medium text-[var(--pg-body)]">How it works</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.title} className={`${CARD} p-5`}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--pg-alt)]">
                <step.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <p className="mt-7 text-[17px] font-semibold">{step.title}</p>
              <p className="mt-1.5 text-[14.5px] leading-[1.55] text-[var(--pg-body)]">
                {step.body.replace('{months}', months ? String(months) : '12').replace('{rate}', rate ? String(rate) : 'a share')}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14" aria-labelledby="ref-terms">
        <h2 id="ref-terms" className="text-[15px] font-medium text-[var(--pg-body)]">Terms</h2>
        <ul className="mt-3 max-w-[760px] space-y-1.5 text-[14.5px] leading-[1.6] text-[var(--pg-body)]">
          <li>You earn {rate ? `${rate}%` : 'a percentage'} of every successful payment the people you refer make{months ? ` in the ${months} months after they join` : ''}, with no cap.</li>
          <li>Only new accounts count. The person must sign up through your link, must not already have an account, and must not have paid us before.</li>
          <li>You cannot refer yourself, and each person can be referred once.</li>
          <li>Commission is worked out on what they actually pay, in the currency they pay in, so you may earn in both naira and dollars.</li>
          <li>Payouts are made by bank transfer: open a support ticket when you have a balance and ask for one.</li>
          <li>People you refer are never named on this page.</li>
        </ul>
      </section>
    </PageContainer>
    </LearnerLayout>
  );
}
