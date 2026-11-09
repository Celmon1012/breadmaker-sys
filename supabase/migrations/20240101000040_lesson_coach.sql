-- The lesson coach: a "Stuck?" panel in the lesson player that answers from the open session.
--
-- One row per message, per learner, per session (lesson). The tutor-chat edge function writes the rows with the
-- service role; a learner can read and delete only their own, so they can clear their history at any time.
-- The same rows give the hourly and daily limits (count a learner's questions in a window).
-- Replaces the old RAG tutor tables (public.course_chunks, public.tutor_sessions), which are no longer used.
-- Safe to re-run.

create table if not exists breadmaker.lms_tutor_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references breadmaker.lms_lessons(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  -- Set on the coach's reply when it judged that a person should take over.
  needs_coach boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists lms_tutor_messages_thread_idx on breadmaker.lms_tutor_messages (user_id, lesson_id, id desc);
create index if not exists lms_tutor_messages_window_idx on breadmaker.lms_tutor_messages (user_id, created_at desc);

alter table breadmaker.lms_tutor_messages enable row level security;

drop policy if exists "Learners read own tutor messages" on breadmaker.lms_tutor_messages;
create policy "Learners read own tutor messages" on breadmaker.lms_tutor_messages
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Learners delete own tutor messages" on breadmaker.lms_tutor_messages;
create policy "Learners delete own tutor messages" on breadmaker.lms_tutor_messages
  for delete to authenticated using (user_id = auth.uid());

grant select, delete on breadmaker.lms_tutor_messages to authenticated;
grant select, insert, delete on breadmaker.lms_tutor_messages to service_role;
grant usage on sequence breadmaker.lms_tutor_messages_id_seq to service_role;
