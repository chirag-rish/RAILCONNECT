/**
 * SIH26028 — AI Assistant 2.0: Provider Abstraction Layer
 *
 * Cleanly wraps different LLM providers behind a common interface.
 * The agent never knows which provider is used.
 * 401 / 429 / timeout / quota errors are handled here and surfaced
 * as structured failures so the agent can respond gracefully.
 *
 * Supported providers:
 *   - openrouter  (OpenRouter API, supports tool calling via functions)
 *   - anthropic   (Anthropic SDK, tool calling via tools)
 *   - fallback    (no LLM — returns static response)
 *
 * Configuration via environment variables:
 *   AI_PROVIDER               — preferred provider ('openrouter' | 'anthropic' | 'auto')
 *   OPENROUTER_API_KEY        — OpenRouter API key
 *   OPENROUTER_MODEL          — model name (e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet')
 *   OPENROUTER_API_URL        — API base URL (default: https://openrouter.ai/api/v1)
 *   ANTHROPIC_API_KEY         — Anthropic API key
 *   AI_FALLBACK_ENABLED       — enable/disable fallback (default: true)
 */

const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

class AIProviderError extends Error {
  constructor(message, code, status, details) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;          // 'UNAUTHORIZED' | 'RATE_LIMIT' | 'TIMEOUT' | 'QUOTA' | 'SERVER_ERROR' | 'NETWORK' | 'UNKNOWN'
    this.status = status;      // HTTP status if applicable
    this.details = details;    // raw response data for diagnostics
  }
}

function getErrorCode(err, apiUrl) {
  if (!err) return 'UNKNOWN';
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') return 'NETWORK';
  if (err.response) {
    const s = err.response.status;
    // For local proxies, treat 401, 404, 502, 503 as NETWORK (proxy not working)
    // For remote providers, 401 = UNAUTHORIZED, 429 = RATE_LIMIT, etc.
    const isLocalProxy = apiUrl && /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/)/i.test(apiUrl);
    if (isLocalProxy) {
      if (s === 401 || s === 404 || s === 502 || s === 503) return 'NETWORK';
    } else {
      if (s === 401) return 'UNAUTHORIZED';
    }
    if (s === 429) return 'RATE_LIMIT';
    if (s >= 500 && s < 600) return 'SERVER_ERROR';
    if (s === 402 || (err.response.data?.error?.message && String(err.response.data.error.message).match(/quota|credit|balance/i))) return 'QUOTA';
  }
  if (err.message && err.message.includes('timeout')) return 'TIMEOUT';
  return 'UNKNOWN';
}

function getErrorMessage(err, provider) {
  const code = getErrorCode(err);
  switch (code) {
    case 'UNAUTHORIZED':
      return `AI provider (${provider}) returned 401 Unauthorized. The configured API key may be invalid, expired, or missing.`;
    case 'RATE_LIMIT':
      return `AI provider (${provider}) rate limited the request (429). Please wait and try again.`;
    case 'QUOTA':
      return `AI provider (${provider}) quota exhausted. Check your account credits.`;
    case 'TIMEOUT':
      return `AI provider (${provider}) request timed out.`;
    case 'SERVER_ERROR':
      return `AI provider (${provider}) returned a server error.`;
    case 'NETWORK':
      return `Cannot reach AI provider (${provider}). Check network/proxy.`;
    default:
      return err?.message || 'Unknown AI provider error.';
  }
}

// ============================================================
// URL Normalization — ensures exactly one /chat/completions suffix
// ============================================================
function normalizeOpenRouterUrl(apiUrl) {
  let base = (apiUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  while (base.endsWith('/chat/completions')) {
    base = base.slice(0, -'/chat/completions'.length);
  }
  return base + '/chat/completions';
}

// ============================================================
// OpenRouter Provider (supports tool calling via functions)
// ============================================================
async function callOpenRouter({ messages, tools, toolChoice, model, apiKey, apiUrl, maxTokens = 1200, temperature = 0.4 }) {
  const finalUrl = normalizeOpenRouterUrl(apiUrl);
  const payload = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  if (tools && tools.length > 0) {
    // OpenRouter / OpenAI-compatible function calling
    payload.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    if (toolChoice) {
      payload.tool_choice = toolChoice === 'auto' ? 'auto' : { type: 'function', function: { name: toolChoice } };
    }
  } else {
    payload.response_format = { type: 'json_object' };
  }

  const isLocal = apiUrl && /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/)/i.test(apiUrl);
  const resp = await axios.post(
    finalUrl,
    payload,
    {
      timeout: isLocal ? 30000 : 30000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'RailConnect AI Agent',
      },
    }
  );

  const choice = resp.data?.choices?.[0];
  if (!choice) throw new AIProviderError('No choice in OpenRouter response', 'SERVER_ERROR', resp.status, resp.data);

  const msg = choice.message;
  const toolCalls = msg?.tool_calls || [];

  return {
    content: msg?.content || null,
    toolCalls: toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
    })),
    usage: resp.data?.usage,
    raw: resp.data,
  };
}

