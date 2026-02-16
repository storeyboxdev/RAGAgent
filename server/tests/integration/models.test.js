import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@lmnr-ai/lmnr', () => ({
  observe: vi.fn((_, cb) => cb()),
  Laminar: { initialize: vi.fn(), setSpanOutput: vi.fn() },
}));

vi.mock('@lmstudio/sdk', () => ({
  tool: vi.fn((def) => def),
  LMStudioClient: vi.fn(() => ({})),
}));

vi.mock('../../lib/supabase.js', () => ({
  createSupabaseClient: vi.fn(),
  supabaseAdmin: { auth: { getUser: vi.fn() }, from: vi.fn(), storage: { from: vi.fn() }, rpc: vi.fn() },
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.user = { id: 'test-user-uuid-1234', email: 'test@example.com' };
    req.accessToken = 'test-bearer-token';
    next();
  }),
}));

const mockListDownloaded = vi.fn();
const mockListLoaded = vi.fn();
const mockListDownloadedEmbedding = vi.fn();
const mockListLoadedEmbedding = vi.fn();
const mockGetActive = vi.fn();
const mockSetActive = vi.fn();

vi.mock('../../lib/lmstudio.js', () => ({
  lmstudioClient: {},
  EMBEDDING_MODEL: 'test-model',
  EMBEDDING_DIMENSIONS: 768,
  getActiveLlmModelId: mockGetActive,
  setActiveLlmModelId: mockSetActive,
  getLlmModel: vi.fn(),
  listDownloadedLlmModels: mockListDownloaded,
  listLoadedLlmModels: mockListLoaded,
  listDownloadedEmbeddingModels: mockListDownloadedEmbedding,
  listLoadedEmbeddingModels: mockListLoadedEmbedding,
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

describe('Models API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/models/llm', () => {
    it('returns 200 with models and activeModel, marks loaded models', async () => {
      mockListDownloaded.mockResolvedValue([
        { modelKey: 'llama3', displayName: 'Llama 3', sizeBytes: 1000, architecture: 'llama', maxContextLength: 4096, paramsString: '8B' },
        { modelKey: 'mistral', displayName: 'Mistral', sizeBytes: 2000, architecture: 'mistral', maxContextLength: 8192, paramsString: '7B' },
      ]);
      mockListLoaded.mockResolvedValue([
        { modelKey: 'llama3' },
      ]);
      mockGetActive.mockReturnValue('llama3');

      const res = await request(app).get('/api/models/llm');
      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(2);
      expect(res.body.models[0].isLoaded).toBe(true);
      expect(res.body.models[1].isLoaded).toBe(false);
      expect(res.body.activeModel).toBe('llama3');
    });

    it('returns 500 on LMStudio error', async () => {
      mockListDownloaded.mockRejectedValue(new Error('LMStudio connection failed'));

      const res = await request(app).get('/api/models/llm');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('LMStudio connection failed');
    });
  });

  describe('GET /api/models/embedding', () => {
    it('returns 200 with activeModel null', async () => {
      mockListDownloadedEmbedding.mockResolvedValue([]);
      mockListLoadedEmbedding.mockResolvedValue([]);

      const res = await request(app).get('/api/models/embedding');
      expect(res.status).toBe(200);
      expect(res.body.activeModel).toBeNull();
    });
  });

  describe('PUT /api/models/active', () => {
    it('returns 200 and calls setActiveLlmModelId', async () => {
      mockGetActive.mockReturnValue('llama3');

      const res = await request(app).put('/api/models/active').send({ modelId: 'llama3' });
      expect(res.status).toBe(200);
      expect(mockSetActive).toHaveBeenCalledWith('llama3');
      expect(res.body.activeModel).toBe('llama3');
    });

    it('returns 400 without modelId', async () => {
      const res = await request(app).put('/api/models/active').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('modelId is required');
    });
  });
});
