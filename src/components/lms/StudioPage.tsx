import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, ClipboardCheck, Plug, LifeBuoy, ArrowDown, ArrowLeft, ArrowUp, CalendarDays, CreditCard, Droplets, GraduationCap, Inbox, LayoutDashboard, Package, Plus, Repeat, Search, Trash2, UsersRound } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  LearnerRow,
  TeamCourseRow,
  TeamMemberRow,
  TeamRole,
  enrollByEmail,
  errorMessage,
  formatPrice,
  loadLearners,
  loadTeam,
  loadTeamCourses,
  removeEnrollment,
  removeTeamMember,
  setTeamMember,
} from '../../lib/lms';
import { loadApplications } from '../../lib/programs';
import CourseEditor from './CourseEditor';
import ApplicationsSection from './ApplicationsSection';
import CohortsSection from './CohortsSection';
import PaymentsSection from './PaymentsSection';
import { isKitSlug } from '../../lib/systems';
import LeakTestSection from './LeakTestSection';
import HubSection from './HubSection';
import SupportSection from './SupportSection';
import ReviewsSection from './ReviewsSection';
import PrestigePricing from './PrestigePricing';
import LaunchMetrics from './LaunchMetrics';
import AgentRunsSection from './AgentRunsSection';
import ConnectionsSection from './ConnectionsSection';
import { LeakTestPricing } from './LeakTestSection';
import {
  Button,
  CARD,
  Chip,
  EmptyState,
  Eyebrow,
  Field,
  DashboardFrame,
  SidebarGroup,
  LmsShell,
  Loading,
  Notice,
  PROGRAM_LABEL,
  ProgressBar,
  Select,
  TextInput,
  useTeamRole,
} from './lms-ui';

export type StudioSection = 'overview' | 'applications' | 'payments' | 'cohorts' | 'products' | 'courses' | 'learners' | 'reviews' | 'leak-test' | 'hub' | 'support' | 'agents' | 'connections' | 'team';