// ============================================================
// Anthropic Provider (supports tool calling via tools)
// ============================================================
async function callAnthropic({ messages, tools, toolChoice, model, apiKey, maxTokens = 1200, temperature = 0.4 }) {
  const client = new Anthropic({ apiKey });

  // Anthropic expects system prompt separate
  const systemMsg = messages.find((m) => m.role === 'system');
  const sysPrompt = systemMsg ? systemMsg.content : '';
  const otherMsgs = messages.filter((m) => m.role !== 'system');

  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: sysPrompt,
    messages: otherMsgs,
    tools: tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    })) || [],
    tool_choice: toolChoice === 'auto' ? { type: 'auto' } : toolChoice ? { type: 'tool', name: toolChoice } : undefined,
  });

  let content = null;
  const toolCalls = [];

  for (const block of resp.content) {
    if (block.type === 'text') content = block.text;
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      });
    }
  }

  return {
    content,
    toolCalls,
    usage: resp.usage ? { prompt_tokens: resp.usage.input_tokens, completion_tokens: resp.usage.output_tokens } : null,
    raw: resp,
  };
}

// ============================================================
// Fallback Provider - throws AIProviderError so agent can use intelligent fallback
// ============================================================
function callFallback() {
  throw new AIProviderError('No AI provider available - falling back to rule-based agent', 'NETWORK', 503);
}

// ============================================================
// Factory / Router
// ============================================================
const PROVIDER_ORDER = ['openrouter', 'anthropic'];

function buildProviderConfig() {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const preferred = process.env.AI_PROVIDER?.toLowerCase() || 'auto';

  const available = {
    openrouter: Boolean(openRouterKey),
    anthropic: Boolean(anthropicKey),
  };

  let primary = 'fallback';
  if (preferred === 'auto' || preferred === 'openrouter') {
    if (available.openrouter) primary = 'openrouter';
    else if (available.anthropic) primary = 'anthropic';
  } else if (preferred === 'anthropic') {
    if (available.anthropic) primary = 'anthropic';
    else if (available.openrouter) primary = 'openrouter';
  }

  return {
    primary,
    available,
    openRouter: {
      enabled: available.openrouter,
      apiKey: openRouterKey,
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      apiUrl: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1',
    },
    anthropic: {
      enabled: available.anthropic,
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
    },
    fallbackEnabled: process.env.AI_FALLBACK_ENABLED !== 'false',
  };
}

