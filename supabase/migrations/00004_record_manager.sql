-- Module 3: Record Manager — content hashing for duplicate detection

-- Add content_hash to documents
alter table public.documents add column content_hash text;

-- Unique index: one hash per user (prevents duplicate uploads)
create unique index idx_documents_user_content_hash
  on public.documents(user_id, content_hash);

-- Drop and re-add status check to include 'duplicate'
alter table public.documents drop constraint documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('pending', 'processing', 'completed', 'error', 'duplicate'));

-- Add content_hash to document_chunks
alter table public.document_chunks add column content_hash text;
