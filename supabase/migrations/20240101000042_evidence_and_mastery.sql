-- Evidence and mastery: a learner proves an action worked, a coach reviews it.
--
-- A session that has both an action and a done-when check takes evidence: a note, up to five links and up to
-- three files (screenshots or a PDF). Submitting marks the session done (attempted) and puts it in front of a
-- coach. The coach passes it or sends it back with a note. The state of a session is therefore:
--   not started   no progress row
--   done          marked done, no evidence yet
--   submitted     evidence is with the coach
--   needs_revision  the coach sent it back with a note
--   passed        the coach confirmed the done-when check is true
--
-- Learners and the team read through row-level security; every write goes through the functions below, so
-- a learner cannot pass their own work. Files live in a private bucket under the learner's own folder.
-- Safe to re-run.

create table if not exists breadmaker.lms_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references breadmaker.lms_lessons(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted', 'needs_revision', 'passed')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table if not exists breadmaker.lms_evidence (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references breadmaker.lms_submissions(id) on delete cascade,
  kind text not null check (kind in ('note', 'link', 'file')),
  -- The note text, the link address, or the file's display name.
  text_value text not null default '',
  -- For a file: its path in the breadmaker-evidence bucket.
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists lms_submissions_queue_idx on breadmaker.lms_submissions (status, submitted_at desc);
create index if not exists lms_submissions_lesson_idx on breadmaker.lms_submissions (lesson_id);
create index if not exists lms_evidence_submission_idx on breadmaker.lms_evidence (submission_id);

alter table breadmaker.lms_submissions enable row level security;
alter table breadmaker.lms_evidence enable row level security;

drop policy if exists "Learners and team read submissions" on breadmaker.lms_submissions;
create policy "Learners and team read submissions" on breadmaker.lms_submissions
  for select to authenticated using (user_id = auth.uid() or breadmaker.is_team_member());

drop policy if exists "Learners and team read evidence" on breadmaker.lms_evidence;
create policy "Learners and team read evidence" on breadmaker.lms_evidence
  for select to authenticated using (
    exists (
      select 1 from breadmaker.lms_submissions s
      where s.id = lms_evidence.submission_id and (s.user_id = auth.uid() or breadmaker.is_team_member())
    )
  );

grant select on breadmaker.lms_submissions, breadmaker.lms_evidence to authenticated;
grant select on breadmaker.lms_submissions, breadmaker.lms_evidence to service_role;

-- ---------------------------------------------------------------------------
-- Private bucket for evidence files. Path: "<user id>/<lesson id>/<file>".

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('breadmaker-evidence', 'breadmaker-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists "Breadmaker evidence: learners add their own" on storage.objects;
create policy "Breadmaker evidence: learners add their own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'breadmaker-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Breadmaker evidence: learners and team read" on storage.objects;
create policy "Breadmaker evidence: learners and team read" on storage.objects
  for select to authenticated
  using (bucket_id = 'breadmaker-evidence' and ((storage.foldername(name))[1] = (select auth.uid())::text or breadmaker.is_team_member()));

drop policy if exists "Breadmaker evidence: learners delete their own" on storage.objects;
create policy "Breadmaker evidence: learners delete their own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'breadmaker-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Learner: submit evidence for a session. Replaces the earlier evidence for that session and puts it back
-- with the coach. p_files is a JSON array of {"path": "...", "name": "..."}.

create or replace function breadmaker.submit_evidence(p_lesson uuid, p_note text, p_links text[] default '{}', p_files jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  v_links text[] := '{}';
  v_link text;
  v_file jsonb;
  v_count integer;
  v_status text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to submit evidence.' using errcode = '42501';
  end if;
  if not breadmaker.can_view_lesson(p_lesson) then
    raise exception 'This session is not open to your account.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from breadmaker.lms_lesson_content
    where lesson_id = p_lesson and btrim(action) <> '' and btrim(done_when) <> ''
  ) then
    raise exception 'This session does not take evidence.' using errcode = '22023';
  end if;

  if char_length(v_note) > 4000 then
    raise exception 'Keep the note under 4000 characters.' using errcode = '22023';
  end if;

  foreach v_link in array coalesce(p_links, '{}') loop
    v_link := btrim(coalesce(v_link, ''));
    if v_link = '' then continue; end if;
    if v_link !~* '^https?://[^[:space:]]+$' or char_length(v_link) > 500 then
      raise exception 'Links must start with http:// or https:// and have no spaces.' using errcode = '22023';
    end if;
    v_links := v_links || v_link;
  end loop;
  if coalesce(array_length(v_links, 1), 0) > 5 then
    raise exception 'Add up to five links.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_files, '[]'::jsonb)) <> 'array' then
    raise exception 'Files must be a list.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(coalesce(p_files, '[]'::jsonb));
  if v_count > 3 then
    raise exception 'Add up to three files.' using errcode = '22023';
  end if;
  for v_file in select * from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
    if coalesce(v_file->>'path', '') !~ ('^' || v_user::text || '/[^/].*$') or char_length(v_file->>'path') > 300 then
      raise exception 'A file is not in your own folder.' using errcode = '42501';
    end if;
  end loop;

  if v_note = '' and coalesce(array_length(v_links, 1), 0) = 0 and v_count = 0 then
    raise exception 'Add a note, a link or a file as evidence.' using errcode = '22023';
  end if;

  select status into v_status from breadmaker.lms_submissions where user_id = v_user and lesson_id = p_lesson;
  if v_status = 'passed' then
    raise exception 'A coach already passed this session.' using errcode = '22023';
  end if;

  insert into breadmaker.lms_submissions (user_id, lesson_id, status, review_note, reviewed_by, reviewed_at, submitted_at, updated_at)
  values (v_user, p_lesson, 'submitted', '', null, null, now(), now())
  on conflict (user_id, lesson_id) do update
    set status = 'submitted', review_note = '', reviewed_by = null, reviewed_at = null, submitted_at = now(), updated_at = now()
  returning id into v_id;

  delete from breadmaker.lms_evidence where submission_id = v_id;
  if v_note <> '' then
    insert into breadmaker.lms_evidence (submission_id, kind, text_value) values (v_id, 'note', v_note);
  end if;
  foreach v_link in array v_links loop
    insert into breadmaker.lms_evidence (submission_id, kind, text_value) values (v_id, 'link', v_link);
  end loop;
  for v_file in select * from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
    insert into breadmaker.lms_evidence (submission_id, kind, text_value, storage_path)
    values (v_id, 'file', left(coalesce(nullif(btrim(v_file->>'name'), ''), 'file'), 200), v_file->>'path');
  end loop;

  -- Submitting counts as having done the session.
  insert into breadmaker.lms_lesson_progress (user_id, lesson_id) values (v_user, p_lesson) on conflict do nothing;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Coach: pass a submission or send it back. Owners and coaches only.

create or replace function breadmaker.review_submission(p_submission uuid, p_status text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_user uuid;
  v_lesson uuid;
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can review evidence.' using errcode = '42501';
  end if;
  if p_status not in ('passed', 'needs_revision') then
    raise exception 'A review passes the work or sends it back.' using errcode = '22023';
  end if;
  if p_status = 'needs_revision' and v_note = '' then
    raise exception 'Tell the learner what to fix.' using errcode = '22023';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the note under 2000 characters.' using errcode = '22023';
  end if;

  update breadmaker.lms_submissions
  set status = p_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_submission
  returning user_id, lesson_id into v_user, v_lesson;
  if v_user is null then
    raise exception 'That submission no longer exists.' using errcode = 'P0002';
  end if;

  if p_status = 'passed' then
    insert into breadmaker.lms_lesson_progress (user_id, lesson_id) values (v_user, v_lesson) on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team: the review queue, waiting work first.

create or replace function breadmaker.review_queue()
returns table (
  submission_id uuid,
  user_id uuid,
  email text,
  full_name text,
  course_id uuid,
  course_title text,
  lesson_id uuid,
  lesson_title text,
  status text,
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  evidence_count integer
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select
    s.id,
    s.user_id,
    u.email::text,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    c.id,
    c.title,
    l.id,
    l.title,
    s.status,
    s.review_note,
    s.submitted_at,
    s.reviewed_at,
    (select count(*)::int from breadmaker.lms_evidence e where e.submission_id = s.id)
  from breadmaker.lms_submissions s
  join breadmaker.lms_lessons l on l.id = s.lesson_id
  join breadmaker.lms_courses c on c.id = l.course_id
  join auth.users u on u.id = s.user_id
  left join breadmaker.profiles p on p.id = s.user_id
  where breadmaker.is_team_member()
  order by (s.status = 'submitted') desc, s.submitted_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Learner: how many evidence sessions are passed, waiting or sent back, per course.

create or replace function breadmaker.my_mastery()
returns table (course_id uuid, evidence_sessions integer, passed integer, in_review integer, needs_revision integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  with takes_evidence as (
    select l.course_id, count(*)::int as n
    from breadmaker.lms_lessons l
    join breadmaker.lms_lesson_content lc on lc.lesson_id = l.id
    where l.status = 'Published' and btrim(lc.action) <> '' and btrim(lc.done_when) <> ''
    group by l.course_id
  ), mine as (
    select l.course_id,
           count(*) filter (where s.status = 'passed')::int as passed,
           count(*) filter (where s.status = 'submitted')::int as in_review,
           count(*) filter (where s.status = 'needs_revision')::int as needs_revision
    from breadmaker.lms_submissions s
    join breadmaker.lms_lessons l on l.id = s.lesson_id
    where s.user_id = auth.uid()
    group by l.course_id
  )
  select m.course_id, coalesce(t.n, 0), m.passed, m.in_review, m.needs_revision
  from mine m
  left join takes_evidence t on t.course_id = m.course_id
  where auth.uid() is not null;
$$;

revoke all on function breadmaker.submit_evidence(uuid, text, text[], jsonb) from public, anon;
revoke all on function breadmaker.review_submission(uuid, text, text) from public, anon;
revoke all on function breadmaker.review_queue() from public, anon;
revoke all on function breadmaker.my_mastery() from public, anon;
grant execute on function breadmaker.submit_evidence(uuid, text, text[], jsonb) to authenticated;
grant execute on function breadmaker.review_submission(uuid, text, text) to authenticated;
grant execute on function breadmaker.review_queue() to authenticated;
grant execute on function breadmaker.my_mastery() to authenticated;
