import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { errorMessage, formatPrice } from '../../lib/lms';
import { splitPrice } from '../../lib/currency';
import DualPrice from './DualPrice';
import { Button, CARD, Select } from './lms-ui';

/** Launchpad and Foundry support-level prices, in naira and dollars. Checkout reads them from the database. */

interface TierRow {
  program: string;
  tier: string;
  label: string;
  price_minor: number;
  currency: 'NGN' | 'USD';
  alt_price_minor: number | null;
  active: boolean;
}

const summary = (row: TierRow) => {
  const { ngn, usd } = splitPrice({ priceMinor: row.price_minor, currency: row.currency, altPriceMinor: row.alt_price_minor });
  return [ngn && formatPrice(ngn, 'NGN'), usd && formatPrice(usd, 'USD')].filter(Boolean).join(' / ') || 'No price';
};

export default function ProgramPrices({
  canEdit,
  onMessage,
  program,
  bare = false,
}: {
  canEdit: boolean;
  onMessage: (tone: 'error' | 'success', text: string) => void;
  /** show only this program's levels (for example 'launchpad') */
  program?: string;
  /** no collapsible header: always open, under a plain "Pricing" heading (used inside a product page) */
  bare?: boolean;
}) {
  const [rows, setRows] = useState<TierRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Load once: onMessage is a new function every render and must not reload (and wipe) unsaved edits.
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('list_program_tiers_admin');
        if (error) throw error;
        setRows((data ?? []) as TierRow[]);
      } catch (err) {
        setRows([]);
        onMessage('error', errorMessage(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (row: TierRow, patch: Partial<TierRow>) =>
    setRows((current) => (current ?? []).map((item) => (item.program === row.program && item.tier === row.tier ? { ...item, ...patch } : item)));

  const save = async (row: TierRow) => {
    const key = `${row.program}-${row.tier}`;
    setBusyKey(key);
    try {
      const { error } = await supabase.rpc('set_program_tier', {
        for_program: row.program,
        for_tier: row.tier,
        new_price_minor: row.price_minor,
        new_currency: row.currency,
        new_alt_price_minor: row.alt_price_minor,
        new_active: row.active,
      });
      if (error) throw error;
      onMessage('success', `${row.label || key} saved. Checkout uses it straight away.`);
    } catch (err) {
      onMessage('error', errorMessage(err));
    } finally {
      setBusyKey(null);
    }
  };

  const shownRows = program ? (rows ?? []).filter((row) => row.program === program) : rows ?? [];
  if (!shownRows.length) return null;
  const expanded = bare || open;

  return (
    <div className={`${CARD} mb-6`}>
      {!bare && (
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left cursor-pointer" aria-expanded={open}>
        <span>
          <span className="block text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Program prices</span>
          <span className="mt-1 block text-[14px] text-[var(--pg-body)]">Launchpad and Foundry levels, in naira and dollars.</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--pg-body)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      )}
      {bare && <p className="px-6 pt-5 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Pricing by level</p>}
      {expanded && (
        <div className={`space-y-6 px-6 py-5 ${bare ? '' : 'border-t border-[var(--pg-line-soft)]'}`}>
          {shownRows.map((row) => (
            <div key={`${row.program}-${row.tier}`}>
              <p className="mb-3 text-[15px] font-semibold">
                {row.label || `${row.program} ${row.tier}`} <span className="font-normal text-[var(--pg-body)]">· {summary(row)}</span>
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <DualPrice
                  price={{ priceMinor: row.price_minor, currency: row.currency, altPriceMinor: row.alt_price_minor }}
                  disabled={!canEdit}
                  onChange={(next) => update(row, { price_minor: next.priceMinor, currency: next.currency, alt_price_minor: next.altPriceMinor })}
                />
                <div>
                  <span className="mb-1.5 block text-[13.5px] font-medium">On sale</span>
                  <Select value={row.active ? 'yes' : 'no'} onChange={(e) => update(row, { active: e.target.value === 'yes' })} disabled={!canEdit}>
                    <option value="yes">Yes</option>
                    <option value="no">No, hide it</option>
                  </Select>
                </div>
              </div>
              {canEdit && (
                <div className="mt-3">
                  <Button busy={busyKey === `${row.program}-${row.tier}`} onClick={() => void save(row)}>Save</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
