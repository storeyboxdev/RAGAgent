import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@lmstudio/sdk', () => ({
  LMStudioClient: vi.fn(() => ({})),
}));

// Mock supabase
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
  },
}));

vi.mock('../../lib/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../lib/keyword-search.js', () => ({
  keywordSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/reranker.js', () => ({
  rerankChunks: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/lmstudio.js', () => ({
  lmstudioClient: {},
  getLlmModel: vi.fn(),
}));

// Import after mocks
const { reciprocalRankFusion, searchDocuments } = await import('../../lib/retrieval.js');

describe('reciprocalRankFusion', () => {
  it('chunk in both lists gets higher score than single-list chunk', () => {
    const listA = [{ id: 'shared', content: 'a' }, { id: 'only-a', content: 'b' }];
    const listB = [{ id: 'shared', content: 'a' }, { id: 'only-b', content: 'c' }];

    const results = reciprocalRankFusion([listA, listB]);

    const sharedScore = results.find((r) => r.id === 'shared').rrf_score;
    const onlyAScore = results.find((r) => r.id === 'only-a').rrf_score;
    const onlyBScore = results.find((r) => r.id === 'only-b').rrf_score;

    expect(sharedScore).toBeGreaterThan(onlyAScore);
    expect(sharedScore).toBeGreaterThan(onlyBScore);
  });

  it('deduplicates chunks appearing in both lists', () => {
    const listA = [{ id: 'shared', content: 'a' }];
    const listB = [{ id: 'shared', content: 'a' }];

    const results = reciprocalRankFusion([listA, listB]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('shared');
  });

  it('returns empty array for empty input lists', () => {
    const results = reciprocalRankFusion([[], []]);
    expect(results).toEqual([]);
  });

  it('sorts by RRF score descending', () => {
    const listA = [{ id: 'a1', content: 'x' }, { id: 'a2', content: 'y' }];
    const listB = [{ id: 'a2', content: 'y' }, { id: 'a1', content: 'x' }];

    const results = reciprocalRankFusion([listA, listB]);
    // Both appear in both lists at different positions — scores differ
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].rrf_score).toBeGreaterThanOrEqual(results[i].rrf_score);
    }
  });
});

describe('searchDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches _searchMeta to results', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const results = await searchDocuments('test', 'user-123');
    expect(results._searchMeta).toBeDefined();
    expect(results._searchMeta.search_mode).toBeDefined();
    expect(typeof results._searchMeta.reranked).toBe('boolean');
  });

  it('returns empty array when metadata filter matches no docs', async () => {
    // Build a fluent chain where every method returns itself, ending in a thenable
    const makeChain = (resolveValue) => {
      const chain = {};
      const methods = ['select', 'eq', 'not', 'ilike'];
      for (const m of methods) {
        chain[m] = vi.fn(() => chain);
      }
      // Make the chain thenable so `await docQuery` resolves
      chain.then = (resolve, reject) => Promise.resolve(resolveValue).then(resolve, reject);
      return chain;
    };

    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const results = await searchDocuments('test', 'user-123', {
      metadata_filter: { topic: 'nonexistent' },
    });
    // Returns plain empty array (no search performed when filter matches nothing)
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});
