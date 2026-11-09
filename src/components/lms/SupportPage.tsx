import React, { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/lms';
import { REPLY_TIME } from '../../lib/program-config';
import { TICKET_CATEGORIES, TICKET_STATUSES, Ticket, TicketCategory, listMyTickets, sendTicket } from '../../lib/support';
import { Button, CARD, Chip, EmptyState, Eyebrow, Field, LearnerLayout, Loading, Notice, PageContainer, PageTitle, Select, TextArea, TextInput } from './lms-ui';

interface SupportPageProps {
  onNavigate: (route: Route) => void;
}

const dateOnly = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const statusLabel = (status: Ticket['status']) => TICKET_STATUSES.find((item) => item.value === status)?.label ?? status;

export default function SupportPage({ onNavigate }: SupportPageProps) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const email = session?.user.email ?? '';
  const name = String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? '');

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [form, setForm] = useState<{ category: TicketCategory; subject: string; message: string }>({ category: 'other', subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    listMyTickets(userId).then(setTickets).catch(() => setTickets([]));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.subject.trim().length < 3 || form.message.trim().length < 5) {
      setNotice({ tone: 'error', text: 'Add a short subject and tell us what happened.' });
      return;
    }
    setBusy(true);
    try {
      await sendTicket({ email, name, ...form });
      setForm({ category: 'other', subject: '', message: '' });
      setNotice({ tone: 'success', text: `Sent. We reply by email within ${REPLY_TIME}.` });
      load();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <LearnerLayout active="support" onNavigate={onNavigate}>
      <PageContainer>
        <Eyebrow>Support</Eyebrow>
        <PageTitle className="mt-4">How can we help?</PageTitle>
        <p className="mt-3 max-w-[640px] text-[17px] leading-[1.6] text-[var(--pg-body)]">
          Send a ticket and a person replies by email within {REPLY_TIME}. Every ticket stays here so you can follow it.
        </p>

        <div className="mt-8 max-w-[760px]">
          <form onSubmit={submit} className={`${CARD} space-y-4 px-6 py-6`}>
            <h2 className="text-[18px] font-bold">New ticket</h2>
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <Field label="What is it about?">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TicketCategory })}>
                {TICKET_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Subject">
              <TextInput value={form.subject} maxLength={160} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="A few words" />
            </Field>
            <Field label="Tell us what happened" hint={`We will reply to ${email}.`}>
              <TextArea rows={6} maxLength={5000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </Field>
            <Button type="submit" busy={busy}>Send ticket</Button>
          </form>

        </div>

        <h2 className="mt-12 text-[20px] font-bold">Your tickets</h2>
        <div className="mt-4">
          {tickets === null ? (
            <Loading />
          ) : tickets.length === 0 ? (
            <EmptyState title="No tickets yet" body="When you send one, it shows up here." />
          ) : (
            <ul className="space-y-3">
              {tickets.map((ticket) => (
                <li key={ticket.id} className={`${CARD} px-6 py-5`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold">{ticket.subject}</span>
                    {ticket.priority === 'priority' && <Chip tone="dark">Priority</Chip>}
                    <Chip tone={ticket.status === 'resolved' ? 'accent' : 'neutral'}>{statusLabel(ticket.status)}</Chip>
                    <span className="text-[13px] text-[var(--pg-body)]">{dateOnly(ticket.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.55] text-[var(--pg-body)]">{ticket.message}</p>
                  {ticket.teamNote && (
                    <p className="mt-3 flex gap-2 rounded-xl bg-[var(--pg-alt)] px-4 py-3 text-[14.5px] leading-[1.5]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pg-accent)]" aria-hidden="true" /> {ticket.teamNote}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageContainer>
    </LearnerLayout>
  );
}
