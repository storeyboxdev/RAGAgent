# Progress

Track your progress through the masterclass. Update this file as you complete modules - Claude Code reads this to understand where you are in the project.

## Convention
- `[ ]` = Not started
- `[-]` = In progress
- `[x]` = Completed

> **Note:** Run `cd server && npm test` after completing any task. All tests must pass before moving on.

## Modules

### Module 1: App Shell + Observability
[x]
- [x] Task 1: Project Initialization — root + server package.json, .gitignore, .env.example
- [x] Task 2: Supabase Local Setup — supabase init, config.toml, supabase start
- [x] Task 3: Database Schema — threads table, pgvector, RLS, updated_at trigger
- [x] Task 4: Backend Setup — Express server, auth middleware, health endpoint, routes
- [x] Task 5: Frontend Setup — Vite + React, Tailwind v4, shadcn/ui, Supabase client
- [x] Task 6: Auth Flow — AuthContext, AuthPage, protected routing, API fetch wrapper
- [x] Task 7: Chat UI — ThreadList, ChatMessages, ChatInput, MessageBubble
- [x] Task 8: OpenAI Responses API — Thread CRUD, SSE chat, message caching, frontend SSE
- [x] Task 9: Laminar Observability — observe() wrapper on chat handler

### Module 2: BYO Retrieval + Memory
[x]
- [x] Task 1: Database Migration — documents + document_chunks tables, match_document_chunks function, storage bucket
- [x] Task 2: Environment Config + LLM Client Refactor — configurable LLM/embedding clients via env vars
- [x] Task 3: Replace Responses API with Chat Completions — stateless messages, streaming delta.content
- [x] Task 4: Chunking Library — chunkText with paragraph/sentence/character splitting + overlap
- [x] Task 5: Embedding Library — generateEmbeddings/generateEmbedding via OpenAI-compatible endpoint
- [x] Task 6: Ingestion Backend — upload, async processing (chunk + embed + store), list, delete
- [x] Task 7: Retrieval + Tool Calling in Chat — search_documents tool, tool call loop, SSE events
- [x] Task 8: Ingestion Frontend — AppLayout, FileUpload, DocumentList, DocumentCard, tab navigation
- [x] Task 9: Realtime Ingestion Status — Supabase Realtime subscription for live document status updates
- [x] Task 10: Tool Call Display in Chat UI — ToolCallIndicator with expandable chunk results

### Module 3: Record Manager
[x]
- [x] Task 1: Database Migration — content_hash columns, unique index, updated status constraint
- [x] Task 2: Hashing Utility Library — hashBuffer/hashString with SHA-256, unit tests
- [x] Task 3: Upload Dedup Logic — exact duplicate detection, re-upload with different content handling
- [x] Task 4: Chunk-Level Hashing — content_hash on each chunk row
- [x] Task 5: Integration Tests — duplicate detection, re-upload, content_hash in payloads
- [x] Task 6: Frontend — duplicate status badge, duplicate alert on upload
- [x] Task 7: Full Test Suite — all 44 tests passing

### Module 4: Metadata Extraction
[x]
- [x] Task 1: Database Migration — metadata JSONB column, extracting status, filter_document_ids param on RPC
- [x] Task 2: Metadata Schema + Extraction Library — Zod schema, extractMetadata with LLM
- [x] Task 3: Ingestion Pipeline Update — extracting status step, non-fatal metadata extraction
- [x] Task 4: Retrieval Enhancement — metadata-filtered search with JSONB operators
- [x] Task 5: Chat Tool Update — metadata_filter param on search_documents tool
- [x] Task 6: Frontend Updates — extracting status badge/spinner, metadata display, filter indicator
- [x] Task 7: Tests — unit tests for metadata, integration tests for extraction in pipeline
- [x] Task 8: Update PROGRESS.md

### Regression Test Suite
[x]
- [x] Test infrastructure (vitest + supertest, app.js extraction)
- [x] Unit tests: chunking library
- [x] Integration tests: health, threads, models, ingestion, chat
- [x] CLAUDE.md updated with testing instructions
