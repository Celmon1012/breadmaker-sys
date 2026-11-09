import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Clock, Tag } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { coursePath } from '../../lib/systems';
import { MyCourse, errorMessage, loadCatalog, loadMyCourses } from '../../lib/lms';
import { EmptyState, LearnerLayout, Loading, Notice, PageContainer, ProgressBar } from './lms-ui';

interface CoursesPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

/** Soft cover colours for courses without a cover image. */
const COVERS = ['#8B8BFF', '#D8E0C8', '#F2D9C4', '#CFE3EA', '#E8D5EC', '#F3E6A8'];

/** Every free course, with the learner's progress on the ones they have started. */
export default function CoursesPage({ onNavigate, openPath }: CoursesPageProps) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<MyCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadCatalog()
      .then((catalog) => loadMyCourses(user.id, catalog.filter((course) => course.category !== 'build')))
      .then((rows) => {
        if (!cancelled) setCourses(rows.sort((a, b) => a.course.title.localeCompare(b.course.title)));
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const featured = courses?.[0];

  return (
    <LearnerLayout active="courses" onNavigate={onNavigate}>
      <PageContainer>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-3 font-label text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-body)]">
              <span aria-hidden="true" className="h-px w-9 bg-[var(--pg-body)]/50" /> The learning library
            </p>
            <h1 className="mt-5 font-editorial text-[34px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[44px]">
              Choose what feels <span className="italic text-[var(--pg-accent)]">useful</span> today.
            </h1>
          </div>
          {featured && (
            <button onClick={() => openPath(coursePath(featured.course.slug))} className="inline-flex items-center gap-2 text-[15px] text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer">
              View featured course <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {error && <div className="mt-8"><Notice tone="error">We could not load the courses: {error}</Notice></div>}
        {!error && courses === null && <Loading />}
        {courses && courses.length === 0 && (
          <div className="mt-8">
            <EmptyState title="No courses yet" body="New courses will show up here as soon as they are published." />
          </div>
        )}
        {courses && courses.length > 0 && (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((entry, index) => {
              const { course } = entry;
              const minutes = course.totalMinutes;
              return (
                <button
                  key={course.id}
                  onClick={() => openPath(coursePath(course.slug))}
                  className="group overflow-hidden rounded-[17px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] text-left transition-transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <span className="relative flex h-[170px] items-center justify-center overflow-hidden" style={{ background: COVERS[index % COVERS.length] }}>
                    {course.coverUrl ? (
                      <img src={course.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <>
                        <span aria-hidden="true" className="absolute h-[250px] w-[250px] rounded-full border border-white/30" />
                        <span aria-hidden="true" className="absolute h-[160px] w-[160px] rounded-full border border-white/30" />
                        <span className="relative inline-flex h-[62px] w-[62px] items-center justify-center rounded-full border border-white/50 text-[var(--pg-ink)]">
                          <BookOpen className="h-6 w-6" aria-hidden="true" />
                        </span>
                      </>
                    )}
                  </span>
                  <span className="block px-6 pb-6 pt-5">
                    <span className="block font-label text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pg-accent)]">{course.audience || 'Course'}</span>
                    <span className="mt-2 block font-editorial text-[22px] font-semibold leading-[1.2] tracking-[-0.01em]">{course.title}</span>
                    {course.subtitle && <span className="mt-2 block text-[15px] leading-[1.5] text-[var(--pg-body)]">{course.subtitle}</span>}
                    <span className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--pg-body)]">
                      <span className="inline-flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> {course.lessonCount} lessons</span>
                      <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> {minutes} min</span>
                      <span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" aria-hidden="true" /> Free</span>
                    </span>
                    {entry.progress > 0 && (
                      <span className="mt-4 block">
                        <ProgressBar value={entry.progress} />
                        <span className="mt-1.5 block text-[12.5px] text-[var(--pg-body)]">{entry.progress}% complete</span>
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </PageContainer>
    </LearnerLayout>
  );
}
