/**
 * Check if web search is enabled and properly configured.
 */
export function isWebSearchEnabled() {
  if (process.env.WEB_SEARCH_ENABLED !== 'true') return false;

  const provider = (process.env.WEB_SEARCH_PROVIDER || 'tavily').toLowerCase();

  if (provider === 'tavily') {
    return !!process.env.TAVILY_API_KEY;
  }
  if (provider === 'searxng') {
    return !!process.env.SEARXNG_URL;
  }

  return false;
}

/**
 * Perform a web search using the configured provider.
 * Returns normalized results: [{ title, url, snippet, score }]
 * Returns [] on any error.
 */
export async function webSearch(query, { maxResults = 5 } = {}) {
  const provider = (process.env.WEB_SEARCH_PROVIDER || 'tavily').toLowerCase();

  try {
    if (provider === 'searxng') {
      return await searchSearXNG(query, maxResults);
    }
    return await searchTavily(query, maxResults);
  } catch {
    return [];
  }
}

async function searchTavily(query, maxResults) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: maxResults,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSearXNG(query, maxResults) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const baseUrl = process.env.SEARXNG_URL;
    const url = `${baseUrl}/search?format=json&q=${encodeURIComponent(query)}&pageno=1`;

    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.results || []).slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score || null,
    }));
  } finally {
    clearTimeout(timeout);
  }
}
