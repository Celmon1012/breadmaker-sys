import { supabase } from './supabase';

/** Support tickets sent from the member area, and the Prestige WhatsApp community link. */

export type TicketCategory = 'billing' | 'access' | 'course' | 'technical' | 'other';
export type TicketStatus = 'open' | 'in-progress' | 'resolved';

export const TICKET_CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'billing', label: 'Billing or payment' },
  { value: 'access', label: 'I cannot get into something' },
  { value: 'course', label: 'A build or lesson' },
  { value: 'technical', label: 'Something is broken' },
  { value: 'other', label: 'Something else' },
];

export const TICKET_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
];

export interface Ticket {
  id: string;
  email: string;
  name: string;
  category: TicketCategory;
  subject: string;
  message: string;
  status: TicketStatus;
  teamNote: string;
  /** Partner members' tickets are marked priority. */
  priority: 'standard' | 'priority';
  createdAt: string;
}

const toTicket = (row: any): Ticket => ({
  id: row.id,
  email: row.email,
  name: row.name ?? '',
  category: row.category,
  subject: row.subject,
  message: row.message,
  status: row.status,
  teamNote: row.team_note ?? '',
  priority: row.priority === 'priority' ? 'priority' : 'standard',
  createdAt: row.created_at,
});

export async function sendTicket(input: { email: string; name: string; category: TicketCategory; subject: string; message: string }) {
  const { error } = await supabase.from('support_tickets').insert({
    email: input.email,
    name: input.name,
    category: input.category,
    subject: input.subject.trim(),
    message: input.message.trim(),
  });
  if (error) throw new Error(error.message);
}

/** The signed-in person's own tickets. */
export async function listMyTickets(userId: string): Promise<Ticket[]> {
  const { data, error } = await supabase.from('support_tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toTicket);
}

/** Every ticket, for the team (row-level security hides other people's rows from everyone else). */
export async function listAllTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  // Priority tickets first, then newest.
  return (data ?? []).map(toTicket).sort((a, b) => Number(b.priority === 'priority') - Number(a.priority === 'priority'));
}

export async function updateTicket(id: string, patch: { status?: TicketStatus; teamNote?: string }) {
  const { error } = await supabase
    .from('support_tickets')
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.teamNote !== undefined ? { team_note: patch.teamNote } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Null unless the person is an active member (or on the team). */
export async function getCommunityLink(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_community_link');
  if (error) throw new Error(error.message);
  return typeof data === 'string' && data.trim() ? data.trim() : null;
}

export async function setCommunityLink(url: string) {
  const { error } = await supabase.rpc('set_community_link', { new_url: url });
  if (error) throw new Error(error.message);
}
