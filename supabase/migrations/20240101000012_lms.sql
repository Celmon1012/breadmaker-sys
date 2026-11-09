-- Breadmaker LMS: courses, weeks (modules), lessons, downloads, enrollment and progress.
--
-- Mirrors the Prof. Sherley (ITA) LMS, adapted to the Breadmaker programs:
--   * Content is Course -> Module (a week or a day) -> Lesson (a session).
--   * Every lesson can carry one action and its definition of done, and every
--     module a "done when" checklist, as the Foundry curriculum requires.
--   * Access is by manual enrollment (the pilot is run by hand) or a free course.
--
-- Everything lives in the breadmaker schema. Storage policy names are prefixed
-- with "breadmaker lms:" because storage.objects is shared with other apps on
-- this Supabase instance. Requires 20240101000011_lock_down_breadmaker.sql.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Team roles. Owner: everything. Coach: edits content and enrolls learners.
-- Support: read-only access to the team dashboard.
-- Existing profiles with role 'admin' are treated as Owners.

create table if not exists breadmaker.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('Owner', 'Coach', 'Support')) default 'Support',
  created_at timestamptz not null default now()
);

insert into breadmaker.team_members (user_id, role)
select id, 'Owner' from breadmaker.profiles where role = 'admin'
on conflict (user_id) do nothing;

create or replace function breadmaker.team_role(check_user_id uuid default auth.uid())
returns text
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select coalesce(
    (select role from breadmaker.team_members where user_id = check_user_id),
    case when breadmaker.is_admin(check_user_id) then 'Owner' end
  );
$$;

