const fs = require('node:fs');
const path = require('node:path');
const { authHeaders, fetchWithTimeout, normalizeGatewayUrl } = require('./api-client');

const MAX_INPUT_IMAGES = 4;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const IMAGE_MIME_BY_EXTENSION = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
});

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function normalizeImageOptions(payload = {}) {
  const mode = payload.mode === 'edit' ? 'edit' : 'generate';
  const prompt = String(payload.prompt || '').trim();
  const model = String(payload.model || 'gpt-image-2').trim();
  if (!prompt) throw new Error('请输入图片提示词');
  if (prompt.length > 32_000) throw new Error('图片提示词过长，请控制在 32000 个字符以内');
  if (!model) throw new Error('请输入图片模型名称');

  const imagePaths = Array.isArray(payload.imagePaths)
    ? payload.imagePaths.map((item) => path.resolve(String(item || ''))).filter(Boolean)
    : [];
  if (mode === 'edit' && imagePaths.length === 0) throw new Error('编辑图片时请至少选择一张参考图片');
  if (imagePaths.length > MAX_INPUT_IMAGES) throw new Error(`一次最多选择 ${MAX_INPUT_IMAGES} 张参考图片`);

  const allowedSizes = new Set([
    'auto', '1024x1024', '1536x1024', '1024x1536',
    '2048x2048', '2048x1152', '3840x2160', '2160x3840'
  ]);
  const allowedQualities = new Set(['auto', 'low', 'medium', 'high']);
  const allowedFormats = new Set(['png', 'jpeg', 'webp']);
  const allowedBackgrounds = new Set(['auto', 'opaque', 'transparent']);

  return {
    mode,
    prompt,
    model,
    imagePaths,
    n: clampInteger(payload.n, 1, 4, 1),
    size: allowedSizes.has(payload.size) ? payload.size : 'auto',
    quality: allowedQualities.has(payload.quality) ? payload.quality : 'auto',
    outputFormat: allowedFormats.has(payload.outputFormat) ? payload.outputFormat : 'png',
    background: allowedBackgrounds.has(payload.background) ? payload.background : 'auto'
  };
}

function appendOutputOptions(target, options) {
  if (options.n > 1) target.n = options.n;
  if (options.size !== 'auto') target.size = options.size;
  if (options.quality !== 'auto') target.quality = options.quality;
  if (options.outputFormat !== 'png') target.output_format = options.outputFormat;
  if (options.background !== 'auto') target.background = options.background;
  return target;
}

function imageMimeFromBuffer(buffer, fallback = 'image/png') {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return fallback;
}

function outputMime(format) {
  return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
}

