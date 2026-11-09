-- What Restart's support agent has drafted lately: the proof behind "Runs at Restart" for the Operations leak.
--
-- Restart's support agent (console-support-webhook) drafts a reply when a client writes in. Every draft is a row in
-- console.support_proposals with a status: proposed (waiting for a person), approved or rejected. Nothing is sent
-- until a person approves it. This function reports counts over the last 30 days and nothing else: no names, no
-- message text. Internal notes the agent posts go straight to the support inbox and are not recorded here, so they
-- are not counted.
--
-- Returns null when Restart's console tables are not in this database.
--
-- Run after migration 58. Safe to re-run.

create or replace function breadmaker.restart_support_stats()
returns jsonb
language plpgsql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
declare
  since timestamptz := now() - interval '30 days';
begin
  if to_regclass('console.support_proposals') is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'days', 30,
      'drafted', count(*),
      'approved', count(*) filter (where status = 'approved'),
      'rejected', count(*) filter (where status = 'rejected'),
      'waiting', count(*) filter (where status = 'proposed')
    )
    from console.support_proposals
    where created_at >= since
  );
end;
$$;

grant execute on function breadmaker.restart_support_stats() to anon, authenticated, service_role;
