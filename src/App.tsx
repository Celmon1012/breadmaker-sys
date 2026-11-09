import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Route } from './types';
import { useAuth } from './context/AuthContext';
import SiteHeader from './components/SiteHeader';
import { ProgramFooter } from './components/program-ui';
import HomePage from './components/HomePage';
import AboutPage from './components/AboutPage';
import LocationPrompt from './components/LocationPrompt';
import ContactPage from './components/ContactPage';
import { DpaPage, PrivacyPage, TermsPage } from './components/LegalPages';
import NotFoundPage from './components/NotFoundPage';
import UnsubscribePage from './components/UnsubscribePage';
import { findGuide } from './lib/guides';
import type { StudioSection } from './components/lms/StudioPage';

// Everything except the home and about pages loads on demand, so first-time visitors download less.
const FoundryLandingPage = lazy(() => import('./components/FoundryLandingPage'));
const LaunchpadLandingPage = lazy(() => import('./components/LaunchpadLandingPage'));
const PaymentCallbackPage = lazy(() => import('./components/PaymentCallbackPage'));
const HubPage = lazy(() => import('./components/HubPage'));
const PartnerApplyPage = lazy(() => import('./components/PartnerApplyPage'));
const SigninPage = lazy(() => import('./components/SigninPage'));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage'));
const AuthConfirmPage = lazy(() => import('./components/AuthConfirmPage'));
const CourseDetailPage = lazy(() => import('./components/lms/CourseDetailPage'));
const LessonPlayerPage = lazy(() => import('./components/lms/LessonPlayerPage'));
const LearnerDashboardPage = lazy(() => import('./components/lms/LearnerDashboardPage'));
const CoursesPage = lazy(() => import('./components/lms/CoursesPage'));
const ProfilePage = lazy(() => import('./components/lms/ProfilePage'));
const PrestigeServicesPage = lazy(() => import('./components/lms/PrestigeServicesPage'));
const SupportPage = lazy(() => import('./components/lms/SupportPage'));
const BillingPage = lazy(() => import('./components/lms/BillingPage'));
const ReferralsPage = lazy(() => import('./components/lms/ReferralsPage'));
const EnquiriesPage = lazy(() => import('./components/lms/EnquiriesPage'));
const LeakTestPage = lazy(() => import('./components/LeakTestPage'));
const GuidesPage = lazy(() => import('./components/GuidesPage'));
const ToolsPage = lazy(() => import('./components/ToolsPage'));
const StudioPage = lazy(() => import('./components/lms/StudioPage'));
const MyFunnelPage = lazy(() => import('./components/lms/MyFunnelPage'));
const AgentsPage = lazy(() => import('./components/lms/AgentsPage'));
const MyAgentsPage = lazy(() => import('./components/lms/MyAgentsPage'));
const IntegrationsPage = lazy(() => import('./components/lms/IntegrationsPage'));
const TemplatesPage = lazy(() => import('./components/lms/TemplatesPage'));
const AnalyticsPage = lazy(() => import('./components/lms/AnalyticsPage'));
const FunnelBriefPage = lazy(() => import('./components/FunnelBriefPage'));

const ROUTES: Route[] = [
  'home', 'about', 'membership', 'contact', 'terms', 'privacy', 'dpa', 'foundry', 'launchpad', 'guides', 'tools', 'leak-test', 'unsubscribe',
  'apply', 'payment', 'signin', 'reset-password', 'auth', 'dashboard', 'account', 'profile', 'billing', 'referrals', 'enquiries', 'funnel', 'agents', 'integrations', 'templates', 'analytics', 'support', 'my-membership', 'courses', 'course', 'build', 'learn', 'studio',
];

// Pages that render their own header and footer; the rest get SiteHeader and ProgramFooter.
const OWN_CHROME_ROUTES: Route[] = [
  'home', 'foundry', 'launchpad', 'leak-test', 'apply', 'payment', 'signin', 'reset-password', 'auth',
  'dashboard', 'account', 'profile', 'billing', 'referrals', 'enquiries', 'funnel', 'agents', 'integrations', 'templates', 'analytics', 'support', 'my-membership', 'courses', 'course', 'build', 'learn', 'studio',
];

