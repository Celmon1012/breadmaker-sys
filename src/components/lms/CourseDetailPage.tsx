import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Check, CheckCircle2, ChevronDown, Circle, Clock, Download, FileText, Layers, Lock } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { themeStyle } from '../program-ui';
import VideoSlot from '../VideoSlot';
import { describeVideo } from '../../lib/lessonVideo';
import {
  CourseTool,
  CourseView,
  SESSION_LABEL,
  canOpenLesson,
  downloadCourseTool,
  errorMessage,
  formatBytes,
  formatMinutes,
  formatPrice,
  loadCourseTools,
  loadCourseView,
  loadLessonContent,
  nextLessonFor,
} from '../../lib/lms';
import { KitOffer, listKitOffers, startKitCheckout } from '../../lib/kits';
import { isKitSlug } from '../../lib/systems';
import { usePrice } from '../../lib/use-price';
import { money } from '../../lib/payments';
import { Button, CARD, Chip, EmptyState, Eyebrow, LmsShell, Loading, Notice, PageContainer, PROGRAM_LABEL, courseLabel, ProgressBar, programTheme } from './lms-ui';

interface CourseDetailPageProps {
  slug: string;
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

export default function CourseDetailPage({ slug, onNavigate, openPath }: CourseDetailPageProps) {
  const { user } = useAuth();
  const { text: priceText, resolve: resolveAmount } = usePrice();
  const [view, setView] = useState<CourseView | null | undefined>(undefined);
  const [tools, setTools] = useState<CourseTool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Set when this course is a kit on sale: it can be bought on its own.
  const [offer, setOffer] = useState<KitOffer | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  // Which syllabus modules are expanded; null until the learner toggles one (then the default applies).
  const [openModules, setOpenModules] = useState<Set<string> | null>(null);
  // Fallback explainer when the course has none set: the video of its free preview session.
  const [explainerUrl, setExplainerUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listKitOffers()
      .then((offers) => !cancelled && setOffer(offers.find((item) => item.slug === slug) ?? null))
      .catch(() => !cancelled && setOffer(null));
    return () => {
      cancelled = true;
    };
  }, [slug]);
  const buyKit = async () => {
    if (!offer || !user?.email) return;
    setBuying(true);
    setBuyError(null);
    try {
      window.location.assign(await startKitCheckout(offer.systemId, user.email, ''));
    } catch (err) {
      setBuyError(errorMessage(err));
      setBuying(false);
    }
  };
  const previewId = view ? view.lessons.find((lesson) => lesson.isPreview)?.id ?? null : null;

