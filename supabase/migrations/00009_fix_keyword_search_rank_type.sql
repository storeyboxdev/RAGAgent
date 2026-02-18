-- Fix keyword_search_chunks: ts_rank returns real but return type declared float (double precision)
drop function if exists public.keyword_search_chunks(text, uuid, integer, uuid[]);

create or replace function public.keyword_search_chunks(
  query_text text,
  match_user_id uuid,
  match_count integer default 10,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  rank real
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
    ts_rank(dc.search_vector, plainto_tsquery('english', query_text)) as rank
  from public.document_chunks dc
  where dc.user_id = match_user_id
    and dc.search_vector @@ plainto_tsquery('english', query_text)
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
  order by rank desc
  limit match_count;
end;
$$;
