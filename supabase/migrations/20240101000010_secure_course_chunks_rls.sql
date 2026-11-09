-- course_chunks and tutor_sessions were created without RLS, so the public anon
-- key could read/write them directly via the REST API regardless of any
-- application-level route guard (e.g. the admin ingestion UI).

alter table public.course_chunks enable row level security;
alter table public.tutor_sessions enable row level security;

-- Course content is only needed by the AI tutor for signed-in learners.
create policy "Authenticated users can read course chunks"
  on public.course_chunks
  for select
  using (auth.role() = 'authenticated');

-- Only admins may ingest/edit/delete course content.
create policy "Admins can manage course chunks"
  on public.course_chunks
  for all
  using (
    exists (
      select 1 from breadmaker.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from breadmaker.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Tutor chat history belongs to a single user.
create policy "Users can manage their own tutor sessions"
  on public.tutor_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
