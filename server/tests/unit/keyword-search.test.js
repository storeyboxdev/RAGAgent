import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: { rpc: (...args) => mockRpc(...args) },
}));

const { keywordSearch } = await import('../../lib/keyword-search.js');

describe('keywordSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls RPC with correct params', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await keywordSearch('test query', 'user-123', { limit: 5 });

    expect(mockRpc).toHaveBeenCalledWith('keyword_search_chunks', {
      query_text: 'test query',
      match_user_id: 'user-123',
      match_count: 5,
    });
  });

  it('passes filter_document_ids when provided', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await keywordSearch('test', 'user-123', { limit: 10, filterDocumentIds: ['doc-1', 'doc-2'] });

    expect(mockRpc).toHaveBeenCalledWith('keyword_search_chunks', {
      query_text: 'test',
      match_user_id: 'user-123',
      match_count: 10,
      filter_document_ids: ['doc-1', 'doc-2'],
    });
  });

  it('returns data array on success', async () => {
    const chunks = [
      { id: 'c1', content: 'hello world', rank: 0.5 },
      { id: 'c2', content: 'foo bar', rank: 0.3 },
    ];
    mockRpc.mockResolvedValue({ data: chunks, error: null });

    const result = await keywordSearch('hello', 'user-123');
    expect(result).toEqual(chunks);
  });

  it('returns empty array on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });

    const result = await keywordSearch('test', 'user-123');
    expect(result).toEqual([]);
  });

  it('uses default limit of 10', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await keywordSearch('test', 'user-123');

    expect(mockRpc).toHaveBeenCalledWith('keyword_search_chunks', expect.objectContaining({
      match_count: 10,
    }));
  });
});