create or replace function breadmaker.is_team_member(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select breadmaker.team_role(check_user_id) is not null;
$$;

create or replace function breadmaker.can_edit_content(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select coalesce(breadmaker.team_role(check_user_id) in ('Owner', 'Coach'), false);
$$;

create or replace function breadmaker.is_owner(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select coalesce(breadmaker.team_role(check_user_id) = 'Owner', false);
$$;

alter table breadmaker.team_members enable row level security;
drop policy if exists "Team can view the team" on breadmaker.team_members;
create policy "Team can view the team" on breadmaker.team_members
  for select using (breadmaker.is_team_member());

-- ---------------------------------------------------------------------------
-- Content

create table if not exists breadmaker.lms_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  program text not null check (program in ('foundry', 'launchpad', 'general')) default 'general',
  audience text not null default '',
  status text not null check (status in ('Published', 'Draft')) default 'Draft',
  cover_url text,
  -- Price in minor units of currency. null = not sold online (enrollment only), 0 = free.
  price_minor integer check (price_minor is null or price_minor >= 0),
  currency text not null check (currency in ('usd', 'ngn')) default 'usd',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists breadmaker.lms_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references breadmaker.lms_courses(id) on delete cascade,
  title text not null,
  summary text not null default '',
  position integer not null default 0,
  done_when text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists breadmaker.lms_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references breadmaker.lms_courses(id) on delete cascade,
  module_id uuid references breadmaker.lms_modules(id) on delete cascade,
  title text not null,
  session_type text not null check (session_type in ('lesson', 'live', 'working')) default 'lesson',
  duration_minutes integer not null default 10,
  position integer not null default 0,
  status text not null check (status in ('Published', 'Draft')) default 'Draft',
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists breadmaker.lms_lesson_content (
  lesson_id uuid primary key references breadmaker.lms_lessons(id) on delete cascade,
  video_url text,
  body text not null default '',
  -- The one action this session ends with, and how the learner knows it is done.
  action text not null default '',
  done_when text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists breadmaker.lms_course_tools (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references breadmaker.lms_courses(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists breadmaker.lms_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references breadmaker.lms_courses(id) on delete cascade,
  source text not null check (source in ('manual', 'free', 'purchase')) default 'manual',
  note text not null default '',
  enrolled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists breadmaker.lms_lesson_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references breadmaker.lms_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists lms_modules_course_idx on breadmaker.lms_modules (course_id, position);
create index if not exists lms_lessons_course_idx on breadmaker.lms_lessons (course_id, position);
create index if not exists lms_lessons_module_idx on breadmaker.lms_lessons (module_id);
create index if not exists lms_tools_course_idx on breadmaker.lms_course_tools (course_id);
create index if not exists lms_enrollments_course_idx on breadmaker.lms_enrollments (course_id);
create index if not exists lms_progress_lesson_idx on breadmaker.lms_lesson_progress (lesson_id);

-- ---------------------------------------------------------------------------
-- Access

-- Only ever checks the caller, so it is safe to expose via RPC.
create or replace function breadmaker.has_course_access(check_course_id uuid)
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select breadmaker.is_team_member(auth.uid())
    or exists (select 1 from breadmaker.lms_enrollments where user_id = auth.uid() and course_id = check_course_id)
    or exists (select 1 from breadmaker.lms_courses where id = check_course_id and status = 'Published' and price_minor = 0);
$$;

-- Team members always; otherwise the lesson and course are published and the
-- lesson is a free preview or the caller has access to the course.
create or replace function breadmaker.can_view_lesson(check_lesson_id uuid)
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select breadmaker.is_team_member(auth.uid()) or exists (
    select 1
    from breadmaker.lms_lessons l
    join breadmaker.lms_courses c on c.id = l.course_id
    where l.id = check_lesson_id
      and l.status = 'Published'
      and c.status = 'Published'
      and (l.is_preview or breadmaker.has_course_access(l.course_id))
  );
$$;

alter table breadmaker.lms_courses enable row level security;
alter table breadmaker.lms_modules enable row level security;
alter table breadmaker.lms_lessons enable row level security;
alter table breadmaker.lms_lesson_content enable row level security;
alter table breadmaker.lms_course_tools enable row level security;
alter table breadmaker.lms_enrollments enable row level security;
alter table breadmaker.lms_lesson_progress enable row level security;

-- The syllabus (course, weeks, lesson titles) of a published course is public;
-- lesson content is not.
drop policy if exists "Published courses are public" on breadmaker.lms_courses;
create policy "Published courses are public" on breadmaker.lms_courses
  for select using (status = 'Published' or breadmaker.is_team_member());
drop policy if exists "Editors manage courses" on breadmaker.lms_courses;
create policy "Editors manage courses" on breadmaker.lms_courses
  for all using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Modules of published courses are public" on breadmaker.lms_modules;
create policy "Modules of published courses are public" on breadmaker.lms_modules
  for select using (
    breadmaker.is_team_member() or exists (
      select 1 from breadmaker.lms_courses c where c.id = lms_modules.course_id and c.status = 'Published'
    )
  );
drop policy if exists "Editors manage modules" on breadmaker.lms_modules;
create policy "Editors manage modules" on breadmaker.lms_modules
  for all using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Published lessons are public" on breadmaker.lms_lessons;
create policy "Published lessons are public" on breadmaker.lms_lessons
  for select using (
    breadmaker.is_team_member() or (
      status = 'Published' and exists (
        select 1 from breadmaker.lms_courses c where c.id = lms_lessons.course_id and c.status = 'Published'
      )
    )
  );
drop policy if exists "Editors manage lessons" on breadmaker.lms_lessons;
create policy "Editors manage lessons" on breadmaker.lms_lessons
  for all using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Viewable lesson content" on breadmaker.lms_lesson_content;
create policy "Viewable lesson content" on breadmaker.lms_lesson_content
  for select using (breadmaker.can_view_lesson(lesson_id));
drop policy if exists "Editors manage lesson content" on breadmaker.lms_lesson_content;
create policy "Editors manage lesson content" on breadmaker.lms_lesson_content
  for all using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Learners with access view tools" on breadmaker.lms_course_tools;
create policy "Learners with access view tools" on breadmaker.lms_course_tools
  for select using (breadmaker.has_course_access(course_id));
drop policy if exists "Editors manage tools" on breadmaker.lms_course_tools;
create policy "Editors manage tools" on breadmaker.lms_course_tools
  for all using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

-- Enrollments are written by the team (or later, a verified payment on the server).
drop policy if exists "Learners view own enrollments" on breadmaker.lms_enrollments;
create policy "Learners view own enrollments" on breadmaker.lms_enrollments
  for select using (user_id = auth.uid() or breadmaker.is_team_member());
drop policy if exists "Editors manage enrollments" on breadmaker.lms_enrollments;
create policy "Editors manage enrollments" on breadmaker.lms_enrollments
  for all using (breadmaker.can_edit_content())
  with check (breadmaker.can_edit_content() and source = 'manual');

drop policy if exists "Learners view own progress" on breadmaker.lms_lesson_progress;
create policy "Learners view own progress" on breadmaker.lms_lesson_progress
  for select using (user_id = auth.uid() or breadmaker.is_team_member());
drop policy if exists "Learners record own progress" on breadmaker.lms_lesson_progress;
create policy "Learners record own progress" on breadmaker.lms_lesson_progress
  for insert to authenticated
  with check (user_id = auth.uid() and breadmaker.can_view_lesson(lesson_id));
drop policy if exists "Learners reset own progress" on breadmaker.lms_lesson_progress;
create policy "Learners reset own progress" on breadmaker.lms_lesson_progress
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Read models

-- Published courses with counts, for the catalog. Tool rows stay private; only counts are exposed.
create or replace function breadmaker.course_catalog()
returns table (
  id uuid,
  slug text,
  title text,
  subtitle text,
  description text,
  program text,
  audience text,
  cover_url text,
  price_minor integer,
  currency text,
  module_count integer,
  lesson_count integer,
  preview_count integer,
  total_minutes integer,
  tool_count integer
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select
    c.id, c.slug, c.title, c.subtitle, c.description, c.program, c.audience, c.cover_url,
    c.price_minor, c.currency,
    (select count(*)::int from breadmaker.lms_modules m where m.course_id = c.id),
    (select count(*)::int from breadmaker.lms_lessons l where l.course_id = c.id and l.status = 'Published'),
    (select count(*)::int from breadmaker.lms_lessons l where l.course_id = c.id and l.status = 'Published' and l.is_preview),
    (select coalesce(sum(l.duration_minutes), 0)::int from breadmaker.lms_lessons l where l.course_id = c.id and l.status = 'Published'),
    (select count(*)::int from breadmaker.lms_course_tools t where t.course_id = c.id)
  from breadmaker.lms_courses c
  where c.status = 'Published'
  order by c.created_at;
$$;

-- Names and sizes of a published course's downloads, shown before enrollment.
create or replace function breadmaker.course_tool_summary(check_course_id uuid)
returns table (id uuid, name text, kind text, size_bytes bigint)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select t.id, t.name, t.mime_type, t.size_bytes
  from breadmaker.lms_course_tools t
  join breadmaker.lms_courses c on c.id = t.course_id
  where t.course_id = check_course_id and (c.status = 'Published' or breadmaker.is_team_member())
  order by t.created_at;
$$;

-- Learners and average completion per course, for the team dashboard.
create or replace function breadmaker.course_stats()
returns table (course_id uuid, learners integer, avg_completion integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  with published as (
    select id, course_id from breadmaker.lms_lessons where status = 'Published'
  ), totals as (
    select course_id, count(*) as lesson_total from published group by course_id
  ), learners as (
    select e.course_id, e.user_id from breadmaker.lms_enrollments e
    union
    select p.course_id, lp.user_id from breadmaker.lms_lesson_progress lp join published p on p.id = lp.lesson_id
  ), done as (
    select p.course_id, lp.user_id, count(*) as completed
    from breadmaker.lms_lesson_progress lp join published p on p.id = lp.lesson_id
    group by p.course_id, lp.user_id
  )
  select
    c.id,
    count(l.user_id)::int,
    coalesce(round(avg(coalesce(d.completed, 0)::numeric * 100 / nullif(t.lesson_total, 0))), 0)::int
  from breadmaker.lms_courses c
  left join learners l on l.course_id = c.id and not breadmaker.is_team_member(l.user_id)
  left join done d on d.course_id = c.id and d.user_id = l.user_id
  left join totals t on t.course_id = c.id
  where breadmaker.is_team_member()
  group by c.id;
$$;

-- One row per learner per course they are enrolled in or have progress on, for the team dashboard.
create or replace function breadmaker.learner_progress()
returns table (
  user_id uuid,
  email text,
  full_name text,
  course_id uuid,
  course_title text,
  enrolled boolean,
  source text,
  enrolled_at timestamptz,
  completed_lessons integer,
  total_lessons integer,
  last_activity_at timestamptz
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  with published as (
    select id, course_id from breadmaker.lms_lessons where status = 'Published'
  ), activity as (
    select p.course_id, lp.user_id, count(*)::int as completed, max(lp.completed_at) as last_at
    from breadmaker.lms_lesson_progress lp join published p on p.id = lp.lesson_id
    group by p.course_id, lp.user_id
  ), pairs as (
    select e.user_id, e.course_id from breadmaker.lms_enrollments e
    union
    select a.user_id, a.course_id from activity a
  )
  select
    pr.user_id,
    u.email::text,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    c.id,
    c.title,
    e.id is not null,
    e.source,
    e.created_at,
    coalesce(a.completed, 0),
    (select count(*)::int from published pb where pb.course_id = c.id),
    a.last_at
  from pairs pr
  join breadmaker.lms_courses c on c.id = pr.course_id
  join auth.users u on u.id = pr.user_id
  left join breadmaker.profiles p on p.id = pr.user_id
  left join breadmaker.lms_enrollments e on e.user_id = pr.user_id and e.course_id = pr.course_id
  left join activity a on a.user_id = pr.user_id and a.course_id = pr.course_id
  where breadmaker.is_team_member()
    and not breadmaker.is_team_member(pr.user_id)
  order by coalesce(a.last_at, e.created_at) desc nulls last;
$$;

-- ---------------------------------------------------------------------------
-- Writes

-- Enrolls an existing account by email. Coaches and owners only.
create or replace function breadmaker.enroll_by_email(learner_email text, target_course_id uuid, enrollment_note text default '')
returns uuid
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_user_id uuid;
  v_id uuid;
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can enroll learners.' using errcode = '42501';
  end if;
  select id into v_user_id from auth.users where lower(email) = lower(trim(learner_email));
  if v_user_id is null then
    raise exception 'No account uses %. Ask them to create an account first, then enroll them.', trim(learner_email);
  end if;
  insert into breadmaker.lms_enrollments (user_id, course_id, source, note, enrolled_by)
  values (v_user_id, target_course_id, 'manual', coalesce(enrollment_note, ''), auth.uid())
  on conflict (user_id, course_id) do update set note = excluded.note
  returning id into v_id;
  return v_id;
end;
$$;

-- Team list with emails, for the team page.
create or replace function breadmaker.team_list()
returns table (user_id uuid, email text, full_name text, role text, created_at timestamptz)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select t.user_id, u.email::text,
         nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         t.role, t.created_at
  from breadmaker.team_members t
  join auth.users u on u.id = t.user_id
  left join breadmaker.profiles p on p.id = t.user_id
  where breadmaker.is_team_member()
  order by t.created_at;
$$;

-- Adds or changes a team member by email. Owners only.
create or replace function breadmaker.set_team_member(member_email text, member_role text)
returns uuid
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_user_id uuid;
begin
  if not breadmaker.is_owner() then
    raise exception 'Only owners can change the team.' using errcode = '42501';
  end if;
  if member_role not in ('Owner', 'Coach', 'Support') then
    raise exception 'Unknown role %.', member_role;
  end if;
  select id into v_user_id from auth.users where lower(email) = lower(trim(member_email));
  if v_user_id is null then
    raise exception 'No account uses %. Ask them to create an account first.', trim(member_email);
  end if;
  insert into breadmaker.team_members (user_id, role) values (v_user_id, member_role)
  on conflict (user_id) do update set role = excluded.role;
  return v_user_id;
end;
$$;

-- Removes a team member. Owners only, and never the last owner.
create or replace function breadmaker.remove_team_member(member_user_id uuid)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.is_owner() then
    raise exception 'Only owners can change the team.' using errcode = '42501';
  end if;
  if (select role from breadmaker.team_members where user_id = member_user_id) = 'Owner'
     and (select count(*) from breadmaker.team_members where role = 'Owner') <= 1 then
    raise exception 'Keep at least one owner on the team.';
  end if;
  delete from breadmaker.team_members where user_id = member_user_id;
end;
$$;

-- Saves a course with its modules, lessons (with content) and tools in one transaction.
-- Runs as the caller, so the editor policies still apply. Lessons keep their ids so
-- learner progress stays attached. A new course whose slug is taken gets a numeric suffix.
--
-- payload: { id?, slug, title, subtitle, description, program, audience, status, cover_url,
--            price_minor, currency,
--            modules: [{ id?, client_id, title, summary, done_when: [text],
--                        lessons: [{ id?, client_id, title, session_type, duration_minutes,
--                                    status, is_preview, video_url, body, action, done_when }] }],
--            tools: [{ id?, client_id, name, storage_path, mime_type, size_bytes }] }
create or replace function breadmaker.save_course(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = breadmaker, pg_temp
as $$
declare
  v_course_id uuid := nullif(payload->>'id', '')::uuid;
  v_base_slug text := coalesce(nullif(payload->>'slug', ''), 'course');
  v_slug text := v_base_slug;
  v_attempt integer := 1;
  v_module jsonb;
  v_lesson jsonb;
  v_tool jsonb;
  v_module_id uuid;
  v_id uuid;
  v_module_position integer := 0;
  v_lesson_position integer := 0;
  v_kept_modules uuid[] := '{}';
  v_kept_lessons uuid[] := '{}';
  v_kept_tools uuid[] := '{}';
  v_module_map jsonb := '[]'::jsonb;
  v_lesson_map jsonb := '[]'::jsonb;
  v_tool_map jsonb := '[]'::jsonb;
  v_removed_paths text[];
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can save courses.' using errcode = '42501';
  end if;
  if coalesce(trim(payload->>'title'), '') = '' then
    raise exception 'Add a course title before saving.';
  end if;

  if v_course_id is not null then
    update breadmaker.lms_courses
      set title = trim(payload->>'title'),
          subtitle = coalesce(payload->>'subtitle', ''),
          description = coalesce(payload->>'description', ''),
          program = coalesce(nullif(payload->>'program', ''), 'general'),
          audience = coalesce(payload->>'audience', ''),
          status = coalesce(nullif(payload->>'status', ''), 'Draft'),
          cover_url = nullif(trim(coalesce(payload->>'cover_url', '')), ''),
          price_minor = (payload->>'price_minor')::integer,
          currency = lower(coalesce(nullif(payload->>'currency', ''), 'usd')),
          updated_at = now()
      where id = v_course_id
      returning slug into v_slug;
    if not found then
      raise exception 'This course no longer exists. Reload the dashboard and try again.';
    end if;
  else
    loop
      begin
        insert into breadmaker.lms_courses
          (slug, title, subtitle, description, program, audience, status, cover_url, price_minor, currency, created_by)
        values (
          v_slug, trim(payload->>'title'), coalesce(payload->>'subtitle', ''), coalesce(payload->>'description', ''),
          coalesce(nullif(payload->>'program', ''), 'general'), coalesce(payload->>'audience', ''),
          coalesce(nullif(payload->>'status', ''), 'Draft'), nullif(trim(coalesce(payload->>'cover_url', '')), ''),
          (payload->>'price_minor')::integer, lower(coalesce(nullif(payload->>'currency', ''), 'usd')), auth.uid()
        )
        returning id into v_course_id;
        exit;
      exception when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt > 50 then raise; end if;
        v_slug := v_base_slug || '-' || v_attempt;
      end;
    end loop;
  end if;

  for v_module in select value from jsonb_array_elements(coalesce(payload->'modules', '[]'::jsonb)) loop
    v_module_id := nullif(v_module->>'id', '')::uuid;
    if v_module_id is not null then
      update breadmaker.lms_modules
        set title = coalesce(nullif(trim(v_module->>'title'), ''), 'Untitled module'),
            summary = coalesce(v_module->>'summary', ''),
            position = v_module_position,
            done_when = coalesce(array(select jsonb_array_elements_text(coalesce(v_module->'done_when', '[]'::jsonb))), '{}'),
            updated_at = now()
        where id = v_module_id and course_id = v_course_id;
      if not found then v_module_id := null; end if;
    end if;
    if v_module_id is null then
      insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
      values (
        v_course_id, coalesce(nullif(trim(v_module->>'title'), ''), 'Untitled module'), coalesce(v_module->>'summary', ''),
        v_module_position, coalesce(array(select jsonb_array_elements_text(coalesce(v_module->'done_when', '[]'::jsonb))), '{}')
      )
      returning id into v_module_id;
    end if;
    v_kept_modules := v_kept_modules || v_module_id;
    v_module_map := v_module_map || jsonb_build_array(jsonb_build_object('client_id', v_module->>'client_id', 'id', v_module_id));
    v_module_position := v_module_position + 1;

    for v_lesson in select value from jsonb_array_elements(coalesce(v_module->'lessons', '[]'::jsonb)) loop
      v_id := nullif(v_lesson->>'id', '')::uuid;
      if v_id is not null then
        update breadmaker.lms_lessons
          set module_id = v_module_id,
              title = coalesce(nullif(trim(v_lesson->>'title'), ''), 'Untitled lesson'),
              session_type = coalesce(nullif(v_lesson->>'session_type', ''), 'lesson'),
              duration_minutes = greatest(1, coalesce((v_lesson->>'duration_minutes')::integer, 10)),
              position = v_lesson_position,
              status = coalesce(nullif(v_lesson->>'status', ''), 'Draft'),
              is_preview = coalesce((v_lesson->>'is_preview')::boolean, false),
              updated_at = now()
          where id = v_id and course_id = v_course_id;
        if not found then v_id := null; end if;
      end if;
      if v_id is null then
        insert into breadmaker.lms_lessons (course_id, module_id, title, session_type, duration_minutes, position, status, is_preview)
        values (
          v_course_id, v_module_id, coalesce(nullif(trim(v_lesson->>'title'), ''), 'Untitled lesson'),
          coalesce(nullif(v_lesson->>'session_type', ''), 'lesson'),
          greatest(1, coalesce((v_lesson->>'duration_minutes')::integer, 10)), v_lesson_position,
          coalesce(nullif(v_lesson->>'status', ''), 'Draft'), coalesce((v_lesson->>'is_preview')::boolean, false)
        )
        returning id into v_id;
      end if;
      insert into breadmaker.lms_lesson_content (lesson_id, video_url, body, action, done_when, updated_at)
      values (
        v_id, nullif(trim(coalesce(v_lesson->>'video_url', '')), ''), coalesce(v_lesson->>'body', ''),
        coalesce(v_lesson->>'action', ''), coalesce(v_lesson->>'done_when', ''), now()
      )
      on conflict (lesson_id) do update
        set video_url = excluded.video_url, body = excluded.body, action = excluded.action,
            done_when = excluded.done_when, updated_at = now();
      v_kept_lessons := v_kept_lessons || v_id;
      v_lesson_map := v_lesson_map || jsonb_build_array(jsonb_build_object('client_id', v_lesson->>'client_id', 'id', v_id));
      v_lesson_position := v_lesson_position + 1;
    end loop;
  end loop;
  delete from breadmaker.lms_lessons where course_id = v_course_id and not (id = any(v_kept_lessons));
  delete from breadmaker.lms_modules where course_id = v_course_id and not (id = any(v_kept_modules));

  for v_tool in select value from jsonb_array_elements(coalesce(payload->'tools', '[]'::jsonb)) loop
    v_id := nullif(v_tool->>'id', '')::uuid;
    if v_id is not null and not exists (select 1 from breadmaker.lms_course_tools where id = v_id and course_id = v_course_id) then
      v_id := null;
    end if;
    if v_id is null then
      if coalesce(v_tool->>'storage_path', '') = '' then continue; end if;
      insert into breadmaker.lms_course_tools (course_id, name, storage_path, mime_type, size_bytes, created_by)
      values (v_course_id, v_tool->>'name', v_tool->>'storage_path', v_tool->>'mime_type', (v_tool->>'size_bytes')::bigint, auth.uid())
      returning id into v_id;
    end if;
    v_kept_tools := v_kept_tools || v_id;
    v_tool_map := v_tool_map || jsonb_build_array(jsonb_build_object('client_id', v_tool->>'client_id', 'id', v_id));
  end loop;
  with removed as (
    delete from breadmaker.lms_course_tools
    where course_id = v_course_id and not (id = any(v_kept_tools))
    returning storage_path
  )
  select array_agg(storage_path) into v_removed_paths from removed;

  return jsonb_build_object(
    'id', v_course_id,
    'slug', v_slug,
    'modules', v_module_map,
    'lessons', v_lesson_map,
    'tools', v_tool_map,
    'removed_tool_paths', to_jsonb(coalesce(v_removed_paths, '{}'::text[]))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. RLS decides which rows; these decide which operations reach RLS at all.

grant usage on schema breadmaker to anon, authenticated;
grant select on breadmaker.lms_courses, breadmaker.lms_modules, breadmaker.lms_lessons,
  breadmaker.lms_lesson_content, breadmaker.lms_course_tools to anon, authenticated;
grant select, insert, update, delete on breadmaker.lms_courses, breadmaker.lms_modules,
  breadmaker.lms_lessons, breadmaker.lms_lesson_content, breadmaker.lms_course_tools,
  breadmaker.lms_enrollments to authenticated;
grant select, insert, delete on breadmaker.lms_lesson_progress to authenticated;
grant select on breadmaker.team_members to authenticated;
revoke insert, update, delete, truncate on breadmaker.team_members from anon, authenticated;
revoke all on breadmaker.lms_enrollments, breadmaker.lms_lesson_progress from anon;

revoke all on function breadmaker.save_course(jsonb) from public, anon;
revoke all on function breadmaker.enroll_by_email(text, uuid, text) from public, anon;
revoke all on function breadmaker.set_team_member(text, text) from public, anon;
revoke all on function breadmaker.remove_team_member(uuid) from public, anon;
revoke all on function breadmaker.learner_progress() from public, anon;
revoke all on function breadmaker.team_list() from public, anon;
revoke all on function breadmaker.course_stats() from public, anon;
grant execute on function breadmaker.save_course(jsonb) to authenticated;
grant execute on function breadmaker.enroll_by_email(text, uuid, text) to authenticated;
grant execute on function breadmaker.set_team_member(text, text) to authenticated;
grant execute on function breadmaker.remove_team_member(uuid) to authenticated;
grant execute on function breadmaker.learner_progress() to authenticated;
grant execute on function breadmaker.team_list() to authenticated;
grant execute on function breadmaker.course_stats() to authenticated;
grant execute on function breadmaker.course_catalog() to anon, authenticated;
grant execute on function breadmaker.course_tool_summary(uuid) to anon, authenticated;
grant execute on function breadmaker.has_course_access(uuid) to anon, authenticated;
grant execute on function breadmaker.can_view_lesson(uuid) to anon, authenticated;
grant execute on function breadmaker.team_role(uuid) to anon, authenticated;
grant execute on function breadmaker.is_team_member(uuid) to anon, authenticated;
grant execute on function breadmaker.can_edit_content(uuid) to anon, authenticated;
grant execute on function breadmaker.is_owner(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for course downloads. Paths are "<course_id>/<file>".

insert into storage.buckets (id, name, public, file_size_limit)
values ('breadmaker-course-tools', 'breadmaker-course-tools', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "breadmaker lms: learners with access read tools" on storage.objects;
create policy "breadmaker lms: learners with access read tools" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'breadmaker-course-tools' and (
      breadmaker.is_team_member() or exists (
        select 1 from breadmaker.lms_course_tools t
        where t.storage_path = storage.objects.name and breadmaker.has_course_access(t.course_id)
      )
    )
  );

drop policy if exists "breadmaker lms: editors upload tools" on storage.objects;
create policy "breadmaker lms: editors upload tools" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'breadmaker-course-tools' and breadmaker.can_edit_content());

drop policy if exists "breadmaker lms: editors update tools" on storage.objects;
create policy "breadmaker lms: editors update tools" on storage.objects
  for update to authenticated
  using (bucket_id = 'breadmaker-course-tools' and breadmaker.can_edit_content())
  with check (bucket_id = 'breadmaker-course-tools' and breadmaker.can_edit_content());

drop policy if exists "breadmaker lms: editors delete tools" on storage.objects;
create policy "breadmaker lms: editors delete tools" on storage.objects
  for delete to authenticated
  using (bucket_id = 'breadmaker-course-tools' and breadmaker.can_edit_content());
