import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@lmstudio/sdk', () => ({
  LMStudioClient: vi.fn(() => ({})),
}));

const mockRespond = vi.fn();

vi.mock('../../lib/lmstudio.js', () => ({
  lmstudioClient: {},
  getLlmModel: vi.fn().mockResolvedValue({ respond: mockRespond }),
}));

const { rerankChunks } = await import('../../lib/reranker.js');

const makeChunk = (id, content = 'chunk content') => ({
  id, content, document_id: 'doc-1', chunk_index: 0,
});

describe('rerankChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty input', async () => {
    const result = await rerankChunks('query', []);
    expect(result).toEqual([]);
  });

  it('returns empty array for null input', async () => {
    const result = await rerankChunks('query', null);
    expect(result).toEqual([]);
  });

  it('scores chunks and sorts by rerank_score descending', async () => {
    mockRespond.mockResolvedValueOnce({
      content: JSON.stringify([
        { index: 0, score: 0.3 },
        { index: 1, score: 0.9 },
        { index: 2, score: 0.6 },
      ]),
    });

    const chunks = [makeChunk('c1'), makeChunk('c2'), makeChunk('c3')];
    const result = await rerankChunks('test query', chunks, 3);

    expect(mockRespond).toHaveBeenCalledTimes(1);
    expect(result[0].id).toBe('c2');
    expect(result[0].rerank_score).toBe(0.9);
    expect(result[1].id).toBe('c3');
    expect(result[1].rerank_score).toBe(0.6);
    expect(result[2].id).toBe('c1');
    expect(result[2].rerank_score).toBe(0.3);
  });

  it('respects limit parameter', async () => {
    mockRespond.mockResolvedValueOnce({
      content: JSON.stringify([
        { index: 0, score: 0.3 },
        { index: 1, score: 0.9 },
        { index: 2, score: 0.6 },
      ]),
    });

    const chunks = [makeChunk('c1'), makeChunk('c2'), makeChunk('c3')];
    const result = await rerankChunks('test query', chunks, 2);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('c2');
    expect(result[1].id).toBe('c3');
  });

  it('strips markdown code fences from LLM response', async () => {
    mockRespond.mockResolvedValueOnce({
      content: '```json\n[{"index": 0, "score": 0.8}]\n```',
    });

    const result = await rerankChunks('query', [makeChunk('c1')], 1);
    expect(result[0].rerank_score).toBe(0.8);
  });

  it('strips think blocks from reasoning model response', async () => {
    mockRespond.mockResolvedValueOnce({
      content: '<think>Let me evaluate this...</think>\n[{"index": 0, "score": 0.75}]',
    });

    const result = await rerankChunks('query', [makeChunk('c1')], 1);
    expect(result[0].rerank_score).toBe(0.75);
  });

  it('assigns score 0 on failed LLM call', async () => {
    mockRespond.mockRejectedValueOnce(new Error('LLM timeout'));

    const result = await rerankChunks('query', [makeChunk('c1')], 1);
    expect(result[0].rerank_score).toBe(0);
    expect(result[0].id).toBe('c1');
  });

  it('assigns score 0 when Zod rejects out-of-range score', async () => {
    mockRespond.mockResolvedValueOnce({
      content: JSON.stringify([{ index: 0, score: 1.5 }]),
    });

    const result = await rerankChunks('query', [makeChunk('c1')], 1);
    expect(result[0].rerank_score).toBe(0);
  });

  it('assigns score 0 for chunks missing from LLM response', async () => {
    mockRespond.mockResolvedValueOnce({
      content: JSON.stringify([
        { index: 0, score: 0.8 },
        // index 1 missing
      ]),
    });

    const chunks = [makeChunk('c1'), makeChunk('c2')];
    const result = await rerankChunks('query', chunks, 2);

    expect(result[0].id).toBe('c1');
    expect(result[0].rerank_score).toBe(0.8);
    expect(result[1].id).toBe('c2');
    expect(result[1].rerank_score).toBe(0);
  });
});
