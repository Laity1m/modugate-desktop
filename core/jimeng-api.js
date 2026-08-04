const { authHeaders, fetchWithTimeout, normalizeGatewayUrl } = require('./api-client');

const JIMENG_REGIONS = Object.freeze({
  cn: { label: '中国站', prefix: '' },
  us: { label: '美国站', prefix: 'us-' },
  hk: { label: '香港站', prefix: 'hk-' },
  jp: { label: '日本站', prefix: 'jp-' },
  sg: { label: '新加坡站', prefix: 'sg-' }
});

function normalizeJimengAccount(input = {}) {
  const id = String(input.id || '').trim();
  const name = String(input.name || '即梦账号').trim().slice(0, 80) || '即梦账号';
  let region = Object.hasOwn(JIMENG_REGIONS, input.region) ? input.region : 'cn';
  let sessionId = String(input.sessionId || '')
    .trim()
    .replace(/^Bearer\s+/i, '');
  const detected = sessionId.match(/^(us|hk|jp|sg)-(.+)$/i);
  if (detected) {
    region = detected[1].toLowerCase();
    sessionId = detected[2];
  }
  if (!id || !/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new Error('即梦账号 ID 无效');
  if (sessionId.length < 8 || sessionId.length > 4096 || /[\s,]/.test(sessionId)) {
    throw new Error('即梦 sessionid 格式不正确，请只粘贴单个账号的 sessionid');
  }
  return { id, name, region, sessionId };
}

function jimengCredential(account) {
  const normalized = normalizeJimengAccount(account);
  return `${JIMENG_REGIONS[normalized.region].prefix}${normalized.sessionId}`;
}

function maskJimengAccount(account) {
  const normalized = normalizeJimengAccount(account);
  const tail = normalized.sessionId.slice(-4);
  return `${JIMENG_REGIONS[normalized.region].prefix}••••••••${tail}`;
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function checkJimengAccount(gatewayUrl, account, options = {}) {
  const normalized = normalizeJimengAccount(account);
  const token = jimengCredential(normalized);
  const { root } = normalizeGatewayUrl(gatewayUrl);
  const startedAt = Date.now();
  let response;
  try {
    response = await fetchWithTimeout(`${root}/token/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token })
    }, options.timeoutMs || 20_000);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('即梦账号检测超时');
    throw new Error('无法连接即梦网关，请先启动兼容服务并检查专用地址');
  }
  const body = await parseJson(response);
  if (!response.ok) {
    if (response.status === 404) throw new Error('当前服务未提供 /token/check，请确认连接的是即梦兼容网关');
    throw new Error(`即梦账号检测失败（HTTP ${response.status}）：${body?.message || '未知错误'}`);
  }

  let points = null;
  if (body?.live === true) {
    try {
      const pointsResponse = await fetchWithTimeout(`${root}/token/points`, {
        method: 'POST',
        headers: authHeaders(token),
        body: '{}'
      }, options.timeoutMs || 20_000);
      const pointsBody = await parseJson(pointsResponse);
      const first = Array.isArray(pointsBody) ? pointsBody[0] : pointsBody;
      points = first?.points || first?.credits || null;
    } catch {
      points = null;
    }
  }

  return {
    live: body?.live === true,
    latencyMs: Date.now() - startedAt,
    points,
    masked: maskJimengAccount(normalized)
  };
}

module.exports = {
  JIMENG_REGIONS,
  normalizeJimengAccount,
  jimengCredential,
  maskJimengAccount,
  checkJimengAccount
};
