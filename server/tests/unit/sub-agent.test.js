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

const mockSupabaseAdmin = {
  from: vi.fn(),
};

vi.mock('../../lib/supabase.js', () => ({
  createSupabaseClient: vi.fn(),
  supabaseAdmin: mockSupabaseAdmin,
}));

const mockModel = { act: vi.fn() };

vi.mock('../../lib/lmstudio.js', () => ({
  lmstudioClient: {},
  EMBEDDING_MODEL: 'test-model',
  EMBEDDING_DIMENSIONS: 768,
  getLlmModel: vi.fn(async () => mockModel),
  getActiveLlmModelId: vi.fn(),
  setActiveLlmModelId: vi.fn(),
  listDownloadedLlmModels: vi.fn(),
  listLoadedLlmModels: vi.fn(),
  listDownloadedEmbeddingModels: vi.fn(),
  listLoadedEmbeddingModels: vi.fn(),
}));

const mockSearchDocuments = vi.fn();
vi.mock('../../lib/retrieval.js', () => ({
  searchDocuments: (...args) => mockSearchDocuments(...args),
}));

const { runSubAgent } = await import('../../lib/sub-agent.js');
const { observe } = await import('@lmnr-ai/lmnr');

// Helper: create a chainable supabase mock
function createChain(result) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve) => resolve(result),
  };
  return chain;
}

// Helper: mock res object for SSE
function createMockRes() {
  return { write: vi.fn() };
}

const TEST_DOC_ID = 'doc-uuid-1234';
const TEST_USER_ID = 'user-uuid-5678';

