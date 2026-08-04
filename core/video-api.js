const fs = require('node:fs');
const path = require('node:path');
const { authHeaders, fetchWithTimeout, normalizeGatewayUrl } = require('./api-client');

const MAX_REFERENCE_COUNTS = Object.freeze({ image: 9, video: 3, audio: 3 });
const MAX_REFERENCE_BYTES = Object.freeze({
  image: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 50 * 1024 * 1024
});
const MEDIA_BY_EXTENSION = Object.freeze({
  '.png': { type: 'image', mimeType: 'image/png' },
  '.jpg': { type: 'image', mimeType: 'image/jpeg' },
  '.jpeg': { type: 'image', mimeType: 'image/jpeg' },
  '.webp': { type: 'image', mimeType: 'image/webp' },
  '.mp4': { type: 'video', mimeType: 'video/mp4' },
  '.mov': { type: 'video', mimeType: 'video/quicktime' },
  '.webm': { type: 'video', mimeType: 'video/webm' },
  '.mp3': { type: 'audio', mimeType: 'audio/mpeg' },
  '.wav': { type: 'audio', mimeType: 'audio/wav' },
  '.m4a': { type: 'audio', mimeType: 'audio/mp4' },
  '.aac': { type: 'audio', mimeType: 'audio/aac' },
  '.flac': { type: 'audio', mimeType: 'audio/flac' }
});

function normalizeVideoOptions(payload = {}) {
  const prompt = String(payload.prompt || '').trim();
  const model = String(payload.model || 'jimeng-video-seedance-2.0-fast').trim();
  if (!prompt) throw new Error('请输入视频提示词');
  if (prompt.length > 32_000) throw new Error('视频提示词过长，请控制在 32000 个字符以内');
  if (!model) throw new Error('请输入视频模型名称');

  const protocol = payload.protocol === 'chat' ? 'chat' : 'videos';
  const allowedRatios = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);
  const allowedResolutions = new Set(['auto', '480p', '720p', '1080p']);
  const durationInput = Number.parseInt(payload.duration, 10);
  const seedance20 = /seedance-2\.0/i.test(model);
  const duration = seedance20 && durationInput >= 4 && durationInput <= 15
    ? durationInput
    : [5, 10].includes(durationInput) ? durationInput : 5;
  const sourceReferences = Array.isArray(payload.references)
    ? payload.references
    : Array.isArray(payload.imagePaths) ? payload.imagePaths.map((filePath) => ({ filePath, type: 'image' })) : [];
  const references = sourceReferences.map((item) => {
    const filePath = path.resolve(String(typeof item === 'string' ? item : item?.filePath || item?.path || ''));
    const media = MEDIA_BY_EXTENSION[path.extname(filePath).toLowerCase()];
    if (!media) throw new Error(`不支持的全能参考素材格式：${path.extname(filePath) || '未知格式'}`);
    const requestedType = String(item?.type || media.type);
    if (requestedType !== media.type) throw new Error(`素材类型与文件扩展名不匹配：${path.basename(filePath)}`);
    return { filePath, type: media.type, mimeType: media.mimeType, name: path.basename(filePath) };
  });
  const counts = { image: 0, video: 0, audio: 0 };
  references.forEach((item) => { counts[item.type] += 1; });
  Object.entries(counts).forEach(([type, count]) => {
    if (count > MAX_REFERENCE_COUNTS[type]) throw new Error(`${type} 参考素材最多 ${MAX_REFERENCE_COUNTS[type]} 个`);
  });
  if (protocol === 'chat' && references.length) throw new Error('聊天兼容接口暂不支持本地参考素材，请改用视频生成接口');
  let referenceMode = payload.referenceMode === 'omni_reference' ? 'omni_reference' : 'first_last_frames';
  if (references.some((item) => item.type !== 'image') || references.length > 2) referenceMode = 'omni_reference';

  return {
    protocol,
    prompt,
    model,
    ratio: allowedRatios.has(payload.ratio) ? payload.ratio : '16:9',
    resolution: allowedResolutions.has(payload.resolution) ? payload.resolution : '720p',
    duration,
    referenceMode,
    references
  };
}

