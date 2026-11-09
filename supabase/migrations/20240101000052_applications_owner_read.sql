-- A member can read their own applications.
--
-- Migrations 49 to 51 let a member read their own funnel (build_jobs), its enquiries (funnel_leads) and its agents
-- (funnel_agents) with a check that joins to breadmaker.applications on user_id = auth.uid(). That join is itself
-- subject to row-level security, and applications had only team policies, so for a member who is not on the team
-- the join found nothing and every one of those pages came up empty. This gives them their own rows, and only those.
--
-- Safe to re-run.

drop policy if exists "Owner read applications" on breadmaker.applications;
create policy "Owner read applications" on breadmaker.applications
  for select to authenticated
  using (user_id = auth.uid());