function friendlyImageError(status, body) {
  const error = body?.error || body || {};
  const code = String(error.code || error.type || '');
  const rawMessage = String(error.message || body?.message || `HTTP ${status}`).slice(0, 500);
  let message = rawMessage;

  if (code === 'moderation_blocked') {
    message = '提示词或生成结果被内容安全规则拦截，请调整描述后重试';
  } else if (code === 'unsupported_country_region_territory') {
    message = '上游服务不支持当前国家或地区；ModuGate 不会绕过服务商的地区限制';
  } else if (code.includes('insufficient_quota') || /quota|额度|余额/i.test(rawMessage)) {
    message = '图片额度不足或账号没有可用的 API 额度';
  } else if (status === 401) {
    message = '图片接口认证失败，请检查本机 API Key 或上游账号状态';
  } else if (status === 403) {
    message = `图片接口拒绝访问：${rawMessage}`;
  } else if (status === 404 || code.includes('model_not_found')) {
    message = '图片接口或模型不存在，请确认网关版本和图片模型名称';
  } else if (status === 429) {
    message = '图片请求过于频繁或达到额度限制，请稍后重试';
  } else if (status >= 500) {
    message = `图片服务暂时不可用：${rawMessage}`;
  }

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

async function readInputImage(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error(`不支持的参考图片格式：${extension || '未知格式'}，请选择 PNG、JPEG 或 WebP`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('参考图片路径不是文件');
  if (stat.size > MAX_INPUT_BYTES) throw new Error(`参考图片 ${path.basename(filePath)} 超过 25 MB`);
  return { buffer: fs.readFileSync(filePath), mimeType, name: path.basename(filePath) };
}

async function downloadImage(url, signal) {
  const target = new URL(String(url));
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('图片接口返回了不安全的下载地址');
  const response = await fetchWithTimeout(target, {
    headers: { accept: 'image/png, image/jpeg, image/webp, */*' },
    signal
  }, 90_000);
  if (!response.ok) throw new Error(`无法下载生成结果：HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_OUTPUT_BYTES) throw new Error('生成图片超过 50 MB，已停止下载');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_OUTPUT_BYTES) throw new Error('生成图片超过 50 MB，已停止下载');
  const mimeType = imageMimeFromBuffer(buffer, String(response.headers.get('content-type') || '').split(';')[0]);
  if (!mimeType.startsWith('image/')) throw new Error('图片接口返回的下载内容不是图片');
  return { buffer, mimeType };
}

async function normalizeResultItem(item, fallbackMime, signal) {
  if (item?.b64_json) {
    const buffer = Buffer.from(String(item.b64_json), 'base64');
    if (!buffer.length) throw new Error('图片接口返回了空的 Base64 数据');
    if (buffer.length > MAX_OUTPUT_BYTES) throw new Error('生成图片超过 50 MB');
    return {
      buffer,
      mimeType: imageMimeFromBuffer(buffer, fallbackMime),
      revisedPrompt: String(item.revised_prompt || '')
    };
  }
  if (item?.url) {
    const downloaded = await downloadImage(item.url, signal);
    return { ...downloaded, revisedPrompt: String(item.revised_prompt || '') };
  }
  throw new Error('图片接口响应中没有 b64_json 或 url');
}

async function generateImages(connection, payload = {}, options = {}) {
  const normalized = normalizeImageOptions(payload);
  const { apiBase } = normalizeGatewayUrl(connection.baseUrl);
  const endpoint = normalized.mode === 'edit' ? `${apiBase}/images/edits` : `${apiBase}/images/generations`;
  const startedAt = Date.now();
  let body;
  let headers;

  if (normalized.mode === 'edit') {
    const form = new FormData();
    form.append('model', normalized.model);
    form.append('prompt', normalized.prompt);
    if (normalized.n > 1) form.append('n', String(normalized.n));
    if (normalized.size !== 'auto') form.append('size', normalized.size);
    if (normalized.quality !== 'auto') form.append('quality', normalized.quality);
    if (normalized.outputFormat !== 'png') form.append('output_format', normalized.outputFormat);
    if (normalized.background !== 'auto') form.append('background', normalized.background);
    const multiple = normalized.imagePaths.length > 1;
    for (const imagePath of normalized.imagePaths) {
      const image = await readInputImage(imagePath);
      form.append(multiple ? 'image[]' : 'image', new Blob([image.buffer], { type: image.mimeType }), image.name);
    }
    body = form;
    headers = authHeaders(connection.apiKey);
    delete headers['content-type'];
  } else {
    body = JSON.stringify(appendOutputOptions({
      model: normalized.model,
      prompt: normalized.prompt
    }, normalized));
    headers = authHeaders(connection.apiKey);
  }

  let response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: options.signal
    }, options.timeoutMs || 300_000);
  } catch (error) {
    if (error.name === 'AbortError' || options.signal?.aborted) throw new Error('图片请求已取消');
    if (/timeout|超时/i.test(error.message || '')) throw new Error('图片生成超时，请降低尺寸或稍后重试');
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|连接失败/i.test(error.message || '')) {
      throw new Error('无法连接图片网关，请先启动本地服务并在“网关连接”中完成检测');
    }
    throw error;
  }

  const responseBody = await parseJsonResponse(response);
  if (!response.ok) throw friendlyImageError(response.status, responseBody);
  const data = Array.isArray(responseBody?.data) ? responseBody.data : [];
  if (!data.length) throw new Error('图片接口请求成功，但没有返回任何图片');
  const images = [];
  for (const item of data) {
    images.push(await normalizeResultItem(item, outputMime(normalized.outputFormat), options.signal));
  }

  return {
    status: response.status,
    latencyMs: Date.now() - startedAt,
    requestId: response.headers.get('x-request-id') || '',
    created: Number(responseBody?.created || Math.floor(Date.now() / 1000)),
    usage: responseBody?.usage || null,
    options: normalized,
    images
  };
}

module.exports = {
  MAX_INPUT_IMAGES,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  normalizeImageOptions,
  appendOutputOptions,
  imageMimeFromBuffer,
  friendlyImageError,
  generateImages
};