interface StudioPageProps {
  section: StudioSection;
  /** sub-page under Applications: launchpad, foundry or leak-test */
  tab?: string;
  /** course id being edited, or 'new' */
  editing: string | null;
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

const NAV: { key: StudioSection; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'applications', label: 'Applications', icon: Inbox },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'cohorts', label: 'Cohorts', icon: CalendarDays },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'learners', label: 'Learners', icon: GraduationCap },
  { key: 'reviews', label: 'Reviews', icon: ClipboardCheck },
  { key: 'hub', label: 'Prestige', icon: Repeat },
  { key: 'support', label: 'Support', icon: LifeBuoy },
  { key: 'agents', label: 'Agents', icon: Bot },
  { key: 'connections', label: 'Connections', icon: Plug },
  { key: 'team', label: 'Team', icon: UsersRound },
];

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function StudioPage({ section, tab, editing, onNavigate, openPath }: StudioPageProps) {
  const { session, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useTeamRole();
  const [courses, setCourses] = useState<TeamCourseRow[] | null>(null);
  const [learners, setLearners] = useState<LearnerRow[] | null>(null);
  const [newApplications, setNewApplications] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [courseRows, learnerRows] = await Promise.all([loadTeamCourses(), loadLearners()]);
      setCourses(courseRows);
      setLearners(learnerRows);
    } catch (err) {
      setError(errorMessage(err));
    }
    // The applications queue is its own surface: a failure there must not blank the studio.
    try {
      const pending = await loadApplications('new', 'all');
      setNewApplications(pending.length);
    } catch {
      setNewApplications(null);
    }
  }, []);

  useEffect(() => {
    if (role) void refresh();
  }, [role, refresh]);

  if (authLoading || roleLoading) {
    return (
      <LmsShell active="studio" onNavigate={onNavigate}>
        <div className="mx-auto max-w-[1312px] px-6"><Loading /></div>
      </LmsShell>
    );
  }

  if (!session || !role) {
    return (
      <LmsShell active="studio" onNavigate={onNavigate}>
        <div className="mx-auto max-w-[1312px] px-4 py-14 sm:px-6">
          <EmptyState
            title="The studio is for the Breadmaker team"
            body={session ? 'Your account is not on the team. Ask an owner to add you.' : 'Sign in with your team account to manage courses and learners.'}
            action={session ? <Button onClick={() => onNavigate('dashboard')}>Go to my learning</Button> : <Button onClick={() => onNavigate('signin')}>Sign in</Button>}
          />
        </div>
      </LmsShell>
    );
  }

  const canEdit = role === 'Owner' || role === 'Coach';
  const isActive = (key: StudioSection) => section === key || (key === 'products' && section === 'courses') || (key === 'applications' && section === 'leak-test');
  const go = (next: StudioSection) => openPath(next === 'overview' ? '/studio' : `/studio/${next}`);

  const toItem = (key: StudioSection) => {
    const item = NAV.find((entry) => entry.key === key)!;
    return { key: item.key, label: item.label, icon: item.icon, active: isActive(item.key), onClick: () => go(item.key) };
  };
  const groups: SidebarGroup[] = [
    { items: [toItem('overview')] },
    { label: 'People', items: (['applications', 'learners', 'reviews', 'cohorts', 'support'] as StudioSection[]).map(toItem) },
    { label: 'Business', items: (['products', 'payments', 'hub'] as StudioSection[]).map(toItem) },
    { label: 'Team', items: [toItem('agents'), toItem('connections'), toItem('team')] },
  ];

  return (
    <LmsShell active="studio" onNavigate={onNavigate} wide hideNav headerMobileOnly drawerTitle="Studio" drawerGroups={groups}>
      <DashboardFrame groups={groups} onNavigate={onNavigate}>
        <main className="min-w-0">
          {error && <div className="mb-6"><Notice tone="error">{error}</Notice></div>}

          {(section === 'courses' || section === 'products') && (editing === 'leak-test' || editing === 'prestige') ? (
            <PricingProduct kind={editing} canEdit={canEdit} go={go} openPath={openPath} />
          ) : (section === 'courses' || section === 'products') && editing ? (
            <CourseEditor
              key={editing}
              courseId={editing === 'new' ? undefined : editing}
              canEdit={canEdit}
              openPath={openPath}
              onClose={(changed) => {
                if (changed) void refresh();
                openPath('/studio/products');
              }}
            />
          ) : section === 'courses' || section === 'products' ? (
            <ProductsSection courses={courses} canEdit={canEdit} openPath={openPath} />
          ) : section === 'applications' || section === 'leak-test' ? (
            <SubmissionsSection tab={section === 'leak-test' ? 'leak-test' : tab} courses={courses} canEdit={canEdit} onChanged={refresh} openPath={openPath} />
          ) : section === 'payments' ? (
            <PaymentsSection canEdit={canEdit} />
          ) : section === 'cohorts' ? (
            <CohortsSection canEdit={canEdit} />
          ) : section === 'learners' ? (
            <LearnersSection learners={learners} courses={courses} canEdit={canEdit} onChanged={refresh} />
          ) : section === 'reviews' ? (
            <ReviewsSection canEdit={canEdit} />
          ) : section === 'hub' ? (
            <HubSection canEdit={canEdit} />
          ) : section === 'support' ? (
            <SupportSection canEdit={canEdit} />
          ) : section === 'agents' ? (
            <AgentRunsSection editing={editing} openPath={openPath} />
          ) : section === 'connections' ? (
            <ConnectionsSection />
          ) : section === 'team' ? (
            <TeamSection role={role} />
          ) : (
            <OverviewSection courses={courses} learners={learners} newApplications={newApplications} go={go} />
          )}
        </main>
      </DashboardFrame>
    </LmsShell>
  );
}

function SectionHeader({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">{title}</h1>
        {body && <p className="mt-2 max-w-[620px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">{body}</p>}
      </div>
      {action}
    </div>
  );
}

