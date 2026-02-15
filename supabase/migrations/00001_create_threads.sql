-- Enable pgvector extension (needed for Module 2, set up now)
create extension if not exists vector with schema extensions;

-- Threads table
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'New Chat',
  openai_response_id text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast user lookups
create index idx_threads_user_id on public.threads(user_id);

-- Enable Row-Level Security
alter table public.threads enable row level security;

-- RLS policies: users can only CRUD their own threads
create policy "Users can select own threads"
  on public.threads for select
  using (auth.uid() = user_id);

create policy "Users can insert own threads"
  on public.threads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own threads"
  on public.threads for update
  using (auth.uid() = user_id);

create policy "Users can delete own threads"
  on public.threads for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at trigger
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger threads_updated_at
  before update on public.threads
  for each row
  execute function public.update_updated_at();