export default function App() {
  // The first path segment picks the page; the rest are its parameters (e.g. /learn/<course>/<lesson>).
  const readPath = () => {
    const parts = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    // The application forms are sections of the program pages now. /launchpad/apply, /foundry/apply and the
    // old /apply/<program> links all go to /<program>#apply.
    const applyProgram =
      parts[0] === 'apply' ? (parts[1] === 'launchpad' ? 'launchpad' : 'foundry') : (parts[0] === 'launchpad' || parts[0] === 'foundry') && parts[1] === 'apply' ? parts[0] : null;
    if (applyProgram) {
      window.history.replaceState({}, '', `/${applyProgram}${window.location.search}#apply`);
      return [applyProgram];
    }
    // The public membership page lives at /membership. The old /hub and /prestige addresses come here.
    if (parts[0] === 'hub' || parts[0] === 'prestige') {
      const next = ['membership', ...parts.slice(1)];
      window.history.replaceState({}, '', `/${next.join('/')}${window.location.search}${window.location.hash}`);
      return next;
    }
    // The builds library is part of the dashboard now.
    if (parts[0] === 'builds') {
      window.history.replaceState({}, '', '/dashboard');
      return ['dashboard'];
    }
    // The Systems page is gone, and only builds remain: those addresses go to the home page and the builds list.
    if (parts[0] === 'systems') {
      window.history.replaceState({}, '', '/');
      return [];
    }
    // Old build links (/course/foundry) now live under /build.
    if (parts[0] === 'course' && parts[1] && ['foundry', 'launchpad'].includes(parts[1])) {
      const next = ['build', parts[1], ...parts.slice(2)];
      window.history.replaceState({}, '', `/${next.join('/')}${window.location.search}${window.location.hash}`);
      return next;
    }
    return parts;
  };
  const [segments, setSegments] = useState<string[]>(readPath);
  const first = segments[0] || 'home';
  const route: Route | null = ROUTES.includes(first as Route) ? (first as Route) : null;
  const routeParams = segments.slice(1);

  /** Navigates to an app path such as "/course/foundry". */
  const openPath = (path: string) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    window.history.pushState({}, '', target);
    setSegments(readPath());
  };

  const setRoute = (newRoute: Route) => openPath(newRoute === 'home' ? '/' : `/${newRoute}`);

  useEffect(() => {
    const handlePopState = () => setSegments(readPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const { session, loading: authLoading } = useAuth();
  const isAuthenticated = !!session;
  // Where to return after signing in, as an app path (e.g. "/learn/foundry/<lesson>").
  const [intendedPath, setIntendedPath] = useState<string | null>(null);

  // Direct URL loads of signed-in pages go through sign-in first.
  useEffect(() => {
    if (authLoading) return;
    if ((route === 'dashboard' || route === 'account' || route === 'profile' || route === 'billing' || route === 'referrals' || route === 'enquiries' || route === 'funnel' || route === 'agents' || route === 'integrations' || route === 'templates' || route === 'analytics') && !isAuthenticated) {
      setIntendedPath(window.location.pathname);
      setRoute('signin');
    }
  }, [route, isAuthenticated, authLoading]);

  // Remember the page a visitor was on when they chose to sign in from it.
  const previousPath = useRef<string>('/');
  useEffect(() => {
    if (route !== 'signin') previousPath.current = window.location.pathname;
    else if (!intendedPath && ['course', 'build', 'learn', 'courses', 'studio'].includes(previousPath.current.split('/')[1])) {
      setIntendedPath(previousPath.current);
    }
  }, [segments.join('/')]);

  const handleSignIn = () => {
    if (intendedPath) {
      openPath(intendedPath);
      setIntendedPath(null);
    } else {
      setRoute('dashboard');
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [segments.join('/')]);

  const ownChrome = route !== null && (OWN_CHROME_ROUTES.includes(route) || (route === 'membership' && routeParams[0] === 'apply'));

  return (
    <div className="min-h-screen bg-[#F5F1E6] antialiased">
      {!ownChrome && <SiteHeader onNavigate={setRoute} />}

      <main>
        <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
        {route === 'home' && <HomePage onNavigate={setRoute} openPath={openPath} />}
        {route === 'foundry' && <FoundryLandingPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'launchpad' && (routeParams[0] === 'brief' && routeParams[1] ? <FunnelBriefPage token={routeParams[1]} onNavigate={setRoute} /> : <LaunchpadLandingPage onNavigate={setRoute} openPath={openPath} />)}
        {route === 'funnel' && isAuthenticated && <MyFunnelPage onNavigate={setRoute} openPath={openPath} token={routeParams[0]} />}
        {route === 'agents' && isAuthenticated && (routeParams[0] === 'mine' ? <MyAgentsPage onNavigate={setRoute} openPath={openPath} id={routeParams[1]} /> : <AgentsPage onNavigate={setRoute} openPath={openPath} id={routeParams[0]} />)}
        {route === 'integrations' && isAuthenticated && <IntegrationsPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'analytics' && isAuthenticated && <AnalyticsPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'templates' && isAuthenticated && <TemplatesPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'leak-test' && <LeakTestPage onNavigate={setRoute} openPath={openPath} section={routeParams[0]} />}
        {route === 'tools' && <ToolsPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'guides' && (routeParams[0] && !findGuide(routeParams[0]) ? (
          <NotFoundPage onNavigate={setRoute} />
        ) : (
          <GuidesPage slug={routeParams[0]} onNavigate={setRoute} openPath={openPath} />
        ))}
        {route === 'payment' && <PaymentCallbackPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'about' && <AboutPage onNavigate={setRoute} />}
        {route === 'membership' && (routeParams[0] === 'apply' ? <PartnerApplyPage onNavigate={setRoute} /> : <HubPage onNavigate={setRoute} openPath={openPath} />)}
        {route === 'unsubscribe' && <UnsubscribePage onNavigate={setRoute} />}
        {route === 'contact' && <ContactPage onNavigate={setRoute} />}
        {route === 'terms' && <TermsPage onNavigate={setRoute} />}
        {route === 'privacy' && <PrivacyPage onNavigate={setRoute} />}
        {route === 'dpa' && <DpaPage onNavigate={setRoute} />}
        {route === 'signin' && <SigninPage onNavigate={setRoute} onSignIn={handleSignIn} />}
        {route === 'reset-password' && <ResetPasswordPage onNavigate={setRoute} />}
        {route === 'auth' && routeParams[0] === 'confirm' && <AuthConfirmPage onNavigate={setRoute} />}
        {route === 'dashboard' && isAuthenticated && <LearnerDashboardPage onNavigate={setRoute} openPath={openPath} />}
        {(route === 'account' || route === 'profile') && isAuthenticated && <ProfilePage onNavigate={setRoute} />}
        {route === 'courses' && isAuthenticated && <CoursesPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'my-membership' && isAuthenticated && <PrestigeServicesPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'support' && isAuthenticated && <SupportPage onNavigate={setRoute} />}
        {route === 'billing' && isAuthenticated && <BillingPage onNavigate={setRoute} openPath={openPath} />}
        {route === 'referrals' && isAuthenticated && <ReferralsPage onNavigate={setRoute} />}
        {route === 'enquiries' && isAuthenticated && <EnquiriesPage onNavigate={setRoute} />}
        {route === 'course' && (routeParams[0] ? (
          <CourseDetailPage slug={routeParams[0]} onNavigate={setRoute} openPath={openPath} />
        ) : (
          <LearnerDashboardPage onNavigate={setRoute} openPath={openPath} />
        ))}
        {route === 'build' && (routeParams[0] ? (
          <CourseDetailPage slug={routeParams[0]} onNavigate={setRoute} openPath={openPath} />
        ) : (
          <LearnerDashboardPage onNavigate={setRoute} openPath={openPath} />
        ))}
        {route === 'learn' && routeParams[0] && routeParams[1] && (
          <LessonPlayerPage slug={routeParams[0]} lessonId={routeParams[1]} onNavigate={setRoute} openPath={openPath} />
        )}
        {route === 'studio' && (
          <StudioPage
            tab={routeParams[0] === 'applications' ? routeParams[1] : undefined}
            section={(['applications', 'payments', 'cohorts', 'products', 'courses', 'learners', 'reviews', 'leak-test', 'hub', 'support', 'agents', 'runs', 'connections', 'team'].includes(routeParams[0]) ? (routeParams[0] === 'runs' ? 'agents' : routeParams[0]) : 'overview') as StudioSection}
            editing={routeParams[0] === 'products' ? (routeParams[1] === 'new' ? 'new' : routeParams[2] ?? null) : routeParams[0] === 'courses' ? routeParams[1] ?? null : (routeParams[0] === 'runs' || routeParams[0] === 'agents') ? (routeParams[1] ? routeParams[1] + (routeParams[2] ? '/' + routeParams[2] : '') : null) : null}
            onNavigate={setRoute}
            openPath={openPath}
          />
        )}
        {(route === null || (route === 'learn' && !(routeParams[0] && routeParams[1])) || (route === 'auth' && routeParams[0] !== 'confirm')) && <NotFoundPage onNavigate={setRoute} />}
        </Suspense>
      </main>

      {!ownChrome && <ProgramFooter onNavigate={setRoute} />}
      <LocationPrompt />
    </div>
  );
}
