import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryChain } from '../helpers/mockSupabase.js';
import { parseSSEEvents } from '../helpers/parseSSE.js';

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

vi.mock('../../lib/supabase.js', () => ({
  createSupabaseClient: vi.fn(() => mockUserClient),
  supabaseAdmin: { auth: { getUser: vi.fn() }, from: vi.fn(), storage: { from: vi.fn() }, rpc: vi.fn() },
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.user = { id: 'test-user-uuid-1234', email: 'test@example.com' };
    req.accessToken = 'test-bearer-token';
    next();
  }),
}));

const mockModel = {
  act: vi.fn(),
};

vi.mock('../../lib/lmstudio.js', () => ({
  lmstudioClient: {},
  EMBEDDING_MODEL: 'test-model',
  EMBEDDING_DIMENSIONS: 768,
  getActiveLlmModelId: vi.fn(),
  setActiveLlmModelId: vi.fn(),
  getLlmModel: vi.fn(async () => mockModel),
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
  searchDocuments: vi.fn().mockResolvedValue([]),
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../app.js');

describe('Chat API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: model.act emits fragments
    mockModel.act.mockImplementation(async (msgs, tools, opts) => {
      opts.onPredictionFragment({ content: 'Hello ' });
      opts.onPredictionFragment({ content: 'world' });
    });
  });

  describe('POST /api/chat', () => {
    it('returns 400 when threadId is missing', async () => {
      const res = await request(app).post('/api/chat').send({ message: 'hi' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('threadId');
    });

    it('returns 400 when message is missing', async () => {
      const res = await request(app).post('/api/chat').send({ threadId: 't1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message');
    });

    it('returns 404 when thread not found', async () => {
      mockUserClient.from.mockReturnValue(createQueryChain({ data: null, error: { message: 'not found' } }));

      const res = await request(app).post('/api/chat').send({ threadId: 't1', message: 'hi' });
      expect(res.status).toBe(404);
    });

    it('returns 200 SSE stream with text_delta and done events', async () => {
      // First from() call: fetch thread (select/eq/single)
      // Second from() call: update thread (update/eq)
      const threadData = { id: 't1', messages: [], title: 'Test' };
      const fetchChain = createQueryChain({ data: threadData, error: null });
      const updateChain = createQueryChain({ data: null, error: null });

      let callCount = 0;
      mockUserClient.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? fetchChain : updateChain;
      });

      const res = await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'Hello' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const events = parseSSEEvents(res.text);
      const deltas = events.filter((e) => e.type === 'text_delta');
      expect(deltas.length).toBe(2);
      expect(deltas[0].content).toBe('Hello ');
      expect(deltas[1].content).toBe('world');

      const done = events.find((e) => e.type === 'done');
      expect(done).toBeDefined();
    });

    it('includes title in done event for first message', async () => {
      const threadData = { id: 't1', messages: [], title: 'Test' };
      const fetchChain = createQueryChain({ data: threadData, error: null });
      const updateChain = createQueryChain({ data: null, error: null });

      let callCount = 0;
      mockUserClient.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? fetchChain : updateChain;
      });

      const res = await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'What is RAG?' });

      const events = parseSSEEvents(res.text);
      const done = events.find((e) => e.type === 'done');
      expect(done.title).toBe('What is RAG?');
    });

    it('calls model.act with correct messages', async () => {
      const existingMessages = [
        { role: 'user', content: 'previous' },
        { role: 'assistant', content: 'response' },
      ];
      const threadData = { id: 't1', messages: existingMessages, title: 'Test' };
      const fetchChain = createQueryChain({ data: threadData, error: null });
      const updateChain = createQueryChain({ data: null, error: null });

      let callCount = 0;
      mockUserClient.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? fetchChain : updateChain;
      });

      await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'new question' });

      expect(mockModel.act).toHaveBeenCalledTimes(1);
      const [messages] = mockModel.act.mock.calls[0];
      expect(messages[0].role).toBe('system');
      expect(messages[1]).toEqual({ role: 'user', content: 'previous' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'response' });
      expect(messages[3]).toEqual({ role: 'user', content: 'new question' });
    });

    it('updates thread in supabase with user + assistant messages', async () => {
      const threadData = { id: 't1', messages: [], title: 'Test' };
      const fetchChain = createQueryChain({ data: threadData, error: null });
      const updateChain = createQueryChain({ data: null, error: null });

      let callCount = 0;
      mockUserClient.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? fetchChain : updateChain;
      });

      await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'Hello' });

      // Verify update was called (second from() call)
      expect(callCount).toBe(2);
      expect(updateChain.update).toHaveBeenCalled();
      const updateArg = updateChain.update.mock.calls[0][0];
      expect(updateArg.messages).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hello world' },
      ]);
    });
  });

  describe('GET /api/chat/:threadId/messages', () => {
    it('returns 200 with messages array', async () => {
      const messages = [{ role: 'user', content: 'hi' }];
      mockUserClient.from.mockReturnValue(createQueryChain({ data: { messages }, error: null }));

      const res = await request(app).get('/api/chat/t1/messages');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
    });

    it('returns 404 when thread not found', async () => {
      mockUserClient.from.mockReturnValue(createQueryChain({ data: null, error: { message: 'not found' } }));

      const res = await request(app).get('/api/chat/missing/messages');
      expect(res.status).toBe(404);
    });
  });
});