async function callAI({ messages, tools, toolChoice, maxTokens, temperature }) {
  const cfg = buildProviderConfig();

  if (cfg.primary === 'fallback') {
    if (cfg.fallbackEnabled) {
      throw new AIProviderError('No AI provider configured - using fallback agent', 'NETWORK', 503);
    }
    throw new AIProviderError('No AI provider configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY.', 'UNAUTHORIZED', 503);
  }

  // Try primary provider
  try {
    if (cfg.primary === 'openrouter') {
      return await callOpenRouter({
        messages,
        tools,
        toolChoice,
        model: cfg.openRouter.model,
        apiKey: cfg.openRouter.apiKey,
        apiUrl: cfg.openRouter.apiUrl,
        maxTokens,
        temperature,
      });
    } else if (cfg.primary === 'anthropic') {
      return await callAnthropic({
        messages,
        tools,
        toolChoice,
        model: cfg.anthropic.model,
        apiKey: cfg.anthropic.apiKey,
        maxTokens,
        temperature,
      });
    }
  } catch (err) {
    const primaryUrl = cfg.primary === 'openrouter' ? cfg.openRouter.apiUrl : undefined;
    const code = getErrorCode(err, primaryUrl);
    // On auth/quota/rate-limit, we do NOT auto-failover (to avoid burning keys).
    // On network/server/timeout, try the other provider if available.
    const shouldTrySecondary = code === 'NETWORK' || code === 'SERVER_ERROR' || code === 'TIMEOUT';

    if (shouldTrySecondary && cfg.primary === 'openrouter' && cfg.available.anthropic) {
      try {
        return await callAnthropic({
          messages,
          tools,
          toolChoice,
          model: cfg.anthropic.model,
          apiKey: cfg.anthropic.apiKey,
          maxTokens,
          temperature,
        });
      } catch (e) {
        // fall through
      }
    }
    if (shouldTrySecondary && cfg.primary === 'anthropic' && cfg.available.openrouter) {
      try {
        return await callOpenRouter({
          messages,
          tools,
          toolChoice,
          model: cfg.openRouter.model,
          apiKey: cfg.openRouter.apiKey,
          apiUrl: cfg.openRouter.apiUrl,
          maxTokens,
          temperature,
        });
      } catch (e) {
        // fall through
      }
    }

    if (cfg.fallbackEnabled) {
      console.warn(`[AI Provider] ${cfg.primary} failed (${code}). Using fallback.`, { message: err?.message });
      return callFallback();
    }

    throw new AIProviderError(getErrorMessage(err, cfg.primary), code, err?.response?.status, err?.response?.data);
  }

  // If we reached here and primary was fallback (shouldn't happen)
  if (cfg.fallbackEnabled) return callFallback();
  throw new AIProviderError('No AI provider available', 'UNAUTHORIZED', 503);
}

function getProviderStatus() {
  const cfg = buildProviderConfig();
  return {
    primary: cfg.primary,
    available: {
      openrouter: cfg.available.openrouter,
      anthropic: cfg.available.anthropic,
    },
    openRouterModel: cfg.openRouter.model,
    anthropicModel: cfg.anthropic.model,
    fallbackEnabled: cfg.fallbackEnabled,
  };
}

// ============================================================
// Streaming: returns an async generator yielding { done, content, toolCalls }
// ============================================================
async function* callAIStream({ messages, tools, toolChoice, maxTokens = 1200, temperature = 0.3 }) {
  const cfg = buildProviderConfig();
  if (cfg.primary === 'fallback' || cfg.primary === 'openrouter') {
    // OpenRouter (OpenAI-compatible) streaming
    const finalUrl = normalizeOpenRouterUrl(cfg.openRouter.apiUrl);

    const payload = {
      model: cfg.openRouter.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      response_format: { type: 'json_object' },
    };

    if (tools && tools.length > 0) {
      payload.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      if (toolChoice) {
        payload.tool_choice = toolChoice === 'auto' ? 'auto' : { type: 'function', function: { name: toolChoice } };
      }
    }

    const resp = await axios.post(finalUrl, payload, {
      timeout: 60000,
      responseType: 'stream',
      headers: {
        Authorization: `Bearer ${cfg.openRouter.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'RailConnect AI Agent',
      },
    });

    const stream = resp.data;
    let content = '';
    const toolCallsMap = {};

    for await (const chunk of stream) {
      const lines = chunk.toString().split('\n').filter((l) => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          yield { done: true, content, toolCalls: Object.values(toolCallsMap) };
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            content += delta.content;
            yield { done: false, content: delta.content, toolCalls: [] };
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsMap[idx]) {
                toolCallsMap[idx] = { id: tc.id || `call_${idx}`, name: tc.function?.name || '', arguments: '' };
              }
              if (tc.id) toolCallsMap[idx].id = tc.id;
              if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
            }
          }
        } catch (_) {
          // skip unparseable SSE lines
        }
      }
    }

    // Stream ended without [DONE]
    const finalToolCalls = Object.values(toolCallsMap).map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments ? JSON.parse(tc.arguments) : {},
    }));
    yield { done: true, content, toolCalls: finalToolCalls };
    return;
  }

  // Anthropic: fall back to non-streaming
  const result = await callAI({ messages, tools, toolChoice, maxTokens, temperature });
  yield { done: true, content: result.content, toolCalls: result.toolCalls };
}

function getWebSearchAvailable() {
  return Boolean(process.env.WEB_SEARCH_API_KEY || process.env.TAVILY_API_KEY || process.env.SERPAPI_KEY);
}

module.exports = {
  callAI,
  callAIStream,
  getProviderStatus,
  getWebSearchAvailable,
  AIProviderError,
};