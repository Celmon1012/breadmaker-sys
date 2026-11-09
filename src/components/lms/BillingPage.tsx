import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, Search } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { MyCourse, loadCatalog, loadMyCourses } from '../../lib/lms';
import { PaymentRow, loadMyPayments, money, paymentSubject } from '../../lib/payments';
import { coursePath } from '../../lib/systems';
import { Button, CARD, Chip, LearnerLayout, Loading, PageContainer, PageTitle, Select, TextInput, courseLabel } from './lms-ui';

interface BillingPageProps {
  onNavigate: (route: Route) => void;
  openPath?: (path: string) => void;
}

const dateOnly = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATUS_LABEL: Record<string, string> = { successful: 'Paid', pending: 'Waiting for payment', failed: 'Failed', cancelled: 'Cancelled' };

/** Columns shared by the header row and every payment row from md up. */
const COLUMNS = 'md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:gap-4';

/** What the learner owns and what they have paid, with invoice numbers. */
export default function BillingPage({ onNavigate, openPath }: BillingPageProps) {
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [owned, setOwned] = useState<MyCourse[] | null>(null);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');

  // Payments and access are read separately: a failure in one must not hide the other.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadMyPayments()
      .then((rows) => !cancelled && setPayments(rows))
      .catch(() => !cancelled && setPayments([]));
    loadCatalog()
      .then((catalog) => loadMyCourses(user.id, catalog))
      .then((rows) => !cancelled && setOwned(rows.filter((row) => row.enrolled)))
      .catch(() => !cancelled && setOwned([]));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (payments ?? []).filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!needle) return true;
      return `${paymentSubject(row)} ${row.invoiceNumber ?? ''}`.toLowerCase().includes(needle);
    });
  }, [payments, status, query]);

  const filtered = status !== 'all' || query.trim() !== '';

  return (
    <LearnerLayout active="billing" onNavigate={onNavigate}>
      <PageContainer>
        <PageTitle>Billing</PageTitle>
        <p className="mt-2 max-w-[640px] text-[16px] leading-[1.6] text-[var(--pg-body)]">
          Everything you have unlocked and paid for, with an invoice for each payment.
        </p>

        <section className="mt-10" aria-labelledby="billing-access">
          <h2 id="billing-access" className="font-editorial text-[24px] font-semibold tracking-[-0.01em]">What you have access to</h2>
          {!owned ? (
            <Loading />
          ) : owned.length === 0 ? (
            <div className={`${CARD} mt-4 flex flex-col items-center px-6 py-10 text-center`}>
              <p className="font-semibold">Nothing unlocked yet</p>
              <p className="mt-1 max-w-[380px] text-[14.5px] leading-[1.55] text-[var(--pg-body)]">
                Programs and kits you buy appear here, and open straight away.
              </p>
              <div className="mt-5">
                <Button onClick={() => onNavigate('courses')}>Browse courses</Button>
              </div>
            </div>
          ) : (
            <ul className={`${CARD} mt-4 divide-y divide-[var(--pg-line-soft)]`}>
              {owned.map(({ course, progress }) => (
                <li key={course.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{course.title}</span>
                    <span className="block text-[13px] text-[var(--pg-body)]">{courseLabel(course)} · {progress}% complete</span>
                  </span>
                  <Button variant="ghost" onClick={() => (openPath ? openPath(coursePath(course.slug)) : onNavigate('dashboard'))}>Open</Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12" aria-labelledby="billing-payments">
          <h2 id="billing-payments" className="font-editorial text-[24px] font-semibold tracking-[-0.01em]">Payments and invoices</h2>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pg-body)]" aria-hidden="true" />
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item or invoice number"
                aria-label="Search payments"
                className="pl-10"
              />
            </div>
            <div className="w-full sm:w-[200px]">
              <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="successful">Paid</option>
                <option value="pending">Waiting for payment</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
            {filtered && (
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
          </div>

          {!payments ? (
            <Loading />
          ) : (
            <div className={`${CARD} mt-4 overflow-hidden`}>
              <div className={`hidden border-b border-[var(--pg-line-soft)] px-5 py-3 text-[13px] text-[var(--pg-body)] ${COLUMNS}`}>
                <span>Item</span>
                <span>Status</span>
                <span>Amount</span>
                <span>Date</span>
                <span>Invoice</span>
              </div>

              {shown.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <Receipt className="h-6 w-6 text-[var(--pg-body)]" strokeWidth={1.5} aria-hidden="true" />
                  <p className="mt-3 font-semibold">{filtered ? 'No payments match' : 'No payments yet'}</p>
                  <p className="mt-1 max-w-[340px] text-[14.5px] leading-[1.55] text-[var(--pg-body)]">
                    {filtered ? 'Try a different search or status.' : 'When you buy something, it is listed here with its invoice number.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--pg-line-soft)]">
                  {shown.map((row) => (
                    <li key={row.id} className={`flex flex-col gap-1.5 px-5 py-4 ${COLUMNS}`}>
                      <span className="min-w-0 font-medium md:truncate">{paymentSubject(row)}</span>
                      <span>
                        <Chip tone={row.status === 'successful' ? 'accent' : 'neutral'}>{STATUS_LABEL[row.status] ?? row.status}</Chip>
                      </span>
                      <span className="text-[15px] font-medium">{money(row.amountMinor, row.currency)}</span>
                      <span className="text-[14px] text-[var(--pg-body)]">{dateOnly(row.paidAt ?? row.createdAt)}</span>
                      <span className="truncate text-[13.5px] text-[var(--pg-body)]">{row.invoiceNumber ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="mt-3 text-[13.5px] text-[var(--pg-body)]">
            Paid and not showing? Email us the reference from your payment confirmation and we will sort it out.
          </p>
        </section>
      </PageContainer>
    </LearnerLayout>
  );
}
