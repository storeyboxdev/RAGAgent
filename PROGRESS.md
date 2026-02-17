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

### Module 5: Multi-Format Support
[x]
- [x] Task 1: Docker Configuration — docker-compose.yml with docling-serve, DOCLING_SERVE_URL env var
- [x] Task 2: Parsing Library — parseDocument with direct text (.txt/.md) and docling-serve (.pdf/.docx/.html) paths
- [x] Task 3: Ingestion Pipeline Update — parseDocument integration, 50MB file limit, fileType parameter
- [x] Task 4: Frontend File Upload — multi-format accept attribute, extension validation, updated drop zone text
- [x] Task 5: Parsing Unit Tests — 15 tests covering all paths, error handling, extension fallbacks
- [x] Task 6: Integration Test Updates — parsing mock, arrayBuffer download mock, multi-format test cases
- [x] Task 7: Update PROGRESS.md

### Module 6: Hybrid Search & Reranking
[x]
- [x] Task 1: Database Migration — tsvector column, GIN index, keyword_search_chunks RPC
- [x] Task 2: Keyword Search Library — keywordSearch via Postgres full-text search RPC
- [x] Task 3: Reranker Library — LLM-based relevance scoring with Zod validation
- [x] Task 4: Retrieval Orchestration — vector/keyword/hybrid modes, RRF fusion, reranking support
- [x] Task 5: Chat Route SSE Update — search_mode and reranked fields in tool_result events
- [x] Task 6: Frontend Updates — SearchModeBadge component, relevance/similarity score labels
- [x] Task 7: Environment Config — SEARCH_MODE and RERANK_ENABLED env vars
- [x] Task 8: Unit Tests — keyword-search (5), reranker (8), retrieval (6) tests
- [x] Task 9: Integration Tests — tool_result SSE event includes search_mode and reranked fields
- [x] Task 10: Update PROGRESS.md

### Module 7: Additional Tools (Text-to-SQL + Web Search)
[x]
- [x] Task 1: Database Migration — read-only query RPC function (execute_readonly_query)
- [x] Task 2: SQL Query Validation Library — validateAndRewriteQuery, getSchemaDescription, executeQuery
- [x] Task 3: Web Search Client Library — isWebSearchEnabled, webSearch (Tavily + SearXNG providers)
- [x] Task 4: Chat Route Multi-Tool Agent — dynamic system prompt, query_database tool, web_search tool, dynamic tools array
- [x] Task 5: Environment Config — WEB_SEARCH_ENABLED, WEB_SEARCH_PROVIDER, TAVILY_API_KEY, SEARXNG_URL
- [x] Task 6: Frontend Updates — ToolCallIndicator refactored with SearchToolView, SqlToolView, WebSearchToolView; ChatPage generic tool_result handler
- [x] Task 7: Unit Tests — SQL query validation (21 tests)
- [x] Task 8: Unit Tests — Web search client (9 tests)
- [x] Task 9: Integration Tests — query_database and web_search SSE events, tool registration (6 new tests)
- [x] Task 10: Update PROGRESS.md

### Regression Test Suite
[x]
- [x] Test infrastructure (vitest + supertest, app.js extraction)
- [x] Unit tests: chunking library
- [x] Integration tests: health, threads, models, ingestion, chat
- [x] CLAUDE.md updated with testing instructions
