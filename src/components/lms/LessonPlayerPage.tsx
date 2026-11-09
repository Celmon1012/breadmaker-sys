import React, { useEffect, useState } from 'react';
import { coursePath, isBuildSlug } from '../../lib/systems';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Circle, Clock, ListChecks, Lock, PanelLeft, Target, X } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { themeStyle } from '../program-ui';
import {
  CourseView,
  LessonContent,
  SESSION_LABEL,
  canOpenLesson,
  errorMessage,
  loadCourseView,
  loadLessonContent,
  setLessonComplete,
} from '../../lib/lms';
import { describeVideo } from '../../lib/lessonVideo';
import CoachPanel from './CoachPanel';
import EvidenceBox from './EvidenceBox';
import { SubmissionStatus, loadCourseStatuses, takesEvidence } from '../../lib/evidence';
import { Button, CARD, EmptyState, Eyebrow, LmsShell, Loading, Notice, PageContainer, Prose, ProgressBar, programTheme } from './lms-ui';

interface LessonPlayerPageProps {
  slug: string;
  lessonId: string;
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

export default function LessonPlayerPage({ slug, lessonId, onNavigate, openPath }: LessonPlayerPageProps) {
  const { user } = useAuth();
  const [view, setView] = useState<CourseView | null | undefined>(undefined);
  const [content, setContent] = useState<LessonContent | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  // Weeks expanded in the outline; the week of the open session is always expanded.
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());

  useEffect(() => {
    const current = view?.modules.find((m) => m.lessons.some((l) => l.id === lessonId));
    if (current) setOpenWeeks((prev) => (prev.has(current.id) ? prev : new Set(prev).add(current.id)));
  }, [view, lessonId]);

