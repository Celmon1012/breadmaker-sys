import { supabase } from './supabase';
import { isKitSlug } from './systems';

/**
 * Data access for the Breadmaker LMS (breadmaker.lms_* tables and RPCs).
 * Access rules live in the database (see supabase/migrations/*_lms.sql); this
 * module only reads and writes through them.
 */

export type Program = 'foundry' | 'launchpad' | 'general';

/** Product category: Launchpad and Foundry are builds, kits and courses are courses, anything else is other. */
export type CourseCategory = 'course' | 'build' | 'other';

/** The category to assume until one has been saved: builds are the two programs, the rest are courses. */
export const defaultCategory = (course: { program: Program }): CourseCategory =>
  course.program === 'launchpad' || course.program === 'foundry' ? 'build' : 'course';

/** id to category for the courses the caller can see; empty if the category migration has not been applied yet. */
async function loadCategories(): Promise<Map<string, CourseCategory>> {
  const { data, error } = await supabase.rpc('course_categories');
  if (error) return new Map();
  return new Map(((data ?? []) as { course_id: string; category: CourseCategory }[]).map((row) => [row.course_id, row.category]));
}
export type SessionType = 'lesson' | 'live' | 'working';
export type PublishStatus = 'Published' | 'Draft';
export type TeamRole = 'Owner' | 'Coach' | 'Support';

export const TOOLS_BUCKET = 'breadmaker-course-tools';

export interface CatalogCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  program: Program;
  audience: string;
  coverUrl: string | null;
  priceMinor: number | null;
  currency: string;
  /** The price in the other currency, when one is set. */
  altPriceMinor: number | null;
  category: CourseCategory;
  moduleCount: number;
  lessonCount: number;
  previewCount: number;
  totalMinutes: number;
  toolCount: number;
}

export interface OutlineLesson {
  id: string;
  moduleId: string | null;
  title: string;
  sessionType: SessionType;
  durationMinutes: number;
  isPreview: boolean;
  status: PublishStatus;
}

export interface OutlineModule {
  id: string;
  title: string;
  summary: string;
  doneWhen: string[];
  lessons: OutlineLesson[];
}

export interface CourseInfo {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  program: Program;
  audience: string;
  coverUrl: string | null;
  /** Explainer video shown beside enrollment; falls back to the free preview's video. */
  explainerUrl: string | null;
  priceMinor: number | null;
  currency: string;
  altPriceMinor: number | null;
  status: PublishStatus;
}

export interface CourseView {
  course: CourseInfo;
  modules: OutlineModule[];
  /** Published lessons in order, flattened across modules. */
  lessons: OutlineLesson[];
  hasAccess: boolean;
  completed: Set<string>;
}

export interface LessonContent {
  videoUrl: string | null;
  body: string;
  action: string;
  doneWhen: string;
}

export interface CourseTool {
  id: string;
  name: string;
  kind: string;
  sizeBytes: number;
  storagePath: string | null;
}

function toCourseInfo(row: any): CourseInfo {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? '',
    description: row.description ?? '',
    program: row.program,
    audience: row.audience ?? '',
    coverUrl: row.cover_url ?? null,
    explainerUrl: row.explainer_url ?? null,
    priceMinor: row.price_minor ?? null,
    currency: row.currency ?? 'usd',
    altPriceMinor: row.alt_price_minor ?? null,
    status: row.status,
  };
}

export function formatPrice(priceMinor: number | null, currency: string) {
  if (priceMinor === null) return null;
  if (priceMinor === 0) return 'Free';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(priceMinor / 100);
}

export function formatMinutes(total: number) {
  if (total < 60) return `${total} min`;
  const hours = total / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export const SESSION_LABEL: Record<SessionType, string> = {
  lesson: 'Lesson',
  live: 'Live session',
  working: 'Working session',
};

export function canOpenLesson(lesson: OutlineLesson, hasAccess: boolean) {
  return hasAccess || lesson.isPreview;
}

/** The first lesson the learner can open and hasn't finished, falling back to the first openable lesson. */
export function nextLessonFor(lessons: OutlineLesson[], completed: Set<string>, hasAccess: boolean) {
  const openable = lessons.filter((lesson) => canOpenLesson(lesson, hasAccess));
  return openable.find((lesson) => !completed.has(lesson.id)) ?? openable[0] ?? null;
}

export async function loadCatalog(): Promise<CatalogCourse[]> {
  const [{ data, error }, { data: alts }] = await Promise.all([supabase.rpc('course_catalog'), supabase.rpc('course_alt_prices')]);
  if (error) throw error;
  const altById = new Map(((alts ?? []) as any[]).map((row) => [row.course_id as string, row.alt_price_minor as number]));
  const categories = await loadCategories();
  return ((data ?? []) as any[])
    .map((row) => {
      const category = categories.get(row.id) ?? defaultCategory(row);
      return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? '',
    description: row.description ?? '',
    program: row.program,
    audience: row.audience ?? '',
    coverUrl: row.cover_url ?? null,
    // Courses are free.
    priceMinor: category === 'course' ? 0 : row.price_minor ?? null,
    currency: row.currency ?? 'usd',
    altPriceMinor: category === 'course' ? null : altById.get(row.id) ?? null,
    category,
    moduleCount: row.module_count,
    lessonCount: row.lesson_count,
    previewCount: row.preview_count,
    totalMinutes: row.total_minutes,
    toolCount: row.tool_count,
  };
  });
}

