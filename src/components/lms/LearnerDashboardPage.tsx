import React, { useEffect, useState } from 'react';
import { coursePath } from '../../lib/systems';
import { PlayCircle } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { themeStyle } from '../program-ui';
import { CatalogCourse, MyCourse, OutlineLesson, errorMessage, loadCatalog, loadCourseView, loadMyCourses, nextLessonFor } from '../../lib/lms';
import OnboardingCard, { onboardingDone } from './OnboardingCard';
import CommunityJoinCard from './CommunityJoinCard';
import SetupProgress from './SetupProgress';
import FunnelsCard from './FunnelsCard';
import EnquiryMetrics from './EnquiryMetrics';
import RecentActivity from './RecentActivity';
import { COURSES_ENABLED } from '../../lib/features';
import { Mastery, loadMyMastery } from '../../lib/evidence';
import { Button, CARD, LearnerLayout, Loading, Notice, PageContainer, PageTitle, ProgressBar, programTheme } from './lms-ui';

interface LearnerDashboardPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

interface ContinueTarget {
  course: CatalogCourse;
  lesson: OutlineLesson;
}

export default function LearnerDashboardPage({ onNavigate, openPath }: LearnerDashboardPageProps) {
  const { user } = useAuth();
  const [mine, setMine] = useState<MyCourse[] | null>(null);
  const [resume, setResume] = useState<ContinueTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileFirstName, setProfileFirstName] = useState<string | null>(null);
  const [onboardingClosed, setOnboardingClosed] = useState(false);
  const [mastery, setMastery] = useState<Map<string, Mastery>>(new Map());

  useEffect(() => {
    if (user && COURSES_ENABLED) void loadMyMastery().then(setMastery);
  }, [user?.id]);

  // The name saved on the Account page lives in profiles, so it wins over the sign-up metadata.
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('first_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setProfileFirstName(data?.first_name?.trim() || null));
  }, [user?.id]);

  useEffect(() => {
    if (!user || !COURSES_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const catalog = await loadCatalog();
        const courses = await loadMyCourses(user.id, catalog);
        if (cancelled) return;
        setMine(courses);
        const current = courses.find((entry) => entry.progress < 100) ?? courses[0];
        if (current) {
          const view = await loadCourseView(current.course.slug, user.id);
          const lesson = view ? nextLessonFor(view.lessons, view.completed, view.hasAccess) : null;
          if (!cancelled && lesson) setResume({ course: current.course, lesson });
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const firstName = profileFirstName || (user?.user_metadata?.first_name as string | undefined) || user?.email?.split('@')[0];

  const builds = (mine ?? []).filter((entry) => entry.course.category === 'build');
  const doneSessions = builds.reduce((sum, entry) => sum + entry.completedLessons, 0);
  const totalSessions = builds.reduce((sum, entry) => sum + entry.course.lessonCount, 0);
  const overall = totalSessions > 0 ? Math.round((doneSessions / totalSessions) * 100) : 0;

  return (
    <LearnerLayout active="dashboard" onNavigate={onNavigate}>
      <PageContainer>
        <PageTitle>Welcome back{firstName ? `, ${firstName}` : ''}.</PageTitle>

        {COURSES_ENABLED && error && <div className="mt-8"><Notice tone="error">We could not load your builds: {error}</Notice></div>}
        {COURSES_ENABLED && !error && mine === null && <Loading label="Loading…" />}

        <SetupProgress openPath={openPath} />
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <FunnelsCard openPath={openPath} />
          <EnquiryMetrics onNavigate={onNavigate} />
          <RecentActivity onNavigate={onNavigate} openPath={openPath} />
        </div>

        {COURSES_ENABLED && mine && (
          <>
            {builds.length === 0 && !onboardingClosed && !onboardingDone(user) && (
              <OnboardingCard openPath={openPath} onDone={() => setOnboardingClosed(true)} />
            )}

            <dl className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Builds', value: String(builds.length) },
                { label: 'Sessions done', value: totalSessions > 0 ? `${doneSessions} of ${totalSessions}` : '0' },
                { label: 'Overall progress', value: `${overall}%` },
              ].map((tile) => (
                <div key={tile.label} className={`${CARD} lg:bg-[color-mix(in_srgb,var(--pg-alt)_35%,var(--pg-card))]! px-5 py-4`}>
                  <dt className="text-[13px] text-[var(--pg-body)]">{tile.label}</dt>
                  <dd className="mt-1 text-[26px] font-semibold leading-[1.15] tracking-[-0.01em]">{tile.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
              {resume ? (
                <button
                  onClick={() => openPath(`/learn/${resume.course.slug}/${resume.lesson.id}`)}
                  style={themeStyle(programTheme(resume.course.program))}
                  className="group flex w-full flex-col justify-between gap-8 rounded-[18px] bg-[var(--pg-dark)] p-7 text-left text-[var(--pg-dark-ink)] transition-opacity hover:opacity-95 lg:min-h-[260px] lg:p-9 cursor-pointer"
                >
                  <div>
                    <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-label-dark)]">Up next · {resume.course.title}</p>
                    <p className="mt-3 font-editorial text-[28px] font-semibold leading-[1.15] lg:text-[34px]">{resume.lesson.title}</p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--pg-dark-ink)] px-6 py-3 text-[15px] font-medium text-[var(--pg-dark)]">
                    <PlayCircle className="h-5 w-5" /> Continue
                  </span>
                </button>
              ) : (
                <div className={`${CARD} flex flex-col items-start gap-3 p-7 lg:min-h-[260px] lg:p-9`}>
                  <p className="font-editorial text-[24px] font-semibold leading-[1.2]">Nothing to continue yet</p>
                  <p className="max-w-[420px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                    Once you are accepted into a program, your next session appears here. You can browse every syllabus and watch the free previews in the meantime.
                  </p>
                  <div className="mt-auto pt-4">
                    <Button onClick={() => onNavigate('courses')}>Browse courses</Button>
                  </div>
                </div>
              )}

              <section className={`${CARD} overflow-hidden`} aria-labelledby="dash-builds">
                <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
                  <h2 id="dash-builds" className="font-editorial text-[20px] font-semibold tracking-[-0.01em]">Your builds</h2>
                  <button onClick={() => onNavigate('courses')} className="text-[13.5px] text-[var(--pg-body)] transition-colors hover:text-[var(--pg-ink)] cursor-pointer">
                    All courses
                  </button>
                </div>
                {builds.length === 0 ? (
                  <p className="px-5 pb-5 text-[14.5px] leading-[1.55] text-[var(--pg-body)]">No builds yet.</p>
                ) : (
                  <ul className="divide-y divide-[var(--pg-line-soft)] border-t border-[var(--pg-line-soft)]">
                    {builds.map((entry) => (
                      <li key={entry.course.id}>
                        <button
                          onClick={() => openPath(coursePath(entry.course.slug))}
                          style={themeStyle(programTheme(entry.course.program))}
                          className="block w-full px-5 py-4 text-left transition-colors hover:bg-[var(--pg-alt)] cursor-pointer"
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="truncate font-medium">{entry.course.title}</span>
                            <span className="shrink-0 text-[13px] text-[var(--pg-body)]">{entry.progress}%</span>
                          </span>
                          <span className="mt-2 block">
                            <ProgressBar value={entry.progress} />
                          </span>
                          <span className="mt-1.5 block text-[12.5px] text-[var(--pg-body)]">
                            {entry.completedLessons} of {entry.course.lessonCount} sessions
                            {(mastery.get(entry.course.id)?.passed ?? 0) > 0 && ` · ${mastery.get(entry.course.id)!.passed} passed by your coach`}
                            {(mastery.get(entry.course.id)?.needsRevision ?? 0) > 0 && ` · ${mastery.get(entry.course.id)!.needsRevision} to fix`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--pg-line-soft)] bg-[var(--pg-alt)]/40 px-5 py-3.5 text-[13.5px] text-[var(--pg-body)]">
                  <span>Guided builds:</span>
                  <button onClick={() => onNavigate('launchpad')} className="font-medium text-[var(--pg-accent)] hover:underline underline-offset-4 cursor-pointer">Launchpad</button>
                  <button onClick={() => onNavigate('foundry')} className="font-medium text-[var(--pg-accent)] hover:underline underline-offset-4 cursor-pointer">Foundry</button>
                </div>
              </section>
            </div>
          </>
        )}
        <CommunityJoinCard />
      </PageContainer>
    </LearnerLayout>
  );
}
