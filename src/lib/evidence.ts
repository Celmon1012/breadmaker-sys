import { supabase } from './supabase';

/**
 * Evidence and mastery (migration 42). A learner proves an action worked with a note, links and files; a coach
 * passes it or sends it back. Reads go through row-level security, writes through the database functions.
 */

export type SubmissionStatus = 'submitted' | 'needs_revision' | 'passed';

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  submitted: 'With your coach',
  needs_revision: 'Needs a fix',
  passed: 'Passed',
};

export interface EvidenceItem {
  id: string;
  kind: 'note' | 'link' | 'file';
  value: string;
  storagePath: string | null;
}

export interface Submission {
  id: string;
  lessonId: string;
  status: SubmissionStatus;
  reviewNote: string;
  submittedAt: string;
  reviewedAt: string | null;
  evidence: EvidenceItem[];
}

export const EVIDENCE_BUCKET = 'breadmaker-evidence';
export const MAX_LINKS = 5;
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const NOTE_MAX = 4000;
export const FILE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** A session takes evidence when it has both an action and a done-when check. */
export const takesEvidence = (content: { action: string; doneWhen: string } | null | undefined) =>
  !!content && content.action.trim() !== '' && content.doneWhen.trim() !== '';

const friendly = (message: string) =>
  /bucket not found|function .* does not exist|could not find the function|relation .* does not exist/i.test(message)
    ? 'Evidence is not switched on yet. The team still needs to apply the evidence update.'
    : message;

const toSubmission = (row: any): Submission => ({
  id: row.id,
  lessonId: row.lesson_id,
  status: row.status,
  reviewNote: row.review_note ?? '',
  submittedAt: row.submitted_at,
  reviewedAt: row.reviewed_at ?? null,
  evidence: ((row.lms_evidence ?? []) as any[])
    .map((item) => ({ id: item.id, kind: item.kind, value: item.text_value ?? '', storagePath: item.storage_path ?? null, createdAt: item.created_at as string }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ createdAt: _createdAt, ...item }) => item as EvidenceItem),
});

const SUBMISSION_COLUMNS = 'id, lesson_id, status, review_note, submitted_at, reviewed_at, lms_evidence(id, kind, text_value, storage_path, created_at)';

/** The signed-in learner's submission for one session, or null. */
export async function loadSubmission(lessonId: string, userId: string): Promise<Submission | null> {
  const { data, error } = await supabase.from('lms_submissions').select(SUBMISSION_COLUMNS).eq('lesson_id', lessonId).eq('user_id', userId).maybeSingle();
  // Before the migration the table does not exist; treat that as "nothing submitted".
  if (error) return null;
  return data ? toSubmission(data) : null;
}

/** lesson id to status for every session of a course the learner has submitted. */
export async function loadCourseStatuses(courseId: string, userId: string): Promise<Map<string, SubmissionStatus>> {
  const { data, error } = await supabase
    .from('lms_submissions')
    .select('lesson_id, status, lms_lessons!inner(course_id)')
    .eq('user_id', userId)
    .eq('lms_lessons.course_id', courseId);
  if (error) return new Map();
  return new Map(((data ?? []) as any[]).map((row) => [row.lesson_id as string, row.status as SubmissionStatus]));
}

export interface Mastery {
  courseId: string;
  evidenceSessions: number;
  passed: number;
  inReview: number;
  needsRevision: number;
}

export async function loadMyMastery(): Promise<Map<string, Mastery>> {
  const { data, error } = await supabase.rpc('my_mastery');
  if (error) return new Map();
  return new Map(
    ((data ?? []) as any[]).map((row) => [
      row.course_id as string,
      { courseId: row.course_id, evidenceSessions: row.evidence_sessions, passed: row.passed, inReview: row.in_review, needsRevision: row.needs_revision } as Mastery,
    ]),
  );
}

export function parseLinks(text: string): string[] {
  return text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateEvidence(input: { note: string; links: string[]; files: File[] }): string | null {
  if (!input.note.trim() && input.links.length === 0 && input.files.length === 0) return 'Add a note, a link or a file as evidence.';
  if (input.note.length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`;
  if (input.links.length > MAX_LINKS) return `Add up to ${MAX_LINKS} links.`;
  if (input.links.some((link) => !/^https?:\/\/\S+$/i.test(link) || link.length > 500)) return 'Links must start with http:// or https://.';
  if (input.files.length > MAX_FILES) return `Add up to ${MAX_FILES} files.`;
  for (const file of input.files) {
    if (!FILE_TYPES[file.type]) return `${file.name} is not a JPG, PNG, WebP or PDF.`;
    if (file.size > MAX_FILE_BYTES) return `${file.name} is over 10MB.`;
  }
  return null;
}

export async function submitEvidence(input: { userId: string; lessonId: string; note: string; links: string[]; files: File[] }): Promise<void> {
  const problem = validateEvidence(input);
  if (problem) throw new Error(problem);

  const uploaded: { path: string; name: string }[] = [];
  try {
    for (const file of input.files) {
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || `file.${FILE_TYPES[file.type]}`;
      const path = `${input.userId}/${input.lessonId}/${Date.now()}-${uploaded.length}-${safe}`;
      const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600' });
      if (error) throw new Error(friendly(error.message));
      uploaded.push({ path, name: file.name });
    }
    const { error } = await supabase.rpc('submit_evidence', { p_lesson: input.lessonId, p_note: input.note, p_links: input.links, p_files: uploaded });
    if (error) throw new Error(friendly(error.message));
  } catch (err) {
    // Do not leave files behind that no submission points at.
    if (uploaded.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(uploaded.map((file) => file.path));
    throw err;
  }
}

/** A short-lived link to open an evidence file; the owner and the team can ask for one. */
export async function evidenceFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new Error('That file could not be opened.');
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Team review

export interface ReviewRow {
  submissionId: string;
  userId: string;
  email: string;
  fullName: string;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  status: SubmissionStatus;
  reviewNote: string;
  submittedAt: string;
  reviewedAt: string | null;
  evidenceCount: number;
}

export async function loadReviewQueue(): Promise<ReviewRow[]> {
  const { data, error } = await supabase.rpc('review_queue');
  if (error) throw new Error(friendly(error.message));
  return ((data ?? []) as any[]).map((row) => ({
    submissionId: row.submission_id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name ?? '',
    courseId: row.course_id,
    courseTitle: row.course_title,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title,
    status: row.status,
    reviewNote: row.review_note ?? '',
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at ?? null,
    evidenceCount: row.evidence_count ?? 0,
  }));
}

export async function loadSubmissionEvidence(submissionId: string): Promise<EvidenceItem[]> {
  const { data, error } = await supabase.from('lms_evidence').select('id, kind, text_value, storage_path, created_at').eq('submission_id', submissionId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((item) => ({ id: item.id, kind: item.kind, value: item.text_value ?? '', storagePath: item.storage_path ?? null }));
}

export async function reviewSubmission(submissionId: string, status: 'passed' | 'needs_revision', note: string): Promise<void> {
  const { error } = await supabase.rpc('review_submission', { p_submission: submissionId, p_status: status, p_note: note });
  if (error) throw new Error(friendly(error.message));
}