/** Course, its outline and (when signed in) the learner's access and progress. null when not found or not visible. */
export async function loadCourseView(slug: string, userId: string | null): Promise<CourseView | null> {
  const { data: courseRow, error } = await supabase
    .from('lms_courses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!courseRow) return null;
  const course = toCourseInfo(courseRow);

  const [{ data: moduleRows, error: moduleError }, { data: lessonRows, error: lessonError }] = await Promise.all([
    supabase.from('lms_modules').select('id, title, summary, done_when, position').eq('course_id', course.id).order('position'),
    supabase
      .from('lms_lessons')
      .select('id, module_id, title, session_type, duration_minutes, is_preview, status, position')
      .eq('course_id', course.id)
      .order('position'),
  ]);
  if (moduleError) throw moduleError;
  if (lessonError) throw lessonError;

  // Team members can read drafts; the learner-facing outline only ever shows published lessons.
  const published: OutlineLesson[] = (lessonRows ?? [])
    .filter((row: any) => row.status === 'Published')
    .map((row: any) => ({
      id: row.id,
      moduleId: row.module_id,
      title: row.title,
      sessionType: row.session_type,
      durationMinutes: row.duration_minutes,
      isPreview: row.is_preview,
      status: row.status,
    }));

  const modules: OutlineModule[] = (moduleRows ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    summary: row.summary ?? '',
    doneWhen: row.done_when ?? [],
    lessons: published.filter((lesson) => lesson.moduleId === row.id),
  }));
  const orphans = published.filter((lesson) => !lesson.moduleId || !modules.some((m) => m.id === lesson.moduleId));
  if (orphans.length) modules.push({ id: 'unsorted', title: 'More sessions', summary: '', doneWhen: [], lessons: orphans });
  const lessons = modules.flatMap((module) => module.lessons);

  let hasAccess = course.priceMinor === 0 && course.status === 'Published';
  let completed = new Set<string>();
  if (userId) {
    const [{ data: access }, { data: progress }] = await Promise.all([
      supabase.rpc('has_course_access', { check_course_id: course.id }),
      lessons.length
        ? supabase.from('lms_lesson_progress').select('lesson_id').eq('user_id', userId).in('lesson_id', lessons.map((l) => l.id))
        : Promise.resolve({ data: [] as { lesson_id: string }[] }),
    ]);
    hasAccess = access === true;
    completed = new Set((progress ?? []).map((row: any) => row.lesson_id as string));
  }

  return { course, modules, lessons, hasAccess, completed };
}

/** Lesson content; null when the caller can't view the lesson (RLS) or it has none yet. */
export async function loadLessonContent(lessonId: string): Promise<LessonContent | null> {
  const { data, error } = await supabase
    .from('lms_lesson_content')
    .select('video_url, body, action, done_when')
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { videoUrl: data.video_url, body: data.body ?? '', action: data.action ?? '', doneWhen: data.done_when ?? '' };
}

export async function setLessonComplete(userId: string, lessonId: string, done: boolean) {
  const { error } = done
    ? await supabase
        .from('lms_lesson_progress')
        .upsert({ user_id: userId, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })
    : await supabase.from('lms_lesson_progress').delete().eq('user_id', userId).eq('lesson_id', lessonId);
  if (error) throw error;
}

/** With access, the real rows (downloadable); without, only names and sizes of a published course. */
export async function loadCourseTools(courseId: string, hasAccess: boolean): Promise<CourseTool[]> {
  if (hasAccess) {
    const { data, error } = await supabase
      .from('lms_course_tools')
      .select('id, name, mime_type, size_bytes, storage_path')
      .eq('course_id', courseId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      kind: row.mime_type ?? 'File',
      sizeBytes: row.size_bytes ?? 0,
      storagePath: row.storage_path,
    }));
  }
  const { data, error } = await supabase.rpc('course_tool_summary', { check_course_id: courseId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind ?? 'File',
    sizeBytes: row.size_bytes ?? 0,
    storagePath: null,
  }));
}

