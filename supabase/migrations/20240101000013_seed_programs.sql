-- Seeds Breadmaker Foundry (30 days, four weeks) and Breadmaker Launchpad (7 days)
-- into the LMS, from "Foundry: Day-30 Scorecard and Curriculum" and the Launchpad
-- landing page. Each course is only seeded when its slug does not exist yet, so
-- re-running never overwrites edits made in the team dashboard.
-- Bracketed values such as [1 business day] are still open decisions.

create or replace function pg_temp.bm_lesson(
  p_course uuid, p_module uuid, p_position integer, p_title text, p_type text, p_minutes integer,
  p_preview boolean, p_body text, p_action text, p_done text
) returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into breadmaker.lms_lessons (course_id, module_id, title, session_type, duration_minutes, position, status, is_preview)
  values (p_course, p_module, p_title, p_type, p_minutes, p_position, 'Published', p_preview)
  returning id into v_id;
  insert into breadmaker.lms_lesson_content (lesson_id, body, action, done_when)
  values (v_id, p_body, p_action, p_done);
end;
$$;

-- ---------------------------------------------------------------------------
-- Breadmaker Foundry

do $$
declare
  c uuid;
  m uuid;
begin
  if exists (select 1 from breadmaker.lms_courses where slug = 'foundry') then
    return;
  end if;

  insert into breadmaker.lms_courses (slug, title, subtitle, description, program, audience, status, price_minor, currency)
  values (
    'foundry',
    'Breadmaker Foundry',
    'Build the system your business runs on, and own every part of it.',
    'A 30-day guided build for technical owner-operators. Four weeks: Frontend, Backend, Automation, and Launch and operate. Every week has three actions, a Monday plan, a Wednesday nudge and a Friday review, and the program ends with a Day-30 scorecard where every core item passes.',
    'foundry',
    'Freelancers, small agency owners and solo founders comfortable with GitHub and a terminal',
    'Published',
    null,
    'usd'
  )
  returning id into c;

  -- Week 1 -----------------------------------------------------------------
  insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
  values (c, 'Week 1: Frontend',
    'By Friday you have a live page on your own domain that explains one offer clearly and captures a real lead into your own database. This week teaches the ship loop the rest of the program depends on: describe a change to Claude Code, review it, push to staging, then promote to production.',
    0,
    array[
      'The site loads over HTTPS on your own domain (scorecard 1)',
      'Three strangers can say what is sold and to whom within 5 seconds (scorecard 2)',
      'The main page and the form work on a phone (scorecard 3)',
      'A form submission creates a row in the leads table and notifies you',
      'A page visit and a lead event both appear in analytics (scorecard 4)',
      'At least one change went from staging to production, and you did it yourself',
      'Your week 2 plan is written with your coach'
    ])
  returning id into m;

  perform pg_temp.bm_lesson(c, m, 0, 'Kickoff', 'live', 90, true,
    'A tour of the console, your repository, staging and production. We run the edit, stage, push loop once end to end so you see the whole path a change takes. You set your day-0 goal and the one number you want in 30 days, and we introduce CLAUDE.md: what the AI may and may not touch in your repository.',
    'Point your domain at your server through Cloudflare, write down your day-0 goal and number, and start your payment-provider application.',
    'Your domain points at your server, your goal is written down, and your payment-provider application is started, since approval can take days.');
  perform pg_temp.bm_lesson(c, m, 1, 'Your offer', 'live', 45, false,
    'Work through who it is for, the problem, what you deliver, the price and the one call to action. We write it together, then you test it with three strangers by message.',
    'Write your offer on one page and save it in your repository.',
    'Your offer is saved in the repository as one page, and three strangers have read it.');
  perform pg_temp.bm_lesson(c, m, 2, 'Build the page', 'working', 60, false,
    'Use Claude Code with your offer page to draft the hero, proof and call-to-action sections. Review the diff before you push, then deploy to staging.',
    'Ship the first version of your landing page to staging.',
    'A staging page that reads clearly on a phone.');
  perform pg_temp.bm_lesson(c, m, 3, 'Capture and track', 'working', 60, false,
    'Add a lead form that writes to Supabase with row-level security on, a thank-you page, and a notification email with a sender check (SPF and DKIM). Add an analytics visit and a lead event.',
    'Submit a test lead through your form.',
    'The test lead lands in your database and reaches your inbox, and both events show in analytics.');
  perform pg_temp.bm_lesson(c, m, 4, 'Launch and review', 'live', 60, false,
    'Promote to production. Read out the 5-second test results and agree one change. Demo the lead flow, mark the week 1 done-when items, and write the week 2 plan together.',
    'Promote your page to production and write your week 2 plan.',
    'Your page is live on your own domain and you have a week 2 plan of three actions.');

  -- Week 2 -----------------------------------------------------------------
  insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
  values (c, 'Week 2: Backend',
    'By Friday your data is structured and secured, a payment completes and lands in your own database, and you can see your leads, customers and payments in one protected view.',
    1,
    array[
      'The tables for leads, customers and payments exist with sensible fields (scorecard 5)',
      'A logged-out request cannot read another user''s data (scorecard 6)',
      'A real or test payment completes and is recorded as paid by a server check, not only by the browser returning (scorecard 7)',
      'You can log in and see leads, customers and payments in one place (scorecard 8)',
      'Secrets sit outside the repository and no live keys are committed',
      'Your week 3 plan is written with your coach'
    ])
  returning id into m;

  perform pg_temp.bm_lesson(c, m, 0, 'Data model', 'live', 75, false,
    'Sketch the tables and how they relate. Have Claude Code write the migration, read the SQL together, and apply it on staging.',
    'Create the tables for leads, customers and payments on staging.',
    'The three tables exist on staging with sensible fields.');
  perform pg_temp.bm_lesson(c, m, 1, 'Security', 'live', 45, false,
    'Write the row-level security policies, set up the admin login, and test as a logged-out user. Use the review checklist on any SQL the AI writes.',
    'Turn on row-level security for every table and run the logged-out test.',
    'A passing logged-out test and a working admin login.');
  perform pg_temp.bm_lesson(c, m, 2, 'Payments', 'working', 75, false,
    'Pick the provider that works in your country and build the checkout. Add the webhook that verifies the payment on the server and marks the record paid, then run a test payment.',
    'Complete one test payment end to end.',
    'A test payment is recorded as paid in your database by the webhook.');
  perform pg_temp.bm_lesson(c, m, 3, 'Admin view', 'working', 60, false,
    'Build the protected page that lists your leads, customers and payments, with filters and a CSV export.',
    'Build your login-protected admin view.',
    'A view you can open and read at a glance.');
  perform pg_temp.bm_lesson(c, m, 4, 'Review and promote', 'live', 60, false,
    'Promote to production, run a payment end to end, mark scorecard items 5 to 8, check a backup exists, and write the week 3 plan.',
    'Promote the backend to production and write your week 3 plan.',
    'The backend is live and you have a week 3 plan of three actions.');

  -- Week 3 -----------------------------------------------------------------
  insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
  values (c, 'Week 3: Automation',
    'By Friday a new lead moves through your pipeline with no manual step, you hear about it within minutes, failures raise an alert, and one AI agent is doing a real task with you approving its output.',
    2,
    array[
      'A new lead triggers a confirmation and a follow-up with no manual step (scorecard 9)',
      'You are notified of a new lead or booking within minutes (scorecard 10)',
      'One AI agent completes a useful task on real input, with a log of what it received and produced (scorecard 11)',
      'A failed job or form error sends you an alert (scorecard 12)',
      'Follow-up messages send from a verified domain and reach the inbox, not spam',
      'Your week 4 plan is written with your coach'
    ])
  returning id into m;

  perform pg_temp.bm_lesson(c, m, 0, 'Journey and trigger', 'live', 75, false,
    'Draw the lead journey as triggers, waits and actions before building anything. Choose the runner, set the trigger on a new lead, and send the first confirmation.',
    'Map your lead journey on one page and wire the trigger.',
    'A trigger that fires and a confirmation that sends.');
  perform pg_temp.bm_lesson(c, m, 1, 'Follow-up', 'working', 60, false,
    'Write the follow-up messages, add the wait and the stop rule for people who already acted, check your sender records, and test.',
    'Automate the follow-up for a new lead.',
    'A follow-up that sends once, on time, and stops when it should.');
  perform pg_temp.bm_lesson(c, m, 2, 'Notify and alert', 'working', 60, false,
    'Add the owner notification and booking link, add an alert for any failed job or form error, then break something on purpose to test it.',
    'Set up owner notifications and failure alerts.',
    'An alert arrives when something fails.');
  perform pg_temp.bm_lesson(c, m, 3, 'AI agent', 'live', 75, false,
    'Pick one task, such as qualifying a lead or drafting a reply. Write the instructions with examples, add the approval step and a log, run it on ten real inputs, and mark what needs fixing.',
    'Build one AI agent on one real task, with your approval before anything is sent.',
    'An agent that completes one task with human approval.');
  perform pg_temp.bm_lesson(c, m, 4, 'Review and promote', 'live', 60, false,
    'Promote to production, run a test lead through the whole journey, mark scorecard items 9 to 12, and write the week 4 plan.',
    'Promote the automation to production and write your week 4 plan.',
    'Automation is live and you have a week 4 plan of three actions.');

  -- Week 4 -----------------------------------------------------------------
  insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
  values (c, 'Week 4: Launch and operate',
    'By Friday the whole system has been tested end to end, you have shown you can roll back a bad change and restore a backup, security is checked, the runbook is written, and your Day-30 scorecard passes.',
    3,
    array[
      'At least 3 changes went from staging to production using the edit, stage, push loop (scorecard 13)',
      'You rolled back a bad change once (scorecard 14)',
      'A backup was restored to a test copy (scorecard 15)',
      'Uptime checks and an alert channel are set up (scorecard 16)',
      '2FA is on GitHub, Cloudflare and the console, no secrets are in the repository, and the guardrails are still on (scorecard 17)',
      'A one-page runbook explains how to deploy, roll back, restore and get help (scorecard 18)',
      'You have chosen continue, move, or export for the server (scorecard 19)',
      'The day-0 target and the actual result are both written down (scorecard 20)'
    ])
  returning id into m;

  perform pg_temp.bm_lesson(c, m, 0, 'Full test', 'live', 90, false,
    'Walk the whole journey as a customer on a phone and a computer: a visit, a lead, a follow-up, a payment and the admin view. List every problem, rank them, and fix the top three.',
    'Test the whole journey end to end and fix the biggest problems.',
    'A ranked fix list with the top three fixed.');
  perform pg_temp.bm_lesson(c, m, 1, 'Rollback and restore', 'live', 75, false,
    'Push a deliberate bad change and roll it back. Restore the latest backup to a test copy and check the data. A backup only counts once it has been restored.',
    'Roll back a bad change and restore a backup to a test copy.',
    'A rollback log and a restore log.');
  perform pg_temp.bm_lesson(c, m, 2, 'Monitor and secure', 'working', 60, false,
    'Set up uptime checks and alerts. Audit two-factor, secrets and row-level security, then sign the security checklist.',
    'Turn on monitoring and finish the security checklist.',
    'Monitoring is on and the security checklist is signed.');
  perform pg_temp.bm_lesson(c, m, 3, 'Go live and write it down', 'working', 75, false,
    'Promote the final version, check DNS and HTTPS, write your one-page runbook, and record the day-0 target against the actual result.',
    'Go live, write your runbook and record your 30-day number.',
    'A live system, a runbook and a result sheet.');
  perform pg_temp.bm_lesson(c, m, 4, 'Day-30 review', 'live', 60, false,
    'Screen-share each scorecard item with its evidence while your coach marks pass or not yet. Record your result, choose the server option (continue on Restart, move to your own account, or export and stop), and agree the next step.',
    'Walk the scorecard and choose what happens to your server.',
    'A signed scorecard and a server decision.');
