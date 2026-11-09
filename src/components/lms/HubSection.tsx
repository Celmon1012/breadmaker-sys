import React, { useCallback, useEffect, useState } from 'react';
import { HubMemberRow, HubPlanAdmin, HubWaitlistRow, getHubPlanAdmin, listHubMembers, listHubWaitlist, setHubMember, setHubPlan } from '../../lib/hub';
import { errorMessage, formatPrice } from '../../lib/lms';
import { splitPrice } from '../../lib/currency';
import DualPrice from './DualPrice';
import PartnerAdmin from './PartnerAdmin';
import { Button, CARD, Chip, EmptyState, Field, Loading, Notice, Select, TextArea, TextInput } from './lms-ui';

/** Breadmaker Hub (monthly membership): price and discount, and who is a member. */

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** <input type="datetime-local"> wants local time without a zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function HubSection({ canEdit }: { canEdit: boolean }) {
  const [plan, setPlan] = useState<HubPlanAdmin | null>(null);
  const [members, setMembers] = useState<HubMemberRow[] | null>(null);
  const [waitlist, setWaitlist] = useState<HubWaitlistRow[] | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantDays, setGrantDays] = useState(30);
  const [grantNote, setGrantNote] = useState('');

  const load = useCallback(async () => {
    try {
      const [loadedPlan, loadedMembers] = await Promise.all([getHubPlanAdmin(), listHubMembers()]);
      setPlan(loadedPlan);
      setMembers(loadedMembers);
      listHubWaitlist()
        .then(setWaitlist)
        .catch(() => setWaitlist([]));
    } catch (err) {
      setMembers([]);
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (success: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setMessage({ tone: 'success', text: success });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const update = (patch: Partial<HubPlanAdmin>) => setPlan((current) => (current ? { ...current, ...patch } : current));
  const activeCount = (members ?? []).filter((member) => member.active).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Breadmaker Prestige</h1>
          <p className="mt-2 max-w-[640px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
            The monthly membership. Members open every kit and every course that is not a program. Each payment adds one period, and
            paying early adds to the end date. The price is set on the Prestige product, under Products.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()}>Refresh</Button>
      </div>

      {message && <div className="mb-6"><Notice tone={message.tone}>{message.text}</Notice></div>}

      {!members ? (
        <Loading />
      ) : (
        <>
          {canEdit && (
            <section className={`${CARD} mb-6 px-6 py-6`}>
              <h2 className="mb-1 text-[16px] font-bold">Give or extend membership</h2>
              <p className="mb-4 text-[13.5px] text-[var(--pg-body)]">For a gift, a partner or a refund. Days are added to any time they already have.</p>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="Email">
                  <TextInput type="email" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="name@example.com" />
                </Field>
                <Field label="Days">
                  <TextInput type="number" min={1} value={grantDays} onChange={(e) => setGrantDays(Math.max(1, Math.round(Number(e.target.value))))} />
                </Field>
              </div>
              <Field label="Note" className="mt-4">
                <TextInput value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="Why, for your own record." />
              </Field>
              <div className="mt-4">
                <Button
                  busy={busy}
                  onClick={() =>
                    void run(`Added ${grantDays} days for ${grantEmail}.`, async () => {
                      await setHubMember(grantEmail, grantDays, grantNote);
                      setGrantEmail('');
                      setGrantNote('');
                    })
                  }
                >
                  Add days
                </Button>
              </div>
            </section>
          )}

          <h2 className="mb-3 text-[16px] font-bold">
            Members <span className="font-normal text-[var(--pg-body)]">· {activeCount} active of {members.length}</span>
          </h2>
          {members.length === 0 ? (
            <EmptyState title="No members yet" body="People appear here as soon as their first payment clears." />
          ) : (
            <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
              {members.map((member) => (
                <li key={member.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{member.name || member.email}</span>
                    {member.name && <span className="block truncate text-[13px] text-[var(--pg-body)]">{member.email}</span>}
                    {member.note && <span className="block truncate text-[13px] text-[var(--pg-body)]">{member.note}</span>}
                  </span>
                  <span className="text-[13.5px] text-[var(--pg-body)]">
                    {member.active ? 'Renews by' : 'Ended'} {formatDate(member.periodEnd)}
                  </span>
                  <Chip>{member.source === 'manual' ? 'Given' : 'Paid'}</Chip>
                  <Chip tone={member.active ? 'accent' : 'neutral'}>{member.active ? 'Active' : 'Ended'}</Chip>
                  {canEdit && member.active && (
                    <Button
                      variant="ghost"
                      busy={busy}
                      onClick={() => {
                        if (!window.confirm(`End ${member.email}'s membership now? They lose access to kits and courses they only had through the Hub.`)) return;
                        void run(`Ended ${member.email}'s membership.`, () => setHubMember(member.email, 0));
                      }}
                    >
                      End now
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h2 className="mb-3 mt-10 text-[16px] font-bold">
            Waitlist <span className="font-normal text-[var(--pg-body)]">· {waitlist ? waitlist.length : 0} {waitlist && waitlist.length === 1 ? 'person' : 'people'}</span>
          </h2>
          {!waitlist ? (
            <Loading />
          ) : waitlist.length === 0 ? (
            <EmptyState title="No one on the waitlist yet" body="People who join the waitlist on the Prestige page appear here, newest first." />
          ) : (
            <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
              {waitlist.map((person) => (
                <li key={person.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{person.name || person.email}</span>
                    {person.name && <span className="block truncate text-[13px] text-[var(--pg-body)]">{person.email}</span>}
                  </span>
                  <span className="text-[13.5px] text-[var(--pg-body)]">Joined {formatDate(person.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}

          <PartnerAdmin members={members} canEdit={canEdit} onChanged={() => void load()} />
        </>
      )}
    </div>
  );
}