  const toggleWeek = (id: string) =>
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const next = await loadCourseView(slug, user?.id ?? null);
        if (!cancelled) setView(next);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, user?.id]);

  const [statuses, setStatuses] = useState<Map<string, SubmissionStatus>>(new Map());
  const courseId = view?.course.id;
  const refreshStatuses = () => {
    if (courseId && user?.id) void loadCourseStatuses(courseId, user.id).then(setStatuses);
  };
  useEffect(refreshStatuses, [courseId, user?.id]);

  const lesson = view?.lessons.find((item) => item.id === lessonId) ?? null;
  const unlocked = !!(view && lesson && canOpenLesson(lesson, view.hasAccess));

  useEffect(() => {
    let cancelled = false;
    setContent(undefined);
    setSaveError(null);
    setOutlineOpen(false);
    if (!unlocked) return;
    loadLessonContent(lessonId)
      .then((value) => !cancelled && setContent(value))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [lessonId, unlocked]);

  if (error) {
    return (
      <LmsShell active="dashboard" onNavigate={onNavigate}>
        <PageContainer>
          <Notice tone="error">We could not load this session: {error}</Notice>
        </PageContainer>
      </LmsShell>
    );
  }
  if (view === undefined) {
    return (
      <LmsShell active="dashboard" onNavigate={onNavigate}>
        <PageContainer>
          <Loading label="Loading session…" />
        </PageContainer>
      </LmsShell>
    );
  }
  if (!view || !lesson) {
    return (
      <LmsShell active="dashboard" onNavigate={onNavigate}>
        <PageContainer>
          <EmptyState
            title="Session not found"
            body="This session does not exist or is not published."
            action={<Button onClick={() => openPath(view ? coursePath(slug) : '/dashboard')}>Back</Button>}
          />
        </PageContainer>
      </LmsShell>
    );
  }

  const { course, modules, lessons, hasAccess, completed } = view;
  const index = lessons.findIndex((item) => item.id === lesson.id);
  const previous = lessons.slice(0, index).reverse().find((item) => canOpenLesson(item, hasAccess)) ?? null;
  const next = lessons.slice(index + 1).find((item) => canOpenLesson(item, hasAccess)) ?? null;
  const module = modules.find((item) => item.lessons.some((l) => l.id === lesson.id)) ?? null;
  const done = completed.has(lesson.id);
  const completedCount = lessons.filter((item) => completed.has(item.id)).length;
  const progress = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  const passedCount = lessons.filter((item) => statuses.get(item.id) === 'passed').length;
  const video = describeVideo(content?.videoUrl);
  const openLesson = (id: string) => openPath(`/learn/${course.slug}/${id}`);

  const toggleComplete = async () => {
    if (!user) {
      onNavigate('signin');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await setLessonComplete(user.id, lesson.id, !done);
      const nextCompleted = new Set(completed);
      if (done) nextCompleted.delete(lesson.id);
      else nextCompleted.add(lesson.id);
      setView({ ...view, completed: nextCompleted });
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const outline = (
    <nav aria-label="Outline" className="space-y-6">
      <div>
        <button onClick={() => openPath(coursePath(course.slug))} className="text-left font-editorial text-[20px] font-semibold leading-[1.2] hover:underline cursor-pointer">
          {course.title}
        </button>
        {hasAccess && (
          <div className="mt-3">
            <ProgressBar value={progress} />
            <p className="mt-1.5 text-[12.5px] text-[var(--pg-body)]">
              {completedCount} of {lessons.length} sessions done
              {passedCount > 0 && ` · ${passedCount} passed by your coach`}
            </p>
          </div>
        )}
      </div>
      {modules.map((item) => (
        <div key={item.id}>
          <button
            type="button"
            onClick={() => toggleWeek(item.id)}
            aria-expanded={openWeeks.has(item.id)}
            className="flex w-full items-center justify-between gap-2 rounded-[12px] py-1 text-left font-label text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer"
          >
            <span>
              {item.title}
              <span className="ml-2 normal-case tracking-normal opacity-70">
                {item.lessons.filter((l) => completed.has(l.id)).length}/{item.lessons.length}
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${openWeeks.has(item.id) ? 'rotate-180' : ''}`} />
          </button>
          {openWeeks.has(item.id) && (
          <ul className="mt-2 space-y-0.5">
            {item.lessons.map((entry) => {
              const open = canOpenLesson(entry, hasAccess);
              const current = entry.id === lesson.id;
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => open && openLesson(entry.id)}
                    disabled={!open}
                    aria-current={current ? 'page' : undefined}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px] leading-[1.35] transition-colors ${
                      current ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : open ? 'hover:bg-[var(--pg-alt)] cursor-pointer' : 'text-[var(--pg-body)] cursor-default'
                    }`}
                  >
                    {completed.has(entry.id) ? (
                      <CheckCircle2 className={`mt-px h-4 w-4 shrink-0 ${current ? '' : 'text-[var(--pg-accent)]'}`} />
                    ) : open ? (
                      <Circle className="mt-px h-4 w-4 shrink-0 opacity-60" />
                    ) : (
                      <Lock className="mt-px h-4 w-4 shrink-0 opacity-60" />
                    )}
                    <span className="min-w-0 flex-1">{entry.title}</span>
                    {statuses.get(entry.id) && (
                      <span className={`ml-auto shrink-0 pt-px text-[11px] font-medium ${current ? 'opacity-80' : statuses.get(entry.id) === 'passed' ? 'text-[var(--pg-accent)]' : 'text-[var(--pg-body)]'}`}>
                        {statuses.get(entry.id) === 'passed' ? 'Passed' : statuses.get(entry.id) === 'needs_revision' ? 'Fix' : 'In review'}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          )}
        </div>
      ))}
    </nav>
  );

  return (
    <LmsShell active="dashboard" onNavigate={onNavigate} wide>
      <div style={themeStyle(programTheme(course.program))} className="bg-[var(--pg-bg)]">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[300px_1fr] lg:py-10">
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">{outline}</div>
          </aside>

          <main className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => openPath(coursePath(course.slug))}
                className="inline-flex items-center gap-2 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" /> Course overview
              </button>
              <button
                onClick={() => setOutlineOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--pg-line)] px-3.5 py-2 text-[13.5px] lg:hidden cursor-pointer"
              >
                <PanelLeft className="h-4 w-4" /> Sessions
              </button>
            </div>

            <div className="mt-6">
              {module && <Eyebrow>{module.title}</Eyebrow>}
              <h1 className="mt-3 font-editorial text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[42px]">{lesson.title}</h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--pg-body)]">
                <span>{SESSION_LABEL[lesson.sessionType]}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {lesson.durationMinutes} min</span>
                {lesson.isPreview && !hasAccess && <span className="font-medium text-[var(--pg-accent)]">Free preview</span>}
              </p>
            </div>

            {!unlocked ? (
              <div className="mt-8">
                <EmptyState
                  title="This session is for enrolled learners"
                  body={user ? 'Your account is not enrolled in this yet. Once you are accepted, every session unlocks here.' : 'Sign in with the account you enrolled with to open this session.'}
                  action={
                    <div className="flex flex-wrap justify-center gap-3">
                      {!user && <Button onClick={() => onNavigate('signin')}>Sign in</Button>}
                      <Button variant="ghost" onClick={() => openPath(coursePath(course.slug))}>See how to enroll</Button>
                    </div>
                  }
                />
              </div>
            ) : content === undefined ? (
              <Loading label="Loading session…" />
            ) : (
              <div className="mt-8 space-y-8">
                {video.kind === 'embed' && (
                  <div className="aspect-video overflow-hidden rounded-[17px] bg-black">
                    <iframe
                      src={video.src}
                      title={`${lesson.title} (${video.label})`}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                )}
                {video.kind === 'file' && (
                  <video controls src={video.src} className="aspect-video w-full rounded-[17px] bg-black" />
                )}
                {video.kind === 'unsupported' && (
                  <Notice>The video link for this session could not be played here. Ask your coach for a working link.</Notice>
                )}

                {content?.body ? (
                  <div className={`${CARD} p-7 sm:p-9`}>
                    <Prose text={content.body} />
                  </div>
                ) : (
                  video.kind === 'none' && <Notice>Notes for this session are coming soon.</Notice>
                )}

                {(content?.action || content?.doneWhen) && (
                  <div className="grid gap-5 md:grid-cols-2">
                    {content.action && (
                      <div className="rounded-[17px] bg-[var(--pg-dark)] p-7 text-[var(--pg-dark-ink)]">
                        <p className="inline-flex items-center gap-2 font-label font-semibold text-[11.5px] uppercase tracking-[0.06em] text-[var(--pg-label-dark)]">
                          <Target className="h-4 w-4" /> Your one action
                        </p>
                        <p className="mt-3 font-editorial text-[21px] leading-[1.35]">{content.action}</p>
                      </div>
                    )}
                    {content.doneWhen && (
                      <div className={`${CARD} p-7`}>
                        <p className="inline-flex items-center gap-2 font-label font-semibold text-[11.5px] uppercase tracking-[0.06em] text-[var(--pg-accent)]">
                          <ListChecks className="h-4 w-4" /> Done when
                        </p>
                        <p className="mt-3 text-[16px] leading-[1.6]">{content.doneWhen}</p>
                      </div>
                    )}
                  </div>
                )}

                {user && takesEvidence(content) && (
                  <EvidenceBox
                    lessonId={lesson.id}
                    userId={user.id}
                    onSubmitted={() => {
                      setView((current) => (current ? { ...current, completed: new Set(current.completed).add(lesson.id) } : current));
                      refreshStatuses();
                    }}
                  />
                )}

                {module && module.doneWhen.length > 0 && module.lessons[module.lessons.length - 1]?.id === lesson.id && (
                  <div className={`${CARD} p-7`}>
                    <p className="font-label font-semibold text-[11.5px] uppercase tracking-[0.06em] text-[var(--pg-accent)]">{module.title}: done when</p>
                    <ul className="mt-4 space-y-2.5">
                      {module.doneWhen.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-[15px] leading-[1.5]">
                          <Check className="mt-[3px] h-4 w-4 shrink-0 text-[var(--pg-accent)]" strokeWidth={2.75} /> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {saveError && <Notice tone="error">{saveError}</Notice>}

                <div className="flex flex-col gap-4 border-t border-[var(--pg-line-soft)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant={done ? 'ghost' : 'accent'} busy={saving} onClick={toggleComplete}>
                    {done ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Done · mark as not done
                      </>
                    ) : user ? (
                      <>
                        <Check className="h-4 w-4" /> Mark as done
                      </>
                    ) : (
                      'Sign in to save progress'
                    )}
                  </Button>
                  <div className="flex gap-3">
                    <Button variant="ghost" disabled={!previous} onClick={() => previous && openLesson(previous.id)}>
                      <ArrowLeft className="h-4 w-4" /> Previous
                    </Button>
                    <Button variant="dark" disabled={!next} onClick={() => next && openLesson(next.id)}>
                      Next <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {unlocked && user && (
          <CoachPanel key={lesson.id} lessonId={lesson.id} lessonTitle={lesson.title} courseTitle={course.title} courseSlug={course.slug} />
        )}

        {outlineOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Outline">
            <button className="absolute inset-0 bg-black/40" aria-label="Close sessions" onClick={() => setOutlineOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[86%] max-w-[360px] overflow-y-auto bg-[var(--pg-bg)] p-6 border-r border-[var(--pg-line-soft)]">
              <button onClick={() => setOutlineOpen(false)} className="mb-4 ml-auto flex rounded-full p-2 hover:bg-[var(--pg-alt)] cursor-pointer" aria-label="Close sessions">
                <X className="h-5 w-5" />
              </button>
              {outline}
            </div>
          </div>
        )}
      </div>
    </LmsShell>
  );
}