function OverviewSection({
  courses,
  learners,
  newApplications,
  go,
}: {
  courses: TeamCourseRow[] | null;
  learners: LearnerRow[] | null;
  newApplications: number | null;
  go: (s: StudioSection) => void;
}) {
  if (!courses || !learners) return <Loading />;
  const published = courses.filter((course) => course.status === 'Published').length;
  const learnerIds = new Set(learners.map((row) => row.userId));
  const enrollments = learners.filter((row) => row.enrolled).length;
  const active = learners.filter((row) => row.lastActivityAt && Date.now() - new Date(row.lastActivityAt).getTime() < 7 * 86400000);
  const avg = learners.length
    ? Math.round(learners.reduce((sum, row) => sum + (row.totalLessons ? row.completedLessons / row.totalLessons : 0), 0) / learners.length * 100)
    : 0;

  const metrics = [
    {
      label: 'New applications',
      value: newApplications ?? '—',
      sub: newApplications ? 'waiting on a first reply' : 'nothing unread',
      to: 'applications' as StudioSection,
    },
    { label: 'Published courses', value: published, sub: `${courses.length - published} in draft` },
    { label: 'Learners', value: learnerIds.size, sub: `${enrollments} ${enrollments === 1 ? 'enrollment' : 'enrollments'}` },
    { label: 'Active this week', value: new Set(active.map((row) => row.userId)).size, sub: 'completed a session in 7 days' },
    { label: 'Average completion', value: `${avg}%`, sub: 'across all learners' },
  ];

  return (
    <div>
      <SectionHeader title="Overview" body="How the funnel is converting, who is enrolled, who is moving, and who has gone quiet." />
      <LaunchMetrics />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <button
            key={metric.label}
            onClick={() => metric.to && go(metric.to)}
            className={`${CARD} p-6 text-left ${metric.to ? 'cursor-pointer transition hover:-translate-y-0.5' : 'cursor-default'}`}
          >
            <p className="font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">{metric.label}</p>
            <p className="mt-2 font-editorial text-[36px] font-semibold leading-none">{metric.value}</p>
            <p className="mt-2 text-[13px] text-[var(--pg-body)]">{metric.sub}</p>
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between">
            <h2 className="font-editorial text-[22px] font-semibold">Courses</h2>
            <button onClick={() => go('products')} className="text-[14px] font-medium text-[var(--pg-accent)] hover:underline cursor-pointer">Manage</button>
          </div>
          <ul className="mt-4 divide-y divide-[var(--pg-line-soft)]">
            {courses.map((course) => (
              <li key={course.id} className="py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{course.title}</span>
                  <span className="text-[13px] text-[var(--pg-body)]">{course.learners} {course.learners === 1 ? 'learner' : 'learners'}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar value={course.avgCompletion} />
                  <span className="w-10 text-right text-[13px] text-[var(--pg-body)]">{course.avgCompletion}%</span>
                </div>
              </li>
            ))}
            {courses.length === 0 && <li className="py-4 text-[14.5px] text-[var(--pg-body)]">No courses yet.</li>}
          </ul>
        </div>

        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between">
            <h2 className="font-editorial text-[22px] font-semibold">Needs a nudge</h2>
            <button onClick={() => go('learners')} className="text-[14px] font-medium text-[var(--pg-accent)] hover:underline cursor-pointer">All learners</button>
          </div>
          <p className="mt-1 text-[13.5px] text-[var(--pg-body)]">Enrolled, and no session completed in the last 7 days.</p>
          <ul className="mt-4 divide-y divide-[var(--pg-line-soft)]">
            {learners
              .filter((row) => row.enrolled && (!row.lastActivityAt || Date.now() - new Date(row.lastActivityAt).getTime() >= 7 * 86400000))
              .slice(0, 8)
              .map((row) => (
                <li key={`${row.userId}-${row.courseId}`} className="flex items-center justify-between gap-3 py-3 text-[14.5px]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{row.fullName || row.email}</span>
                    <span className="block truncate text-[13px] text-[var(--pg-body)]">{row.courseTitle}</span>
                  </span>
                  <span className="shrink-0 text-[13px] text-[var(--pg-body)]">{row.lastActivityAt ? `Last ${formatDate(row.lastActivityAt)}` : 'Not started'}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

type ProductCategory = 'Builds' | 'Courses' | 'Other';
const PRODUCT_CATEGORIES: ProductCategory[] = ['Builds', 'Courses', 'Other'];

/** The saved category: Launchpad and Foundry are builds (run as cohorts), kits and courses are courses, anything else is other. */
const productCategory = (course: TeamCourseRow): ProductCategory => {
  if (course.category === 'build') return 'Builds';
  if (course.category === 'other') return 'Other';
  return 'Courses';
};

/** A column heading that doubles as a filter: it reads as the label until a value is chosen. */
function HeaderFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (next: string) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={`Filter by ${label.toLowerCase()}`}
      className={`cursor-pointer rounded-md bg-transparent py-1 pr-1 font-label text-[11px] font-medium uppercase tracking-[0.06em] hover:text-[var(--pg-ink)] ${
        value === 'All' ? 'text-[var(--pg-body)]' : 'text-[var(--pg-accent)]'
      }`}
    >
      <option value="All">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function ProductsSection({ courses, canEdit, openPath }: { courses: TeamCourseRow[] | null; canEdit: boolean; openPath: (p: string) => void }) {
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All');
  const [newestFirst, setNewestFirst] = useState(true);
  if (!courses) return <Loading />;

  const statuses: string[] = ['Published', 'Draft'];
  const shown = courses
    .filter((c) => (category === 'All' || productCategory(c) === category) && (status === 'All' || c.status === status))
    .sort((a, b) => {
      const diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return newestFirst ? -diff : diff;
    });
  const filtered = category !== 'All' || status !== 'All';

  return (
    <div>
      <SectionHeader
        title="Products"
        body="Launchpad and Foundry (builds), and anything else you add. Builds are sold on their own pages by level and joined through an application."
        action={canEdit && <Button onClick={() => openPath('/studio/products/new')}><Plus className="h-4 w-4" /> New Product</Button>}
      />

      {shown.length === 0 && !(category === 'All' || category === 'Other') ? (
        <EmptyState
          title="Nothing here"
          body={filtered ? 'No product matches these filters.' : 'Create the first product to start building its syllabus.'}
          action={filtered ? <Button variant="ghost" onClick={() => { setCategory('All'); setStatus('All'); }}>Clear filters</Button> : undefined}
        />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-[820px] text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-[var(--pg-line)] font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">
                <th className="px-6 py-4 font-medium">Product</th>
                <th className="px-4 py-4 font-medium">
                  <HeaderFilter label="Category" value={category} options={PRODUCT_CATEGORIES} onChange={setCategory} />
                </th>
                <th className="px-4 py-4 font-medium">
                  <HeaderFilter label="Status" value={status} options={statuses} onChange={setStatus} />
                </th>
                <th className="px-4 py-4 font-medium">Sessions</th>
                <th className="px-4 py-4 font-medium">Access</th>
                <th className="px-4 py-4 font-medium">Learners</th>
                <th className="px-4 py-4 font-medium" aria-sort={newestFirst ? 'descending' : 'ascending'}>
                  <button
                    onClick={() => setNewestFirst((value) => !value)}
                    className="inline-flex items-center gap-1.5 uppercase tracking-[0.06em] hover:text-[var(--pg-ink)] cursor-pointer"
                    title={newestFirst ? 'Newest first. Click for oldest first.' : 'Oldest first. Click for newest first.'}
                  >
                    Updated {newestFirst ? <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--pg-line-soft)]">
              {shown.map((course) => {
                const group = productCategory(course);
                const byLevel = course.program === 'launchpad' || course.program === 'foundry';
                return (
                  <tr key={course.id} onClick={() => openPath(`/studio/products/${group.toLowerCase()}/${course.id}`)} className="cursor-pointer hover:bg-[var(--pg-alt)]/60">
                    <td className="px-6 py-4">
                      <span className="font-medium">{course.title}</span>
                    </td>
                    <td className="px-4 py-4"><Chip tone={group === 'Builds' ? 'accent' : 'neutral'}>{group === 'Other' ? 'Other' : group.replace(/s$/, '')}</Chip></td>
                    <td className="px-4 py-4"><Chip tone={course.status === 'Published' ? 'accent' : 'neutral'}>{course.status}</Chip></td>
                    <td className="px-4 py-4">{course.lessonCount} in {course.moduleCount} modules</td>
                    <td className="px-4 py-4">{byLevel ? 'By level' : formatPrice(course.priceMinor, course.currency) ?? 'Not on sale'}</td>
                    <td className="px-4 py-4">{course.learners}</td>
                    <td className="px-4 py-4 text-[var(--pg-body)]">{formatDate(course.updatedAt)}</td>
                  </tr>
                );
              })}
              {(category === 'All' || category === 'Other') && (status === 'All' || status === 'Published') &&
                [
                  { key: 'leak-test', title: 'Business Leak Test', access: 'Free, paid report' },
                  { key: 'prestige', title: 'Breadmaker Prestige', access: 'Monthly membership' },
                ].map((product) => (
                  <tr key={product.key} onClick={() => openPath(`/studio/products/other/${product.key}`)} className="cursor-pointer hover:bg-[var(--pg-alt)]/60">
                    <td className="px-6 py-4"><span className="font-medium">{product.title}</span></td>
                    <td className="px-4 py-4"><Chip>Other</Chip></td>
                    <td className="px-4 py-4"><Chip tone="accent">Published</Chip></td>
                    <td className="px-4 py-4 text-[var(--pg-body)]">—</td>
                    <td className="px-4 py-4">{product.access}</td>
                    <td className="px-4 py-4 text-[var(--pg-body)]">—</td>
                    <td className="px-4 py-4 text-[var(--pg-body)]">—</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A product that is not a course: its page is the pricing for it, with a link to its people. */
function PricingProduct({ kind, canEdit, go, openPath }: { kind: 'leak-test' | 'prestige'; canEdit: boolean; go: (s: StudioSection) => void; openPath: (p: string) => void }) {
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const leak = kind === 'leak-test';
  return (
    <div>
      <button onClick={() => openPath('/studio/products')} className="mb-4 inline-flex items-center gap-2 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Products
      </button>
      <SectionHeader
        title={leak ? 'Business Leak Test' : 'Breadmaker Prestige'}
        body={leak ? 'The free test and the paid report. Set the report prices and the launch discount here; checkout reads them from the database.' : 'The monthly membership. Set the price, discount and what members see here; checkout reads it from the database.'}
        action={<Button variant="ghost" onClick={() => go(leak ? 'leak-test' : 'hub')}>{leak ? 'See the results' : 'See members and waitlist'}</Button>}
      />
      {note && <div className="mb-6"><Notice tone={note.tone}>{note.text}</Notice></div>}
      {leak ? <LeakTestPricing bare canEdit={canEdit} onMessage={(tone, text) => setNote({ tone, text })} /> : <PrestigePricing canEdit={canEdit} />}
    </div>
  );
}

const SUBMISSION_TABS = [
  { key: 'launchpad', label: 'Launchpad' },
  { key: 'foundry', label: 'Foundry' },
  { key: 'leak-test', label: 'Leak Test' },
];

/** Everything people send us through a form: Launchpad bookings, Foundry applications and Leak Test takers. */
function SubmissionsSection({ tab, courses, canEdit, onChanged, openPath }: { tab?: string; courses: TeamCourseRow[] | null; canEdit: boolean; onChanged: () => Promise<void>; openPath: (p: string) => void }) {
  const current = SUBMISSION_TABS.some((item) => item.key === tab) ? (tab as string) : 'launchpad';
  return (
    <div>
      <SectionHeader title="Applications" body="Everyone who sent us a form: Launchpad bookings, Foundry applications and Leak Test takers." />
      <div className="mb-6 flex flex-wrap gap-1 rounded-full bg-[var(--pg-alt)] p-1 w-fit" role="tablist" aria-label="Applications">
        {SUBMISSION_TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={current === item.key}
            onClick={() => openPath(`/studio/applications/${item.key}`)}
            className={`rounded-full px-5 py-2 text-[14px] font-medium transition-colors cursor-pointer ${
              current === item.key ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'hover:bg-[var(--pg-card)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {current === 'leak-test' ? (
        <LeakTestSection canEdit={canEdit} embedded />
      ) : (
        <ApplicationsSection courses={courses} canEdit={canEdit} onChanged={onChanged} programFilter={current} embedded />
      )}
    </div>
  );
}

function LearnersSection({
  learners,
  courses,
  canEdit,
  onChanged,
}: {
  learners: LearnerRow[] | null;
  courses: TeamCourseRow[] | null;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [form, setForm] = useState({ email: '', courseId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (learners ?? []).filter(
      (row) =>
        (courseFilter === 'all' || row.courseId === courseFilter) &&
        (!needle || row.email.toLowerCase().includes(needle) || (row.fullName ?? '').toLowerCase().includes(needle)),
    );
  }, [learners, query, courseFilter]);

  if (!learners || !courses) return <Loading />;

  const enroll = async (event: React.FormEvent) => {
    event.preventDefault();
    const courseId = form.courseId || courses[0]?.id;
    if (!form.email.trim() || !courseId) return;
    setBusy(true);
    setMessage(null);
    try {
      await enrollByEmail(form.email, courseId, form.note);
      setMessage({ tone: 'success', text: `${form.email.trim()} is enrolled.` });
      setForm({ email: '', courseId, note: '' });
      await onChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const unenroll = async (row: LearnerRow) => {
    if (!window.confirm(`Remove ${row.email} from ${row.courseTitle}? Their progress is kept.`)) return;
    setMessage(null);
    try {
      await removeEnrollment(row.userId, row.courseId);
      await onChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  };

  return (
    <div>
      <SectionHeader title="Learners" body="Enroll people once they are accepted and paid. They need an account first: ask them to sign up with the same email." />

      {canEdit && (
        <form onSubmit={enroll} className={`${CARD} mb-6 grid gap-4 p-6 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end`}>
          <Field label="Learner email">
            <TextInput type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
          </Field>
          <Field label="Course">
            <Select value={form.courseId || courses[0]?.id || ''} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Pilot cohort, paid" />
          </Field>
          <Button type="submit" busy={busy}>Enroll</Button>
          {message && <div className="md:col-span-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
        </form>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pg-body)]" />
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" className="pl-10" />
        </div>
        <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="max-w-[260px]">
          <option value="all">All courses</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>{course.title}</option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No learners yet" body={learners.length ? 'No learners match this search.' : 'Enrolled learners and anyone with progress appear here.'} />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-[760px] text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-[var(--pg-line)] font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">
                <th className="px-6 py-4 font-medium">Learner</th>
                <th className="px-4 py-4 font-medium">Course</th>
                <th className="px-4 py-4 font-medium">Progress</th>
                <th className="px-4 py-4 font-medium">Last activity</th>
                <th className="px-4 py-4 font-medium">Enrolled</th>
                {canEdit && <th className="px-4 py-4" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--pg-line-soft)]">
              {filtered.map((row) => {
                const pct = row.totalLessons ? Math.round((row.completedLessons / row.totalLessons) * 100) : 0;
                return (
                  <tr key={`${row.userId}-${row.courseId}`}>
                    <td className="px-6 py-4">
                      <span className="block font-medium">{row.fullName || '—'}</span>
                      <span className="text-[13px] text-[var(--pg-body)]">{row.email}</span>
                    </td>
                    <td className="px-4 py-4">{row.courseTitle}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <ProgressBar value={pct} className="w-28" />
                        <span className="text-[13px] text-[var(--pg-body)]">{row.completedLessons}/{row.totalLessons}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[var(--pg-body)]">{formatDate(row.lastActivityAt)}</td>
                    <td className="px-4 py-4">{row.enrolled ? formatDate(row.enrolledAt) : <Chip>Free access</Chip>}</td>
                    {canEdit && (
                      <td className="px-4 py-4 text-right">
                        {row.enrolled && (
                          <button onClick={() => unenroll(row)} className="rounded-full p-2 text-[var(--pg-body)] hover:bg-[var(--pg-alt)] hover:text-[#B42318] cursor-pointer" aria-label={`Remove ${row.email} from ${row.courseTitle}`} title="Remove enrollment">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ROLE_HELP: Record<TeamRole, string> = {
  Owner: 'Everything, including the team.',
  Coach: 'Edits courses and enrolls learners.',
  Support: 'Reads courses and learner progress.',
};

function TeamSection({ role }: { role: TeamRole }) {
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamMemberRow[] | null>(null);
  const [form, setForm] = useState<{ email: string; role: TeamRole }>({ email: '', role: 'Coach' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const isOwner = role === 'Owner';

  const refresh = useCallback(async () => {
    try {
      setTeam(await loadTeam());
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: 'success', text: success });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Team" body="Who can open the studio. People need a Breadmaker account before you add them." />

      {isOwner && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => setTeamMember(form.email, form.role), `${form.email.trim()} is now ${form.role === 'Owner' ? 'an' : 'a'} ${form.role}.`).then(() =>
              setForm((current) => ({ ...current, email: '' })),
            );
          }}
          className={`${CARD} mb-6 grid gap-4 p-6 md:grid-cols-[1.4fr_1fr_auto] md:items-end`}
        >
          <Field label="Email">
            <TextInput type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
          </Field>
          <Field label="Role" hint={ROLE_HELP[form.role]}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as TeamRole })}>
              <option value="Owner">Owner</option>
              <option value="Coach">Coach</option>
              <option value="Support">Support</option>
            </Select>
          </Field>
          <Button type="submit" busy={busy} className="md:mb-5">Add to team</Button>
        </form>
      )}

      {message && <div className="mb-6"><Notice tone={message.tone}>{message.text}</Notice></div>}

      {!team ? (
        <Loading />
      ) : (
        <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
          {team.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-4 px-6 py-4">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{member.fullName || member.email}{member.userId === user?.id && ' (you)'}</span>
                <span className="text-[13px] text-[var(--pg-body)]">{member.email}</span>
              </span>
              {isOwner ? (
                <Select
                  value={member.role}
                  disabled={busy}
                  onChange={(e) => void run(() => setTeamMember(member.email, e.target.value as TeamRole), `${member.email} is now ${e.target.value}.`)}
                  className="max-w-[140px]"
                  aria-label={`Role for ${member.email}`}
                >
                  <option value="Owner">Owner</option>
                  <option value="Coach">Coach</option>
                  <option value="Support">Support</option>
                </Select>
              ) : (
                <Chip>{member.role}</Chip>
              )}
              {isOwner && (
                <button
                  onClick={() => {
                    if (window.confirm(`Remove ${member.email} from the team?`)) void run(() => removeTeamMember(member.userId), `${member.email} was removed.`);
                  }}
                  className="rounded-full p-2 text-[var(--pg-body)] hover:bg-[var(--pg-alt)] hover:text-[#B42318] cursor-pointer"
                  aria-label={`Remove ${member.email}`}
                  title="Remove from team"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
