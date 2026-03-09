-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Enable uuid generation
create extension if not exists "uuid-ossp" with schema extensions;

-- Main memories table
create table if not exists memories (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       text not null,
  text          text not null,
  embedding     extensions.vector(1536) not null,
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Index for filtering by user_id
create index if not exists idx_memories_user_id on memories(user_id);

-- HNSW index for fast cosine similarity search
create index if not exists idx_memories_embedding on memories
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RPC function for similarity search
create or replace function match_memories(
  query_embedding extensions.vector(1536),
  query_user_id   text,
  match_threshold  float default 0.5,
  match_count      int default 10
)
returns table (
  id          uuid,
  user_id     text,
  text        text,
  metadata    jsonb,
  similarity  float,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql stable
as $$
  select
    m.id,
    m.user_id,
    m.text,
    m.metadata,
    1 - (m.embedding <=> query_embedding) as similarity,
    m.created_at,
    m.updated_at
  from memories m
  where m.user_id = query_user_id
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding asc
  limit least(match_count, 200);
$$;
