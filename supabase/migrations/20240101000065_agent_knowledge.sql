-- Knowledge: documents an agent can answer from.
--
-- A person adds a source to an agent: text they paste, or a public web page. The platform splits it into short passages
-- (chunks) and stores them here. When the agent is asked something factual it searches its own passages and answers
-- from what it finds, naming the source. Search is Postgres full-text search: no extra service and no embeddings model,
-- good for policies, FAQs and product pages, where the question shares words with the answer.
--
-- Knowledge belongs to one agent. The platform writes sources and passages with the service role (it does the fetching
-- and splitting); the team reads them, and owners and coaches can remove a source from the studio (its passages go too).
--
-- Run after migration 64. Safe to re-run.

create table if not exists breadmaker.agent_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references breadmaker.agent_defs(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  kind text not null check (kind in ('text', 'url')),
  -- For a web page: the address it was read from, so it can be read again.
  url text,
  status text not null default 'ready' check (status in ('ready', 'failed')),
  error text,
  chunk_count integer not null default 0,
  chars integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_knowledge_sources_agent_idx on breadmaker.agent_knowledge_sources (agent_id, created_at desc);

create table if not exists breadmaker.agent_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references breadmaker.agent_knowledge_sources(id) on delete cascade,
  agent_id uuid not null references breadmaker.agent_defs(id) on delete cascade,
  position integer not null,
  content text not null,
  tsv tsvector generated always as (to_tsvector('english', content)) stored
);

create index if not exists agent_knowledge_chunks_tsv_idx on breadmaker.agent_knowledge_chunks using gin (tsv);
create index if not exists agent_knowledge_chunks_agent_idx on breadmaker.agent_knowledge_chunks (agent_id);
create index if not exists agent_knowledge_chunks_source_idx on breadmaker.agent_knowledge_chunks (source_id, position);

alter table breadmaker.agent_knowledge_sources enable row level security;
alter table breadmaker.agent_knowledge_chunks enable row level security;

drop policy if exists "Team read knowledge sources" on breadmaker.agent_knowledge_sources;
create policy "Team read knowledge sources" on breadmaker.agent_knowledge_sources for select using (breadmaker.is_team_member());
drop policy if exists "Editors remove knowledge sources" on breadmaker.agent_knowledge_sources;
create policy "Editors remove knowledge sources" on breadmaker.agent_knowledge_sources for delete using (breadmaker.can_edit_content());

drop policy if exists "Team read knowledge chunks" on breadmaker.agent_knowledge_chunks;
create policy "Team read knowledge chunks" on breadmaker.agent_knowledge_chunks for select using (breadmaker.is_team_member());

grant select, delete on breadmaker.agent_knowledge_sources to authenticated;
grant select on breadmaker.agent_knowledge_chunks to authenticated;
grant select, insert, update, delete on breadmaker.agent_knowledge_sources to service_role;
grant select, insert, update, delete on breadmaker.agent_knowledge_chunks to service_role;

-- The best matching passages of one agent's knowledge for a question, with the source each came from.
create or replace function breadmaker.search_knowledge(p_agent uuid, p_query text, p_limit integer default 5)
returns table (source_name text, content text, rank real)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select s.name, c.content, ts_rank(c.tsv, q.query) as rank
  from breadmaker.agent_knowledge_chunks c
  join breadmaker.agent_knowledge_sources s on s.id = c.source_id
  cross join (select websearch_to_tsquery('english', p_query) as query) q
  where c.agent_id = p_agent and c.tsv @@ q.query
  order by rank desc
  limit least(greatest(p_limit, 1), 8);
$$;

revoke all on function breadmaker.search_knowledge(uuid, text, integer) from public, anon, authenticated;
grant execute on function breadmaker.search_knowledge(uuid, text, integer) to service_role;
