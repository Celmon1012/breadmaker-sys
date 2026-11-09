// Applies the Breadmaker migrations to an in-memory Postgres with a minimal
// Supabase stub (auth, storage, roles) and checks the access rules.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = new PGlite();

const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated; grant all on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
-- pg_cron and pg_net are not available in the embedded database. Stub the parts the migrations call so the
-- schedule SQL still parses and runs (jobs are recorded, never executed).
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid::bigint $$;
create function cron.unschedule(job_name text) returns boolean language sql as $$
  with d as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from d) $$;
create function cron.unschedule(job_id bigint) returns boolean language sql as $$
  with d as (delete from cron.job where jobid = job_id returning 1) select exists (select 1 from d) $$;
create schema net;
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}') returns bigint language sql as $$ select 0::bigint $$;
`;
await db.exec(stub);

// Extensions PGlite cannot load; the stubs above stand in for pg_cron and pg_net.
const stripExtensions = (sql) => sql.replace(/^\s*create extension if not exists (pg_cron|pg_net)[^;]*;/gim, '');
const readMigration = (f) => stripExtensions(fs.readFileSync(path.join(MIG, f), 'utf8'));

const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  // ai tutor (pgvector) and the restart schema are not part of this test
  .filter((f) => !/000004_ai_tutor|000007_restart|000010_secure_course_chunks/.test(f));
for (const f of files) {
  try {
    await db.exec(readMigration(f));
    console.log('applied', f);
  } catch (e) {
    console.error('FAILED', f, e.message);
    process.exit(1);
  }
}

// Users: owner (legacy admin), coach, learner, other learner.
const U = {
  owner: '00000000-0000-0000-0000-000000000001',
  coach: '00000000-0000-0000-0000-000000000002',
  learner: '00000000-0000-0000-0000-000000000003',
  other: '00000000-0000-0000-0000-000000000004',
};
for (const [name, id] of Object.entries(U)) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}@example.com`, { first_name: name }]);
}
await db.exec(`update breadmaker.profiles set role = 'admin' where id = '${U.owner}'`);
// Re-run the LMS migration so the admin is seeded as an Owner, and prove it is re-runnable.
for (const f of files.filter((f) => /00001[123]_/.test(f))) await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
// Migration 12 defines has_course_access; the Hub (28) redefines it, so it must be applied after any re-run of 12 (29 follows 28, and 38 follows 29).
for (const f of files.filter((f) => /00002[89]_|000038_/.test(f))) await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));

let failures = 0;
async function as(who, fn) {
  const role = who === 'anon' ? 'anon' : 'authenticated';
  const sub = who === 'anon' ? '' : U[who];
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub}', false); select set_config('request.jwt.claim.role', '${role}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
async function expect(label, fn, check) {
  let result, error;
  try { result = await fn(); } catch (e) { error = e; }
  const ok = check(result, error);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  -> ${error ? error.message : JSON.stringify(result?.rows ?? result)}`}`);
}
const rows = (r) => r?.rows ?? [];
const q = (sql, params) => db.query(sql, params);

await expect('anon cannot read any profile', () => as('anon', () => q('select * from breadmaker.profiles')), (r, e) => !e && rows(r).length === 0);
await expect('learner reads only own profile', () => as('learner', () => q('select id from breadmaker.profiles')), (r) => rows(r).length === 1 && rows(r)[0].id === U.learner);
await expect('admin reads all profiles', () => as('owner', () => q('select id from breadmaker.profiles')), (r) => rows(r).length === 4);
await expect('anon cannot write legacy courses', () => as('anon', () => q(`insert into breadmaker.courses (id, title) values ('x', 'x')`)), (r, e) => !!e);
await expect('anon can join waitlist', () => as('anon', () => q(`insert into breadmaker.waitlist (email) values ('a@b.co')`)), (r, e) => !e);
await expect('anon cannot read waitlist', () => as('anon', () => q('select * from breadmaker.waitlist')), (r, e) => !!e || rows(r).length === 0);
await expect('anon can send contact message', () => as('anon', () => q(`insert into breadmaker.contact_messages (name, email, message) values ('A', 'a@b.co', 'hi')`)), (r, e) => !e);
await expect('learner cannot read contact messages', () => as('learner', () => q('select * from breadmaker.contact_messages')), (r, e) => !!e || rows(r).length === 0);
await expect('owner reads contact messages', () => as('owner', () => q('select * from breadmaker.contact_messages')), (r) => rows(r).length === 1);
await expect('learner cannot change own role', () => as('learner', () => q(`update breadmaker.profiles set role = 'admin' where id = '${U.learner}'`)), (r, e) => !!e);

await expect('legacy admin became Owner', () => as('owner', () => q('select breadmaker.team_role() r')), (r) => rows(r)[0].r === 'Owner');
await expect('anon catalog lists 2 programs', () => as('anon', () => q('select slug, module_count, lesson_count from breadmaker.course_catalog()')), (r) => rows(r).length === 2);
await expect('foundry has 4 weeks, 20 lessons', () => as('anon', () => q(`select module_count, lesson_count, preview_count from breadmaker.course_catalog() where slug = 'foundry'`)), (r) => rows(r)[0].module_count === 4 && rows(r)[0].lesson_count === 20 && rows(r)[0].preview_count === 1);
await expect('anon sees public syllabus', () => as('anon', () => q(`select l.title from breadmaker.lms_lessons l join breadmaker.lms_courses c on c.id = l.course_id where c.slug = 'foundry'`)), (r) => rows(r).length === 20);
await expect('anon reads preview content only', () => as('anon', () => q(`select lc.lesson_id from breadmaker.lms_lesson_content lc`)), (r) => rows(r).length === 2);
await expect('learner without enrollment reads previews only', () => as('learner', () => q(`select lc.lesson_id from breadmaker.lms_lesson_content lc`)), (r) => rows(r).length === 2);

const foundryId = rows(await q(`select id from breadmaker.lms_courses where slug = 'foundry'`))[0].id;
const lockedLesson = rows(await q(`select id from breadmaker.lms_lessons where course_id = $1 and not is_preview limit 1`, [foundryId]))[0].id;

await expect('learner cannot record progress on locked lesson', () => as('learner', () => q(`insert into breadmaker.lms_lesson_progress (lesson_id) values ($1)`, [lockedLesson])), (r, e) => !!e);
await expect('learner cannot enroll self', () => as('learner', () => q(`insert into breadmaker.lms_enrollments (user_id, course_id) values ($1, $2)`, [U.learner, foundryId])), (r, e) => !!e);
await expect('learner cannot call enroll_by_email', () => as('learner', () => q(`select breadmaker.enroll_by_email('learner@example.com', $1)`, [foundryId])), (r, e) => !!e);
await expect('learner cannot make self team member', () => as('learner', () => q(`select breadmaker.set_team_member('learner@example.com', 'Owner')`)), (r, e) => !!e);
await expect('owner adds coach', () => as('owner', () => q(`select breadmaker.set_team_member('coach@example.com', 'Coach')`)), (r, e) => !e);
await expect('coach enrolls learner by email', () => as('coach', () => q(`select breadmaker.enroll_by_email('LEARNER@example.com', $1, 'pilot seat')`, [foundryId])), (r, e) => !e);
await expect('enrolling unknown email explains why', () => as('coach', () => q(`select breadmaker.enroll_by_email('nobody@example.com', $1)`, [foundryId])), (r, e) => !!e && /No account uses/.test(e.message));
await expect('enrolled learner reads all foundry content', () => as('learner', () => q(`select count(*)::int n from breadmaker.lms_lesson_content lc join breadmaker.lms_lessons l on l.id = lc.lesson_id where l.course_id = $1`, [foundryId])), (r) => rows(r)[0].n === 20);
await expect('enrolled learner records progress', () => as('learner', () => q(`insert into breadmaker.lms_lesson_progress (lesson_id) values ($1)`, [lockedLesson])), (r, e) => !e);
await expect('other learner still locked out', () => as('other', () => q(`select count(*)::int n from breadmaker.lms_lesson_content lc join breadmaker.lms_lessons l on l.id = lc.lesson_id where l.course_id = $1`, [foundryId])), (r) => rows(r)[0].n === 1);
await expect('other learner cannot see learner progress', () => as('other', () => q(`select * from breadmaker.lms_lesson_progress`)), (r) => rows(r).length === 0);
// Enrolling in Foundry also enrolls its four kits, so the learner holds the course plus its bundle.
await expect('learner sees own enrollment only', () => as('learner', () => q(`select * from breadmaker.lms_enrollments`)), (r) => rows(r).length === 5 && rows(r).every((x) => x.user_id === U.learner));
await expect('learner_progress empty for learners', () => as('learner', () => q(`select * from breadmaker.learner_progress()`)), (r) => rows(r).length === 0);
await expect('learner_progress for team', () => as('coach', () => q(`select email, completed_lessons, total_lessons, enrolled from breadmaker.learner_progress()`)), (r) => rows(r).length === 5 && rows(r).every((x) => x.email === 'learner@example.com') && rows(r).some((x) => x.completed_lessons === 1 && x.total_lessons === 20));
await expect('course_stats for team', () => as('owner', () => q(`select * from breadmaker.course_stats() where course_id = $1`, [foundryId])), (r) => rows(r)[0].learners === 1 && rows(r)[0].avg_completion === 5);
await expect('team_list shows owner and coach', () => as('coach', () => q(`select email, role from breadmaker.team_list()`)), (r) => rows(r).length === 2);
await expect('coach cannot change team', () => as('coach', () => q(`select breadmaker.set_team_member('other@example.com', 'Owner')`)), (r, e) => !!e);
await expect('cannot remove last owner', () => as('owner', () => q(`select breadmaker.remove_team_member($1)`, [U.owner])), (r, e) => !!e);

