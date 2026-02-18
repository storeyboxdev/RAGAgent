-- Fix vector dimension mismatch: RPC expects 768 but column stores 512
-- Migration 00005 accidentally reverted the dimension fix from 00003
drop function if exists public.match_document_chunks(vector, uuid, integer, float, uuid[]);

create or replace function public.match_document_chunks(
  query_embedding vector(512),
  match_user_id uuid,
  match_count integer default 5,
  match_threshold float default 0.5,
  filter_document_ids uuid[] default null
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
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;
