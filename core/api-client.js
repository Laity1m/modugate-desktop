const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeGatewayUrl(value) {
  const input = String(value || '').trim();
  if (!input) throw new Error('请先填写网关地址');

  let url;
  try {
    url = new URL(input.includes('://') ? input : `http://${input}`);
  } catch {
    throw new Error('网关地址格式不正确');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('仅支持 HTTP 或 HTTPS 地址');
  }

  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '') || '/';
  const root = url.toString().replace(/\/$/, '');
  return { root, apiBase: `${root}/v1` };
}

function authHeaders(apiKey, protocol) {
  const key = String(apiKey || '').trim();
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  if (key) headers.authorization = `Bearer ${key}`;
  if (protocol === 'claude') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  }
  return headers;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const outerSignal = options.signal;
  const abortFromOuter = () => controller.abort(outerSignal?.reason);
  if (outerSignal) {
    if (outerSignal.aborted) abortFromOuter();
    else outerSignal.addEventListener('abort', abortFromOuter, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('请求超时')), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener?.('abort', abortFromOuter);
  }
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function formatHttpError(status, body) {
  const message = body?.error?.message || body?.message || body?.raw || `HTTP ${status}`;
  return new Error(`${status}: ${String(message).slice(0, 500)}`);
}

async function testGateway(connection, options = {}) {
  const { root, apiBase } = normalizeGatewayUrl(connection.baseUrl);
  const startedAt = Date.now();
  const result = {
    online: false,
    root,
    apiBase,
    latencyMs: null,
    healthStatus: null,
    models: [],
    checkedAt: new Date().toISOString()
  };

  try {
    const health = await fetchWithTimeout(`${root}/health`, {
      headers: authHeaders(connection.apiKey)
    }, options.timeoutMs || 8_000);
    result.healthStatus = health.status;
    result.online = health.ok;
  } catch (error) {
    result.healthError = error.name === 'AbortError' ? '连接超时' : error.message;
  }

  try {
    const models = await fetchWithTimeout(`${apiBase}/models`, {
      headers: authHeaders(connection.apiKey)
    }, options.timeoutMs || 12_000);
    const body = await parseResponseBody(models);
    if (!models.ok) throw formatHttpError(models.status, body);
    const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
    result.models = list.map((item) => typeof item === 'string' ? item : item.id || item.name).filter(Boolean);
    result.online = true;
    result.modelsStatus = models.status;
  } catch (error) {
    result.modelsError = error.name === 'AbortError' ? '模型列表请求超时' : error.message;
  }

  result.latencyMs = Date.now() - startedAt;
  return result;
}

function buildRequest(connection, preset, prompt, model, options = {}) {
  const { apiBase } = normalizeGatewayUrl(connection.baseUrl);
  const selectedModel = String(model || connection.defaultModel || '').trim();
  if (!selectedModel) throw new Error('请选择或填写测试模型');
  if (!String(prompt || '').trim()) throw new Error('请输入测试内容');

  if (preset === 'codex') {
    return {
      endpoint: `${apiBase}/responses`,
      headers: authHeaders(connection.apiKey),
      body: {
        model: selectedModel,
        input: String(prompt),
        stream: options.stream !== false
      }
    };
  }

  if (preset === 'claude') {
    return {
      endpoint: `${apiBase}/messages`,
      headers: authHeaders(connection.apiKey, 'claude'),
      body: {
        model: selectedModel,
        max_tokens: Number(options.maxTokens) || 2048,
        stream: options.stream !== false,
        messages: [{ role: 'user', content: String(prompt) }]
      }
    };
  }

  return {
    endpoint: `${apiBase}/chat/completions`,
    headers: authHeaders(connection.apiKey),
    body: {
      model: selectedModel,
      stream: options.stream !== false,
      messages: [{ role: 'user', content: String(prompt) }]
    }
  };
}

function extractText(value) {
  if (!value || typeof value !== 'object') return '';
  if (typeof value.delta === 'string') return value.delta;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.output_text === 'string') return value.output_text;
  if (typeof value.delta?.text === 'string') return value.delta.text;
  if (typeof value.choices?.[0]?.delta?.content === 'string') return value.choices[0].delta.content;
  if (typeof value.choices?.[0]?.message?.content === 'string') return value.choices[0].message.content;
  if (typeof value.content?.[0]?.text === 'string') return value.content[0].text;
  if (typeof value.response?.output_text === 'string') return value.response.output_text;
  if (Array.isArray(value.output)) {
    return value.output.flatMap((item) => item?.content || [])
      .map((item) => item?.text || item?.output_text || '')
      .join('');
  }
  return '';
}

async function streamRequest(connection, request, onEvent = () => {}, options = {}) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(request.endpoint, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: options.signal
  }, options.timeoutMs || 180_000);

  if (!response.ok) {
    const body = await parseResponseBody(response);
    throw formatHttpError(response.status, body);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.body || !contentType.includes('text/event-stream')) {
    const body = await parseResponseBody(response);
    const text = extractText(body);
    if (text) onEvent({ type: 'text', text });
    onEvent({ type: 'raw', value: body });
    return { status: response.status, latencyMs: Date.now() - startedAt, streamed: false, body };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      const text = extractText(event);
      if (text) {
        output += text;
        onEvent({ type: 'text', text });
      }
      if (event.usage || event.response?.usage) {
        onEvent({ type: 'usage', usage: event.usage || event.response.usage });
      }
    }
  }

  return {
    status: response.status,
    latencyMs: Date.now() - startedAt,
    streamed: true,
    output
  };
}

module.exports = {
  normalizeGatewayUrl,
  authHeaders,
  fetchWithTimeout,
  testGateway,
  buildRequest,
  extractText,
  streamRequest
};

