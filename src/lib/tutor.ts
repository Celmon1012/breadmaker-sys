import { supabase } from './supabase';
import { functionErrorMessage } from './function-error';

/** The lesson coach: the "Stuck?" panel in the lesson player. */

export interface CoachMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  needsCoach: boolean;
}

export type StuckOn = 'action' | 'done-when' | 'concept' | 'error' | 'other';

export const STUCK_OPTIONS: { value: StuckOn; label: string }[] = [
  { value: 'action', label: 'I do not know where to start' },
  { value: 'error', label: 'I got an error or a result I did not expect' },
  { value: 'done-when', label: 'I cannot tell if it is done' },
  { value: 'concept', label: 'I do not understand the idea' },
  { value: 'other', label: 'Something else' },
];

export const COACH_QUESTION_MAX = 1500;

/** This learner's earlier exchange for one session, oldest first. Only their own rows are readable. */
export async function loadCoachThread(lessonId: string): Promise<CoachMessage[]> {
  const { data, error } = await supabase
    .from('lms_tutor_messages')
    .select('id, role, content, needs_coach')
    .eq('lesson_id', lessonId)
    .order('id', { ascending: true })
    .limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({ id: row.id, role: row.role, content: row.content, needsCoach: !!row.needs_coach }));
}

export interface CoachReply {
  reply: string;
  needsCoach: boolean;
}

export async function askCoach(input: { lessonId: string; question: string; stuckOn?: StuckOn }): Promise<CoachReply> {
  const { data, error } = await supabase.functions.invoke('tutor-chat', {
    body: { lesson_id: input.lessonId, question: input.question, stuck_on: input.stuckOn },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'The coach could not answer just now. Try again in a minute.'));
  if (!data?.reply) throw new Error(data?.error ?? 'The coach could not answer just now. Try again in a minute.');
  return { reply: data.reply as string, needsCoach: !!data.needs_coach };
}

/** Removes this learner's coach history for one session. */
export async function clearCoachThread(lessonId: string) {
  const { error } = await supabase.from('lms_tutor_messages').delete().eq('lesson_id', lessonId);
  if (error) throw new Error(error.message);
}
