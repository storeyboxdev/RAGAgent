import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('web-search', () => {
  let isWebSearchEnabled, webSearch;

  beforeEach(async () => {
    // Reset env before each test
    process.env = { ...originalEnv };
    // Re-import to pick up env changes
    vi.resetModules();
    const mod = await import('../../lib/web-search.js');
    isWebSearchEnabled = mod.isWebSearchEnabled;
    webSearch = mod.webSearch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('isWebSearchEnabled', () => {
    it('returns false by default', () => {
      delete process.env.WEB_SEARCH_ENABLED;
      expect(isWebSearchEnabled()).toBe(false);
    });

    it('returns true when tavily is configured', () => {
      process.env.WEB_SEARCH_ENABLED = 'true';
      process.env.WEB_SEARCH_PROVIDER = 'tavily';
      process.env.TAVILY_API_KEY = 'tvly-test-key';
      expect(isWebSearchEnabled()).toBe(true);
    });

    it('returns false when enabled but no API key', () => {
      process.env.WEB_SEARCH_ENABLED = 'true';
      process.env.WEB_SEARCH_PROVIDER = 'tavily';
      delete process.env.TAVILY_API_KEY;
      expect(isWebSearchEnabled()).toBe(false);
    });

    it('returns true when searxng is configured', () => {
      process.env.WEB_SEARCH_ENABLED = 'true';
      process.env.WEB_SEARCH_PROVIDER = 'searxng';
      process.env.SEARXNG_URL = 'http://localhost:8080';
      expect(isWebSearchEnabled()).toBe(true);
    });
  });

  describe('webSearch - Tavily', () => {
    beforeEach(() => {
      process.env.WEB_SEARCH_PROVIDER = 'tavily';
      process.env.TAVILY_API_KEY = 'tvly-test-key';
    });

    it('sends correct request to Tavily API', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          results: [
            { title: 'Test Result', url: 'https://example.com', content: 'Test snippet', score: 0.9 },
          ],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const results = await webSearch('test query');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: 'tvly-test-key', query: 'test query', max_results: 5 }),
        })
      );
      expect(results).toEqual([
        { title: 'Test Result', url: 'https://example.com', snippet: 'Test snippet', score: 0.9 },
      ]);
    });

    it('returns empty array on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
      const results = await webSearch('test');
      expect(results).toEqual([]);
    });

    it('returns empty array on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 });
      const results = await webSearch('test');
      expect(results).toEqual([]);
    });

    it('respects maxResults parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ results: [] }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await webSearch('test', { maxResults: 3 });

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.max_results).toBe(3);
    });
  });

  describe('webSearch - SearXNG', () => {
    beforeEach(() => {
      process.env.WEB_SEARCH_PROVIDER = 'searxng';
      process.env.SEARXNG_URL = 'http://localhost:8080';
    });

    it('sends correct request to SearXNG', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          results: [
            { title: 'SearXNG Result', url: 'https://example.com', content: 'A snippet', score: 0.8 },
          ],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const results = await webSearch('test query');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:8080/search?format=json&q=test%20query'),
        expect.any(Object)
      );
      expect(results).toEqual([
        { title: 'SearXNG Result', url: 'https://example.com', snippet: 'A snippet', score: 0.8 },
      ]);
    });
  });
});
