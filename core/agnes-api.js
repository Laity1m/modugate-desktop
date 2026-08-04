const DEFAULT_AGNES_BASE_URL = 'https://apihub.agnes-ai.com';
const DEFAULT_AGNES_MODEL = 'agnes-video-v2.0';

function normalizeAgnesBaseUrl(value) {
  const candidate = String(value || DEFAULT_AGNES_BASE_URL).trim().replace(/\/+$/, '');
  let url;
  try { url = new URL(candidate); } catch { throw new Error('Agnes API 地址无效'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Agnes API 地址必须使用 HTTP 或 HTTPS');
  return url.toString().replace(/\/+$/, '');
}

function durationToFrames(duration) {
  const seconds = Math.min(18, Math.max(1, Number(duration) || 5));
  return Math.min(441, Math.max(9, Math.round((seconds * 24 - 1) / 8) * 8 + 1));
}

function dimensionsFor(ratio = '16:9', resolution = '720p') {
  const table = {
    '480p': { '16:9': [854, 480], '9:16': [480, 854], '1:1': [512, 512], '4:3': [640, 480], '3:4': [480, 640], '21:9': [1024, 440] },
    '720p': { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [768, 768], '4:3': [960, 720], '3:4': [720, 960], '21:9': [1536, 656] },
    '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:3': [1440, 1080], '3:4': [1080, 1440], '21:9': [2304, 984] }
  };
  return (table[resolution] || table['720p'])[ratio] || table['720p']['16:9'];
}

function errorMessage(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'string') return raw;
  return raw.error?.message || raw.message || raw.detail || fallback;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function extractVideoUrl(value) {
  if (!value || typeof value !== 'object') return '';
  const direct = value.video_url || value.videoUrl || value.url || value.remixed_from_video_id;
  if (typeof direct === 'string' && /^https?:\/\//i.test(direct)) return direct;
  for (const key of ['data', 'output', 'result', 'video']) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = extractVideoUrl(item);
        if (found) return found;
      }
    } else {
      const found = extractVideoUrl(nested);
      if (found) return found;
    }
  }
  return '';
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = () => { clearTimeout(timer); reject(new Error('视频生成已取消')); };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function generateAgnesVideo(connection, payload, options = {}) {
  const apiKey = String(connection?.apiKey || '').trim();
  if (!apiKey) throw new Error('请先在“网关连接”中填写 Agnes API Key');
  if (!String(payload?.prompt || '').trim()) throw new Error('请输入视频提示词');
  if (payload?.references?.length) throw new Error('Agnes 当前接入先支持文生视频，请移除参考素材后重试');
  const root = normalizeAgnesBaseUrl(connection.baseUrl);
  const model = String(payload.model || DEFAULT_AGNES_MODEL).trim();
  const [width, height] = dimensionsFor(payload.ratio, payload.resolution);
  const body = {
    model,
    prompt: String(payload.prompt).trim(),
    width,
    height,
    num_frames: durationToFrames(payload.duration),
    frame_rate: 24
  };
  const started = Date.now();
  const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' };
  const createdResponse = await fetch(`${root}/v1/videos`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: options.signal
  });
  const created = await readJson(createdResponse);
  if (!createdResponse.ok) throw new Error(`Agnes 提交失败（HTTP ${createdResponse.status}）：${errorMessage(created, '未知错误')}`);
  const videoId = created.video_id || created.task_id || created.id || created.data?.video_id || created.data?.id;
  if (!videoId) throw new Error('Agnes 已响应，但没有返回 video_id');
  const intervalMs = Math.max(50, Number(options.pollIntervalMs ?? Number(connection.pollIntervalSeconds || 10) * 1000));
  const timeoutMs = Math.max(intervalMs, Number(options.timeoutMs ?? Number(connection.timeoutSeconds || 900) * 1000));
  let final = created;
  while (Date.now() - started < timeoutMs) {
    const initialUrl = extractVideoUrl(final);
    const initialState = String(final.status || final.state || '').toLowerCase();
    if (initialUrl || ['completed', 'succeeded', 'success'].includes(initialState)) break;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(initialState)) {
      throw new Error(`Agnes 生成失败：${errorMessage(final, initialState)}`);
    }
    await wait(intervalMs, options.signal);
    let response = await fetch(`${root}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(model)}`, { headers, signal: options.signal });
    if (response.status === 404 || response.status === 405) {
      response = await fetch(`${root}/v1/videos/${encodeURIComponent(videoId)}`, { headers, signal: options.signal });
    }
    final = await readJson(response);
    if (!response.ok) throw new Error(`Agnes 查询失败（HTTP ${response.status}）：${errorMessage(final, '未知错误')}`);
  }
  const url = extractVideoUrl(final);
  if (!url) throw new Error(`Agnes 视频生成超时或未返回地址（任务 ID：${videoId}）`);
  return {
    status: 200,
    latencyMs: Date.now() - started,
    requestId: '',
    options: body,
    urls: [url],
    taskId: String(videoId),
    state: 'completed',
    raw: { provider: 'agnes', created, final }
  };
}

module.exports = {
  DEFAULT_AGNES_BASE_URL,
  DEFAULT_AGNES_MODEL,
  normalizeAgnesBaseUrl,
  durationToFrames,
  dimensionsFor,
  extractVideoUrl,
  generateAgnesVideo
};