/** Opens a short-lived signed download link; storage policies only allow learners with access. */
export async function downloadCourseTool(tool: CourseTool) {
  if (!tool.storagePath) throw new Error('This download is only available once you are enrolled.');
  const { data, error } = await supabase.storage.from(TOOLS_BUCKET).createSignedUrl(tool.storagePath, 60, { download: tool.name });
  if (error) throw error;
  window.location.assign(data.signedUrl);
}

export interface MyCourse {
  course: CatalogCourse;
  enrolled: boolean;
  completedLessons: number;
  progress: number;
  lastActivityAt: string | null;
}

/** Courses the learner is enrolled in, has progress on, or can open for free. */
export async function loadMyCourses(userId: string, catalog: CatalogCourse[]): Promise<MyCourse[]> {
  const [{ data: enrollments, error: enrollError }, { data: progress, error: progressError }] = await Promise.all([
    supabase.from('lms_enrollments').select('course_id').eq('user_id', userId),
    supabase
      .from('lms_lesson_progress')
      .select('completed_at, lms_lessons!inner(course_id, status)')
      .eq('user_id', userId)
      .eq('lms_lessons.status', 'Published'),
  ]);
  if (enrollError) throw enrollError;
  if (progressError) throw progressError;

  const enrolled = new Set((enrollments ?? []).map((row: any) => row.course_id as string));
  // Breadmaker Hub members also open every kit and standalone course.
  const { data: hubMember } = await supabase.rpc('is_hub_member');
  const viaHub = (course: CatalogCourse) => hubMember === true && (isKitSlug(course.slug) || course.program === 'general');
  const activity = new Map<string, { completed: number; last: string | null }>();
  for (const row of (progress ?? []) as any[]) {
    const courseId = row.lms_lessons.course_id as string;
    const entry = activity.get(courseId) ?? { completed: 0, last: null };
    entry.completed += 1;
    if (!entry.last || row.completed_at > entry.last) entry.last = row.completed_at;
    activity.set(courseId, entry);
  }

  return catalog
    .filter((course) => enrolled.has(course.id) || activity.has(course.id) || course.priceMinor === 0 || viaHub(course))
    .map((course) => {
      const entry = activity.get(course.id);
      const completedLessons = Math.min(entry?.completed ?? 0, course.lessonCount);
      return {
        course,
        enrolled: enrolled.has(course.id) || viaHub(course),
        completedLessons,
        progress: course.lessonCount ? Math.round((completedLessons / course.lessonCount) * 100) : 0,
        lastActivityAt: entry?.last ?? null,
      };
    })
    .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));
}

// ---------------------------------------------------------------------------
// Team

export async function loadTeamRole(): Promise<TeamRole | null> {
  const { data, error } = await supabase.rpc('team_role');
  if (error) return null;
  return (data as TeamRole | null) ?? null;
}

export interface TeamCourseRow {
  id: string;
  slug: string;
  title: string;
  program: Program;
  category: CourseCategory;
  status: PublishStatus;
  priceMinor: number | null;
  currency: string;
  altPriceMinor: number | null;
  moduleCount: number;
  lessonCount: number;
  learners: number;
  avgCompletion: number;
  updatedAt: string;
}

export async function loadTeamCourses(): Promise<TeamCourseRow[]> {
  const [{ data: courses, error }, { data: modules }, { data: lessons }, { data: stats }] = await Promise.all([
    supabase.from('lms_courses').select('id, slug, title, program, status, price_minor, currency, alt_price_minor, updated_at').order('created_at'),
    supabase.from('lms_modules').select('course_id'),
    supabase.from('lms_lessons').select('course_id'),
    supabase.rpc('course_stats'),
  ]);
  const categories = await loadCategories();
  if (error) throw error;
  const count = (rows: any[] | null, id: string) => (rows ?? []).filter((row) => row.course_id === id).length;
  const statsById = new Map(((stats ?? []) as any[]).map((row) => [row.course_id, row]));
  return (courses ?? [])
    .map((row: any) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    program: row.program,
    category: categories.get(row.id) ?? defaultCategory(row),
    status: row.status,
    priceMinor: row.price_minor,
    currency: row.currency,
    altPriceMinor: row.alt_price_minor ?? null,
    moduleCount: count(modules, row.id),
    lessonCount: count(lessons, row.id),
    learners: statsById.get(row.id)?.learners ?? 0,
    avgCompletion: statsById.get(row.id)?.avg_completion ?? 0,
    updatedAt: row.updated_at,
  }));
}