end $$;

-- ---------------------------------------------------------------------------
-- Breadmaker Launchpad

do $$
declare
  c uuid;
  m uuid;
begin
  if exists (select 1 from breadmaker.lms_courses where slug = 'launchpad') then
    return;
  end if;

  insert into breadmaker.lms_courses (slug, title, subtitle, description, program, audience, status, price_minor, currency)
  values (
    'launchpad',
    'Breadmaker Launchpad',
    'Your first working online page, live in [7] days.',
    'No jargon, no guesswork. One clear step each day: we write your offer with you, build your page on a proven template, connect enquiries, bookings or payments, test it, and launch it on your own domain.',
    'launchpad',
    'Coaches, consultants, creators and local service businesses',
    'Published',
    null,
    'usd'
  )
  returning id into c;

  insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
  values (c, 'Days 1-2: Plan',
    'Choose your one goal and write an offer a visitor understands at a glance.',
    0,
    array['You know your one goal for the week', 'Your offer is written: who it is for, the problem, what you deliver, the price and the one action'])
  returning id into m;
  perform pg_temp.bm_lesson(c, m, 0, 'Day 1: Start call', 'live', 30, true,
    'A 30-minute call to choose your one goal and outline your offer. Bring a short description of what you sell, your logo and a few photos if you have them, and access to your domain.',
    'Choose your one goal for the week.',
    'You leave the call with the plan for the week.');
  perform pg_temp.bm_lesson(c, m, 1, 'Day 2: Your offer', 'working', 60, false,
    'We write it together: who it is for, the problem, what you deliver, the price, and the one action you want visitors to take.',
    'Approve your written offer.',
    'Your offer is written on one page and you are happy with it.');

  insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
  values (c, 'Days 3-4: Build',
    'We build your page with you on a proven template, and you tell us what to change.',
    1,
    array['Your page is built and works on a phone', 'You have reviewed it and your changes are in'])
  returning id into m;
  perform pg_temp.bm_lesson(c, m, 0, 'Days 3-4: Build', 'working', 90, false,
    'We build your page on a proven template, edited for your offer and checked on a phone. You review it and tell us what to change.',
    'Review your page and send your changes.',
    'Your page reads clearly on a phone and your changes are in.');

  insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
  values (c, 'Days 5-7: Launch',
    'Connect the ways to take action, test everything, and go live on your own domain.',
    2,
    array[
      'A way to take enquiries, bookings or payments works',
      'An automatic reply goes out the moment someone signs up',
      'Tracking shows your visits and enquiries',
      'Your page is live on your own domain'
    ])
  returning id into m;
  perform pg_temp.bm_lesson(c, m, 0, 'Day 5: Connect', 'working', 60, false,
    'We connect the form, booking or payments, the automatic reply and the tracking.',
    'Send yourself a test enquiry.',
    'The enquiry arrives and the automatic reply reaches you.');
  perform pg_temp.bm_lesson(c, m, 1, 'Day 6: Test', 'working', 60, false,
    'We test on a phone and a computer, run a test enquiry and a test payment, and fix what breaks.',
    'Run a test enquiry and a test payment.',
    'Both tests pass on a phone and a computer.');
  perform pg_temp.bm_lesson(c, m, 2, 'Day 7: Launch', 'live', 45, false,
    'Your page goes live on your own domain, and you learn how to make simple changes yourself.',
    'Make one simple change to your live page yourself.',
    'Your page is live on your domain and you have made a change on your own.');
end $$;
