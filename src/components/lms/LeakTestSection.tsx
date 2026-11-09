import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import {
  AiReport,
  LeakLead,
  LeakLeadDetail,
  LeakPriceAdmin,
  SystemInterestCount,
  deleteLeakTest,
  getLeakLeadDetail,
  listLeakLeads,
  listLeakPricesAdmin,
  listSystemInterest,
  requeueLeakAi,
  setLeakAiReport,
  setLeakCall,
  setLeakPrice,
} from '../../lib/leak-test-api';
import { errorMessage, formatPrice } from '../../lib/lms';
import { splitPrice } from '../../lib/currency';
import { findSystem } from '../../lib/systems';
import DualPrice from './DualPrice';
import { Button, CARD, Chip, EmptyState, Field, Loading, Notice, Select, TextArea, TextInput } from './lms-ui';

/**
 * Business Leak Test leads: who took the test and paid, the personal plan written for
 * Report + call buyers (read it, edit it, release it) and the review call.
 */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Needs review' },
  { key: 'call', label: 'Calls to do' },
  { key: 'paid', label: 'Paid' },
];

const TIER_LABEL: Record<string, string> = { report: 'Report', report_call: 'Report + call' };

const needsReview = (lead: LeakLead) => lead.paid_tier === 'report_call' && lead.ai_status === 'ready' && !lead.ai_released;
const callOpen = (lead: LeakLead) => lead.paid_tier === 'report_call' && lead.call_status !== 'done';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** <input type="datetime-local"> wants local time without a zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function LeakTestSection({ canEdit, embedded = false }: { canEdit: boolean; embedded?: boolean }) {
  const [rows, setRows] = useState<LeakLead[] | null>(null);
  const [demand, setDemand] = useState<SystemInterestCount[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('lead'));
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await listLeakLeads());
      setDemand(await listSystemInterest().catch(() => []));
    } catch (err) {
      setRows([]);
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter((lead) => {
      if (filter === 'review' && !needsReview(lead)) return false;
      if (filter === 'call' && !callOpen(lead)) return false;
      if (filter === 'paid' && !lead.paid_tier) return false;
      return !needle || lead.name.toLowerCase().includes(needle) || lead.email.toLowerCase().includes(needle);
    });
  }, [rows, filter, query]);

  const counts = useMemo(
    () => ({ review: (rows ?? []).filter(needsReview).length, call: (rows ?? []).filter(callOpen).length }),
    [rows],
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          {!embedded && <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Leak Test</h1>}
          <p className="mt-2 max-w-[640px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
            Everyone who took the Business Leak Test. For Report + call buyers, read the personal plan the AI wrote before the
            customer sees it, fix anything off, then release it. Track each review call here.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void refresh()}>Refresh</Button>
      </div>

      {message && <div className="mb-6"><Notice tone={message.tone}>{message.text}</Notice></div>}

      {demand.length > 0 && (
        <div className={`${CARD} mb-6 px-6 py-5`}>
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Demand for systems in testing</p>
          <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {demand.map((item) => (
              <li key={item.system_id} className="flex items-baseline justify-between gap-4 text-[15px]">
                <span>{findSystem(item.system_id)?.name ?? item.system_id}</span>
                <span className="font-semibold">{item.people}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-[var(--pg-body)]">People who asked to be told when it is ready. Build and record the top one first.</p>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-full bg-[var(--pg-alt)] p-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-4 py-2 text-[13.5px] transition-colors cursor-pointer ${
                filter === item.key ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'hover:bg-[var(--pg-card)]'
              }`}
            >
              {item.label}
              {item.key === 'review' && counts.review ? ` ${counts.review}` : ''}
              {item.key === 'call' && counts.call ? ` ${counts.call}` : ''}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pg-body)]" />
          <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" className="pl-10" />
        </div>
      </div>

      {!rows ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing in this view"
          body={rows.length ? 'No one matches this filter.' : 'Results appear here as soon as someone finishes the test.'}
        />
      ) : (
        <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
          {filtered.map((lead) => {
            const open = openId === lead.id;
            return (
              <li key={lead.id}>
                <button
                  onClick={() => setOpenId(open ? null : lead.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 text-left cursor-pointer hover:bg-[var(--pg-alt)]/50"
                  aria-expanded={open}
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--pg-body)] transition-transform ${open ? 'rotate-180' : ''}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{lead.name}</span>
                    <span className="block truncate text-[13px] text-[var(--pg-body)]">{lead.email}</span>
                  </span>
                  <span className="hidden text-[13.5px] text-[var(--pg-body)] sm:block">
                    {lead.total}/100 · {lead.leakiest}
                  </span>
                  <span className="hidden text-[13.5px] text-[var(--pg-body)] lg:block">{formatDate(lead.created_at)}</span>
                  {lead.paid_tier ? <Chip tone="dark">{TIER_LABEL[lead.paid_tier]}</Chip> : <Chip>Free</Chip>}
                  {needsReview(lead) && <Chip tone="accent">Review plan</Chip>}
                  {lead.paid_tier === 'report_call' && lead.call_status !== 'done' && (
                    <Chip>{lead.call_status === 'booked' ? 'Call booked' : 'Call to book'}</Chip>
                  )}
                </button>
                {open && (
                  <LeadDetail
                    id={lead.id}
                    canEdit={canEdit}
                    onChanged={refresh}
                    onDeleted={() => {
                      setOpenId(null);
                      void refresh();
                    }}
                    onMessage={(tone, text) => setMessage({ tone, text })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LeadDetail({
  id,
  canEdit,
  onChanged,
  onDeleted,
  onMessage,
}: {
  id: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
  onMessage: (tone: 'error' | 'success', text: string) => void;
}) {
  const [detail, setDetail] = useState<LeakLeadDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [callAt, setCallAt] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const found = await getLeakLeadDetail(id);
      setDetail(found);
      setDraft(found?.ai_report ? JSON.stringify(found.ai_report, null, 2) : '');
      setCallStatus(found?.call_status ?? '');
      setCallAt(toLocalInput(found?.call_booked_at ?? null));
      setCallNotes(found?.call_notes ?? '');
    } catch (err) {
      onMessage('error', errorMessage(err));
    }
  }, [id, onMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      onMessage('success', label);
      await load();
      await onChanged();
    } catch (err) {
      onMessage('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const parseDraft = (): AiReport => {
    const parsed = JSON.parse(draft) as AiReport;
    if (!parsed.headline || !Array.isArray(parsed.first_week) || !Array.isArray(parsed.thirty_day_plan)) {
      throw new Error('The plan needs a headline, first_week and thirty_day_plan.');
    }
    return parsed;
  };

  if (!detail) return <div className="border-t border-[var(--pg-line-soft)] px-6 py-6"><Loading /></div>;

  const callTier = detail.paid_tier === 'report_call';
  const waiting = callTier && detail.ai_status === 'ready' && !detail.ai_released;

  return (
    <div className="space-y-8 border-t border-[var(--pg-line-soft)] bg-[var(--pg-alt)]/40 px-6 py-6">
      <dl className="grid gap-x-8 gap-y-3 text-[14.5px] sm:grid-cols-2 lg:grid-cols-3">
        <Info label="WhatsApp" value={detail.whatsapp} />
        <Info label="Score" value={`${detail.total}/100 · ${detail.archetype}`} />
        <Info label="Pillars (offer, sales, ops, cash, team, tech)" value={detail.pillar_scores.join(' · ')} />
        {Object.entries(detail.profile ?? {}).map(([key, value]) => (
          <Info key={key} label={key.replace('_', ' ')} value={String(value || '—')} />
        ))}
      </dl>

      <section>
        <h3 className="text-[16px] font-bold">In their own words</h3>
        {detail.intake ? (
          <dl className="mt-3 space-y-3 text-[15px] leading-[1.6]">
            <Info label="What the business does" value={detail.intake.about} />
            <Info label="Biggest frustration" value={detail.intake.frustration || '—'} />
            <Info label="Already tried" value={detail.intake.tried || '—'} />
          </dl>
        ) : (
          <p className="mt-2 text-[14.5px] text-[var(--pg-body)]">
            {detail.paid_tier ? 'They have not answered the three questions yet.' : 'The report is not unlocked, so there is no intake.'}
          </p>
        )}
      </section>

      {detail.paid_tier && (
        <section>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-[16px] font-bold">Personal plan</h3>
            <Chip tone={detail.ai_status === 'ready' ? 'dark' : 'neutral'}>{detail.ai_status}</Chip>
            {detail.ai_status === 'ready' && <Chip tone={detail.ai_released ? 'accent' : 'neutral'}>{detail.ai_released ? 'Customer can see it' : 'Hidden from customer'}</Chip>}
          </div>
          {detail.ai_report ? (
            <>
              <p className="mt-2 text-[13.5px] text-[var(--pg-body)]">
                Edit the text below, keeping the structure, then save. Check it for invented facts, income promises and anything that
                reads like financial or legal advice.
              </p>
              <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} className="mt-3 font-mono text-[13px]" disabled={!canEdit} />
              {canEdit && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    variant="ghost"
                    busy={busy}
                    onClick={() => void run('Plan saved.', () => setLeakAiReport(id, parseDraft(), detail.ai_released))}
                  >
                    Save edits
                  </Button>
                  {detail.ai_released ? (
                    <Button variant="ghost" busy={busy} onClick={() => void run('The plan is hidden from the customer.', () => setLeakAiReport(id, null, false))}>
                      Hide from customer
                    </Button>
                  ) : (
                    <Button busy={busy} onClick={() => void run('Released. The customer can see their plan.', () => setLeakAiReport(id, parseDraft(), true))}>
                      {waiting ? 'Save and release to customer' : 'Release to customer'}
                    </Button>
                  )}
                  <Button variant="ghost" busy={busy} onClick={() => void run('Queued. It is written again when the customer next opens their report.', () => requeueLeakAi(id))}>
                    Write it again
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-[14.5px] text-[var(--pg-body)]">
              {detail.ai_status === 'failed' ? 'Writing failed. The customer can retry from their report, or re-queue it below.' : 'Nothing written yet.'}
              {canEdit && detail.intake && detail.ai_status === 'failed' && (
                <span className="ml-3 inline-block">
                  <Button variant="ghost" busy={busy} onClick={() => void run('Queued.', () => requeueLeakAi(id))}>Re-queue</Button>
                </span>
              )}
            </p>
          )}
        </section>
      )}

      {callTier && (
        <section>
          <h3 className="text-[16px] font-bold">Review call</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select value={callStatus} onChange={(e) => setCallStatus(e.target.value)} disabled={!canEdit}>
                <option value="">To book</option>
                <option value="booked">Booked</option>
                <option value="done">Done</option>
              </Select>
            </Field>
            <Field label="Call time">
              <TextInput type="datetime-local" value={callAt} onChange={(e) => setCallAt(e.target.value)} disabled={!canEdit} />
            </Field>
          </div>
          <Field label="Notes" className="mt-4">
            <TextArea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} rows={4} disabled={!canEdit} placeholder="What to cover, what was agreed, the next step to offer." />
          </Field>
          {canEdit && (
            <div className="mt-3">
              <Button
                busy={busy}
                onClick={() => void run('Call details saved.', () => setLeakCall(id, callStatus || 'to_book', callAt ? new Date(callAt).toISOString() : null, callNotes))}
              >
                Save call details
              </Button>
            </div>
          )}
        </section>
      )}

      {canEdit && (
        <section className="border-t border-[var(--pg-line-soft)] pt-5">
          <Button
            variant="ghost"
            busy={busy}
            onClick={async () => {
              const paid = detail.paid_tier ? ' They have paid; the payment record stays but their report is gone.' : '';
              if (!window.confirm(`Delete ${detail.name}'s leak test permanently?${paid} This cannot be undone.`)) return;
              setBusy(true);
              try {
                await deleteLeakTest(id);
                onMessage('success', `Deleted ${detail.name}'s leak test.`);
                onDeleted();
              } catch (err) {
                onMessage('error', errorMessage(err));
                setBusy(false);
              }
            }}
          >
            Delete this test
          </Button>
        </section>
      )}
    </div>
  );
}

