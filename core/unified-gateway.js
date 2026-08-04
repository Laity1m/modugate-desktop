const http = require('node:http');
const { Readable } = require('node:stream');
const { authHeaders, normalizeGatewayUrl } = require('./api-client');
const { jimengCredential } = require('./jimeng-api');

const MAX_PROXY_BODY_BYTES = 160 * 1024 * 1024;

function extractRequestModel(contentType, buffer) {
  if (!buffer?.length) return '';
  if (/application\/json/i.test(contentType || '')) {
    try { return String(JSON.parse(buffer.toString('utf8'))?.model || '').trim(); } catch { return ''; }
  }
  if (/multipart\/form-data/i.test(contentType || '')) {
    const head = buffer.subarray(0, Math.min(buffer.length, 2 * 1024 * 1024)).toString('utf8');
    return head.match(/name="model"\r?\n(?:[^\r\n]*\r?\n)*\r?\n([^\r\n]+)/i)?.[1]?.trim() || '';
  }
  return '';
}

function isJimengModel(model) {
  return /^(?:jimeng|seedance|dreamina)(?:[-_]|$)/i.test(String(model || '').trim());
}

function selectUpstream(pathname, model, hasJimengAccount) {
  if (isJimengModel(model)) return 'jimeng';
  if (!model && hasJimengAccount && /^\/v1\/videos(?:\/|$)/i.test(pathname)) return 'jimeng';
  return 'main';
}

function readRequestBody(request, limit = MAX_PROXY_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体超过统一网关 160 MB 限制'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function bearerToken(request) {
  return String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || String(request.headers['x-api-key'] || '').trim();
}

function jsonResponse(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length
  });
  response.end(payload);
}

class UnifiedGateway {
  constructor({ getSettings, ensureJimeng = async () => {}, onLog = () => {} }) {
    this.getSettings = getSettings;
    this.ensureJimeng = ensureJimeng;
    this.onLog = onLog;
    this.server = null;
    this.address = null;
  }

  async start() {
    if (this.server) return this.status();
    const settings = this.getSettings();
    const port = Number(settings.router?.port ?? 8787);
    this.server = http.createServer((request, response) => {
      this.handle(request, response).catch((error) => {
        if (!response.headersSent) {
          jsonResponse(response, error.statusCode || 502, { error: { message: error.message } });
        } else response.end();
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', resolve);
    });
    const info = this.server.address();
    this.address = `http://127.0.0.1:${info.port}`;
    this.onLog(`统一 API 已启动：${this.address}/v1`, 'info');
    return this.status();
  }

  async stop() {
    if (!this.server) return false;
    const server = this.server;
    this.server = null;
    this.address = null;
    await new Promise((resolve) => server.close(resolve));
    return true;
  }

  status() {
    return { running: Boolean(this.server), root: this.address, apiBase: this.address ? `${this.address}/v1` : '' };
  }

  async handle(request, response) {
    const settings = this.getSettings();
    const url = new URL(request.url || '/', this.address || 'http://127.0.0.1');
    if (url.pathname === '/health') {
      jsonResponse(response, 200, { status: 'ok', service: 'ModuGate Unified Gateway' });
      return;
    }
    const expectedKey = String(settings.router?.apiKey || '').trim();
    if (!expectedKey || bearerToken(request) !== expectedKey) {
      jsonResponse(response, 401, { error: { message: '统一 API Key 无效' } });
      return;
    }
    if (url.pathname === '/v1/models' && request.method === 'GET') {
      await this.handleModels(response, settings);
      return;
    }
    if (!url.pathname.startsWith('/v1/')) {
      jsonResponse(response, 404, { error: { message: '仅支持 /v1 下的兼容接口' } });
      return;
    }

    const body = ['GET', 'HEAD'].includes(request.method || '') ? Buffer.alloc(0) : await readRequestBody(request);
    const model = extractRequestModel(request.headers['content-type'], body);
    const hasJimengAccount = Boolean(settings.jimeng?.accounts?.some((item) => item.id === settings.jimeng.selectedAccountId));
    const target = selectUpstream(url.pathname, model, hasJimengAccount);
    if (target === 'jimeng') await this.ensureJimeng();
    const connection = this.connectionFor(target, settings);
    await this.forward(request, response, url, body, connection, target);
  }

  connectionFor(target, settings) {
    if (target === 'main') return settings.connection;
    const account = settings.jimeng.accounts.find((item) => item.id === settings.jimeng.selectedAccountId);
    if (!account) throw Object.assign(new Error('尚未添加或选择即梦账号'), { statusCode: 503 });
    return { baseUrl: settings.jimeng.gatewayUrl, apiKey: jimengCredential(account) };
  }

  async handleModels(response, settings) {
    const targets = [{ name: 'main', connection: settings.connection }];
    const account = settings.jimeng?.accounts?.find((item) => item.id === settings.jimeng.selectedAccountId);
    if (account) {
      await this.ensureJimeng();
      targets.push({ name: 'jimeng', connection: { baseUrl: settings.jimeng.gatewayUrl, apiKey: jimengCredential(account) } });
    }
    const collected = [];
    await Promise.all(targets.map(async ({ name, connection }) => {
      try {
        const { apiBase } = normalizeGatewayUrl(connection.baseUrl);
        const upstream = await fetch(`${apiBase}/models`, { headers: authHeaders(connection.apiKey) });
        const body = await upstream.json();
        const models = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
        models.forEach((item) => {
          const model = typeof item === 'string' ? { id: item, object: 'model' } : item;
          if (model?.id && !collected.some((entry) => entry.id === model.id)) collected.push(model);
        });
        if (name === 'jimeng') {
          ['jimeng-video-seedance-2.0', 'jimeng-video-seedance-2.0-fast'].forEach((id) => {
            if (!collected.some((entry) => entry.id === id)) collected.push({ id, object: 'model', owned_by: 'jimeng-api' });
          });
        }
      } catch {
        // A temporarily unavailable upstream must not hide models from the other one.
      }
    }));
    jsonResponse(response, 200, { object: 'list', data: collected });
  }

  async forward(request, response, url, body, connection, target) {
    const { root } = normalizeGatewayUrl(connection.baseUrl);
    const upstreamUrl = `${root}${url.pathname}${url.search}`;
    const headers = { ...request.headers };
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];
    delete headers.authorization;
    delete headers['x-api-key'];
    headers.authorization = `Bearer ${String(connection.apiKey || '').trim()}`;
    if (/\/v1\/messages$/i.test(url.pathname)) {
      headers['x-api-key'] = String(connection.apiKey || '').trim();
      headers['anthropic-version'] ||= '2023-06-01';
    }
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: body.length ? body : undefined,
      redirect: 'manual'
    });
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });
    response.writeHead(upstream.status, responseHeaders);
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(response);
    else response.end();
    this.onLog(`统一 API：${request.method} ${url.pathname} → ${target}${modelLogSuffix(url.pathname)}`, 'info');
  }
}

function modelLogSuffix(pathname) {
  return pathname.length > 80 ? '' : ` · ${pathname}`;
}

module.exports = {
  MAX_PROXY_BODY_BYTES,
  extractRequestModel,
  isJimengModel,
  selectUpstream,
  UnifiedGateway
};