// save_course round trip keeps lesson ids (and progress) and removes dropped ones.
const payload = rows(await q(`
  select jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'title', c.title || ' (edited)', 'status', c.status, 'program', c.program,
    'price_minor', c.price_minor, 'currency', c.currency,
    'modules', (select jsonb_agg(jsonb_build_object('id', m.id, 'client_id', m.id, 'title', m.title, 'done_when', to_jsonb(m.done_when),
       'lessons', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'client_id', l.id, 'title', l.title, 'status', l.status,
          'session_type', l.session_type, 'duration_minutes', l.duration_minutes, 'is_preview', l.is_preview,
          'body', lc.body, 'action', lc.action, 'done_when', lc.done_when) order by l.position), '[]')
          from breadmaker.lms_lessons l left join breadmaker.lms_lesson_content lc on lc.lesson_id = l.id where l.module_id = m.id))
       order by m.position) from breadmaker.lms_modules m where m.course_id = c.id and m.position < 3),
    'tools', '[]'::jsonb) p
  from breadmaker.lms_courses c where c.id = $1`, [foundryId]))[0].p;
await expect('learner cannot save course', () => as('learner', () => q(`select breadmaker.save_course($1)`, [payload])), (r, e) => !!e);
await expect('coach saves course without week 4', () => as('coach', () => q(`select breadmaker.save_course($1) r`, [payload])), (r, e) => !e);
await expect('week 4 removed, 15 lessons left', () => q(`select (select count(*)::int from breadmaker.lms_modules where course_id = $1) m, (select count(*)::int from breadmaker.lms_lessons where course_id = $1) l`, [foundryId]), (r) => rows(r)[0].m === 3 && rows(r)[0].l === 15);
await expect('progress survived the save', () => q(`select count(*)::int n from breadmaker.lms_lesson_progress where lesson_id = $1`, [lockedLesson]), (r) => rows(r)[0].n === 1);
await expect('new course slug collision gets suffix', () => as('coach', () => q(`select breadmaker.save_course('{"slug":"foundry","title":"Copy","status":"Draft","modules":[]}'::jsonb) r`)), (r) => rows(r)[0].r.slug === 'foundry-2');
await expect('anon cannot see draft course', () => as('anon', () => q(`select * from breadmaker.lms_courses where slug = 'foundry-2'`)), (r) => rows(r).length === 0);

// Storage policies
await q(`insert into breadmaker.lms_course_tools (course_id, name, storage_path) values ($1, 'Runbook.pdf', $2)`, [foundryId, `${foundryId}/runbook.pdf`]);
await q(`insert into storage.objects (bucket_id, name) values ('breadmaker-course-tools', $1)`, [`${foundryId}/runbook.pdf`]);
await expect('enrolled learner can read tool file', () => as('learner', () => q(`select name from storage.objects`)), (r) => rows(r).length === 1);
await expect('other learner cannot read tool file', () => as('other', () => q(`select name from storage.objects`)), (r) => rows(r).length === 0);
await expect('learner cannot upload tools', () => as('learner', () => q(`insert into storage.objects (bucket_id, name) values ('breadmaker-course-tools', 'x/y.pdf')`)), (r, e) => !!e);
await expect('coach can upload tools', () => as('coach', () => q(`insert into storage.objects (bucket_id, name) values ('breadmaker-course-tools', 'x/y.pdf')`)), (r, e) => !e);
await expect('other sees tool summary but not rows', () => as('other', () => q(`select (select count(*)::int from breadmaker.course_tool_summary($1)) s, (select count(*)::int from breadmaker.lms_course_tools) t`, [foundryId])), (r) => rows(r)[0].s === 1 && rows(r)[0].t === 0);


// Programs: cohorts, applications, waitlists and tier prices.
await expect('anon cannot read the cohorts table', () => as('anon', () => q('select * from breadmaker.program_cohorts')), (r, e) => !!e || rows(r).length === 0);
await expect('anon sees the open cohort count', () => as('anon', () => q(`select (s->>'open_cohorts')::int n from (select breadmaker.program_status('foundry') s) x`)), (r) => rows(r)[0].n === 1);
await expect('foundry cohort is 6 places, all free', () => as('anon', () => q(`select (s->>'capacity')::int c, (s->>'remaining')::int rem, (s->>'accepting')::bool a from (select breadmaker.program_status('foundry') s) t`)), (r) => rows(r)[0].c === 6 && rows(r)[0].rem === 6 && rows(r)[0].a === true);
await expect('anon submits a foundry application', () => as('anon', () => q(`select breadmaker.submit_application('{"program":"foundry","tier":"guided","name":"Ada Obi","email":"ada@example.com","company":"Ada Studio","answers":{"business":"Design studio"}}'::jsonb) r`)), (r, e) => !e && !!rows(r)[0].r);
await expect('a bad email is refused', () => as('anon', () => q(`select breadmaker.submit_application('{"program":"foundry","name":"No Email","email":"nope"}'::jsonb)`)), (r, e) => !!e && /valid email/.test(e.message));
await expect('an unknown program is refused', () => as('anon', () => q(`select breadmaker.submit_application('{"program":"restart","name":"A","email":"a@b.co"}'::jsonb)`)), (r, e) => !!e);
await expect('anon cannot read applications', () => as('anon', () => q('select * from breadmaker.applications')), (r, e) => !!e || rows(r).length === 0);
await expect('learner cannot read applications', () => as('learner', () => q('select * from breadmaker.applications')), (r, e) => !!e || rows(r).length === 0);
await expect('team reads the application queue', () => as('owner', () => q(`select name, status, cohort_label from breadmaker.list_applications('all','all')`)), (r) => rows(r).length === 1 && rows(r)[0].status === 'new' && rows(r)[0].cohort_label !== '');
await expect('the application joined the open cohort', () => q(`select count(*)::int n from breadmaker.applications where cohort_id is not null`), (r) => rows(r)[0].n === 1);
await expect('learner cannot work the queue', () => as('learner', () => q(`select breadmaker.set_application_status((select id from breadmaker.applications limit 1), 'accepted')`)), (r, e) => !!e);
await expect('coach accepts the application', () => as('coach', () => q(`select breadmaker.set_application_status((select id from breadmaker.applications where email = 'ada@example.com'), 'accepted', 'Good fit')`)), (r, e) => !e);
await expect('accepted application holds a place', () => as('anon', () => q(`select (s->>'taken')::int t, (s->>'remaining')::int rem from (select breadmaker.program_status('foundry') s) x`)), (r) => rows(r)[0].t === 1 && rows(r)[0].rem === 5);
await expect('anon joins the waitlist', () => as('anon', () => q(`select breadmaker.join_waitlist('{"program":"foundry","name":"Chidi U","email":"chidi@example.com"}'::jsonb) r`)), (r, e) => !e && !!rows(r)[0].r);
await expect('joining twice keeps one entry', () => as('anon', () => q(`select breadmaker.join_waitlist('{"program":"foundry","name":"Chidi Uzo","email":"CHIDI@example.com"}'::jsonb) r`)), async (r, e) => !e && rows(await q('select count(*)::int n from breadmaker.cohort_waitlist'))[0].n === 1);
await expect('learner cannot read the waitlist', () => as('learner', () => q('select * from breadmaker.cohort_waitlist')), (r, e) => !!e || rows(r).length === 0);
await expect('team reads the waitlist', () => as('coach', () => q('select name, email from breadmaker.list_waitlist()')), (r) => rows(r).length === 1 && rows(r)[0].name === 'Chidi Uzo');
await expect('learner cannot create a cohort', () => as('learner', () => q(`select breadmaker.save_cohort('{"program":"foundry","label":"Sneaky","capacity":"1"}'::jsonb)`)), (r, e) => !!e);
await expect('coach creates a dated launchpad cohort', () => as('coach', () => q(`select breadmaker.save_cohort('{"program":"launchpad","label":"Week of 3 Nov","starts_on":"2026-11-03","ends_on":"2026-11-10","capacity":"8","status":"open","timezone":"Africa/Lagos"}'::jsonb) r`)), (r, e) => !e && !!rows(r)[0].r);
await expect('the dated cohort becomes the next one', () => as('anon', () => q(`select (s->>'starts_on') d, (s->>'label') l from (select breadmaker.program_status('launchpad') s) x`)), (r) => rows(r)[0].d === '2026-11-03' && rows(r)[0].l === 'Week of 3 Nov');
await expect('team lists every cohort with counts', () => as('coach', () => q('select program, label, capacity, taken, waitlist, status from breadmaker.list_cohorts() order by program, starts_on nulls last')), (r) => rows(r).length === 3 && rows(r).find((row) => row.program === 'foundry').taken === 1);
await expect('a program-level waiter shows on the program, not a run', () => as('anon', () => q(`select (s->>'waitlist_count')::int n from (select breadmaker.program_status('foundry') s) x`)), (r) => rows(r)[0].n === 1);
await expect('the run still has no waiters of its own', () => as('coach', () => q(`select coalesce(sum(waitlist), 0)::int n from breadmaker.list_cohorts() where program = 'foundry'`)), (r) => rows(r)[0].n === 0);
await expect('learner cannot delete a cohort', () => as('learner', () => q(`select breadmaker.delete_cohort((select id from breadmaker.program_cohorts limit 1))`)), (r, e) => !!e);
await expect('anon reads the tier prices', () => as('anon', () => q(`select tier, price_minor, currency from breadmaker.program_tier_list() where program = 'foundry' order by price_minor`)), (r) => rows(r).length === 1 && rows(r)[0].tier === 'done-with-you' && rows(r)[0].price_minor === 99700 && rows(r)[0].currency === 'USD');
await expect('anon cannot read payments', () => as('anon', () => q('select * from breadmaker.payments')), (r, e) => !!e || rows(r).length === 0);
await expect('learner cannot read payments', () => as('learner', () => q('select * from breadmaker.payments')), (r, e) => !!e || rows(r).length === 0);
await expect('unknown payment reference returns nothing', () => as('anon', () => q(`select breadmaker.payment_status('bm-nope') s`)), (r) => rows(r)[0].s === null);
await expect('a successful payment shows on the application', async () => {
  await q(`insert into breadmaker.payments (tx_ref, program, tier, email, name, amount_minor, currency, status) values ('bm-test-1', 'foundry', 'guided', 'ada@example.com', 'Ada Obi', 60000000, 'NGN', 'successful')`);
  return as('owner', () => q(`select payment_status from breadmaker.list_applications('all','all') where email = 'ada@example.com'`));
}, (r) => rows(r)[0].payment_status === 'successful');
await expect('anon sees the payment status by reference', () => as('anon', () => q(`select (s->>'status') st, (s->>'amount_minor')::int amt from (select breadmaker.payment_status('bm-test-1') s) x`)), (r) => rows(r)[0].st === 'successful' && rows(r)[0].amt === 60000000);

