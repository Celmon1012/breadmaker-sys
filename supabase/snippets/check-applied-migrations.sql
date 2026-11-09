-- Which recent migrations have been applied? Paste into the Supabase SQL editor. Read-only.
-- Every row with applied = false needs its migration file run, in order, from supabase/migrations.
-- (Migrations 32 and 38 only redefine functions, so they have no simple marker; re-run them after 28 if unsure.)

select * from (
  select 'm26 profile details' as migration, to_regclass('breadmaker.profile_details') is not null as applied
  union all select 'm27 leak test admin', to_regprocedure('breadmaker.delete_leak_test(uuid)') is not null
  union all select 'm28 membership', to_regclass('breadmaker.memberships') is not null
  union all select 'm29 dual currency', exists (select 1 from information_schema.columns where table_schema = 'breadmaker' and table_name = 'lms_courses' and column_name = 'alt_price_minor')
  union all select 'm30 course category', to_regprocedure('breadmaker.course_categories()') is not null
  union all select 'm31 support', to_regclass('breadmaker.support_tickets') is not null
  union all select 'm33 prestige partner', to_regprocedure('breadmaker.my_plan()') is not null
  union all select 'm34 agent usage', to_regclass('breadmaker.agent_usage_log') is not null
  union all select 'm35 profile photos', exists (select 1 from information_schema.columns where table_schema = 'breadmaker' and table_name = 'profiles' and column_name = 'avatar_url')
  union all select 'm36 leads', to_regclass('breadmaker.leads') is not null
  union all select 'm37 newsletter consent', exists (select 1 from information_schema.columns where table_schema = 'breadmaker' and table_name = 'leads' and column_name = 'newsletter_consented_at')
  union all select 'm39 agent tools', to_regclass('breadmaker.agent_turns') is not null
  union all select 'm40 lesson coach', to_regclass('breadmaker.lms_tutor_messages') is not null
  union all select 'm41 kit lesson content', not exists (
    select 1 from breadmaker.lms_lesson_content lc
    join breadmaker.lms_lessons l on l.id = lc.lesson_id
    join breadmaker.lms_courses c on c.id = l.course_id
    where c.kit_system_id is not null and l.position <= 4 and lc.done_when = ''
  )
  union all select 'm42 evidence and mastery', to_regclass('breadmaker.lms_submissions') is not null
  union all select 'm43 crm outbox', to_regclass('breadmaker.crm_outbox') is not null
  union all select 'm44 crm lifecycle attribution', to_regclass('breadmaker.lead_attribution') is not null
  union all select 'm45 whatsapp groups', to_regclass('breadmaker.group_queue') is not null
  union all select 'm46 community groups', to_regclass('breadmaker.community_optin') is not null
  union all select 'm47 crm cleanup cron', exists (select 1 from cron.job where jobname = 'crm-cleanup')
  union all select 'm48 build jobs', to_regclass('breadmaker.build_jobs') is not null
  union all select 'm49 launchpad portal', to_regprocedure('breadmaker.launchpad_start_request()') is not null
  union all select 'm50 funnel leads', to_regclass('breadmaker.funnel_leads') is not null
  union all select 'm51 funnel agents', to_regclass('breadmaker.funnel_agents') is not null
  union all select 'm52 applications owner read', exists (select 1 from pg_policies where schemaname = 'breadmaker' and tablename = 'applications' and policyname = 'Owner read applications')
  union all select 'm55 launch metrics', to_regprocedure('breadmaker.launch_metrics(integer)') is not null
  union all select 'm54 referrals', to_regprocedure('breadmaker.my_referral_summary()') is not null
) checks
order by migration;
