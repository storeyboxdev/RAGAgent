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
  searchDocuments: vi.fn().mockImplementation(async () => {
    const chunks = [];
    chunks._searchMeta = { search_mode: 'hybrid', reranked: false };
    return chunks;
  }),
}));

vi.mock('../../lib/sql-query.js', () => ({
  getSchemaDescription: vi.fn(() => 'TABLE: documents\n  - id (uuid)\n  - filename (text)'),
  executeQuery: vi.fn(),
}));

vi.mock('../../lib/web-search.js', () => ({
  isWebSearchEnabled: vi.fn(() => false),
  webSearch: vi.fn(),
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../app.js');
const { executeQuery } = await import('../../lib/sql-query.js');
const { isWebSearchEnabled, webSearch } = await import('../../lib/web-search.js');

function setupThreadMock() {
  const threadData = { id: 't1', messages: [], title: 'Test' };
  const fetchChain = createQueryChain({ data: threadData, error: null });
  const updateChain = createQueryChain({ data: null, error: null });

  let callCount = 0;
  mockUserClient.from.mockImplementation(() => {
    callCount++;
    return callCount === 1 ? fetchChain : updateChain;
  });

  return { fetchChain, updateChain };
}

describe('Chat API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: model.act emits fragments
    mockModel.act.mockImplementation(async (msgs, tools, opts) => {
      opts.onPredictionFragment({ content: 'Hello ' });
      opts.onPredictionFragment({ content: 'world' });
    });
    // Default: web search disabled
    isWebSearchEnabled.mockReturnValue(false);
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
      setupThreadMock();

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
      setupThreadMock();

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
      const { updateChain } = setupThreadMock();

      await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'Hello' });

      expect(updateChain.update).toHaveBeenCalled();
      const updateArg = updateChain.update.mock.calls[0][0];
      expect(updateArg.messages).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hello world' },
      ]);
    });

    it('tool_result SSE event includes search_mode and reranked fields', async () => {
      // Override model.act to invoke the search tool
      mockModel.act.mockImplementation(async (msgs, tools, opts) => {
        const searchTool = tools.find((t) => t.name === 'search_documents');
        await searchTool.implementation({ query: 'test query' });
        opts.onPredictionFragment({ content: 'Answer' });
      });

      setupThreadMock();

      const res = await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'test' });

      const events = parseSSEEvents(res.text);
      const toolResult = events.find((e) => e.type === 'tool_result');
      expect(toolResult).toBeDefined();
      expect(toolResult.search_mode).toBe('hybrid');
      expect(toolResult.reranked).toBe(false);
    });

    // --- Module 7: query_database tests ---

    it('query_database emits correct tool_call and tool_result SSE events', async () => {
      executeQuery.mockResolvedValue({
        rows: [{ filename: 'test.pdf', status: 'ready' }],
        rowCount: 1,
        sql: "SELECT filename, status FROM documents WHERE documents.user_id = 'test-user-uuid-1234'",
      });

      mockModel.act.mockImplementation(async (msgs, tools, opts) => {
        const dbTool = tools.find((t) => t.name === 'query_database');
        await dbTool.implementation({ sql: 'SELECT filename, status FROM documents' });
        opts.onPredictionFragment({ content: 'You have 1 document.' });
      });

      setupThreadMock();

      const res = await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'How many documents do I have?' });

      const events = parseSSEEvents(res.text);

      const toolCall = events.find((e) => e.type === 'tool_call' && e.name === 'query_database');
      expect(toolCall).toBeDefined();
      expect(toolCall.arguments.sql).toBe('SELECT filename, status FROM documents');

      const toolResult = events.find((e) => e.type === 'tool_result' && e.name === 'query_database');
      expect(toolResult).toBeDefined();
      expect(toolResult.rows).toEqual([{ filename: 'test.pdf', status: 'ready' }]);
      expect(toolResult.rowCount).toBe(1);
      expect(toolResult.sql).toBeDefined();
    });

    it('query_database emits error on invalid SQL', async () => {
      executeQuery.mockRejectedValue(new Error('Only SELECT statements are allowed'));

      mockModel.act.mockImplementation(async (msgs, tools, opts) => {
        const dbTool = tools.find((t) => t.name === 'query_database');
        await dbTool.implementation({ sql: 'DROP TABLE documents' });
        opts.onPredictionFragment({ content: 'I cannot do that.' });
      });

      setupThreadMock();

      const res = await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'Drop the table' });

      const events = parseSSEEvents(res.text);
      const toolResult = events.find((e) => e.type === 'tool_result' && e.name === 'query_database');
      expect(toolResult).toBeDefined();
      expect(toolResult.error).toContain('SELECT');
      expect(toolResult.rows).toEqual([]);
    });

    // --- Module 7: web_search tests ---

    it('web_search emits correct SSE events when enabled', async () => {
      isWebSearchEnabled.mockReturnValue(true);
      webSearch.mockResolvedValue([
        { title: 'Web Result', url: 'https://example.com', snippet: 'A snippet', score: 0.9 },
      ]);

      // Need to re-import app to pick up web search enabled
      // But since we're mocking at module level, the tool registration happens at request time
      mockModel.act.mockImplementation(async (msgs, tools, opts) => {
        const wsTool = tools.find((t) => t.name === 'web_search');
        await wsTool.implementation({ query: 'quantum computing' });
        opts.onPredictionFragment({ content: 'Quantum computing is...' });
      });

      setupThreadMock();

      const res = await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'What is quantum computing?' });

      const events = parseSSEEvents(res.text);

      const toolCall = events.find((e) => e.type === 'tool_call' && e.name === 'web_search');
      expect(toolCall).toBeDefined();
      expect(toolCall.arguments.query).toBe('quantum computing');

      const toolResult = events.find((e) => e.type === 'tool_result' && e.name === 'web_search');
      expect(toolResult).toBeDefined();
      expect(toolResult.results).toHaveLength(1);
      expect(toolResult.results[0].url).toBe('https://example.com');
    });

    it('web_search tool not registered when disabled', async () => {
      isWebSearchEnabled.mockReturnValue(false);

      mockModel.act.mockImplementation(async (msgs, tools, opts) => {
        const wsTool = tools.find((t) => t.name === 'web_search');
        expect(wsTool).toBeUndefined();
        opts.onPredictionFragment({ content: 'No web search available.' });
      });

      setupThreadMock();

      await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'test' });

      expect(mockModel.act).toHaveBeenCalled();
    });

    it('all three tools available when web search enabled', async () => {
      isWebSearchEnabled.mockReturnValue(true);

      mockModel.act.mockImplementation(async (msgs, tools, opts) => {
        const toolNames = tools.map((t) => t.name);
        expect(toolNames).toContain('search_documents');
        expect(toolNames).toContain('query_database');
        expect(toolNames).toContain('web_search');
        expect(toolNames).toHaveLength(3);
        opts.onPredictionFragment({ content: 'Done' });
      });

      setupThreadMock();

      await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'test' });
    });

    it('only search_documents and query_database when web search disabled', async () => {
      isWebSearchEnabled.mockReturnValue(false);

      mockModel.act.mockImplementation(async (msgs, tools, opts) => {
        const toolNames = tools.map((t) => t.name);
        expect(toolNames).toContain('search_documents');
        expect(toolNames).toContain('query_database');
        expect(toolNames).not.toContain('web_search');
        expect(toolNames).toHaveLength(2);
        opts.onPredictionFragment({ content: 'Done' });
      });

      setupThreadMock();

      await request(app)
        .post('/api/chat')
        .send({ threadId: 't1', message: 'test' });
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
