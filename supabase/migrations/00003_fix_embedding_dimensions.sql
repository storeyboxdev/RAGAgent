-- Fix embedding dimensions to match model output (512)

-- Drop the HNSW index (must be recreated for new dimensions)
drop index if exists idx_document_chunks_embedding;

-- Alter the column type
alter table public.document_chunks
  alter column embedding type vector(512);

-- Drop and recreate the match function with correct dimensions
drop function if exists public.match_document_chunks;

create or replace function public.match_document_chunks(
  query_embedding vector(512),
  match_user_id uuid,
  match_count integer default 5,
  match_threshold float default 0.5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.user_id = match_user_id
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Recreate HNSW index
create index idx_document_chunks_embedding on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- Enable full replica identity for Realtime filtered subscriptions
alter table public.documents replica identity full;
