import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies before importing app
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

describe('GET /api/health', () => {
  it('returns 200 with status ok and timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});
