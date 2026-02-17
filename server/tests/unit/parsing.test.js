import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

const { parseDocument, SUPPORTED_EXTENSIONS } = await import('../../lib/parsing.js');

describe('parseDocument', () => {
  describe('direct text path', () => {
    it('.txt files return direct text without fetch', async () => {
      const buffer = Buffer.from('Hello world');
      const result = await parseDocument(buffer, 'test.txt', 'text/plain');
      expect(result).toBe('Hello world');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('.md files return direct text without fetch', async () => {
      const buffer = Buffer.from('# Heading\nSome markdown');
      const result = await parseDocument(buffer, 'readme.md', 'text/markdown');
      expect(result).toBe('# Heading\nSome markdown');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('text/plain mime type triggers direct text regardless of extension', async () => {
      const buffer = Buffer.from('plain text content');
      const result = await parseDocument(buffer, 'file.unknown', 'text/plain');
      expect(result).toBe('plain text content');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('docling path', () => {
    it('.pdf files call docling-serve', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ document: { md_content: 'parsed pdf content' } }),
      });

      const buffer = Buffer.from('fake pdf bytes');
      const result = await parseDocument(buffer, 'doc.pdf', 'application/pdf');
      expect(result).toBe('parsed pdf content');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch.mock.calls[0][0]).toContain('/v1/convert/file');
    });

    it('.docx files call docling-serve', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ document: { md_content: 'parsed docx content' } }),
      });

      const buffer = Buffer.from('fake docx bytes');
      const result = await parseDocument(buffer, 'doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(result).toBe('parsed docx content');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('.html files call docling-serve', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ document: { md_content: 'parsed html content' } }),
      });

      const buffer = Buffer.from('<html><body>Hello</body></html>');
      const result = await parseDocument(buffer, 'page.html', 'text/html');
      expect(result).toBe('parsed html content');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('.htm files call docling-serve', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: 'htm content' } ),
      });

      const buffer = Buffer.from('<html><body>Hello</body></html>');
      const result = await parseDocument(buffer, 'page.htm', 'text/html');
      expect(result).toBe('htm content');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('handles alternative response shapes (md_content at root)', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ md_content: 'root level content' }),
      });

      const buffer = Buffer.from('fake pdf');
      const result = await parseDocument(buffer, 'doc.pdf', 'application/pdf');
      expect(result).toBe('root level content');
    });

    it('handles text response shape', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'text field content' }),
      });

      const buffer = Buffer.from('fake pdf');
      const result = await parseDocument(buffer, 'doc.pdf', 'application/pdf');
      expect(result).toBe('text field content');
    });

    it('throws on docling-serve error (500)', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const buffer = Buffer.from('fake pdf');
      await expect(parseDocument(buffer, 'doc.pdf', 'application/pdf'))
        .rejects.toThrow('Docling-serve error (500)');
    });

    it('throws on unexpected response shape', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ unexpected: 'shape' }),
      });

      const buffer = Buffer.from('fake pdf');
      await expect(parseDocument(buffer, 'doc.pdf', 'application/pdf'))
        .rejects.toThrow('Unexpected docling-serve response shape');
    });
  });

  describe('fallback path', () => {
    it('unknown mime type falls back to direct text', async () => {
      const buffer = Buffer.from('some content');
      const result = await parseDocument(buffer, 'file.xyz', 'application/octet-stream');
      expect(result).toBe('some content');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('extension fallback for application/octet-stream', () => {
    it('.pdf extension triggers docling even with octet-stream mime', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ document: { md_content: 'pdf from octet-stream' } }),
      });

      const buffer = Buffer.from('fake pdf');
      const result = await parseDocument(buffer, 'doc.pdf', 'application/octet-stream');
      expect(result).toBe('pdf from octet-stream');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('.txt extension triggers direct text even with octet-stream mime', async () => {
      const buffer = Buffer.from('plain text');
      const result = await parseDocument(buffer, 'file.txt', 'application/octet-stream');
      expect(result).toBe('plain text');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});

describe('SUPPORTED_EXTENSIONS', () => {
  it('includes all expected extensions', () => {
    expect(SUPPORTED_EXTENSIONS).toEqual(['.txt', '.md', '.pdf', '.docx', '.html', '.htm']);
  });
});