  useEffect(() => {
    setExplainerUrl(null);
    if (!previewId) return;
    let cancelled = false;
    loadLessonContent(previewId)
      .then((content) => !cancelled && setExplainerUrl(content?.videoUrl ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [previewId]);

  useEffect(() => {
    let cancelled = false;
    setView(undefined);
    setError(null);
    (async () => {
      try {
        const next = await loadCourseView(slug, user?.id ?? null);
        if (cancelled) return;
        setView(next);
        if (next) {
          const list = await loadCourseTools(next.course.id, next.hasAccess);
          if (!cancelled) setTools(list);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, user?.id]);

  if (error || view === null) {
    return (
      <LmsShell active="dashboard" onNavigate={onNavigate}>
        <PageContainer>
          {error ? (
            <Notice tone="error">We could not load this page: {error}</Notice>
          ) : (
            <EmptyState
              title="Course not found"
              body="This course does not exist or is not published yet."
              action={<Button onClick={() => onNavigate(user ? 'dashboard' : 'home')}>{user ? 'Go to the dashboard' : 'Back to home'}</Button>}
            />
          )}
        </PageContainer>
      </LmsShell>
    );
  }

  if (view === undefined) {
    return (
      <LmsShell active="dashboard" onNavigate={onNavigate}>
        <PageContainer>
          <Loading label="Loading course…" />
        </PageContainer>
      </LmsShell>
    );
  }

  const { course, modules, lessons, hasAccess, completed } = view;
  const next = nextLessonFor(lessons, completed, hasAccess);
  const completedCount = lessons.filter((lesson) => completed.has(lesson.id)).length;
  const progress = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0);
  const price = priceText(course);
  const openLesson = (lessonId: string) => openPath(`/learn/${course.slug}/${lessonId}`);
  // By default only the module holding the learner's next session is expanded.
  const defaultOpen = new Set([(modules.find((m) => m.lessons.some((l) => l.id === next?.id)) ?? modules[0])?.id].filter(Boolean) as string[]);
  const expanded = openModules ?? defaultOpen;
  const toggleModule = (id: string) =>
    setOpenModules((prev) => {
      const nextSet = new Set(prev ?? defaultOpen);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  const landing: Route | null = course.program === 'foundry' ? 'foundry' : course.program === 'launchpad' ? 'launchpad' : null;

  const handleDownload = async (tool: CourseTool) => {
    setDownloadError(null);
    try {
      await downloadCourseTool(tool);
    } catch (err) {
      setDownloadError(errorMessage(err));
    }
  };

  return (
    <LmsShell active="dashboard" onNavigate={onNavigate}>
      <div style={themeStyle(programTheme(course.program))} className="bg-[var(--pg-bg)]">
        <PageContainer>
          <button
            onClick={() => onNavigate(user ? 'dashboard' : 'home')}
            className="inline-flex items-center gap-2 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> {user ? 'Dashboard' : 'Back to home'}
          </button>

          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
            <div className="lg:col-start-1 lg:row-start-1">
              <Eyebrow>{courseLabel(course)}</Eyebrow>
              <h1 className="mt-4 font-editorial text-[38px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[52px]">
                {course.title}
              </h1>
              {course.subtitle && (
                <p className="mt-4 font-editorial text-[22px] leading-[1.35] sm:text-[26px]">{course.subtitle}</p>
              )}
              {course.description && (
                <p className="mt-5 max-w-[680px] text-[17px] leading-[1.65] text-[var(--pg-body)]">{course.description}</p>
              )}
              {course.audience && (
                <p className="mt-5 text-[15px] text-[var(--pg-body)]">
                  <span className="font-semibold text-[var(--pg-ink)]">For: </span>
                  {course.audience}
                </p>
              )}
              <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px] text-[var(--pg-body)]">
                <span className="inline-flex items-center gap-2"><Layers className="h-4 w-4" /> {modules.length} {modules.length === 1 ? 'module' : 'modules'}</span>
                <span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4" /> {lessons.length} {lessons.length === 1 ? 'session' : 'sessions'}</span>
                <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4" /> {formatMinutes(totalMinutes)}</span>
              </p>
            </div>

            <aside className={`${CARD} h-fit p-7 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:p-8`}>


              <div>
                {hasAccess ? (
                  <>
                    <div className="mb-2 flex justify-between text-[14px]">
                      <span className="font-medium">{progress}% complete</span>
                      <span className="text-[var(--pg-body)]">{completedCount} of {lessons.length}</span>
                    </div>
                    <ProgressBar value={progress} />
                    {next && (
                      <Button className="mt-6 w-full" onClick={() => openLesson(next.id)}>
                        {completedCount === 0 ? (isKitSlug(course.slug) ? 'Start the kit' : 'Start the build') : 'Continue where you left off'}
                      </Button>
                    )}
                    <p className="mt-3 text-center text-[13.5px] text-[var(--pg-body)]">
                      {next ? `Next: ${next.title}` : 'No sessions are published yet.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-editorial text-[22px] font-semibold">
                      {offer ? 'Kit · free with Breadmaker Community' : price === 'Free' ? 'Free course' : price ?? 'Enrollment by application'}
                    </p>
                    <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--pg-body)]">
                      {offer
                        ? 'Every kit is free for Breadmaker Community members. Join once and every session, checklist and definition of done unlocks here. It is also included in the program that builds it.'
                        : price === 'Free'
                          ? 'Sign in to open every session and save your progress.'
                          : 'Once you are accepted and enrolled, every session and download unlocks here.'}
                    </p>
                    {describeVideo(course.explainerUrl || explainerUrl).kind === 'embed' && (
                      <div className="mt-5">
                        <VideoSlot url={course.explainerUrl || explainerUrl} title={`About ${course.title}`} compact />
                      </div>
                    )}
                    <div className="mt-5 flex flex-col gap-3">
                      {offer && <Button onClick={() => onNavigate('membership')}>Join Breadmaker Community</Button>}
                      {offer && !user && <Button variant="ghost" onClick={() => onNavigate('signin')}>Already a member? Sign in</Button>}
                      {offer && buyError && <Notice tone="error">{buyError}</Notice>}
                      {!user && !offer && <Button onClick={() => onNavigate('signin')}>{price === 'Free' ? 'Sign in to start' : 'Already enrolled? Sign in'}</Button>}
                      {price !== 'Free' && landing && (
                        <>
                        <Button variant={user ? 'accent' : 'ghost'} onClick={() => openPath(`/${course.program}/apply`)}>
                          {course.program === 'foundry' ? 'Apply for the next cohort' : 'Reserve Your Build Spot'}
                        </Button>
                        <button onClick={() => onNavigate(landing)} className="text-[14px] font-medium underline underline-offset-4 hover:opacity-75 cursor-pointer">
                          About {PROGRAM_LABEL[course.program]}
                        </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </aside>

            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {/* Syllabus */}
          <section>
            <Eyebrow>Syllabus</Eyebrow>
            <h2 className="mt-3 font-editorial text-[30px] font-semibold tracking-[-0.01em] sm:text-[36px]">What you will do</h2>
            <div className="mt-8 space-y-5">
              {modules.map((module, moduleIndex) => (
                <div key={module.id} className={`${CARD} p-6 sm:p-8`}>
                  <button
                    type="button"
                    onClick={() => toggleModule(module.id)}
                    aria-expanded={expanded.has(module.id)}
                    className="flex w-full items-center gap-4 text-left cursor-pointer"
                  >
                    <span className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <span className="font-editorial text-[24px] font-semibold leading-[1.2]">{module.title}</span>
                      <span className="text-[13.5px] text-[var(--pg-body)]">
                        {module.lessons.length} {module.lessons.length === 1 ? 'session' : 'sessions'} · {formatMinutes(module.lessons.reduce((s, l) => s + l.durationMinutes, 0))}
                      </span>
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--pg-line)] transition-colors hover:bg-[var(--pg-alt)]">
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded.has(module.id) ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  {expanded.has(module.id) && (
                  <>
                  {module.summary && <p className="mt-3 max-w-[820px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">{module.summary}</p>}

                  <ol className="mt-5 divide-y divide-[var(--pg-line-soft)] border-y border-[var(--pg-line-soft)]">
                    {module.lessons.map((lesson) => {
                      const open = canOpenLesson(lesson, hasAccess);
                      const done = completed.has(lesson.id);
                      return (
                        <li key={lesson.id}>
                          <button
                            onClick={() => open && openLesson(lesson.id)}
                            disabled={!open}
                            className="flex w-full items-center gap-4 py-4 text-left disabled:cursor-default enabled:cursor-pointer enabled:hover:bg-[var(--pg-alt)]/60 sm:px-2"
                          >
                            {done ? (
                              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--pg-accent)]" />
                            ) : open ? (
                              <Circle className="h-5 w-5 shrink-0 text-[var(--pg-body)]" />
                            ) : (
                              <Lock className="h-5 w-5 shrink-0 text-[var(--pg-body)]" />
                            )}
                            <span className="flex-1">
                              <span className="block text-[16px] font-medium">{lesson.title}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-[var(--pg-body)]">
                                <span>{SESSION_LABEL[lesson.sessionType]}</span>
                                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {lesson.durationMinutes} min</span>
                              </span>
                            </span>
                            {lesson.isPreview && !hasAccess && <Chip tone="accent">Free preview</Chip>}
                          </button>
                        </li>
                      );
                    })}
                    {module.lessons.length === 0 && <li className="py-4 text-[14.5px] text-[var(--pg-body)]">Sessions are coming soon.</li>}
                  </ol>

                  {module.doneWhen.length > 0 && (
                    <div className="mt-5">
                      <p className="font-label font-medium text-[11.5px] uppercase tracking-[0.06em] text-[var(--pg-body)]">
                        {moduleIndex === modules.length - 1 && course.program === 'foundry' ? 'Done when (Day-30 scorecard)' : 'Done when'}
                      </p>
                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {module.doneWhen.map((item) => (
                          <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-[1.5]">
                            <Check className="mt-[3px] h-4 w-4 shrink-0 text-[var(--pg-accent)]" strokeWidth={2.75} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  </>
                  )}
                </div>
              ))}
              {modules.length === 0 && <EmptyState title="Syllabus coming soon" body="The sessions are being prepared." />}
            </div>
          </section>

          {tools.length > 0 && (
            <section className="mt-14">
              <Eyebrow>Downloads</Eyebrow>
              <h2 className="mt-3 font-editorial text-[30px] font-semibold tracking-[-0.01em]">Templates and checklists</h2>
              {downloadError && <div className="mt-5"><Notice tone="error">{downloadError}</Notice></div>}
              <ul className={`${CARD} mt-6 divide-y divide-[var(--pg-line-soft)]`}>
                {tools.map((tool) => (
                  <li key={tool.id} className="flex items-center gap-4 px-6 py-4">
                    <FileText className="h-5 w-5 shrink-0 text-[var(--pg-accent)]" />
                    <span className="flex-1">
                      <span className="block text-[15.5px] font-medium">{tool.name}</span>
                      <span className="text-[13px] text-[var(--pg-body)]">{formatBytes(tool.sizeBytes)}</span>
                    </span>
                    {tool.storagePath ? (
                      <Button variant="ghost" onClick={() => handleDownload(tool)}>
                        <Download className="h-4 w-4" /> Download
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[13.5px] text-[var(--pg-body)]"><Lock className="h-4 w-4" /> Enrolled learners</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
            </div>
          </div>
        </PageContainer>
      </div>
    </LmsShell>
  );
}