// Copy that lives in the database must not carry bracketed placeholders.
await expect('no bracketed placeholders in catalog copy', () => q(`select slug, title, subtitle, description from breadmaker.lms_courses where title like '%[%' or subtitle like '%[%' or description like '%[%'`), (r) => rows(r).length === 0);
await expect('launchpad subtitle reads clean', () => q(`select subtitle from breadmaker.lms_courses where slug = 'launchpad'`), (r) => rows(r)[0].subtitle === 'Your first working online page, live in 7 days.');


// Business Leak Test: lead capture, the paywall, codes and benchmarks.
const answers30 = (n) => Array(30).fill(n);
const goodPayload = (over = {}) => JSON.stringify({ name: 'Tola Ade', email: 'Tola@Example.com', whatsapp: '+234 801 234 5678', consent: true, answers: answers30(2), profile: { industry: 'Retail' }, archetype: 'The Steward', leakiest: 'Sales & Lead Flow', ...over });
const BAD_TOKEN = '00000000-0000-0000-0000-0000000000aa';
let leak;
await expect('anon submits a leak test', async () => { const r = await as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb) r', [goodPayload()])); leak = rows(r)[0].r; return r; }, (r, e) => !e && !!leak.id && !!leak.token);
await expect('submission needs consent', () => as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb)', [goodPayload({ consent: false })])), (r, e) => !!e && /consent/.test(e.message));
await expect('submission needs a WhatsApp number', () => as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb)', [goodPayload({ whatsapp: '' })])), (r, e) => !!e && /WhatsApp/.test(e.message));
await expect('submission rejects a bad email', () => as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb)', [goodPayload({ email: 'nope' })])), (r, e) => !!e);
await expect('submission needs 30 answers', () => as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb)', [goodPayload({ answers: [1, 2, 3] })])), (r, e) => !!e);
await expect('submission rejects an answer above 4', () => as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb)', [goodPayload({ answers: answers30(5) })])), (r, e) => !!e);
await expect('scores are computed in the database', () => as('owner', () => q('select total, band, pillar_scores, owner_dependence, email from breadmaker.leak_test_submissions')), (r) => rows(r)[0].total === 50 && rows(r)[0].band === 'surviving' && rows(r)[0].pillar_scores.every((p) => p === 50) && rows(r)[0].owner_dependence === 8 && rows(r)[0].email === 'tola@example.com');
await expect('anon cannot read submissions directly', () => as('anon', () => q('select * from breadmaker.leak_test_submissions')), (r, e) => !!e || rows(r).length === 0);
await expect('learner cannot read submissions directly', () => as('learner', () => q('select * from breadmaker.leak_test_submissions')), (r, e) => !!e || rows(r).length === 0);
await expect('owner lists the leads', () => as('owner', () => q('select email, whatsapp from breadmaker.list_leak_test_leads()')), (r) => rows(r).length === 1);
await expect('learner cannot list the leads', () => as('learner', () => q('select * from breadmaker.list_leak_test_leads()')), (r) => rows(r).length === 0);
await expect('the owner of a result reads it back with the token', () => as('anon', () => q('select breadmaker.get_leak_test($1, $2) r', [leak.id, leak.token])), (r) => rows(r)[0].r.total === 50 && rows(r)[0].r.paid_tier === null && !('email' in rows(r)[0].r));
await expect('a wrong token reads nothing', () => as('anon', () => q('select breadmaker.get_leak_test($1, $2) r', [leak.id, BAD_TOKEN])), (r) => rows(r)[0].r === null);
await expect('the report is locked before payment', () => as('anon', () => q('select breadmaker.get_leak_test_report($1, $2)', [leak.id, leak.token])), (r, e) => !!e && /not unlocked/.test(e.message));
await expect('anon reads the report prices', () => as('anon', () => q('select tier, price_minor from breadmaker.leak_test_price_list()')), (r) => rows(r).length === 2 && rows(r)[0].tier === 'report');
await expect('anon cannot read report content directly', () => as('anon', () => q('select * from breadmaker.leak_test_report_content')), (r, e) => !!e || rows(r).length === 0);
await expect('anon cannot create codes', () => as('anon', () => q("select breadmaker.create_leak_test_codes('X', 'report', 1)")), (r, e) => !!e);
await expect('learner cannot create codes', () => as('learner', () => q("select breadmaker.create_leak_test_codes('X', 'report', 1)")), (r, e) => !!e);
let codes;
await expect('owner creates a batch of partner codes', async () => { const r = await as('owner', () => q("select breadmaker.create_leak_test_codes('Acme Accountants', 'report_call', 2, 1) c")); codes = rows(r).map((x) => x.c); return r; }, (r, e) => !e && codes.length === 2 && codes.every((c) => /^BM-[0-9A-F]{8}$/.test(c)));
await expect('a bad code is refused', () => as('anon', () => q('select breadmaker.redeem_leak_test_code($1, $2, $3)', [leak.id, leak.token, 'BM-NOPE'])), (r, e) => !!e && /not valid/.test(e.message));
await expect('a code needs the right token', () => as('anon', () => q('select breadmaker.redeem_leak_test_code($1, $2, $3)', [leak.id, BAD_TOKEN, codes[0]])), (r, e) => !!e);
await expect('a valid code unlocks the report', () => as('anon', () => q('select breadmaker.redeem_leak_test_code($1, $2, $3) t', [leak.id, leak.token, codes[0].toLowerCase()])), (r, e) => !e && rows(r)[0].t === 'report_call');
await expect('an already-unlocked result does not spend a second code', async () => { await as('anon', () => q('select breadmaker.redeem_leak_test_code($1, $2, $3)', [leak.id, leak.token, codes[1]])); return as('owner', () => q('select sum(uses)::int n from breadmaker.leak_test_codes')); }, (r) => rows(r)[0].n === 1);
await expect('an unlocked report returns its content', () => as('anon', () => q('select breadmaker.get_leak_test_report($1, $2) r', [leak.id, leak.token])), (r) => rows(r)[0].r.paid_tier === 'report_call' && !!rows(r)[0].r.content['pillar:sales'].plan && rows(r)[0].r.benchmark.ready === false);
await expect('a used-up code is refused', async () => { const other = rows(await as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb) r', [goodPayload({ email: 'b@example.com' })])))[0].r; return as('anon', () => q('select breadmaker.redeem_leak_test_code($1, $2, $3)', [other.id, other.token, codes[0]])); }, (r, e) => !!e && /not valid/.test(e.message));
await expect('a payment unlocks the report', async () => {
  const other = rows(await as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb) r', [goodPayload({ email: 'c@example.com' })])))[0].r;
  await q("insert into breadmaker.payments (tx_ref, program, tier, email, name, amount_minor, currency, status, submission_id) values ('bm-leaktest-report-1', 'leaktest', 'report', 'c@example.com', 'C', 400000, 'NGN', 'successful', $1)", [other.id]);
  await q("select breadmaker.grant_leak_test_report('bm-leaktest-report-1')");
  return as('anon', () => q('select breadmaker.get_leak_test($1, $2) r', [other.id, other.token]));
}, (r) => rows(r)[0].r.paid_tier === 'report');
await expect('anon cannot grant a report', () => as('anon', () => q("select breadmaker.grant_leak_test_report('bm-leaktest-report-1')")), (r, e) => !!e);
await expect('a benchmark appears once there is enough data', async () => {
  for (let i = 0; i < 30; i++) await as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb)', [goodPayload({ email: 'bulk' + i + '@example.com' })]));
  return as('anon', () => q('select breadmaker.get_leak_test_report($1, $2) r', [leak.id, leak.token]));
}, (r) => rows(r)[0].r.benchmark.ready === true && rows(r)[0].r.benchmark.scope === 'industry' && rows(r)[0].r.benchmark.pillars.length === 6);

// Personalised report: profile notes, intake, the AI section and its review gate.
const fullProfile = JSON.stringify({ industry: 'Food and hospitality', business_age: '1 to 2 years', team_size: 'Just me', revenue_band: '₦1 million to ₦5 million', main_goal: 'Get more customers' });
await db.exec(`update breadmaker.leak_test_submissions set profile = '${fullProfile}'::jsonb where id = '${leak.id}'`);
await expect('the report returns profile notes for the profile', () => as('anon', () => q('select breadmaker.get_leak_test_report($1, $2) r', [leak.id, leak.token])), (r) => { const n = rows(r)[0].r.profile_notes; return n.length === 5 && n[0].dimension === 'main_goal' && n[0].focus === 'sales' && !!n[1].boost; });
await expect('profile rows are not leaked into content', () => as('anon', () => q('select breadmaker.get_leak_test_report($1, $2) r', [leak.id, leak.token])), (r) => !Object.keys(rows(r)[0].r.content).some((k) => k.startsWith('profile:')));
await expect('intake is refused before payment', async () => { const o = rows(await as('anon', () => q('select breadmaker.submit_leak_test($1::jsonb) r', [goodPayload({ email: 'intake@example.com' })])))[0].r; return as('anon', () => q('select breadmaker.save_leak_intake($1, $2, $3::jsonb)', [o.id, o.token, JSON.stringify({ about: 'x' })])); }, (r, e) => !!e);
await expect('intake needs a wrong token refused', () => as('anon', () => q('select breadmaker.save_leak_intake($1, $2, $3::jsonb)', [leak.id, BAD_TOKEN, JSON.stringify({ about: 'x' })])), (r, e) => !!e);
await expect('intake needs the first answer', () => as('anon', () => q('select breadmaker.save_leak_intake($1, $2, $3::jsonb)', [leak.id, leak.token, JSON.stringify({ about: ' ' })])), (r, e) => !!e);
await expect('intake queues the AI section', () => as('anon', () => q('select breadmaker.save_leak_intake($1, $2, $3::jsonb) s', [leak.id, leak.token, JSON.stringify({ about: 'We sell jollof', frustration: 'Orders in chat', tried: 'A spreadsheet' })])), (r, e) => !e && rows(r)[0].s === 'pending');
await expect('the report shows intake as done', () => as('anon', () => q('select breadmaker.get_leak_test_report($1, $2) r', [leak.id, leak.token])), (r) => rows(r)[0].r.intake_done === true && rows(r)[0].r.ai_status === 'pending' && rows(r)[0].r.ai === null);
await db.exec(`update breadmaker.leak_test_submissions set ai_status = 'ready', ai_report = '{"summary":"Draft"}'::jsonb where id = '${leak.id}'`);
await expect('a Report + call AI draft is held for review', () => as('anon', () => q('select breadmaker.get_leak_test_report($1, $2) r', [leak.id, leak.token])), (r) => rows(r)[0].r.ai_status === 'review' && rows(r)[0].r.ai === null);
await expect('a learner cannot release the AI report', () => as('learner', () => q('select breadmaker.set_leak_ai_report($1, null, true)', [leak.id])), (r, e) => !!e);
await expect('the owner releases the AI report', () => as('owner', () => q('select breadmaker.set_leak_ai_report($1, $2::jsonb, true)', [leak.id, JSON.stringify({ summary: 'Reviewed' })])), (r, e) => !e);
await expect('a released AI report is shown', () => as('anon', () => q('select breadmaker.get_leak_test_report($1, $2) r', [leak.id, leak.token])), (r) => rows(r)[0].r.ai_status === 'ready' && rows(r)[0].r.ai.summary === 'Reviewed' && rows(r)[0].r.call.status === 'to_book');
await expect('intake does not overwrite a finished report', () => as('anon', () => q('select breadmaker.save_leak_intake($1, $2, $3::jsonb) s', [leak.id, leak.token, JSON.stringify({ about: 'changed' })])), (r, e) => !e && rows(r)[0].s === 'ready');
await expect('the owner records a booked call', () => as('owner', () => q("select breadmaker.set_leak_call($1, 'booked', now(), 'Prep: sales')", [leak.id])), (r, e) => !e);
await expect('the owner reads the lead detail', () => as('owner', () => q('select breadmaker.leak_test_lead_detail($1) d', [leak.id])), (r) => rows(r)[0].d.call_status === 'booked' && rows(r)[0].d.intake.about === 'We sell jollof');
await expect('a learner cannot read lead detail', () => as('learner', () => q('select breadmaker.leak_test_lead_detail($1) d', [leak.id])), (r) => rows(r)[0].d === null);

// Demand for systems in testing: anyone can ask, only the team reads the counts.
await expect('anon asks to be told when a system is ready', () => as('anon', () => q("select breadmaker.register_system_interest('lead-capture-and-follow-up', 'Ask@Example.com', 'Ada', 'systems')")), (r, e) => !e);
await expect('asking twice with a different case adds nothing', async () => { await as('anon', () => q("select breadmaker.register_system_interest('lead-capture-and-follow-up', 'ask@example.com')")); return as('owner', () => q('select people from breadmaker.system_interest_counts()')); }, (r, e) => !e && rows(r)[0].people === 1);
await expect('a bad email is refused', () => as('anon', () => q("select breadmaker.register_system_interest('delegation-pack', 'nope')")), (r, e) => !!e);
await expect('anon cannot read the interest list', () => as('anon', () => q('select * from breadmaker.system_interest')), (r, e) => !!e || rows(r).length === 0);
await expect('a learner sees no counts', () => as('learner', () => q('select * from breadmaker.system_interest_counts()')), (r, e) => !e && rows(r).length === 0);

// The edge functions use the service role, which needs table privileges on tables created after the first migration.
async function asServiceRole(fn) {
  await db.exec('set role service_role;');
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
// Kits and bundles: a kit is a course linked to a system; a program brings its kits with it.
await expect('the six kits are seeded as unpublished drafts', () => as('owner', () => q("select count(*)::int n, count(*) filter (where status = 'Draft')::int d from breadmaker.lms_courses where kit_system_id is not null")), (r) => rows(r)[0].n === 6 && rows(r)[0].d === 6);
await expect('each kit has sessions ending in a definition of done', () => as('owner', () => q("select count(*)::int n from breadmaker.lms_lessons l join breadmaker.lms_courses c on c.id = l.course_id where c.kit_system_id = 'invoicing-and-cash-tracker' and l.title = 'Your definition of done'")), (r) => rows(r)[0].n === 1);
await expect('no kit is on sale while they are drafts', () => as('anon', () => q('select * from breadmaker.kit_offers()')), (r, e) => !e && rows(r).length === 0);
await db.exec("update breadmaker.lms_courses set status = 'Published', price_minor = 500000 where kit_system_id = 'lead-capture-and-follow-up'");
await expect('a published, priced kit is offered', () => as('anon', () => q('select * from breadmaker.kit_offers()')), (r) => rows(r).length === 1 && rows(r)[0].system_id === 'lead-capture-and-follow-up' && rows(r)[0].lesson_count >= 4);
await expect('a paid kit enrolls the payer in that kit only', async () => {
  await db.exec("insert into breadmaker.payments (tx_ref, program, tier, email, amount_minor, currency, status, course_id) select 'bm-kit-test-1', 'kit', 'lead-capture-and-follow-up', 'learner@example.com', 500000, 'NGN', 'successful', id from breadmaker.lms_courses where kit_system_id = 'lead-capture-and-follow-up'");
  const e = rows(await asServiceRole(() => q("select breadmaker.enroll_from_payment('bm-kit-test-1') r")))[0].r;
  const n = rows(await db.query("select count(*)::int n from breadmaker.lms_enrollments e join breadmaker.lms_courses c on c.id = e.course_id where e.user_id = $1 and c.kit_system_id = 'lead-capture-and-follow-up'", [U.learner]))[0].n;
  return { rows: [{ e, n }] };
}, (r) => rows(r)[0].e === 'enrolled' && rows(r)[0].n === 1);
await expect('a paid program also enrolls its kits', async () => {
  await db.exec("insert into breadmaker.payments (tx_ref, program, tier, email, amount_minor, currency, status) values ('bm-launchpad-test-1', 'launchpad', 'self-paced', 'other@example.com', 1, 'NGN', 'successful')");
  await asServiceRole(() => q("select breadmaker.enroll_from_payment('bm-launchpad-test-1')"));
  return db.query("select c.slug from breadmaker.lms_enrollments e join breadmaker.lms_courses c on c.id = e.course_id where e.user_id = $1 order by c.slug", [U.other]);
}, (r) => { const s = rows(r).map((x) => x.slug); return s.includes('launchpad') && s.includes('offer-and-pricing-sheet') && s.includes('lead-capture-and-follow-up') && s.includes('invoicing-and-cash-tracker') && !s.includes('delegation-pack'); });
await expect('manual enrollment in Foundry also enrolls its kits', async () => {
  await as('owner', () => q("select breadmaker.enroll_by_email('coach@example.com', (select id from breadmaker.lms_courses where slug = 'foundry'))"));
  return db.query("select c.slug from breadmaker.lms_enrollments e join breadmaker.lms_courses c on c.id = e.course_id where e.user_id = $1 order by c.slug", [U.coach]);
}, (r) => { const s = rows(r).map((x) => x.slug); return s.includes('foundry') && s.includes('delegation-pack') && s.includes('automation-and-data-safety') && !s.includes('offer-and-pricing-sheet'); });

await expect('service role can read leak test submissions', () => asServiceRole(() => q('select id from breadmaker.leak_test_submissions limit 1')), (r, e) => !e);
await expect('service role can write payments', () => asServiceRole(() => q("insert into breadmaker.payments (tx_ref, program, tier, email, amount_minor, status) values ('bm-sr-1', 'leaktest', 'report', 's@example.com', 1, 'pending')")), (r, e) => !e);
await expect('service role can read prices', () => asServiceRole(() => q('select tier from breadmaker.leak_test_prices')), (r, e) => !e && rows(r).length === 2);

// New price list (migration 38): one-time Community, Done-with-you only, new report prices, kits listed without a price.
await expect('Community is a one-time $97 with a 100-year period', () => as('owner', () => q("select price_minor, currency, period_days from breadmaker.list_membership_plans_admin() where code = 'hub'")), (r, e) => !e && rows(r)[0].price_minor === 9700 && rows(r)[0].currency === 'USD' && rows(r)[0].period_days === 36500);
await expect('Partner is $300 a month', () => as('owner', () => q("select price_minor, period_days from breadmaker.list_membership_plans_admin() where code = 'partner'")), (r, e) => !e && rows(r)[0].price_minor === 30000 && rows(r)[0].period_days <= 366);
await expect('the owner can save a lifetime period but not a longer one', async () => {
  await as('owner', () => q("select breadmaker.set_membership_plan('x', 9700, 'USD', null, 36500, 0, null, false)"));
  let refused = false;
  try { await as('owner', () => q("select breadmaker.set_membership_plan('x', 9700, 'USD', null, 36501, 0, null, false)")); } catch { refused = true; }
  return { rows: [{ refused }] };
}, (r, e) => !e && rows(r)[0].refused === true);
await expect('Launchpad and Foundry sell Done-with-you only, at $297 and $997', () => as('anon', () => q("select program, tier, price_minor, currency from breadmaker.program_tier_list() order by program")), (r, e) => !e && rows(r).length === 2 && rows(r).every((x) => x.tier === 'done-with-you' && x.currency === 'USD') && rows(r)[0].program === 'foundry' && rows(r)[0].price_minor === 99700 && rows(r)[1].program === 'launchpad' && rows(r)[1].price_minor === 29700);
await expect('the Leak Test report is $27 and report + call is $97', () => as('anon', () => q('select tier, price_minor, currency from breadmaker.leak_test_price_list() order by price_minor')), (r, e) => !e && rows(r).length === 2 && rows(r)[0].price_minor === 2700 && rows(r)[1].price_minor === 9700 && rows(r).every((x) => x.currency === 'USD'));
await expect('a published kit with no price is still offered', async () => {
  await db.exec("update breadmaker.lms_courses set status = 'Published', price_minor = null, alt_price_minor = null where kit_system_id = 'delegation-pack'");
  const r = await as('anon', () => q("select system_id, price_minor from breadmaker.kit_offers() where system_id = 'delegation-pack'"));
  await db.exec("update breadmaker.lms_courses set status = 'Draft' where kit_system_id = 'delegation-pack'");
  return r;
}, (r, e) => !e && rows(r).length === 1 && rows(r)[0].price_minor === null);

// Leak Test admin: price/discount edits and deleting a result.
await expect('a learner cannot change a leak test price', () => as('learner', () => q("select breadmaker.set_leak_test_price('report', 1, 'NGN', null, 0, 0, true)")), (r, e) => !!e);
await expect('the owner sets a price and discount', async () => {
  await as('owner', () => q("select breadmaker.set_leak_test_price('report', 300000, 'NGN', 200000, 20, 48, true)"));
  return as('owner', () => q("select price_minor, alt_price_minor, discount_pct, discount_hours from breadmaker.list_leak_test_prices_admin() where tier = 'report'"));
}, (r, e) => !e && rows(r)[0].price_minor === 300000 && rows(r)[0].alt_price_minor === 200000 && rows(r)[0].discount_pct === 20 && rows(r)[0].discount_hours === 48);
await expect('a discount over 100 is refused', () => as('owner', () => q("select breadmaker.set_leak_test_price('report', 300000, 'NGN', null, 150, 48, true)")), (r, e) => !!e);
await expect('a learner cannot delete a leak test', () => as('learner', () => q("select breadmaker.delete_leak_test('00000000-0000-0000-0000-0000000000aa')")), (r, e) => !!e);

// Breadmaker Hub (monthly membership).
const hubPay = (ref, email) => db.exec(`insert into breadmaker.payments (tx_ref, program, tier, email, amount_minor, currency, status) values ('${ref}', 'membership', 'hub', '${email}', 500000, 'NGN', 'successful')`);
await db.exec("insert into breadmaker.lms_courses (slug, title, program, status, price_minor) values ('hub-general', 'Hub general course', 'general', 'Published', 900000), ('hub-programish', 'A program course', 'foundry', 'Published', 900000)");
const courseId = async (slug) => rows(await db.query('select id from breadmaker.lms_courses where slug = $1', [slug]))[0].id;
const canOpen = async (who, slug) => rows(await as(who, async () => db.query('select breadmaker.has_course_access($1) ok', [await courseId(slug)])))[0].ok;
await expect('a non-member cannot open a priced course', async () => ({ rows: [{ ok: await canOpen('learner', 'hub-general') }] }), (r) => rows(r)[0].ok === false);
await expect('the Hub is not on sale until switched on', () => as('anon', () => q('select * from breadmaker.membership_offer()')), (r, e) => !e && rows(r).length === 0);
await expect('a learner cannot set the Hub price', () => as('learner', () => q("select breadmaker.set_membership_plan('x', 1, 'NGN', null, 30, 0, null, true)")), (r, e) => !!e);
await expect('the owner switches the Hub on and anon sees the offer', async () => {
  await as('owner', () => q("select breadmaker.set_membership_plan('Every kit and course.', 500000, 'NGN', 400000, 30, 0, null, true)"));
  return as('anon', () => q('select * from breadmaker.membership_offer()'));
}, (r, e) => !e && rows(r).length === 1 && rows(r)[0].price_minor === 500000 && rows(r)[0].alt_price_minor === 400000 && rows(r)[0].period_days === 30);
await expect('a paid month makes an active member', async () => {
  await hubPay('bm-membership-hub-t1', 'learner@example.com');
  const r = rows(await asServiceRole(() => q("select breadmaker.grant_membership('bm-membership-hub-t1') r")))[0].r;
  const m = rows(await as('learner', () => q('select * from breadmaker.my_membership()')))[0];
  return { rows: [{ r, active: m?.active }] };
}, (r) => rows(r)[0].r === 'activated' && rows(r)[0].active === true);
await expect('the same payment cannot extend twice', async () => {
  const before = rows(await db.query("select current_period_end e from breadmaker.memberships where email = 'learner@example.com'"))[0].e;
  const r = rows(await asServiceRole(() => q("select breadmaker.grant_membership('bm-membership-hub-t1') r")))[0].r;
  const after = rows(await db.query("select current_period_end e from breadmaker.memberships where email = 'learner@example.com'"))[0].e;
  return { rows: [{ r, same: String(before) === String(after) }] };
}, (r) => rows(r)[0].r === 'already' && rows(r)[0].same === true);
await expect('renewing early adds to the end date', async () => {
  const before = new Date(rows(await db.query("select current_period_end e from breadmaker.memberships where email = 'learner@example.com'"))[0].e).getTime();
  await hubPay('bm-membership-hub-t2', 'learner@example.com');
  await asServiceRole(() => q("select breadmaker.grant_membership('bm-membership-hub-t2')"));
  const after = new Date(rows(await db.query("select current_period_end e from breadmaker.memberships where email = 'learner@example.com'"))[0].e).getTime();
  return { rows: [{ days: Math.round((after - before) / 86_400_000) }] };
}, (r) => rows(r)[0].days === 30);
await expect('a pending payment grants nothing', async () => {
  await db.exec("insert into breadmaker.payments (tx_ref, program, tier, email, amount_minor, currency, status) values ('bm-membership-hub-t3', 'membership', 'hub', 'other@example.com', 500000, 'NGN', 'pending')");
  return asServiceRole(() => q("select breadmaker.grant_membership('bm-membership-hub-t3') r"));
}, (r) => rows(r)[0].r === 'not-paid');
await expect('a member opens a standalone course', async () => ({ rows: [{ ok: await canOpen('learner', 'hub-general') }] }), (r) => rows(r)[0].ok === true);
await expect('a member opens a published kit', async () => ({ rows: [{ ok: await canOpen('learner', 'lead-capture-and-follow-up') }] }), (r) => rows(r)[0].ok === true);
await expect('a member does not open a program course', async () => ({ rows: [{ ok: await canOpen('learner', 'hub-programish') }] }), (r) => rows(r)[0].ok === false);
await expect('someone else is still locked out', async () => ({ rows: [{ ok: await canOpen('other', 'hub-general') }] }), (r) => rows(r)[0].ok === false);
await expect('a lapsed member loses access', async () => {
  await db.exec("update breadmaker.memberships set current_period_end = now() - interval '1 day' where email = 'learner@example.com'");
  return { rows: [{ ok: await canOpen('learner', 'hub-general') }] };
}, (r) => rows(r)[0].ok === false);
await expect('an ended member gets one lapse notice that is then marked sent', async () => {
  const first = rows(await asServiceRole(() => q("select kind from breadmaker.membership_notices() where email = 'learner@example.com'")));
  const end = rows(await db.query("select current_period_end e from breadmaker.memberships where email = 'learner@example.com'"))[0].e;
  await asServiceRole(() => db.query("select breadmaker.mark_membership_notice('learner@example.com', 'ended', $1)", [end]));
  const second = rows(await asServiceRole(() => q("select kind from breadmaker.membership_notices() where email = 'learner@example.com'")));
  return { rows: [{ first: first.length, second: second.length }] };
}, (r) => rows(r)[0].first === 1 && rows(r)[0].second === 0);
await expect('a learner cannot grant membership by hand', () => as('learner', () => q("select breadmaker.set_membership('other@example.com', 30)")), (r, e) => !!e);
await expect('the owner can give days and end a membership', async () => {
  await as('owner', () => q("select breadmaker.set_membership('other@example.com', 10, 'gift')"));
  const open = await canOpen('other', 'hub-general');
  await as('owner', () => q("select breadmaker.set_membership('other@example.com', 0)"));
  return { rows: [{ open, closed: !(await canOpen('other', 'hub-general')) }] };
}, (r) => rows(r)[0].open === true && rows(r)[0].closed === true);
await expect('a learner cannot read the member list', () => as('learner', () => q('select * from breadmaker.list_memberships()')), (r, e) => !e && rows(r).length === 0);

// Dual currency: every price carries an amount in the other currency.
await expect('the public price list carries the dollar amount', () => as('anon', () => q("select tier, alt_price_minor from breadmaker.leak_test_price_list() where tier = 'report'")), (r, e) => !e && rows(r)[0].alt_price_minor === 200000);
await expect('a learner cannot set a program price', () => as('learner', () => q("select breadmaker.set_program_tier('launchpad', 'guided', 1, 'NGN', 1, true)")), (r, e) => !!e);
await expect('the owner sets a program price in both currencies', async () => {
  await as('owner', () => q("select breadmaker.set_program_tier('launchpad', 'guided', 18000000, 'NGN', 12000, true)"));
  return as('anon', () => q("select price_minor, currency, alt_price_minor from breadmaker.program_tier_list() where program = 'launchpad' and tier = 'guided'"));
}, (r, e) => !e && rows(r)[0].price_minor === 18000000 && rows(r)[0].alt_price_minor === 12000);
await expect('a negative dollar price is refused', () => as('owner', () => q("select breadmaker.set_program_tier('launchpad', 'guided', 18000000, 'NGN', -1, true)")), (r, e) => !!e);
await expect('a learner cannot set a course dollar price', async () => { const id = await courseId('hub-general'); return as('learner', () => q('select breadmaker.set_course_alt_price($1, 5000)', [id])); }, (r, e) => !!e);
await expect('the owner sets a course dollar price and the public list shows it', async () => {
  const id = await courseId('hub-general');
  await as('owner', () => q('select breadmaker.set_course_alt_price($1, 5000)', [id]));
  return as('anon', () => q('select alt_price_minor from breadmaker.course_alt_prices() where course_id = $1', [id]));
}, (r, e) => !e && rows(r)[0]?.alt_price_minor === 5000);
await expect('kit offers carry the dollar amount', async () => {
  await db.exec("update breadmaker.lms_courses set alt_price_minor = 4000 where kit_system_id = 'lead-capture-and-follow-up'");
  return as('anon', () => q('select alt_price_minor from breadmaker.kit_offers()'));
}, (r, e) => !e && rows(r)[0].alt_price_minor === 4000);

// Leads: Leak Test submitters are copied in; only the team reads them; anyone with the link can unsubscribe.
await expect('a Leak Test submission becomes a lead', () => as('owner', () => q("select count(*)::int n from breadmaker.leads where source = 'leak-test'")), (r, e) => !e && rows(r)[0].n >= 1);
await expect('a Leak Test lead has not agreed to the newsletter yet', () => as('owner', () => q("select count(*)::int n from breadmaker.leads where source = 'leak-test' and newsletter_consented_at is not null")), (r, e) => !e && rows(r)[0].n === 0);
await expect('anon cannot read leads', () => as('anon', () => q('select * from breadmaker.leads')), (r, e) => !!e || rows(r).length === 0);
await expect('anon cannot write leads', () => as('anon', () => q("insert into breadmaker.leads (email, consent_text) values ('x@example.com', 'x')")), (r, e) => !!e);
await expect('a learner sees no leads', () => as('learner', () => q('select * from breadmaker.list_leads()')), (r, e) => !e && rows(r).length === 0);
await expect('the owner lists leads', () => as('owner', () => q('select * from breadmaker.list_leads()')), (r, e) => !e && rows(r).length >= 1);
await expect('anon unsubscribes with the link token', async () => {
  const t = await as('owner', () => q("select unsubscribe_token t from breadmaker.leads limit 1"));
  const done = await as('anon', () => q('select breadmaker.unsubscribe_lead($1::uuid) ok', [rows(t)[0].t]));
  return done;
}, (r, e) => !e && rows(r)[0].ok === true);
await expect('a wrong token unsubscribes nobody', () => as('anon', () => q("select breadmaker.unsubscribe_lead('00000000-0000-0000-0000-000000000000'::uuid) ok")), (r, e) => !e && rows(r)[0].ok === false);
await expect('the unsubscribe is recorded', () => as('owner', () => q('select count(*)::int n from breadmaker.leads where unsubscribed_at is not null')), (r, e) => !e && rows(r)[0].n === 1);

// The chat agent's tools (migration 39): live prices, a lookup by WhatsApp number, and the turn log.
await db.exec("insert into breadmaker.leak_test_submissions (name, email, whatsapp, consent, answers, pillar_scores, total, band, archetype, leakiest) values ('Ade', 'Ade@Example.com', '+234 806 411 8424', true, array_fill(2, array[30]), array_fill(50, array[6]), 50, 'surviving', 'The Builder', 'Sales and Lead Flow')");
await db.exec("insert into breadmaker.payments (tx_ref, program, tier, email, phone, amount_minor, currency, status, paid_at) values ('bm-leaktest-agent-1', 'leaktest', 'report', 'ade@example.com', '08064118424', 2700, 'USD', 'successful', now())");
await db.exec("insert into breadmaker.memberships (email, plan_code, current_period_end) values ('ade@example.com', 'hub', now() + interval '36500 days') on conflict (email) do nothing");
await expect('the agent price list mirrors the live price tables', async () => {
  const p = rows(await asServiceRole(() => q('select breadmaker.agent_prices() as p')))[0].p;
  const tiers = rows(await db.query('select count(*)::int n from breadmaker.program_tiers where active'))[0].n;
  const leak = rows(await db.query('select count(*)::int n from breadmaker.leak_test_prices where active'))[0].n;
  const partner = p.prestige.find((x) => x.plan === 'partner');
  const hub = p.prestige.find((x) => x.plan === 'hub');
  return { rows: [{ programs: p.programs.length === tiers, leak: p.leak_test.length === leak, plans: p.prestige.length === 2 && !!hub && !!partner, partnerOffSale: partner.on_sale === false && partner.one_time === false }] };
}, (r, e) => !e && Object.values(rows(r)[0]).every((x) => x === true));
await expect('anon and signed-in users cannot run the agent functions', async () => {
  let refused = 0;
  for (const who of ['anon', 'learner', 'owner']) {
    try { await as(who, () => q('select breadmaker.agent_prices()')); } catch { refused += 1; }
    try { await as(who, () => q("select breadmaker.agent_customer_lookup('08064118424')")); } catch { refused += 1; }
  }
  return { rows: [{ refused }] };
}, (r) => rows(r)[0].refused === 6);
await expect('a number is matched however it is written and returns the person\'s records', () => asServiceRole(() => q("select breadmaker.agent_customer_lookup('+2348064118424') as c")), (r, e) => {
  if (e) return false;
  const c = rows(r)[0].c;
  return c.found === true && c.name === 'Ade' && c.leak_tests.length === 1 && c.leak_tests[0].score === 50 && c.payments.length === 1 && c.payments[0].for === 'Leak Test report' && c.membership[0].active === true && c.membership[0].lifetime === true;
});
await expect('the same number in local format finds the same person', () => asServiceRole(() => q("select breadmaker.agent_customer_lookup('0806 411 8424') as c")), (r, e) => !e && rows(r)[0].c.found === true);
await expect('an unknown number finds nothing and reveals nothing', () => asServiceRole(() => q("select breadmaker.agent_customer_lookup('08099999999') as c")), (r, e) => !e && rows(r)[0].c.found === false && Object.keys(rows(r)[0].c).length === 1);
await expect('a number that is too short is refused', () => asServiceRole(() => q("select breadmaker.agent_customer_lookup('123') as c")), (r, e) => !e && rows(r)[0].c.found === false);
await expect('a message id can be recorded once', async () => {
  await asServiceRole(() => q("insert into breadmaker.agent_turns (message_id, conversation_id) values ('m-1', 'c-1')"));
  let duplicate = false;
  try { await asServiceRole(() => q("insert into breadmaker.agent_turns (message_id) values ('m-1')")); } catch { duplicate = true; }
  return { rows: [{ duplicate }] };
}, (r) => rows(r)[0].duplicate === true);
await expect('the team reads the turn log and learners do not', async () => {
  const team = rows(await as('owner', () => q('select count(*)::int n from breadmaker.agent_turns')))[0].n;
  const learner = rows(await as('learner', () => q('select count(*)::int n from breadmaker.agent_turns')))[0].n;
  return { rows: [{ team, learner }] };
}, (r) => rows(r)[0].team === 1 && rows(r)[0].learner === 0);

// Lesson coach: the edge function writes with the service role; a learner reads and deletes only their own messages.
await asServiceRole(() => q(
  `insert into breadmaker.lms_tutor_messages (user_id, lesson_id, role, content) values ($1, $3, 'user', 'q1'), ($1, $3, 'assistant', 'a1'), ($2, $3, 'user', 'q2')`,
  [U.learner, U.other, lockedLesson],
));
await expect('a learner reads only their own coach messages', () => as('learner', () => q('select content from breadmaker.lms_tutor_messages order by id')), (r, e) => !e && rows(r).length === 2 && rows(r).every((x) => x.content !== 'q2'));
await expect('anon reads no coach messages', () => as('anon', () => q('select * from breadmaker.lms_tutor_messages')), (r, e) => !!e || rows(r).length === 0);
await expect('a learner cannot write coach messages directly', () => as('learner', () => q(`insert into breadmaker.lms_tutor_messages (user_id, lesson_id, role, content) values ('${U.learner}', '${lockedLesson}', 'assistant', 'fake')`)), (r, e) => !!e);
await expect('a learner deletes only their own coach messages', async () => {
  await as('learner', () => q('delete from breadmaker.lms_tutor_messages'));
  const remaining = rows(await asServiceRole(() => q('select user_id from breadmaker.lms_tutor_messages')));
  return { rows: [{ n: remaining.length, who: remaining[0]?.user_id }] };
}, (r) => rows(r)[0].n === 1 && rows(r)[0].who === U.other);

// Evidence and mastery: learners submit, coaches review, nobody passes their own work.
const evLesson = lockedLesson; // a Foundry session the enrolled learner can open; it has an action and a done-when
const myEvidence = (who, sql, params) => as(who, () => q(sql, params));
await expect('a session with an action and a done-when takes evidence', () => q(`select count(*)::int n from breadmaker.lms_lesson_content where lesson_id = $1 and action <> '' and done_when <> ''`, [evLesson]), (r) => rows(r)[0].n === 1);
await expect('anon cannot submit evidence', () => myEvidence('anon', `select breadmaker.submit_evidence($1, 'x')`, [evLesson]), (r, e) => !!e);
await expect('a learner without access cannot submit evidence', () => myEvidence('other', `select breadmaker.submit_evidence($1, 'I did it')`, [evLesson]), (r, e) => !!e && /not open to your account/.test(e.message));
await expect('an empty submission is refused', () => myEvidence('learner', `select breadmaker.submit_evidence($1, '   ')`, [evLesson]), (r, e) => !!e && /Add a note/.test(e.message));
await expect('a link must be http or https', () => myEvidence('learner', `select breadmaker.submit_evidence($1, '', array['javascript:alert(1)'])`, [evLesson]), (r, e) => !!e && /http/.test(e.message));
await expect('more than five links are refused', () => myEvidence('learner', `select breadmaker.submit_evidence($1, '', array['https://a.co/1','https://a.co/2','https://a.co/3','https://a.co/4','https://a.co/5','https://a.co/6'])`, [evLesson]), (r, e) => !!e && /five links/.test(e.message));
await expect('a file outside the learner\'s own folder is refused', () => myEvidence('learner', `select breadmaker.submit_evidence($1, '', '{}', jsonb_build_array(jsonb_build_object('path', '${U.other}/x/a.png', 'name', 'a.png')))`, [evLesson]), (r, e) => !!e && /own folder/.test(e.message));
await expect('a learner cannot write submissions directly', () => as('learner', () => q(`insert into breadmaker.lms_submissions (user_id, lesson_id, status) values ('${U.learner}', $1, 'passed')`, [evLesson])), (r, e) => !!e);
await expect('a learner submits a note, a link and a file', () => myEvidence('learner', `select breadmaker.submit_evidence($1, 'Tested from my phone', array['https://example.com/proof'], jsonb_build_array(jsonb_build_object('path', '${U.learner}/${evLesson}/shot.png', 'name', 'shot.png')))`, [evLesson]), (r, e) => !e);
await expect('the submission is waiting with three evidence items', async () => {
  const s = rows(await as('learner', () => q(`select s.id, s.status, (select count(*)::int from breadmaker.lms_evidence e where e.submission_id = s.id) n from breadmaker.lms_submissions s where s.lesson_id = $1`, [evLesson])))[0];
  return { rows: [s] };
}, (r) => rows(r)[0].status === 'submitted' && rows(r)[0].n === 3);
await expect('submitting marks the session done', () => as('learner', () => q(`select 1 from breadmaker.lms_lesson_progress where lesson_id = $1`, [evLesson])), (r) => rows(r).length === 1);
await expect('another learner cannot read the submission or its evidence', async () => {
  const s = rows(await as('other', () => q('select * from breadmaker.lms_submissions'))).length;
  const e = rows(await as('other', () => q('select * from breadmaker.lms_evidence'))).length;
  return { rows: [{ s, e }] };
}, (r) => rows(r)[0].s === 0 && rows(r)[0].e === 0);
const subId = rows(await q(`select id from breadmaker.lms_submissions where lesson_id = $1 and user_id = $2`, [evLesson, U.learner]))[0].id;
await expect('a learner cannot review their own work', () => as('learner', () => q(`select breadmaker.review_submission($1, 'passed', '')`, [subId])), (r, e) => !!e && /Only owners and coaches/.test(e.message));
await expect('a learner cannot change their own status directly', () => as('learner', () => q(`update breadmaker.lms_submissions set status = 'passed' where id = $1`, [subId])), (r, e) => !!e);
await expect('the status stayed submitted', () => q(`select status from breadmaker.lms_submissions where id = $1`, [subId]), (r) => rows(r)[0].status === 'submitted');
await expect('the review queue lists the work for the team and nothing for learners', async () => {
  const team = rows(await as('coach', () => q('select * from breadmaker.review_queue()'))).filter((x) => x.status === 'submitted').length;
  const learner = rows(await as('learner', () => q('select * from breadmaker.review_queue()'))).length;
  return { rows: [{ team, learner }] };
}, (r) => rows(r)[0].team === 1 && rows(r)[0].learner === 0);
await expect('the team reads the evidence', () => as('coach', () => q('select * from breadmaker.lms_evidence where submission_id = $1', [subId])), (r) => rows(r).length === 3);
await expect('sending work back needs a note', () => as('coach', () => q(`select breadmaker.review_submission($1, 'needs_revision', '  ')`, [subId])), (r, e) => !!e && /what to fix/.test(e.message));
await expect('a coach sends work back with a note', () => as('coach', () => q(`select breadmaker.review_submission($1, 'needs_revision', 'Show the confirmation email')`, [subId])), (r, e) => !e);
await expect('the learner sees the coach note', () => as('learner', () => q(`select status, review_note from breadmaker.lms_submissions where id = $1`, [subId])), (r) => rows(r)[0].status === 'needs_revision' && rows(r)[0].review_note === 'Show the confirmation email');
await expect('resubmitting replaces the evidence and goes back to the coach', async () => {
  await as('learner', () => q(`select breadmaker.submit_evidence($1, 'Here is the email')`, [evLesson]));
  const s = rows(await q(`select s.status, s.review_note, (select count(*)::int from breadmaker.lms_evidence e where e.submission_id = s.id) n from breadmaker.lms_submissions s where s.id = $1`, [subId]))[0];
  return { rows: [s] };
}, (r) => rows(r)[0].status === 'submitted' && rows(r)[0].review_note === '' && rows(r)[0].n === 1);
await expect('a coach passes the work', () => as('coach', () => q(`select breadmaker.review_submission($1, 'passed', 'Looks right')`, [subId])), (r, e) => !e);
await expect('passed work cannot be replaced by the learner', () => as('learner', () => q(`select breadmaker.submit_evidence($1, 'sneaky')`, [evLesson])), (r, e) => !!e && /already passed/.test(e.message));
await expect('mastery counts the passed session', () => as('learner', () => q('select passed, in_review, needs_revision, evidence_sessions from breadmaker.my_mastery()')), (r) => rows(r).length === 1 && rows(r)[0].passed === 1 && rows(r)[0].in_review === 0 && rows(r)[0].evidence_sessions > 0);
await expect('a learner cannot delete evidence directly', () => as('learner', () => q('delete from breadmaker.lms_evidence')), (r, e) => !!e);

// The "which migrations are applied" snippet works and reports everything applied on a fully migrated database.
await expect('the applied-migrations check reports every migration applied', () => q(fs.readFileSync(path.join(MIG, '..', 'snippets', 'check-applied-migrations.sql'), 'utf8')), (r, e) => !e && rows(r).length === 27 && rows(r).every((x) => x.applied === true));

// Kit lessons: steps 1 to 4 of every kit carry real content; the closing "definition of done" session is untouched.
const kitSteps = `select lc.body, lc.action, lc.done_when from breadmaker.lms_lesson_content lc join breadmaker.lms_lessons l on l.id = lc.lesson_id join breadmaker.lms_courses c on c.id = l.course_id where c.kit_system_id is not null and l.position <= 4`;
await expect('every kit step has a body, an action and a done-when', () => q(kitSteps), (r, e) => !e && rows(r).length === 24 && rows(r).every((x) => x.body.length > 200 && x.body !== x.action && x.action && x.done_when));
await expect('re-running the kit content migration changes nothing', async () => {
  const before = JSON.stringify(rows(await q(`${kitSteps} order by lc.lesson_id`)));
  await db.exec(fs.readFileSync(path.join(MIG, '20240101000041_kit_lesson_content.sql'), 'utf8'));
  return { rows: [{ same: before === JSON.stringify(rows(await q(`${kitSteps} order by lc.lesson_id`))) }] };
}, (r) => rows(r)[0].same === true);
await expect('the definition-of-done session keeps its own content', () => q(`select count(*)::int n from breadmaker.lms_lesson_content lc join breadmaker.lms_lessons l on l.id = lc.lesson_id join breadmaker.lms_courses c on c.id = l.course_id where c.kit_system_id is not null and l.title = 'Your definition of done' and lc.done_when = 'Every line above is true for your business.'`), (r, e) => !e && rows(r)[0].n === 6);
await expect('a step the team has edited is not overwritten', async () => {
  await q(`update breadmaker.lms_lesson_content set body = 'Team edit', action = 'Team action', done_when = '' where lesson_id = (select l.id from breadmaker.lms_lessons l join breadmaker.lms_courses c on c.id = l.course_id where c.kit_system_id = 'delegation-pack' and l.position = 1)`);
  await db.exec(fs.readFileSync(path.join(MIG, '20240101000041_kit_lesson_content.sql'), 'utf8'));
  return q(`select lc.body from breadmaker.lms_lesson_content lc join breadmaker.lms_lessons l on l.id = lc.lesson_id join breadmaker.lms_courses c on c.id = l.course_id where c.kit_system_id = 'delegation-pack' and l.position = 1`);
}, (r, e) => !e && rows(r)[0].body === 'Team edit');

// Launch metrics: visitors record funnel starts, only the team reads the numbers.
const metricsOf = async (who) => Object.fromEntries(rows(await as(who, () => q('select metric, current_count::int c, previous_count::int p from breadmaker.launch_metrics(30)'))).map((x) => [x.metric, x]));
await expect('anon records a leak test start', () => as('anon', () => q(`select breadmaker.track_event('leaktest_start', 'session-aaaa-0001')`)), (r, e) => !e);
await expect('the same visitor twice in a day counts once', () => as('anon', () => q(`select breadmaker.track_event('leaktest_start', 'session-aaaa-0001')`)), (r, e) => !e);
await expect('a second visitor counts separately', () => as('anon', () => q(`select breadmaker.track_event('leaktest_start', 'session-bbbb-0002')`)), (r, e) => !e);
await expect('an unknown event is ignored, not an error', () => as('anon', () => q(`select breadmaker.track_event('drop_table', 'session-cccc-0003')`)), (r, e) => !e);
await expect('a too-short session id is ignored', () => as('anon', () => q(`select breadmaker.track_event('foundry_apply_start', 'x')`)), (r, e) => !e);
await expect('anon cannot read recorded events', () => as('anon', () => q('select * from breadmaker.site_events')), (r, e) => !!e);
await expect('anon cannot read launch metrics', () => as('anon', () => q('select * from breadmaker.launch_metrics(30)')), (r, e) => !!e);
await expect('a learner cannot read launch metrics', () => as('learner', () => q('select * from breadmaker.launch_metrics(30)')), (r, e) => !!e);
await expect('the team reads launch metrics: only real events are stored', async () => {
  const m = await metricsOf('coach');
  const stored = rows(await q(`select name, count(*)::int n from breadmaker.site_events group by name`));
  return { rows: [{ m, stored }] };
}, (r, e) => {
  if (e) return false;
  const { m, stored } = rows(r)[0];
  return Object.keys(m).length === 8 && m.leaktest_start.c === 2 && m.foundry_apply_start.c === 0 && stored.length === 1 && stored[0].name === 'leaktest_start';
});
await expect('completions, applications and paid enrolments come from their own records', async () => {
  const m = await metricsOf('owner');
  const counts = rows(await q(`select (select count(*)::int from breadmaker.leak_test_submissions) subs, (select count(*)::int from breadmaker.applications where program = 'foundry') foundry, (select count(*)::int from breadmaker.payments where status = 'successful' and program not in ('leaktest', 'membership')) paid`))[0];
  return { rows: [{ m, counts }] };
}, (r, e) => {
  if (e) return false;
  const { m, counts } = rows(r)[0];
  return counts.subs > 0 && counts.paid > 0 && m.leaktest_complete.c === counts.subs && m.application_foundry.c === counts.foundry && m.paid_enrolment.c === counts.paid;
});
await expect('older records fall in the previous period', async () => {
  await q(`update breadmaker.site_events set created_at = now() - interval '40 days' where session_id = 'session-bbbb-0002'`);
  const m = await metricsOf('owner');
  return { rows: [m.leaktest_start] };
}, (r, e) => !e && rows(r)[0].c === 1 && rows(r)[0].p === 1);

// Referral program (migration 54): codes, claiming, commission from the referred person's payments, payouts.
U.newbie = '00000000-0000-0000-0000-000000000005';
U.veteran = '00000000-0000-0000-0000-000000000006';
U.buyer = '00000000-0000-0000-0000-000000000007';
await db.exec(`insert into auth.users (id, email) values ('${U.newbie}', 'newbie@example.com'), ('${U.buyer}', 'buyer@example.com')`);
await db.exec(`insert into auth.users (id, email, created_at) values ('${U.veteran}', 'veteran@example.com', now() - interval '30 days')`);
const refCode = async () => rows(await as('learner', () => q('select breadmaker.my_referral_code() c')))[0].c;
const claim = (who, code) => as(who, () => q('select breadmaker.claim_referral($1) ok', [code]));
const summary = async (who) => rows(await as(who, () => q('select breadmaker.my_referral_summary() s')))[0].s;
const myCode = await refCode();
await expect('anon cannot get a referral code', () => as('anon', () => q('select breadmaker.my_referral_code()')), (r, e) => !!e);
await expect('a member gets one stable referral code', async () => ({ rows: [{ a: myCode, b: await refCode() }] }), (r, e) => !e && /^[0-9a-f]{8}$/.test(rows(r)[0].a) && rows(r)[0].a === rows(r)[0].b);
await expect('nobody can read the referral tables directly', () => as('learner', () => q('select * from breadmaker.referrals')), (r, e) => !!e);
await expect('you cannot refer yourself', () => claim('learner', myCode), (r, e) => !e && rows(r)[0].ok === false);
await expect('an unknown code is ignored', () => claim('newbie', 'nosuchcode'), (r, e) => !e && rows(r)[0].ok === false);
await expect('an account older than a week cannot be referred', () => claim('veteran', myCode), (r, e) => !e && rows(r)[0].ok === false);
await db.exec(`insert into breadmaker.payments (tx_ref, program, tier, email, amount_minor, currency, status, paid_at) values ('ref-0', 'kit', 'x', 'buyer@example.com', 1000, 'NGN', 'successful', now())`);
await expect('someone who already paid us cannot be referred', () => claim('buyer', myCode), (r, e) => !e && rows(r)[0].ok === false);
await expect('a new account is recorded as referred, once', async () => {
  const first = rows(await claim('newbie', myCode))[0].ok;
  const again = rows(await claim('newbie', myCode.toUpperCase()))[0].ok;
  return { rows: [{ first, again }] };
}, (r, e) => !e && rows(r)[0].first === true && rows(r)[0].again === false);
await expect('a referral with no payments earns nothing yet', () => summary('learner'), (s, e) => !e && s.referrals.length === 1 && s.earned.length === 0 && s.rate_pct === 20 && s.window_months === 12 && Object.keys(s.referrals[0]).sort().join() === 'earned,joined_at');
await db.exec(`insert into breadmaker.payments (tx_ref, program, tier, email, amount_minor, currency, status, user_id, paid_at) values
  ('ref-1', 'kit', 'x', 'newbie@example.com', 500000, 'NGN', 'successful', '${U.newbie}', now()),
  ('ref-2', 'kit', 'x', 'NEWBIE@example.com', 1000, 'USD', 'successful', null, now()),
  ('ref-3', 'kit', 'x', 'newbie@example.com', 900000, 'NGN', 'pending', '${U.newbie}', null),
  ('ref-4', 'kit', 'x', 'newbie@example.com', 700000, 'NGN', 'successful', '${U.newbie}', now() - interval '400 days')`);
await expect('commission is 20% of successful payments inside the window, matched by user or email', () => summary('learner'), (s, e) => {
  if (e) return false;
  const by = Object.fromEntries(s.earned.map((x) => [x.currency, Number(x.amount_minor)]));
  return by.NGN === 100000 && by.USD === 200 && s.referrals[0].earned.length === 2;
});
await expect('a learner cannot read the payout ledger', () => as('learner', () => q('select * from breadmaker.referral_ledger_admin()')), (r, e) => !!e);
await expect('the owner sees what is owed', () => as('owner', () => q("select currency, owed_minor from breadmaker.referral_ledger_admin() where email = 'learner@example.com' order by currency")), (r, e) => !e && rows(r).length === 2 && Number(rows(r)[0].owed_minor) === 100000 && Number(rows(r)[1].owed_minor) === 200);
await expect('paying more than is owed is refused', () => as('owner', () => q('select breadmaker.record_referral_payout($1, $2, 100001, $3)', [U.learner, 'NGN', 'too much'])), (r, e) => !!e);
await expect('a learner cannot record a payout', () => as('learner', () => q('select breadmaker.record_referral_payout($1, $2, 1000, $3)', [U.learner, 'NGN', 'self'])), (r, e) => !!e);
await expect('a payout reduces what is owed and shows as paid', async () => {
  await as('owner', () => q('select breadmaker.record_referral_payout($1, $2, 60000, $3)', [U.learner, 'NGN', 'bank transfer']));
  const s = await summary('learner');
  const owed = rows(await as('owner', () => q("select owed_minor from breadmaker.referral_ledger_admin() where email = 'learner@example.com' and currency = 'NGN'")))[0].owed_minor;
  return { rows: [{ s, owed }] };
}, (r, e) => !e && Number(rows(r)[0].owed) === 40000 && Number(rows(r)[0].s.paid[0].amount_minor) === 60000);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
