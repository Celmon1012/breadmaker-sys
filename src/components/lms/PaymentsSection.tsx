import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Receipt, RefreshCw, Search } from 'lucide-react';
import { PaymentRow, lagoInvoicesUrl, loadPayments, money, paymentSubject, verifyPayment } from '../../lib/payments';
import { errorMessage } from '../../lib/lms';
import { Button, CARD, Chip, Loading, Notice, Select, TextInput } from './lms-ui';

/**
 * The payments ledger: every attempt with its status, what it bought and the Lago invoice that bills it.
 * Read-only. "Check now" asks the payment service to settle a stuck pending payment.
 */

const TONES: Record<string, 'neutral' | 'accent' | 'dark'> = { successful: 'accent', pending: 'neutral', failed: 'dark', cancelled: 'neutral' };
const STATUSES = ['all', 'successful', 'pending', 'failed', 'cancelled'];
/** Columns shared by the header row and every payment row from md up. */
const COLUMNS = 'md:grid md:grid-cols-[16px_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] md:items-center md:gap-4';
const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function PaymentsSection({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await loadPayments());
    } catch (err) {
      setRows([]);
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  const collected = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows ?? []) if (row.status === 'successful') totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amountMinor);
    return [...totals.entries()].map(([currency, minor]) => money(minor, currency)).join(' + ') || '—';
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) =>
        (status === 'all' || row.status === status) &&
        (!needle ||
          row.email.toLowerCase().includes(needle) ||
          row.name.toLowerCase().includes(needle) ||
          row.txRef.toLowerCase().includes(needle) ||
          (row.invoiceNumber ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, status, query]);

  const check = async (row: PaymentRow) => {
    setBusy(row.id);
    setMessage(null);
    try {
      const result = await verifyPayment(row.txRef);
      setMessage({
        tone: result.status === 'successful' ? 'success' : 'error',
        text:
          result.status === 'successful'
            ? `${row.email} is paid and enrolled.`
            : `${row.email}: still ${result.status}${result.reason ? ` (${result.reason})` : ''}.`,
      });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const dateOnly = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const isFiltered = status !== 'all' || query.trim() !== '';

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Payments</h1>
        <p className="mt-2 max-w-[640px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
          Every checkout attempt and what it bought, billed as an invoice in Lago.
        </p>
      </div>

      {message && <div className="mb-6"><Notice tone={message.tone}>{message.text}</Notice></div>}

      <dl className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Collected', value: collected, sub: `${counts.get('successful') ?? 0} successful` },
          { label: 'Waiting', value: counts.get('pending') ?? 0, sub: 'started but not paid yet' },
          { label: 'Failed or cancelled', value: (counts.get('failed') ?? 0) + (counts.get('cancelled') ?? 0), sub: 'worth a follow-up' },
        ].map((metric) => (
          <div key={metric.label} className={`${CARD} lg:bg-[color-mix(in_srgb,var(--pg-alt)_35%,var(--pg-card))]! px-5 py-4`}>
            <dt className="text-[13px] text-[var(--pg-body)]">{metric.label}</dt>
            <dd className="mt-1 text-[26px] font-semibold leading-[1.15] tracking-[-0.01em]">{metric.value}</dd>
            <p className="mt-1 text-[13px] text-[var(--pg-body)]">{metric.sub}</p>
          </div>
        ))}
      </dl>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-[190px]">
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            {STATUSES.map((key) => (
              <option key={key} value={key}>
                {key === 'all' ? 'All statuses' : `${key[0].toUpperCase()}${key.slice(1)}`}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pg-body)]" aria-hidden="true" />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email, name, reference or invoice number"
            aria-label="Search payments"
            className="pl-10"
          />
        </div>
        {isFiltered && (
          <button
            onClick={() => {
              setStatus('all');
              setQuery('');
            }}
            className="text-[14px] text-[var(--pg-body)] underline underline-offset-4 transition-colors hover:text-[var(--pg-ink)] cursor-pointer"
          >
            Reset filters
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <a
            href={lagoInvoicesUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--pg-line)] px-4 py-2 text-[14px] transition hover:bg-[var(--pg-alt)]"
          >
            <ExternalLink className="h-4 w-4" /> Open Lago
          </a>
          <Button variant="ghost" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {!rows ? (
        <Loading />
      ) : (
        <div className={`${CARD} lg:bg-[color-mix(in_srgb,var(--pg-alt)_35%,var(--pg-card))]! overflow-hidden`}>
          <div className={`hidden border-b border-[var(--pg-line-soft)] px-5 py-3 text-[13px] text-[var(--pg-body)] ${COLUMNS}`}>
            <span aria-hidden="true" />
            <span>Customer</span>
            <span>Item</span>
            <span>Invoice</span>
            <span>Date</span>
            <span>Amount</span>
            <span>Status</span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Receipt className="h-6 w-6 text-[var(--pg-body)]" strokeWidth={1.5} aria-hidden="true" />
              <p className="mt-3 font-semibold">{rows.length ? 'No payments match' : 'No payments yet'}</p>
              <p className="mt-1 max-w-[360px] text-[14.5px] leading-[1.55] text-[var(--pg-body)]">
                {rows.length ? 'Try a different search or status.' : 'Payments appear here the moment someone starts a checkout.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--pg-line-soft)]">
              {filtered.map((row) => {
                const open = openId === row.id;
                const details: [string, string][] = [
                  ['Email', row.email],
                  ['Reference', row.txRef],
                  ['Invoice', row.invoiceNumber ?? 'Paid by direct link (no Lago invoice)'],
                  ['Billed through', row.provider === 'lago-flutterwave' ? 'Lago + Flutterwave' : row.provider || '—'],
                  ['Started', dateTime(row.createdAt)],
                  ['Paid', dateTime(row.paidAt)],
                ];
                if (row.failureReason) details.push(['Problem', row.failureReason]);
                return (
                  <li key={row.id}>
                    <button
                      onClick={() => setOpenId(open ? null : row.id)}
                      aria-expanded={open}
                      className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-4 text-left cursor-pointer hover:bg-[var(--pg-alt)]/50 ${COLUMNS}`}
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--pg-body)] transition-transform ${open ? 'rotate-180' : ''}`} />
                      <span className="min-w-0 flex-1 md:flex-none">
                        <span className="block truncate font-medium">{row.name || row.email}</span>
                        {row.name && <span className="block truncate text-[13px] text-[var(--pg-body)]">{row.email}</span>}
                      </span>
                      <span className="min-w-0 truncate text-[14.5px]">{paymentSubject(row)}</span>
                      <span className="text-[13.5px] text-[var(--pg-body)]">{row.invoiceNumber ?? 'No invoice'}</span>
                      <span className="text-[13.5px] text-[var(--pg-body)]">{dateOnly(row.createdAt)}</span>
                      <span className="text-[14.5px] font-medium">{money(row.amountMinor, row.currency)}</span>
                      <span>
                        <Chip tone={TONES[row.status] ?? 'neutral'}>{row.status}</Chip>
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-[var(--pg-line-soft)] bg-[var(--pg-alt)]/40 px-5 py-6">
                        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                          {details.map(([term, detail]) => (
                            <div key={term}>
                              <dt className="text-[13px] text-[var(--pg-body)]">{term}</dt>
                              <dd className="mt-0.5 break-all text-[14.5px]">{detail}</dd>
                            </div>
                          ))}
                        </dl>
                        {canEdit && row.status === 'pending' && (
                          <div className="mt-6 border-t border-[var(--pg-line-soft)] pt-6">
                            <Button variant="dark" busy={busy === row.id} onClick={() => void check(row)}>
                              Check now
                            </Button>
                            <span className="ml-3 text-[13px] text-[var(--pg-body)]">Asks Lago whether the invoice was paid and enrolls the payer if so.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
