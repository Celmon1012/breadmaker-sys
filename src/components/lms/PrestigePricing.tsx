import React, { useEffect, useState } from 'react';
import { HubPlanAdmin, getHubPlanAdmin, setHubPlan } from '../../lib/hub';
import { errorMessage, formatPrice } from '../../lib/lms';
import { splitPrice } from '../../lib/currency';
import { getCommunityLink, setCommunityLink } from '../../lib/support';
import DualPrice from './DualPrice';
import { Button, CARD, Chip, Field, Loading, Notice, Select, TextArea, TextInput } from './lms-ui';

/** Breadmaker Prestige price and discount. Lives on the Prestige product page; checkout reads it from the database. */

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** <input type="datetime-local"> wants local time without a zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function PrestigePricing({ canEdit }: { canEdit: boolean }) {
  const [plan, setPlan] = useState<HubPlanAdmin | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    getCommunityLink().then((value) => setLink(value ?? '')).catch(() => undefined);
    getHubPlanAdmin()
      .then(setPlan)
      .catch((err) => {
        setPlan(null);
        setMessage({ tone: 'error', text: errorMessage(err) });
      });
  }, []);

  const update = (patch: Partial<HubPlanAdmin>) => setPlan((current) => (current ? { ...current, ...patch } : current));

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await setHubPlan(plan);
      await setCommunityLink(link.trim());
      setMessage({ tone: 'success', text: 'Saved. Checkout uses it straight away.' });
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (plan === undefined) return <Loading />;
  if (!plan) return <Notice tone="error">The Prestige plan is missing. Apply migration 28 first.</Notice>;

  const prices = splitPrice(plan);

  return (
    <div>
      {message && <div className="mb-6"><Notice tone={message.tone}>{message.text}</Notice></div>}
      <section className={`${CARD} px-6 py-6`}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-[16px] font-bold">Price and discount</h2>
          <Chip tone={plan.active ? 'accent' : 'neutral'}>{plan.active ? 'On sale' : 'Not on sale'}</Chip>
          <span className="text-[13.5px] text-[var(--pg-body)]">
            {[prices.ngn && formatPrice(prices.ngn, 'NGN'), prices.usd && formatPrice(prices.usd, 'USD')].filter(Boolean).join(' / ') || 'No price'} for {plan.periodDays} days
            {plan.discountPct > 0 && plan.discountEndsAt && new Date(plan.discountEndsAt) > new Date()
              ? ` · ${plan.discountPct}% off until ${formatDate(plan.discountEndsAt)}`
              : ''}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DualPrice
            price={plan}
            disabled={!canEdit}
            onChange={(next) => update({ priceMinor: next.priceMinor, currency: next.currency, altPriceMinor: next.altPriceMinor })}
          />
          <Field label="Days per payment" hint="30 for a month. 36500 makes it a one-time payment with lifetime access.">
            <TextInput
              type="number"
              min={1}
              max={36500}
              value={plan.periodDays}
              onChange={(e) => update({ periodDays: Math.min(36500, Math.max(1, Math.round(Number(e.target.value)))) })}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Discount %" hint="0 for none.">
            <TextInput
              type="number"
              min={0}
              max={100}
              value={plan.discountPct}
              onChange={(e) => update({ discountPct: Math.min(100, Math.max(0, Math.round(Number(e.target.value)))) })}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Discount ends" hint="Leave empty for no discount.">
            <TextInput
              type="datetime-local"
              value={toLocalInput(plan.discountEndsAt)}
              onChange={(e) => update({ discountEndsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              disabled={!canEdit}
            />
          </Field>
        </div>
        <Field label="What members see" className="mt-4" hint="One or two sentences on the membership card.">
          <TextArea value={plan.description} onChange={(e) => update({ description: e.target.value })} rows={2} disabled={!canEdit} />
        </Field>
        <Field label="On sale" className="mt-4">
          <Select value={plan.active ? 'yes' : 'no'} onChange={(e) => update({ active: e.target.value === 'yes' })} className="max-w-[240px]" disabled={!canEdit}>
            <option value="yes">Yes, people can join</option>
            <option value="no">No, hide it</option>
          </Select>
        </Field>
        <Field label="WhatsApp community link" className="mt-4" hint="Members see a Join button on their Support page. Leave empty to hide it.">
          <TextInput type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/…" disabled={!canEdit} />
        </Field>
        {canEdit && (
          <div className="mt-4">
            <Button busy={busy} onClick={() => void save()}>Save price</Button>
          </div>
        )}
      </section>
    </div>
  );
}
