const { authHeaders, fetchWithTimeout, normalizeGatewayUrl } = require('./api-client');

const JIMENG_REGIONS = Object.freeze({
  cn: { label: '中国站', prefix: '' },
  us: { label: '美国站', prefix: 'us-' },
  hk: { label: '香港站', prefix: 'hk-' },
  jp: { label: '日本站', prefix: 'jp-' },
  sg: { label: '新加坡站', prefix: 'sg-' }
});

function parseJimengSessionInput(value) {
  let raw = String(value || '').trim().replace(/^Bearer\s+/i, '').trim();
  raw = raw.replace(/^["']|["']$/g, '');

  const session = raw.match(/(?:^|[;\s])sessionid=([^;\s]+)/i);
  const secureSession = raw.match(/(?:^|[;\s])sessionid_ss=([^;\s]+)/i);
  if (session || secureSession) raw = (session || secureSession)[1];
  raw = raw.trim().replace(/^["']|["']$/g, '');

  let region = null;
  const detected = raw.match(/^(us|hk|jp|sg)-(.+)$/i);
  if (detected) {
    region = detected[1].toLowerCase();
    raw = detected[2];
  }
  return { region, sessionId: raw };
}

function normalizeJimengAccount(input = {}) {
  const id = String(input.id || '').trim();
  const name = String(input.name || '即梦账号').trim().slice(0, 80) || '即梦账号';
  let region = Object.hasOwn(JIMENG_REGIONS, input.region) ? input.region : 'cn';
  const parsed = parseJimengSessionInput(input.sessionId);
  let sessionId = parsed.sessionId;
  if (parsed.region) region = parsed.region;
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

  let live = body?.live === true;
  let points = null;
  let reason = '';
  if (live || body?.live === false) {
    try {
      const pointsResponse = await fetchWithTimeout(`${root}/token/points`, {
        method: 'POST',
        headers: authHeaders(token),
        body: '{}'
      }, options.timeoutMs || 20_000);
      const pointsBody = await parseJson(pointsResponse);
      const first = Array.isArray(pointsBody) ? pointsBody[0] : pointsBody;
      const apiCode = Number(first?.code);
      const pointsValidated = pointsResponse.ok
        && first
        && (!Number.isFinite(apiCode) || apiCode === 0)
        && (Array.isArray(pointsBody) ? pointsBody.length > 0 : true);
      if (pointsValidated) {
        points = first?.points || first?.credits || first?.data?.points || null;
        live = true;
      } else if (!live) {
        reason = first?.message || `积分接口返回 HTTP ${pointsResponse.status}`;
      }
    } catch (error) {
      points = null;
      if (!live) reason = error?.message || '即梦接口暂时无法验证账号';
    }
  }

  return {
    live,
    status: live ? 'valid' : 'unverified',
    reason: live ? '' : (reason || '即梦检测接口未能确认账号；这不一定表示 sessionid 已失效'),
    latencyMs: Date.now() - startedAt,
    points,
    masked: maskJimengAccount(normalized)
  };
}

module.exports = {
  JIMENG_REGIONS,
  parseJimengSessionInput,
  normalizeJimengAccount,
  jimengCredential,
  maskJimengAccount,
  checkJimengAccount
};
