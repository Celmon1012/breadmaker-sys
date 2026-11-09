-- Course explainer video: shown on the course page beside enrollment.
-- Adds breadmaker.lms_courses.explainer_url and saves it from the studio editor.
-- Safe to re-run. Requires 20240101000012_lms.sql.

alter table breadmaker.lms_courses add column if not exists explainer_url text;

-- Saves a course with its modules, lessons (with content) and tools in one transaction.
-- Runs as the caller, so the editor policies still apply. Lessons keep their ids so
-- learner progress stays attached. A new course whose slug is taken gets a numeric suffix.
--
-- payload: { id?, slug, title, subtitle, description, program, audience, status, cover_url,
--            explainer_url, price_minor, currency,
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
          explainer_url = nullif(trim(coalesce(payload->>'explainer_url', '')), ''),
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
          (slug, title, subtitle, description, program, audience, status, cover_url, explainer_url, price_minor, currency, created_by)
        values (
          v_slug, trim(payload->>'title'), coalesce(payload->>'subtitle', ''), coalesce(payload->>'description', ''),
          coalesce(nullif(payload->>'program', ''), 'general'), coalesce(payload->>'audience', ''),
          coalesce(nullif(payload->>'status', ''), 'Draft'), nullif(trim(coalesce(payload->>'cover_url', '')), ''),
          nullif(trim(coalesce(payload->>'explainer_url', '')), ''),
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

revoke all on function breadmaker.save_course(jsonb) from public, anon;
grant execute on function breadmaker.save_course(jsonb) to authenticated;