/** Report prices and the launch discount, edited the way a course price is. Amounts are in major units (naira / dollars). */
export function LeakTestPricing({ canEdit, onMessage, bare = false }: { canEdit: boolean; onMessage: (tone: 'error' | 'success', text: string) => void; bare?: boolean }) {
  const [rows, setRows] = useState<LeakPriceAdmin[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyTier, setBusyTier] = useState<string | null>(null);

  // Load once: onMessage is a new function every render and must not reload (and wipe) unsaved edits.
  useEffect(() => {
    listLeakPricesAdmin().then(setRows).catch((err) => {
      setRows([]);
      onMessage('error', errorMessage(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (tier: string, patch: Partial<LeakPriceAdmin>) =>
    setRows((current) => (current ?? []).map((row) => (row.tier === tier ? { ...row, ...patch } : row)));

  const save = async (row: LeakPriceAdmin) => {
    setBusyTier(row.tier);
    try {
      await setLeakPrice(row);
      onMessage('success', `${row.label || row.tier} saved. Checkout uses it straight away.`);
    } catch (err) {
      onMessage('error', errorMessage(err));
    } finally {
      setBusyTier(null);
    }
  };

  if (!rows?.length) return null;
  const expanded = bare || open;

  return (
    <div className={`${CARD} mb-6`}>
      {!bare && (
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left cursor-pointer"
        aria-expanded={open}
      >
        <span>
          <span className="block text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Price and discount</span>
          <span className="mt-1 block text-[14px] text-[var(--pg-body)]">
            {rows
              .map((row) => `${row.label || row.tier}: ${[splitPrice({ priceMinor: row.price_minor, currency: row.currency, altPriceMinor: row.alt_price_minor }).ngn && formatPrice(splitPrice({ priceMinor: row.price_minor, currency: row.currency, altPriceMinor: row.alt_price_minor }).ngn, 'NGN'), splitPrice({ priceMinor: row.price_minor, currency: row.currency, altPriceMinor: row.alt_price_minor }).usd && formatPrice(splitPrice({ priceMinor: row.price_minor, currency: row.currency, altPriceMinor: row.alt_price_minor }).usd, 'USD')].filter(Boolean).join(' / ')}${row.discount_pct ? ` (${row.discount_pct}% off)` : ''}`)
              .join(' · ')}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--pg-body)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      )}
      {bare && <p className="px-6 pt-5 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Pricing</p>}
      {expanded && (
        <div className={`space-y-6 px-6 py-5 ${bare ? '' : 'border-t border-[var(--pg-line-soft)]'}`}>
          {rows.map((row) => (
            <div key={row.tier}>
              <p className="mb-3 text-[15px] font-semibold">{row.label || row.tier}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <DualPrice
                  price={{ priceMinor: row.price_minor, currency: row.currency, altPriceMinor: row.alt_price_minor }}
                  disabled={!canEdit}
                  onChange={(next) => update(row.tier, { price_minor: next.priceMinor, currency: next.currency, alt_price_minor: next.altPriceMinor })}
                />
                <Field label="Discount %" hint="0 for none.">
                  <TextInput
                    type="number"
                    min={0}
                    max={100}
                    value={row.discount_pct}
                    onChange={(e) => update(row.tier, { discount_pct: Math.min(100, Math.max(0, Math.round(Number(e.target.value)))) })}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Discount lasts (hours)" hint="Counted from the result date.">
                  <TextInput
                    type="number"
                    min={0}
                    value={row.discount_hours}
                    onChange={(e) => update(row.tier, { discount_hours: Math.max(0, Math.round(Number(e.target.value))) })}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="On sale">
                  <Select value={row.active ? 'yes' : 'no'} onChange={(e) => update(row.tier, { active: e.target.value === 'yes' })} disabled={!canEdit}>
                    <option value="yes">Yes</option>
                    <option value="no">No, hide it</option>
                  </Select>
                </Field>
              </div>
              {canEdit && (
                <div className="mt-3">
                  <Button busy={busyTier === row.tier} onClick={() => void save(row)}>Save</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string; key?: React.Key }) {
  return (
    <div>
      <dt className="text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--pg-body)]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}
