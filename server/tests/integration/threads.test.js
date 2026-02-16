import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryChain } from '../helpers/mockSupabase.js';
import { TEST_USER, TEST_TOKEN } from '../helpers/mockAuth.js';

// Mock external dependencies
vi.mock('@lmnr-ai/lmnr', () => ({
  observe: vi.fn((_, cb) => cb()),
  Laminar: { initialize: vi.fn(), setSpanOutput: vi.fn() },
}));

vi.mock('@lmstudio/sdk', () => ({
  tool: vi.fn((def) => def),
  LMStudioClient: vi.fn(() => ({})),
}));

const mockSupabaseClient = { from: vi.fn() };

vi.mock('../../lib/supabase.js', () => ({
  createSupabaseClient: vi.fn(() => mockSupabaseClient),
  supabaseAdmin: { auth: { getUser: vi.fn() }, from: vi.fn(), storage: { from: vi.fn() }, rpc: vi.fn() },
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.user = { id: 'test-user-uuid-1234', email: 'test@example.com' };
    req.accessToken = 'test-bearer-token';
    next();
  }),
}));

vi.mock('../../lib/lmstudio.js', () => ({
  lmstudioClient: {},
  EMBEDDING_MODEL: 'test-model',
  EMBEDDING_DIMENSIONS: 768,
  getActiveLlmModelId: vi.fn(),
  setActiveLlmModelId: vi.fn(),
  getLlmModel: vi.fn(),
  listDownloadedLlmModels: vi.fn(),
  listLoadedLlmModels: vi.fn(),
  listDownloadedEmbeddingModels: vi.fn(),
  listLoadedEmbeddingModels: vi.fn(),
}));

vi.mock('../../lib/embeddings.js', () => ({
  generateEmbeddings: vi.fn(),
  generateEmbedding: vi.fn(),
}));

vi.mock('../../lib/retrieval.js', () => ({
  searchDocuments: vi.fn(),
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../app.js');

describe('Threads API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/threads', () => {
    it('returns 200 with array of threads', async () => {
      const threads = [{ id: '1', title: 'Test Thread' }];
      mockSupabaseClient.from.mockReturnValue(createQueryChain({ data: threads, error: null }));

      const res = await request(app).get('/api/threads');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(threads);
    });

    it('returns 500 when supabase errors', async () => {
      mockSupabaseClient.from.mockReturnValue(createQueryChain({ data: null, error: { message: 'DB error' } }));

      const res = await request(app).get('/api/threads');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('POST /api/threads', () => {
    it('returns 201 with created thread', async () => {
      const thread = { id: '1', title: 'My Thread', user_id: TEST_USER.id };
      mockSupabaseClient.from.mockReturnValue(createQueryChain({ data: thread, error: null }));

      const res = await request(app).post('/api/threads').send({ title: 'My Thread' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual(thread);
    });

    it('creates with default title when none provided', async () => {
      const thread = { id: '1', title: 'New Chat', user_id: TEST_USER.id };
      mockSupabaseClient.from.mockReturnValue(createQueryChain({ data: thread, error: null }));

      const res = await request(app).post('/api/threads').send({});
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /api/threads/:id', () => {
    it('returns 200 with updated thread', async () => {
      const thread = { id: '1', title: 'Updated' };
      mockSupabaseClient.from.mockReturnValue(createQueryChain({ data: thread, error: null }));

      const res = await request(app).patch('/api/threads/1').send({ title: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
    });
  });

  describe('DELETE /api/threads/:id', () => {
    it('returns 204', async () => {
      mockSupabaseClient.from.mockReturnValue(createQueryChain({ error: null }));

      const res = await request(app).delete('/api/threads/1');
      expect(res.status).toBe(204);
    });
  });
});
