-- Module 2: BYO Retrieval + Memory

-- Drop openai_response_id from threads (no longer needed)
alter table public.threads drop column if exists openai_response_id;

-- Documents table
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null,
  file_type text not null,
  file_size integer not null,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
  error_message text,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_documents_user_id on public.documents(user_id);

alter table public.documents enable row level security;

create policy "Users can select own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

create trigger documents_updated_at
  before update on public.documents
  for each row
  execute function public.update_updated_at();

-- Document chunks table
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  chunk_index integer not null,
  embedding vector(768)
);

create index idx_document_chunks_document_id on public.document_chunks(document_id);
create index idx_document_chunks_user_id on public.document_chunks(user_id);

-- HNSW index for fast vector similarity search
create index idx_document_chunks_embedding on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.document_chunks enable row level security;

create policy "Users can select own chunks"
  on public.document_chunks for select
  using (auth.uid() = user_id);

create policy "Users can insert own chunks"
  on public.document_chunks for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own chunks"
  on public.document_chunks for delete
  using (auth.uid() = user_id);

-- Vector similarity search function
create or replace function public.match_document_chunks(
  query_embedding vector(768),
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

-- Add documents to Supabase Realtime publication
alter publication supabase_realtime add table public.documents;

-- Create documents storage bucket
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false);

-- Storage RLS policies: users can only access their own folder
create policy "Users can upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own files"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
