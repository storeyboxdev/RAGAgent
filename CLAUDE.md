# CLAUDE.md

RAG app with chat (default) and document ingestion interfaces. Config via env vars, no admin UI.

## Environment Notes
- Operating System: Windows 11 Home 10.0.26200
- File paths should use backslashes (\) as the standard separator
- Command line tools may support forward slashes (/) but backslash is the conventional path format

## Stack

- Frontend: React + Vite + Tailwind + shadcn/ui
- Backend: NodeJS + Express
- Database: Supabase (Postgres, pgvector, Auth, Storage, Realtime) running in docker container and persisting data by mounting a local directory
- LLM: OpenAI (Module 1), LMStudio (Module 2+),
- Observability: Laminar

## Rules

- No LangChain, no LangGraph - raw SDK calls only
- Use Zod for structured LLM outputs
- All tables need Row-Level Security - users only see their own data
- Stream chat responses via SSE
- Use Supabase Realtime for ingestion status updates
- Module 2+ uses stateless completions - store and send chat history yourself
- Ingestion is manual file upload only - no connectors or automated pipelines

## Planning

- Save all plans to `.agent/plans/` folder
- Naming convention: `{sequence}.{plan-name}.md` (e.g., `1.auth-setup.md`, `2.document-ingestion.md`)
- Plans should be detailed enough to execute without ambiguity
- Each task in the plan must include at least one validation test to verify it works
- Assess complexity and single-pass feasibility - can an agent realistically complete this in one go?
- Include a complexity indicator at the top of each plan:
  - ✅ **Simple** - Single-pass executable, low risk
  - ⚠️ **Medium** - May need iteration, some complexity
  - 🔴 **Complex** - Break into sub-plans before executing

## Development Flow

1. **Plan** - Create a detailed plan and save it to `.agent/plans/`
2. **Build** - Execute the plan to implement the feature
3. **Test** - Run `cd server && npm test` — all tests must pass
4. **Validate** - Test and verify the implementation works correctly. Use browser testing where applicable via an appropriate MCP
5. **Iterate** - Fix any issues found during testing or validation

## Testing

- Test framework: vitest + supertest (server-side only)
- Run all tests: `cd server && npm test`
- Run in watch mode: `cd server && npm run test:watch`
- Tests run with mocked external deps (no LMStudio or Supabase needed)
- **Run the full test suite after every new feature or rewrite** before committing
- Tests must all pass before a feature is considered complete

## Progress

Check PROGRESS.md for current module status. Update it as you complete tasks.