describe('Sub-Agent Library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModel.act.mockImplementation(async (msgs, tools, opts) => {
      opts.onPredictionFragment({ content: 'Analysis result' });
    });
  });

  function setupDocMock(doc = { id: TEST_DOC_ID, filename: 'report.pdf', metadata: {} }) {
    const docChain = createChain({ data: doc, error: null });
    const chunksChain = createChain({
      data: [
        { content: 'Chunk 1 content', chunk_index: 0 },
        { content: 'Chunk 2 content', chunk_index: 1 },
      ],
      error: null,
    });

    let callCount = 0;
    mockSupabaseAdmin.from.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? docChain : chunksChain;
    });

    return { docChain, chunksChain };
  }

  it('fetches document by document_id and userId', async () => {
    const { docChain } = setupDocMock();
    const res = createMockRes();

    await runSubAgent({ document_id: TEST_DOC_ID, task: 'summarize', userId: TEST_USER_ID, res });

    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('documents');
    expect(docChain.eq).toHaveBeenCalledWith('id', TEST_DOC_ID);
    expect(docChain.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID);
  });

  it('fetches chunks ordered by chunk_index', async () => {
    const { chunksChain } = setupDocMock();
    const res = createMockRes();

    await runSubAgent({ document_id: TEST_DOC_ID, task: 'summarize', userId: TEST_USER_ID, res });

    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('document_chunks');
    expect(chunksChain.order).toHaveBeenCalledWith('chunk_index', { ascending: true });
    expect(chunksChain.limit).toHaveBeenCalledWith(50);
  });

  it('truncates at 50K chars with notice', async () => {
    const longContent = 'x'.repeat(30000);
    const docChain = createChain({ data: { id: TEST_DOC_ID, filename: 'big.pdf', metadata: {} }, error: null });
    const chunksChain = createChain({
      data: [
        { content: longContent, chunk_index: 0 },
        { content: longContent, chunk_index: 1 },
      ],
      error: null,
    });

    let callCount = 0;
    mockSupabaseAdmin.from.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? docChain : chunksChain;
    });

    const res = createMockRes();
    await runSubAgent({ document_id: TEST_DOC_ID, task: 'summarize', userId: TEST_USER_ID, res });

    const [messages] = mockModel.act.mock.calls[0];
    expect(messages[0].content).toContain('[Document truncated due to length]');
  });

  it('throws when document not found', async () => {
    const docChain = createChain({ data: null, error: { message: 'not found' } });
    mockSupabaseAdmin.from.mockReturnValue(docChain);

    const res = createMockRes();
    await expect(
      runSubAgent({ document_id: 'nonexistent', task: 'summarize', userId: TEST_USER_ID, res })
    ).rejects.toThrow('Document not found');
  });

  it('emits subagent_text_delta SSE events during streaming', async () => {
    setupDocMock();
    const res = createMockRes();

    mockModel.act.mockImplementation(async (msgs, tools, opts) => {
      opts.onPredictionFragment({ content: 'Part 1' });
      opts.onPredictionFragment({ content: ' Part 2' });
    });

    await runSubAgent({ document_id: TEST_DOC_ID, task: 'summarize', userId: TEST_USER_ID, res });

    const writes = res.write.mock.calls.map((c) => JSON.parse(c[0].replace('data: ', '').trim()));
    const deltas = writes.filter((w) => w.type === 'subagent_text_delta');
    expect(deltas).toHaveLength(2);
    expect(deltas[0].content).toBe('Part 1');
    expect(deltas[1].content).toBe(' Part 2');
  });

  it('emits subagent_tool_call + subagent_tool_result when search_within_document invoked', async () => {
    setupDocMock();
    const res = createMockRes();

    const mockChunks = [{ id: 'c1', content: 'found text' }];
    mockChunks._searchMeta = { search_mode: 'hybrid', reranked: false };
    mockSearchDocuments.mockResolvedValue(mockChunks);

    mockModel.act.mockImplementation(async (msgs, tools, opts) => {
      const searchTool = tools.find((t) => t.name === 'search_within_document');
      await searchTool.implementation({ query: 'specific topic' });
      opts.onPredictionFragment({ content: 'Done' });
    });

    await runSubAgent({ document_id: TEST_DOC_ID, task: 'find info', userId: TEST_USER_ID, res });

    const writes = res.write.mock.calls.map((c) => JSON.parse(c[0].replace('data: ', '').trim()));
    const toolCall = writes.find((w) => w.type === 'subagent_tool_call');
    expect(toolCall).toBeDefined();
    expect(toolCall.name).toBe('search_within_document');
    expect(toolCall.arguments.query).toBe('specific topic');

    const toolResult = writes.find((w) => w.type === 'subagent_tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult.name).toBe('search_within_document');
    expect(toolResult.count).toBe(1);
  });

  it('search_within_document calls searchDocuments with document_id option', async () => {
    setupDocMock();
    const res = createMockRes();

    const mockChunks = [];
    mockChunks._searchMeta = { search_mode: 'hybrid', reranked: false };
    mockSearchDocuments.mockResolvedValue(mockChunks);

    mockModel.act.mockImplementation(async (msgs, tools, opts) => {
      const searchTool = tools.find((t) => t.name === 'search_within_document');
      await searchTool.implementation({ query: 'test query' });
      opts.onPredictionFragment({ content: 'Done' });
    });

    await runSubAgent({ document_id: TEST_DOC_ID, task: 'search', userId: TEST_USER_ID, res });

    expect(mockSearchDocuments).toHaveBeenCalledWith('test query', TEST_USER_ID, { document_id: TEST_DOC_ID, limit: 5 });
  });

  it('sub-agent system message includes filename and assembled content', async () => {
    setupDocMock();
    const res = createMockRes();

    await runSubAgent({ document_id: TEST_DOC_ID, task: 'summarize this', userId: TEST_USER_ID, res });

    const [messages] = mockModel.act.mock.calls[0];
    const systemMsg = messages[0].content;
    expect(systemMsg).toContain('report.pdf');
    expect(systemMsg).toContain('Chunk 1 content');
    expect(systemMsg).toContain('Chunk 2 content');
    expect(systemMsg).toContain('summarize this');
  });

  it('returns final accumulated sub-agent content', async () => {
    setupDocMock();
    const res = createMockRes();

    mockModel.act.mockImplementation(async (msgs, tools, opts) => {
      opts.onPredictionFragment({ content: 'Summary: ' });
      opts.onPredictionFragment({ content: 'The document covers...' });
    });

    const result = await runSubAgent({ document_id: TEST_DOC_ID, task: 'summarize', userId: TEST_USER_ID, res });
    expect(result).toBe('Summary: The document covers...');
  });

  it('wraps in observe() span', async () => {
    setupDocMock();
    const res = createMockRes();

    await runSubAgent({ document_id: TEST_DOC_ID, task: 'summarize', userId: TEST_USER_ID, res });

    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sub_agent', input: { document_id: TEST_DOC_ID, task: 'summarize' } }),
      expect.any(Function)
    );
  });
});
