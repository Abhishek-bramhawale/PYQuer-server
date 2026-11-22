// Lightweight provider probes (model/key GETs — not full chat completions).
// Short in-memory TTL so page refresh can recheck without hammering APIs.

const HEALTH_CACHE_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 4000;
const DEGRADED_LATENCY_MS = 2500;

let healthCache = null;

const statusFromResult = (ok, latencyMs, configured) => {
  if (!configured) return 'unavailable';
  if (!ok) return 'unavailable';
  if (latencyMs > DEGRADED_LATENCY_MS) return 'degraded';
  return 'ready';
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
      error: error.name === 'AbortError' ? 'Health check timed out' : (error.message || 'Health check failed'),
    };
  }
};

const probeGemini = async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
  const configured = Boolean(apiKey);

  if (!configured) {
    return {
      id: 'gemini',
      name: 'Gemini',
      model: primaryModel,
      configured: false,
      status: 'unavailable',
      latencyMs: null,
      error: 'GEMINI_API_KEY not set',
    };
  }

  const checkModel = async (model) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${apiKey}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const data = await response.json();
    if (!data?.name) {
      throw new Error('Invalid Gemini model response');
    }
  };

  // Fast GET on model metadata (no token generation)
  const primary = await timed(() => checkModel(primaryModel));
  if (primary.ok) {
    return {
      id: 'gemini',
      name: 'Gemini',
      model: primaryModel,
      configured: true,
      status: statusFromResult(true, primary.latencyMs, true),
      latencyMs: primary.latencyMs,
      error: null,
    };
  }

  const fallback = await timed(() => checkModel(fallbackModel));
  if (fallback.ok) {
    return {
      id: 'gemini',
      name: 'Gemini',
      model: fallbackModel,
      configured: true,
      status: 'degraded',
      latencyMs: fallback.latencyMs,
      error: `Primary (${primaryModel}) failed: ${primary.error}`,
    };
  }

  return {
    id: 'gemini',
    name: 'Gemini',
    model: primaryModel,
    configured: true,
    status: 'unavailable',
    latencyMs: primary.latencyMs,
    error: primary.error || fallback.error,
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
    const response = await fetchWithTimeout('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    await response.json();
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

  // Key endpoint is much cheaper than a chat completion
  const result = await timed(async () => {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    await response.json();
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
  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
  const fallbackModel = process.env.MISTRAL_FALLBACK_MODEL || 'ministral-8b-latest';
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
    const response = await fetchWithTimeout('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const data = await response.json();
    const ids = new Set((data?.data || []).map((m) => m.id));
    if (!ids.has(model) && !ids.has(fallbackModel)) {
      throw new Error(`Configured Mistral models not available on this key (${model})`);
    }
    if (!ids.has(model) && ids.has(fallbackModel)) {
      // Primary missing but fallback exists — treat as degraded, not hard fail
      const err = new Error(`Primary model ${model} not on this tier; fallback ${fallbackModel} available`);
      err.degraded = true;
      throw err;
    }
  });

  if (!result.ok && /fallback .+ available/i.test(result.error || '')) {
    return {
      id: 'mistral',
      name: 'Mistral',
      model: fallbackModel,
      configured: true,
      status: 'degraded',
      latencyMs: result.latencyMs,
      error: result.error,
    };
  }

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
    cacheTtlMs: HEALTH_CACHE_TTL_MS,
    providers: byId,
  };
};

const getProviderHealth = async ({ force = false } = {}) => {
  const now = Date.now();
  if (
    !force &&
    healthCache &&
    now - healthCache.cachedAt < HEALTH_CACHE_TTL_MS
  ) {
    return { ...healthCache.payload, cached: true };
  }

  const payload = await runProviderHealthChecks();
  healthCache = {
    payload,
    cachedAt: now,
  };
  return { ...payload, cached: false };
};

module.exports = {
  getProviderHealth,
};
