-- Any model the platform offers, not just three.
--
-- Migration 60 limited an agent's model to three Anthropic ones. The platform now keeps a model catalogue (several
-- providers, each switched on by its key in the platform settings) and refuses a model it does not offer or whose
-- provider is not connected. The database only checks the shape of the name ("provider/model").
--
-- Run after migration 62. Safe to re-run.

alter table breadmaker.agent_defs drop constraint if exists agent_defs_model_check;
alter table breadmaker.agent_defs drop constraint if exists agent_defs_model_format;
alter table breadmaker.agent_defs add constraint agent_defs_model_format
  check (model ~ '^[a-z0-9-]+/[A-Za-z0-9._:-]+$' and char_length(model) <= 120);
