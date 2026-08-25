const HEALTH_CACHE_TTL_MS = null;

let healthCache = null;

const DEGRADED_LATENCY_MS = 4000;

const statusFromResult = (ok, latencyMs, configured) => {
  if (!configured) return 'unavailable';
  if (!ok) return 'unavailable';
  if (latencyMs > DEGRADED_LATENCY_MS) return 'degraded';
  return 'ready';
};

const timed = async (fn) => {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start, error: null };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error.message || 'Health check failed',
    };
  }
};

const probeGemini = async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
  const configured = Boolean(apiKey);
  if (!configured) {
    return {
      id: 'gemini',
      name: 'Gemini',
      model,
      configured: false,
      status: 'unavailable',
      latencyMs: null,
      error: 'GEMINI_API_KEY not set',
    };
  }

  const result = await timed(async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with OK only.' }] }],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const data = await response.json();
    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid Gemini health response');
    }
  });

  return {
    id: 'gemini',
    name: 'Gemini',
    model,
    configured: true,
    status: statusFromResult(result.ok, result.latencyMs, true),
    latencyMs: result.latencyMs,
    error: result.error,
  };
};

const probeGrok = async () => {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const model = process.env.GROK_MODEL || 'grok-4.20-0309-non-reasoning';
  const configured = Boolean(apiKey);
  if (!configured) {
    return {
      id: 'grok',
      name: 'Grok',
      model,
      configured: false,
      status: 'unavailable',
      latencyMs: null,
      error: 'GROK_API_KEY not set',
    };
  }

  const result = await timed(async () => {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Reply with OK only.' }],
      max_tokens: 8,
    });
    if (!response?.choices?.[0]?.message?.content) {
      throw new Error('Invalid Grok health response');
    }
  });

  return {
    id: 'grok',
    name: 'Grok',
    model,
    configured: true,
    status: statusFromResult(result.ok, result.latencyMs, true),
    latencyMs: result.latencyMs,
    error: result.error,
  };
};

const probeOpenRouter = async () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'openrouter/free';
  const configured = Boolean(apiKey);
  if (!configured) {
    return {
      id: 'openrouter',
      name: 'OpenRouter Free',
      model,
      configured: false,
      status: 'unavailable',
      latencyMs: null,
      error: 'OPENROUTER_API_KEY not set',
    };
  }

  const result = await timed(async () => {
    const OpenAI = require('openai');
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://py-quer-client.vercel.app',
        'X-Title': process.env.OPENROUTER_APP_TITLE || 'PYQuer',
      },
    });
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Reply with OK only.' }],
      max_tokens: 8,
    });
    if (!response?.choices?.[0]?.message?.content) {
      throw new Error('Invalid OpenRouter health response');
    }
  });

  return {
    id: 'openrouter',
    name: 'OpenRouter Free',
    model,
    configured: true,
    status: statusFromResult(result.ok, result.latencyMs, true),
    latencyMs: result.latencyMs,
    error: result.error,
  };
};

const probeMistral = async () => {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL || 'mistral-large-latest';
  const configured = Boolean(apiKey);
  if (!configured) {
    return {
      id: 'mistral',
      name: 'Mistral',
      model,
      configured: false,
      status: 'unavailable',
      latencyMs: null,
      error: 'MISTRAL_API_KEY not set',
    };
  }

  const result = await timed(async () => {
    const { default: MistralClient } = await import('@mistralai/mistralai');
    const client = new MistralClient(apiKey);
    const response = await client.chat({
      model,
      messages: [{ role: 'user', content: 'Reply with OK only.' }],
    });
    if (!response?.choices?.[0]?.message?.content) {
      throw new Error('Invalid Mistral health response');
    }
  });

  return {
    id: 'mistral',
    name: 'Mistral',
    model,
    configured: true,
    status: statusFromResult(result.ok, result.latencyMs, true),
    latencyMs: result.latencyMs,
    error: result.error,
  };
};

const runProviderHealthChecks = async () => {
  const providers = await Promise.all([
    probeGemini(),
    probeGrok(),
    probeOpenRouter(),
    probeMistral(),
  ]);

  const byId = {};
  for (const p of providers) {
    byId[p.id] = p;
  }

  return {
    checkedAt: new Date().toISOString(),
    cache: 'session',
    providers: byId,
  };
};

const getProviderHealth = async () => {
  if (healthCache) {
    return { ...healthCache.payload, cached: true };
  }

  const payload = await runProviderHealthChecks();
  healthCache = {
    payload,
    cachedAt: Date.now(),
    // Kept for the whole process lifetime (session); TTL intentionally unused
    ttlMs: HEALTH_CACHE_TTL_MS,
  };
  return { ...payload, cached: false };
};

module.exports = {
  getProviderHealth,
};
