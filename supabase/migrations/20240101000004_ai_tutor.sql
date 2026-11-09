-- Enable pgvector
create extension if not exists vector;

-- Course content chunks (source of truth for RAG)
create table if not exists course_chunks (
  id uuid primary key default gen_random_uuid(),
  course_id text not null, -- Using text to match frontend course ids
  module_id text not null, -- Using text to match frontend module ids
  chunk_text text not null,
  embedding vector(1536), -- OpenAI embedding dimensions
  chunk_index int,
  created_at timestamptz default now()
);

-- Create vector similarity index
create index if not exists course_chunks_embedding_idx on course_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Chat sessions per user per module
create table if not exists tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, -- Simplified for local/mock
  course_id text,
  module_id text,
  messages jsonb default '[]',
  created_at timestamptz default now()
);

-- RPC for finding similar chunks
create or replace function match_course_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_course_id text,
  filter_module_id text
)
returns table (
  id uuid,
  course_id text,
  module_id text,
  chunk_text text,
  similarity float
)
language sql stable
as $$
  select
    course_chunks.id,
    course_chunks.course_id,
    course_chunks.module_id,
    course_chunks.chunk_text,
    1 - (course_chunks.embedding <=> query_embedding) as similarity
  from course_chunks
  where course_chunks.course_id = filter_course_id
    and course_chunks.module_id = filter_module_id
    and 1 - (course_chunks.embedding <=> query_embedding) > match_threshold
  order by course_chunks.embedding <=> query_embedding
  limit match_count;
$$;
