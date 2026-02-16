import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryChain } from '../helpers/mockSupabase.js';

// Mock external dependencies
vi.mock('@lmnr-ai/lmnr', () => ({
  observe: vi.fn((_, cb) => cb()),
  Laminar: { initialize: vi.fn(), setSpanOutput: vi.fn() },
}));

vi.mock('@lmstudio/sdk', () => ({
  tool: vi.fn((def) => def),
  LMStudioClient: vi.fn(() => ({})),
}));

const mockUserClient = { from: vi.fn() };
const mockAdminStorage = {
  from: vi.fn().mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
    download: vi.fn().mockResolvedValue({ data: { text: vi.fn().mockResolvedValue('test content') }, error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  }),
};
const mockAdminFrom = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  createSupabaseClient: vi.fn(() => mockUserClient),
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
    from: mockAdminFrom,
    storage: mockAdminStorage,
    rpc: vi.fn(),
  },
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
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  generateEmbedding: vi.fn(),
}));

vi.mock('../../lib/retrieval.js', () => ({
  searchDocuments: vi.fn(),
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../app.js');

describe('Ingestion API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the admin storage mock
    mockAdminStorage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      download: vi.fn().mockResolvedValue({ data: { text: vi.fn().mockResolvedValue('test content') }, error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    });
    // Admin from chain for background processing
    mockAdminFrom.mockReturnValue(createQueryChain({ data: null, error: null }));
  });

  describe('POST /api/ingestion/upload', () => {
    it('returns 201 with document on successful upload', async () => {
      const doc = { id: 'doc-1', filename: 'test.txt', status: 'pending' };
      mockUserClient.from.mockReturnValue(createQueryChain({ data: doc, error: null }));

      const res = await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello world'), 'test.txt');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
    });

    it('returns 400 with no file', async () => {
      const res = await request(app).post('/api/ingestion/upload');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No file provided');
    });

    it('returns 500 on storage error', async () => {
      mockAdminStorage.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: { message: 'Storage full' } }),
      });

      const res = await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello'), 'test.txt');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Storage full');
    });
  });

  describe('GET /api/ingestion/documents', () => {
    it('returns 200 with array of documents', async () => {
      const docs = [{ id: '1', filename: 'a.txt' }];
      mockUserClient.from.mockReturnValue(createQueryChain({ data: docs, error: null }));

      const res = await request(app).get('/api/ingestion/documents');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(docs);
    });

    it('returns 500 on error', async () => {
      mockUserClient.from.mockReturnValue(createQueryChain({ data: null, error: { message: 'Query failed' } }));

      const res = await request(app).get('/api/ingestion/documents');
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/ingestion/documents/:id', () => {
    it('returns 200 with success true', async () => {
      // First call: fetch doc to get storage_path (via .single())
      // Second call: delete doc
      const fetchChain = createQueryChain({ data: { storage_path: 'user/doc/file.txt' }, error: null });
      const deleteChain = createQueryChain({ error: null });

      let callCount = 0;
      mockUserClient.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? fetchChain : deleteChain;
      });

      const res = await request(app).delete('/api/ingestion/documents/doc-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when document not found', async () => {
      mockUserClient.from.mockReturnValue(createQueryChain({ data: null, error: { message: 'not found' } }));

      const res = await request(app).delete('/api/ingestion/documents/missing');
      expect(res.status).toBe(404);
    });
  });
});
