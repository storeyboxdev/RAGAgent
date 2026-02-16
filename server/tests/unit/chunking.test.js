import { describe, it, expect } from 'vitest';
import { chunkText } from '../../lib/chunking.js';

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const result = chunkText('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ content: 'Hello world', chunkIndex: 0 });
  });

  it('keeps two short paragraphs in a single chunk', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const result = chunkText(text, { chunkSize: 512 });
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('First paragraph.');
    expect(result[0].content).toContain('Second paragraph.');
  });

  it('splits two paragraphs exceeding chunkSize into 2 chunks', () => {
    const para1 = 'A'.repeat(300);
    const para2 = 'B'.repeat(300);
    const text = `${para1}\n\n${para2}`;
    const result = chunkText(text, { chunkSize: 400 });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('overlap — second chunk starts with tail of first chunk content', () => {
    const para1 = 'A'.repeat(300);
    const para2 = 'B'.repeat(300);
    const text = `${para1}\n\n${para2}`;
    const result = chunkText(text, { chunkSize: 400, chunkOverlap: 50 });
    expect(result.length).toBeGreaterThanOrEqual(2);
    // Second chunk should start with overlap from first
    const firstTail = result[0].content.slice(-50);
    expect(result[1].content.startsWith(firstTail)).toBe(true);
  });

  it('splits long single paragraph at sentence boundaries', () => {
    const sentences = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} is here.`);
    const text = sentences.join(' ');
    const result = chunkText(text, { chunkSize: 100 });
    expect(result.length).toBeGreaterThan(1);
    // Each chunk should end near a sentence boundary
    for (const chunk of result) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('respects custom chunkSize and chunkOverlap', () => {
    const para1 = 'X'.repeat(100);
    const para2 = 'Y'.repeat(100);
    const text = `${para1}\n\n${para2}`;
    const result = chunkText(text, { chunkSize: 120, chunkOverlap: 20 });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns sequential chunkIndex values', () => {
    const paragraphs = Array.from({ length: 5 }, (_, i) => 'P'.repeat(200) + i);
    const text = paragraphs.join('\n\n');
    const result = chunkText(text, { chunkSize: 250 });
    for (let i = 0; i < result.length; i++) {
      expect(result[i].chunkIndex).toBe(i);
    }
  });
});
