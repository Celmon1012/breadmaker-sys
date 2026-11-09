import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/lms';
import { TICKET_CATEGORIES, TICKET_STATUSES, Ticket, TicketStatus, listAllTickets, updateTicket } from '../../lib/support';
import { Button, CARD, Chip, EmptyState, Loading, Notice, Select, TextArea } from './lms-ui';

/** Studio: tickets sent from the member area. */

const dateOnly = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const TicketCard: React.FC<{ ticket: Ticket; canEdit: boolean; onSaved: () => void; onError: (text: string) => void }> = ({ ticket, canEdit, onSaved, onError }) => {
  const [note, setNote] = useState(ticket.teamNote);
  const [busy, setBusy] = useState(false);
  const save = async (patch: { status?: TicketStatus; teamNote?: string }) => {
    setBusy(true);
    try {
      await updateTicket(ticket.id, patch);
      onSaved();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={`${CARD} px-6 py-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{ticket.subject}</span>
        {ticket.priority === 'priority' && <Chip tone="dark">Priority</Chip>}
        <Chip>{TICKET_CATEGORIES.find((item) => item.value === ticket.category)?.label ?? ticket.category}</Chip>
        <span className="text-[13px] text-[var(--pg-body)]">{dateOnly(ticket.createdAt)}</span>
        <Select value={ticket.status} disabled={!canEdit || busy} onChange={(e) => void save({ status: e.target.value as TicketStatus })} className="ml-auto max-w-[170px]">
          {TICKET_STATUSES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </Select>
      </div>
      <p className="mt-1 text-[13.5px] text-[var(--pg-body)]">
        {ticket.name ? `${ticket.name} · ` : ''}
        <a className="underline underline-offset-2" href={`mailto:${ticket.email}?subject=${encodeURIComponent('Re: ' + ticket.subject)}`}>{ticket.email}</a>
      </p>
      <p className="mt-3 whitespace-pre-line text-[15px] leading-[1.55]">{ticket.message}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} placeholder="Note the person sees on their ticket" />
        {canEdit && <Button variant="ghost" busy={busy} onClick={() => void save({ teamNote: note })}>Save note</Button>}
      </div>
    </li>
  );
};

export default function SupportSection({ canEdit }: { canEdit: boolean }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listAllTickets()
      .then(setTickets)
      .catch((err) => {
        setTickets([]);
        setError(errorMessage(err));
      });
  }, []);
  useEffect(load, [load]);

  const shown = (tickets ?? []).filter((ticket) => filter === 'all' || ticket.status !== 'resolved');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Support</h1>
          <p className="mt-3 max-w-[560px] text-[16px] leading-[1.55] text-[var(--pg-body)]">Tickets from the member area. Reply by email, then mark them resolved.</p>
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as 'active' | 'all')} className="max-w-[190px]">
          <option value="active">Open and in progress</option>
          <option value="all">All tickets</option>
        </Select>
      </div>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {tickets === null ? (
        <Loading />
      ) : shown.length === 0 ? (
        <EmptyState title="No tickets" body="Nothing waiting for a reply." />
      ) : (
        <ul className="space-y-3">
          {shown.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} canEdit={canEdit} onSaved={load} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}