export interface DraftLesson {
  id?: string;
  clientId: string;
  title: string;
  sessionType: SessionType;
  durationMinutes: number;
  status: PublishStatus;
  isPreview: boolean;
  videoUrl: string;
  body: string;
  action: string;
  doneWhen: string;
}

export interface DraftModule {
  id?: string;
  clientId: string;
  title: string;
  summary: string;
  doneWhen: string[];
  lessons: DraftLesson[];
}

export interface DraftTool {
  id?: string;
  clientId: string;
  name: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface DraftCourse {
  id?: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  program: Program;
  category: CourseCategory;
  audience: string;
  status: PublishStatus;
  coverUrl: string;
  explainerUrl: string;
  priceMinor: number | null;
  currency: string;
  altPriceMinor: number | null;
  modules: DraftModule[];
  tools: DraftTool[];
}

export const newClientId = () => Math.random().toString(36).slice(2, 10);

export function emptyLesson(): DraftLesson {
  return {
    clientId: newClientId(),
    title: 'New session',
    sessionType: 'lesson',
    durationMinutes: 30,
    status: 'Draft',
    isPreview: false,
    videoUrl: '',
    body: '',
    action: '',
    doneWhen: '',
  };
}

export function emptyModule(position: number): DraftModule {
  return { clientId: newClientId(), title: `Week ${position + 1}`, summary: '', doneWhen: [], lessons: [emptyLesson()] };
}

export function emptyCourse(): DraftCourse {
  return {
    slug: '',
    title: '',
    subtitle: '',
    description: '',
    program: 'general',
    category: 'build',
    audience: '',
    status: 'Draft',
    coverUrl: '',
    explainerUrl: '',
    priceMinor: null,
    currency: 'usd',
    altPriceMinor: null,
    modules: [emptyModule(0)],
    tools: [],
  };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export async function loadDraftCourse(courseId: string): Promise<DraftCourse> {
  const [{ data: course, error }, { data: modules }, { data: lessons }, { data: tools }] = await Promise.all([
    supabase.from('lms_courses').select('*').eq('id', courseId).single(),
    supabase.from('lms_modules').select('*').eq('course_id', courseId).order('position'),
    supabase
      .from('lms_lessons')
      .select('*, lms_lesson_content(video_url, body, action, done_when)')
      .eq('course_id', courseId)
      .order('position'),
    supabase.from('lms_course_tools').select('*').eq('course_id', courseId).order('created_at'),
  ]);
  if (error) throw error;
  const categories = await loadCategories();

  const toLesson = (row: any): DraftLesson => {
    const content = Array.isArray(row.lms_lesson_content) ? row.lms_lesson_content[0] : row.lms_lesson_content;
    return {
      id: row.id,
      clientId: row.id,
      title: row.title,
      sessionType: row.session_type,
      durationMinutes: row.duration_minutes,
      status: row.status,
      isPreview: row.is_preview,
      videoUrl: content?.video_url ?? '',
      body: content?.body ?? '',
      action: content?.action ?? '',
      doneWhen: content?.done_when ?? '',
    };
  };

  const draftModules: DraftModule[] = (modules ?? []).map((row: any) => ({
    id: row.id,
    clientId: row.id,
    title: row.title,
    summary: row.summary ?? '',
    doneWhen: row.done_when ?? [],
    lessons: (lessons ?? []).filter((l: any) => l.module_id === row.id).map(toLesson),
  }));
  const orphans = (lessons ?? []).filter((l: any) => !l.module_id || !draftModules.some((m) => m.id === l.module_id));
  if (orphans.length) {
    draftModules.push({ clientId: newClientId(), title: 'More sessions', summary: '', doneWhen: [], lessons: orphans.map(toLesson) });
  }

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle ?? '',
    description: course.description ?? '',
    program: course.program,
    category: categories.get(course.id) ?? defaultCategory(course),
    audience: course.audience ?? '',
    status: course.status,
    coverUrl: course.cover_url ?? '',
    explainerUrl: course.explainer_url ?? '',
    priceMinor: course.price_minor,
    currency: course.currency,
    altPriceMinor: course.alt_price_minor ?? null,
    modules: draftModules,
    tools: (tools ?? []).map((row: any) => ({
      id: row.id,
      clientId: row.id,
      name: row.name,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
    })),
  };
}

export interface SaveResult {
  id: string;
  slug: string;
  removedToolPaths: string[];
}

export async function saveCourse(draft: DraftCourse): Promise<SaveResult> {
  const payload = {
    id: draft.id ?? null,
    slug: draft.slug || slugify(draft.title) || 'course',
    title: draft.title,
    subtitle: draft.subtitle,
    description: draft.description,
    program: draft.program,
    audience: draft.audience,
    status: draft.status,
    cover_url: draft.coverUrl,
    explainer_url: draft.explainerUrl,
    // Courses are free; builds and other products keep the price the team set.
    price_minor: draft.category === 'course' ? 0 : draft.priceMinor,
    currency: draft.currency,
    modules: draft.modules.map((module) => ({
      id: module.id ?? null,
      client_id: module.clientId,
      title: module.title,
      summary: module.summary,
      done_when: module.doneWhen.map((item) => item.trim()).filter(Boolean),
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id ?? null,
        client_id: lesson.clientId,
        title: lesson.title,
        session_type: lesson.sessionType,
        duration_minutes: lesson.durationMinutes,
        status: lesson.status,
        is_preview: lesson.isPreview,
        video_url: lesson.videoUrl,
        body: lesson.body,
        action: lesson.action,
        done_when: lesson.doneWhen,
      })),
    })),
    tools: draft.tools.map((tool) => ({
      id: tool.id ?? null,
      client_id: tool.clientId,
      name: tool.name,
      storage_path: tool.storagePath,
      mime_type: tool.mimeType,
      size_bytes: tool.sizeBytes,
    })),
  };
  const { data, error } = await supabase.rpc('save_course', { payload });
  if (error) throw error;
  const result = data as any;
  // The category is saved beside the course (skipped quietly until the category migration is applied).
  await supabase.rpc('set_course_category', { check_course_id: result.id, new_category: draft.category });
  // The other-currency price is saved beside the course: only on sale when it has a main price to sit beside.
  const { error: altError } = await supabase.rpc('set_course_alt_price', {
    check_course_id: result.id,
    new_alt_price_minor: draft.priceMinor && draft.priceMinor > 0 ? draft.altPriceMinor : null,
  });
  if (altError) throw altError;
  // Files of removed downloads are cleaned up best-effort; the rows are already gone.
  if (result.removed_tool_paths?.length) {
    await supabase.storage.from(TOOLS_BUCKET).remove(result.removed_tool_paths);
  }
  return { id: result.id, slug: result.slug, removedToolPaths: result.removed_tool_paths ?? [] };
}

