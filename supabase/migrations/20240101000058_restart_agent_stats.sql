-- What Restart's own follow-up agent has done lately: the proof behind "Runs at Restart".
--
-- Restart already runs a follow-up agent (console-agent-run, every day) that reviews enquiries and delivery work and
-- only drafts: a person approves each message. Every run is recorded in console.agent_runs, and each draft is a
-- console.*_activities row with activity_type = 'agent_proposal'. This function reports totals over the last 30 days
-- and nothing else: no names, no messages, no client details. That is why it is safe to show on the public Leak Test
-- result and in the studio.
--
-- Returns null when Restart's console tables are not in this database.
--
-- Run after migration 57. Safe to re-run.

create or replace function breadmaker.restart_agent_stats()
returns jsonb
language plpgsql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
declare
  since timestamptz := now() - interval '30 days';
  runs jsonb;
  drafts jsonb;
begin
  if to_regclass('console.agent_runs') is null
     or to_regclass('console.inquiry_activities') is null
     or to_regclass('console.deliverable_activities') is null then
    return null;
  end if;

  select jsonb_build_object(
    'runs', count(*),
    'failed', count(*) filter (where error is not null),
    'lastRunAt', max(started_at),
    'inquiriesReviewed', coalesce(sum(inquiries_scanned), 0),
    'deliverablesReviewed', coalesce(sum(deliverables_scanned), 0),
    'actions', coalesce(sum(actions_created), 0)
  ) into runs
  from console.agent_runs
  where started_at >= since;

  -- Drafts the agent proposed, on enquiries and on delivery work, and what people did with them.
  select jsonb_build_object(
    'proposed', count(*),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'),
    'waiting', count(*) filter (where status = 'proposed')
  ) into drafts
  from (
    select status from console.inquiry_activities where activity_type = 'agent_proposal' and created_at >= since
    union all
    select status from console.deliverable_activities where activity_type = 'agent_proposal' and created_at >= since
  ) proposals;

  return runs || jsonb_build_object('days', 30, 'drafts', drafts);
end;
$$;

grant execute on function breadmaker.restart_agent_stats() to anon, authenticated, service_role;
