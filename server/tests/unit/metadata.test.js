import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock LMStudio SDK
vi.mock('@lmstudio/sdk', () => ({
  LMStudioClient: vi.fn(() => ({})),
}));

const mockRespond = vi.fn();

vi.mock('../../lib/lmstudio.js', () => ({
  lmstudioClient: {},
  getLlmModel: vi.fn().mockResolvedValue({ respond: mockRespond }),
}));

const { DocumentMetadataSchema, extractMetadata, MAX_EXTRACTION_CHARS } = await import('../../lib/metadata.js');

const validMetadata = {
  topic: 'Machine Learning',
  document_type: 'tutorial',
  key_entities: ['Python', 'TensorFlow', 'neural networks'],
  summary: 'A tutorial on building neural networks with TensorFlow in Python.',
  language: 'English',
};

describe('DocumentMetadataSchema', () => {
  it('validates correct structure', () => {
    const result = DocumentMetadataSchema.parse(validMetadata);
    expect(result).toEqual(validMetadata);
  });

  it('rejects missing required fields', () => {
    expect(() => DocumentMetadataSchema.parse({ topic: 'test' })).toThrow();
  });

  it('rejects invalid document_type', () => {
    expect(() => DocumentMetadataSchema.parse({ ...validMetadata, document_type: 'invalid' })).toThrow();
  });

  it('rejects key_entities with more than 10 items', () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `entity${i}`);
    expect(() => DocumentMetadataSchema.parse({ ...validMetadata, key_entities: tooMany })).toThrow();
  });

  it('rejects summary longer than 500 chars', () => {
    expect(() => DocumentMetadataSchema.parse({ ...validMetadata, summary: 'x'.repeat(501) })).toThrow();
  });
});

describe('extractMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid LLM response', async () => {
    mockRespond.mockResolvedValue({ content: JSON.stringify(validMetadata) });

    const result = await extractMetadata('Some document text here');
    expect(result).toEqual(validMetadata);
  });

  it('strips markdown code fences from response', async () => {
    mockRespond.mockResolvedValue({ content: '```json\n' + JSON.stringify(validMetadata) + '\n```' });

    const result = await extractMetadata('Some document text');
    expect(result).toEqual(validMetadata);
  });

  it('strips <think> blocks from reasoning model responses', async () => {
    const thinkResponse = '<think>The document appears to be about ML...</think>\n' + JSON.stringify(validMetadata);
    mockRespond.mockResolvedValue({ content: thinkResponse });

    const result = await extractMetadata('Some document text');
    expect(result).toEqual(validMetadata);
  });

  it('handles string response (not object)', async () => {
    mockRespond.mockResolvedValue(JSON.stringify(validMetadata));

    const result = await extractMetadata('Some text');
    expect(result).toEqual(validMetadata);
  });

  it('throws on invalid document_type from LLM', async () => {
    mockRespond.mockResolvedValue({ content: JSON.stringify({ ...validMetadata, document_type: 'blogpost' }) });

    await expect(extractMetadata('Some text')).rejects.toThrow();
  });

  it('throws on malformed JSON', async () => {
    mockRespond.mockResolvedValue({ content: 'not valid json{' });

    await expect(extractMetadata('Some text')).rejects.toThrow();
  });

  it('truncates input text to MAX_EXTRACTION_CHARS', async () => {
    mockRespond.mockResolvedValue({ content: JSON.stringify(validMetadata) });

    const marker = 'X';
    const longText = marker.repeat(MAX_EXTRACTION_CHARS + 1000);
    await extractMetadata(longText);

    const calledWith = mockRespond.mock.calls[0][0][0].content;
    // Should contain exactly MAX_EXTRACTION_CHARS of the marker character
    const markerCount = (calledWith.match(/X/g) || []).length;
    expect(markerCount).toBe(MAX_EXTRACTION_CHARS);
  });
});