function friendlyVideoError(status, body) {
  const error = body?.error || body || {};
  const code = String(error.code || error.type || '');
  const rawMessage = String(error.message || body?.message || `HTTP ${status}`).slice(0, 800);
  let message = rawMessage;
  if (status === 401) message = '视频接口认证失败，请检查 API Key 或即梦 sessionid';
  else if (status === 403) message = `视频接口拒绝访问：${rawMessage}`;
  else if (status === 404 || code.includes('model_not_found')) message = '视频接口或模型不存在，请确认网关版本、接口类型和模型名称';
  else if (status === 429 || /quota|积分|额度|余额/i.test(rawMessage)) message = '视频积分不足、额度受限或请求过于频繁';
  else if (status >= 500) message = `视频服务暂时不可用：${rawMessage}`;
  const result = new Error(`${status}: ${message}`);
  result.status = status;
  result.code = code;
  return result;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function urlsFromText(value) {
  const text = String(value || '');
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  return matches.map((item) => safeHttpUrl(item.replace(/[.,;!?]+$/, ''))).filter(Boolean);
}

function extractVideoResult(body) {
  const urls = [];
  const seen = new Set();
  const add = (value) => {
    const url = safeHttpUrl(value);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };
  const visit = (value, depth = 0) => {
    if (depth > 6 || value == null) return;
    if (typeof value === 'string') {
      urlsFromText(value).forEach(add);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    ['url', 'video_url', 'videoUrl', 'output_url', 'download_url'].forEach((key) => add(value[key]));
    Object.entries(value).forEach(([key, child]) => {
      if (!['url', 'video_url', 'videoUrl', 'output_url', 'download_url'].includes(key)) visit(child, depth + 1);
    });
  };
  visit(body);
  const videoUrls = urls.filter((url) => /\.(?:mp4|webm|mov|m3u8)(?:[?#]|$)/i.test(url));
  return {
    urls: videoUrls.length ? videoUrls : urls,
    taskId: String(body?.task_id || body?.taskId || body?.id || body?.data?.task_id || body?.data?.id || ''),
    state: String(body?.status || body?.state || body?.data?.status || body?.data?.state || (urls.length ? 'completed' : 'accepted'))
  };
}

function readReferenceFile(reference) {
  const stat = fs.statSync(reference.filePath);
  if (!stat.isFile()) throw new Error(`参考素材不是文件：${reference.name}`);
  if (stat.size > MAX_REFERENCE_BYTES[reference.type]) {
    const limit = Math.round(MAX_REFERENCE_BYTES[reference.type] / 1024 / 1024);
    throw new Error(`${reference.name} 超过 ${limit} MB 限制`);
  }
  return { ...reference, buffer: fs.readFileSync(reference.filePath) };
}

function buildVideoRequest(normalized) {
  if (normalized.protocol === 'chat') {
    const detail = `${normalized.prompt}\n\n生成参数：${normalized.ratio}，${normalized.resolution}，${normalized.duration}秒。`;
    return {
      endpoint: '/chat/completions',
      headers: null,
      body: JSON.stringify({
        model: normalized.model,
        messages: [{ role: 'user', content: detail }],
        stream: false
      })
    };
  }

  if (normalized.references.length) {
    const form = new FormData();
    form.append('model', normalized.model);
    form.append('prompt', normalized.prompt);
    form.append('ratio', normalized.ratio);
    form.append('resolution', normalized.resolution);
    form.append('duration', String(normalized.duration));
    form.append('functionMode', normalized.referenceMode);
    const counters = { image: 0, video: 0, audio: 0 };
    normalized.references.forEach((reference) => {
      const media = readReferenceFile(reference);
      counters[media.type] += 1;
      const fieldName = `${media.type}_file_${counters[media.type]}`;
      form.append(fieldName, new Blob([media.buffer], { type: media.mimeType }), media.name);
    });
    return { endpoint: '/videos/generations', headers: {}, body: form };
  }

  return {
    endpoint: '/videos/generations',
    headers: null,
    body: JSON.stringify({
      model: normalized.model,
      prompt: normalized.prompt,
      ratio: normalized.ratio,
      resolution: normalized.resolution,
      duration: normalized.duration
    })
  };
}

async function generateVideo(connection, payload = {}, options = {}) {
  const normalized = normalizeVideoOptions(payload);
  const { apiBase } = normalizeGatewayUrl(connection.baseUrl);
  const request = buildVideoRequest(normalized);
  const endpoint = `${apiBase}${request.endpoint}`;
  const headers = { ...authHeaders(connection.apiKey), ...(request.headers || {}) };
  if (request.body instanceof FormData) delete headers['content-type'];
  const startedAt = Date.now();

  let response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers,
      body: request.body,
      signal: options.signal
    }, options.timeoutMs || 1_800_000);
  } catch (error) {
    if (error.name === 'AbortError' || options.signal?.aborted) throw new Error('视频请求已取消');
    if (/timeout|超时/i.test(error.message || '')) throw new Error('视频生成超时；任务可能仍在上游运行，请稍后查看即梦任务列表');
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|连接失败/i.test(error.message || '')) {
      throw new Error('无法连接视频网关，请先启动即梦 API 服务并确认网关地址');
    }
    throw error;
  }

  const responseBody = await parseJsonResponse(response);
  if (!response.ok) throw friendlyVideoError(response.status, responseBody);
  const extracted = extractVideoResult(responseBody);
  return {
    status: response.status,
    latencyMs: Date.now() - startedAt,
    requestId: response.headers.get('x-request-id') || '',
    options: normalized,
    urls: extracted.urls,
    taskId: extracted.taskId,
    state: extracted.state,
    raw: responseBody
  };
}

module.exports = {
  MAX_REFERENCE_COUNTS,
  MAX_REFERENCE_BYTES,
  MEDIA_BY_EXTENSION,
  normalizeVideoOptions,
  friendlyVideoError,
  safeHttpUrl,
  urlsFromText,
  extractVideoResult,
  buildVideoRequest,
  generateVideo
};
