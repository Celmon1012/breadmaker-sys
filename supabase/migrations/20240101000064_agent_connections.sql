-- Connections: tools an agent can use that are defined as data, not code.
--
-- A web tool is one HTTP call (method, address, headers, inputs) with a name and a description the agent reads. Once
-- it exists, any agent can pick it in the builder. A tool that only reads (GET) runs when the agent calls it. Anything
-- else changes something, so it goes through the approval queue like a restart does.
--
-- Secrets are never stored here. A header can say {{secret:KUMODA}}; the platform fills it from its own setting
-- CONN_SECRET_KUMODA (set in Coolify). The platform only reads settings that start with CONN_SECRET_, so a connection
-- cannot ask for the model key or any other secret.
--
-- Run after migration 63. Safe to re-run.

create table if not exists breadmaker.agent_connections (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'http_tool' check (kind in ('http_tool', 'mcp')),
  name text not null check (char_length(name) between 2 and 80),
  -- The id agents pick it by: lower-case words and underscores, e.g. kumoda_find_contact.
  tool_id text not null check (tool_id ~ '^[a-z][a-z0-9_]{2,39}$'),
  -- What the agent reads to decide when to use it.
  description text not null check (char_length(description) between 10 and 400),
  -- http_tool: { method, url, headers, params: [{name, type, description}], body, risk }
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_connections_tool_id_idx on breadmaker.agent_connections (tool_id);

alter table breadmaker.agent_connections enable row level security;

drop policy if exists "Team read agent connections" on breadmaker.agent_connections;
create policy "Team read agent connections" on breadmaker.agent_connections for select using (breadmaker.is_team_member());
drop policy if exists "Editors write agent connections" on breadmaker.agent_connections;
create policy "Editors write agent connections" on breadmaker.agent_connections for all
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

grant select, insert, update, delete on breadmaker.agent_connections to authenticated;
grant select on breadmaker.agent_connections to service_role;
