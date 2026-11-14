/**
 * SIH26028 — AI Assistant 2.0: Web Search Abstraction Layer
 *
 * Provides web search capability using standard search APIs (e.g. Tavily, Brave, SerpAPI, or DuckDuckGo HTML fallback)
 * configured via environment variables. If no search API key is configured, returns graceful unavailable message.
 */

const axios = require('axios');

async function searchWeb(query, options = {}) {
  const maxResults = options.maxResults || 3;
  const apiKey = process.env.WEB_SEARCH_API_KEY || process.env.TAVILY_API_KEY || process.env.SERPAPI_KEY;
  const provider = (process.env.WEB_SEARCH_PROVIDER || (process.env.TAVILY_API_KEY ? 'tavily' : process.env.SERPAPI_KEY ? 'serpapi' : 'duckduckgo')).toLowerCase();

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { success: false, results: [], error: 'Empty query' };
  }

  try {
    // 1. Tavily API
    if (provider === 'tavily' && apiKey) {
      const resp = await axios.post('https://api.tavily.com/search', {
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: true,
      }, { timeout: 10000 });

      const results = (resp.data?.results || []).map(r => ({
        title: r.title,
        snippet: r.content || r.snippet,
        url: r.url,
      }));
      return { success: true, answer: resp.data?.answer, results, source: 'Tavily Search' };
    }

    // 2. SerpAPI
    if (provider === 'serpapi' && apiKey) {
      const resp = await axios.get('https://serpapi.com/search', {
        params: {
          api_key: apiKey,
          q: query,
          num: maxResults,
          engine: 'google',
        },
        timeout: 10000,
      });

      const organic = resp.data?.organic_results || [];
      const results = organic.slice(0, maxResults).map(r => ({
        title: r.title,
        snippet: r.snippet,
        url: r.link,
      }));
      return { success: true, answer: resp.data?.answer_box?.snippet || resp.data?.answer_box?.answer, results, source: 'SerpAPI' };
    }

    // 3. DuckDuckGo / Public fallback (no API key required)
    const resp = await axios.get(`https://html.duckduckgo.com/html/`, {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RailConnectAgent/2.0',
      },
      timeout: 8000,
    });

    const html = resp.data;
    const results = [];
    const snippetRegex = /<a class="result__snippet"[^>]*>(.*?)<\/a>/g;
    const titleRegex = /<a class="result__url"[^>]*>(.*?)<\/a>/g;
    
    let match;
    let count = 0;
    while ((match = snippetRegex.exec(html)) !== null && count < maxResults) {
      count++;
      const snippet = match[1].replace(/<[^>]*>/g, '').trim();
      results.push({
        title: `Web Result ${count}`,
        snippet,
        url: 'https://duckduckgo.com',
      });
    }

    if (results.length > 0) {
      return { success: true, results, source: 'Web Search (DuckDuckGo)' };
    }

    return { success: false, results: [], error: 'Web search returned no results or requires API key configuration.' };
  } catch (err) {
    console.error('[WebSearch] Error:', err.message);
    return { success: false, results: [], error: err.message };
  }
}

function isWebSearchRequired(message) {
  const msg = message.toLowerCase();
  // Don't trigger web search for standard railway/train queries
  if (/\b(train|station|pnr|booking|delay|eta|platform|reach|arrive|depart|schedule)\b/.test(msg)) {
    return /\b(search the web|google|internet|latest news|railway news|announcements|disruptions)\b/.test(msg);
  }
  return /\b(news|announcements|latest news|current events|search the web|internet)\b/.test(msg);
}

module.exports = {
  searchWeb,
  isWebSearchRequired,
};