/** Uploads a file for a course download. Returns the storage path to save with the course. */
export async function uploadToolFile(courseKey: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '-');
  const path = `${courseKey}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(TOOLS_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export interface LearnerRow {
  userId: string;
  email: string;
  fullName: string | null;
  courseId: string;
  courseTitle: string;
  enrolled: boolean;
  source: string | null;
  enrolledAt: string | null;
  completedLessons: number;
  totalLessons: number;
  lastActivityAt: string | null;
}

export async function loadLearners(): Promise<LearnerRow[]> {
  const { data, error } = await supabase.rpc('learner_progress');
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    courseId: row.course_id,
    courseTitle: row.course_title,
    enrolled: row.enrolled,
    source: row.source,
    enrolledAt: row.enrolled_at,
    completedLessons: row.completed_lessons,
    totalLessons: row.total_lessons,
    lastActivityAt: row.last_activity_at,
  }));
}

export async function enrollByEmail(email: string, courseId: string, note: string) {
  const { error } = await supabase.rpc('enroll_by_email', { learner_email: email, target_course_id: courseId, enrollment_note: note });
  if (error) throw error;
}

export async function removeEnrollment(userId: string, courseId: string) {
  const { error } = await supabase.from('lms_enrollments').delete().eq('user_id', userId).eq('course_id', courseId);
  if (error) throw error;
}

export interface TeamMemberRow {
  userId: string;
  email: string;
  fullName: string | null;
  role: TeamRole;
  createdAt: string;
}

export async function loadTeam(): Promise<TeamMemberRow[]> {
  const { data, error } = await supabase.rpc('team_list');
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: row.created_at,
  }));
}

export async function setTeamMember(email: string, role: TeamRole) {
  const { error } = await supabase.rpc('set_team_member', { member_email: email, member_role: role });
  if (error) throw error;
}

export async function removeTeamMember(userId: string) {
  const { error } = await supabase.rpc('remove_team_member', { member_user_id: userId });
  if (error) throw error;
}

/** Postgres/PostgREST errors carry the useful text in message; fall back gracefully. */
export function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'Something went wrong. Please try again.';
}
