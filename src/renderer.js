const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const pageMeta = {
  dashboard: ['WORKSPACE OVERVIEW', '运行概览'],
  connection: ['GATEWAY CONNECTION', '网关连接'],
  playground: ['PROTOCOL PLAYGROUND', '协议测试台'],
  images: ['IMAGE WORKSHOP', '图片工坊'],
  videos: ['VIDEO WORKSHOP', '视频工坊'],
  clients: ['CLIENT COMPATIBILITY', '客户端实验室'],
  service: ['LOCAL ORCHESTRATION', '服务与日志'],
  security: ['SECURITY & TRUST', '安全说明']
};

const presetMeta = {
  hermes: { endpoint: '/v1/chat/completions', label: 'OpenAI Chat Completions', title: 'Hermes' },
  codex: { endpoint: '/v1/responses', label: 'OpenAI Responses', title: 'Codex' },
  claude: { endpoint: '/v1/messages', label: 'Anthropic Messages', title: 'Claude Code' }
};

const state = {
  settings: null,
  health: null,
  models: [],
  activePreset: 'codex',
  activeTool: 'hermes',
  apiRequestId: null,
  imageRequestId: null,
  imageMode: 'generate',
  referenceImages: [],
  videoRequestId: null,
  videoReferences: [],
  videoResultUrl: '',
  jimengAccounts: [],
  jimengAccountStatus: {},
  routerRunning: false,
  toolRequestId: null,
  toolStatus: {},
  lanQrRequest: 0
};

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  $('#toast-stack').append(node);
  setTimeout(() => node.remove(), 4200);
}

function setPage(page) {
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.pageTarget === page));
  $$('.page').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  const meta = pageMeta[page] || pageMeta.dashboard;
  $('#page-eyebrow').textContent = meta[0];
  $('#page-title').textContent = meta[1];
  $('.content-scroll').scrollTop = 0;
  if (page === 'images') refreshImageHistory().catch(() => {});
}

function readFormSettings() {
  const mode = $('input[name="service-mode"]:checked')?.value || 'cliproxy';
  const managedUrl = mode === 'cliproxy'
    ? $('#cliproxy-url').textContent.trim()
    : mode === 'integrated'
      ? $('#integrated-url').value.trim()
      : $('#base-url').value.trim();
  const managedKey = mode === 'cliproxy' && !$('#cliproxy-api-key').value.startsWith('正在')
    ? $('#cliproxy-api-key').value.trim()
    : $('#api-key').value.trim();
  return {
    connection: {
      baseUrl: managedUrl,
      apiKey: managedKey,
      defaultModel: $('#default-model').value.trim()
    },
    jimeng: {
      gatewayUrl: $('#jimeng-gateway-url').value.trim() || 'http://127.0.0.1:8001',
      selectedAccountId: state.settings?.jimeng?.selectedAccountId || '',
      accounts: state.jimengAccounts.map(({ id, name, region, sessionId }) => ({ id, name, region, sessionId }))
    },
    router: {
      enabled: true,
      port: state.settings?.router?.port || 8787,
      apiKey: state.settings?.router?.apiKey || ''
    },
    service: {
      mode,
      allowLan: $('#lan-access-enabled').checked,
      composeFile: $('#compose-file').value.trim(),
      binaryPath: $('#binary-path').value.trim(),
      workingDirectory: $('#working-directory').value.trim(),
      binaryArgs: $('#binary-args').value.trim()
    },
    tools: {
      hermesPath: $('#hermes-path').value.trim() || 'hermes',
      codexPath: $('#codex-path').value.trim() || 'codex',
      claudePath: $('#claude-path').value.trim() || 'claude'
    },
    images: {
      model: $('#image-model').value.trim() || 'gpt-image-2',
      size: $('#image-size').value,
      quality: $('#image-quality').value,
      outputFormat: $('#image-format').value,
      background: $('#image-background').value
    },
    videos: {
      model: $('#video-model').value.trim() || 'jimeng-video-seedance-2.0-fast',
      connectionKind: $('#video-connection-kind').value === 'main' ? 'main' : 'jimeng',
      protocol: $('#video-protocol').value,
      referenceMode: $('#video-reference-mode').value,
      ratio: $('#video-ratio').value,
      resolution: $('#video-resolution').value,
      duration: Number($('#video-duration').value || 5)
    }
  };
}

function applySettings(settings) {
  state.settings = settings;
  $('#base-url').value = settings.connection.baseUrl || '';
  $('#api-key').value = settings.connection.apiKey || '';
  $('#jimeng-gateway-url').value = settings.jimeng?.gatewayUrl || 'http://127.0.0.1:8001';
  $('#unified-api-key').value = settings.router?.apiKey || '';
  $('#unified-api-url').textContent = `http://127.0.0.1:${settings.router?.port || 8787}/v1`;
  state.jimengAccounts = Array.isArray(settings.jimeng?.accounts) ? settings.jimeng.accounts.map((item) => ({ ...item })) : [];
  $('#default-model').value = settings.connection.defaultModel || '';
  $('#play-model').value = settings.connection.defaultModel || '';
  $('#tool-model').value = settings.connection.defaultModel || '';
  $('#image-model').value = settings.images?.model || 'gpt-image-2';
  $('#image-size').value = settings.images?.size || '1024x1024';
  $('#image-quality').value = settings.images?.quality || 'auto';
  $('#image-format').value = settings.images?.outputFormat || 'png';
  $('#image-background').value = settings.images?.background || 'auto';
  $('#video-model').value = settings.videos?.model || 'jimeng-video-seedance-2.0-fast';
  $('#video-connection-kind').value = settings.videos?.connectionKind === 'main' ? 'main' : 'jimeng';
  $('#video-protocol').value = settings.videos?.protocol || 'videos';
  $('#video-reference-mode').value = settings.videos?.referenceMode || 'first_last_frames';
  $('#video-ratio').value = settings.videos?.ratio || '16:9';
  $('#video-resolution').value = settings.videos?.resolution || '720p';
  $('#video-duration').value = String(settings.videos?.duration || 5);
  $('#top-endpoint').textContent = settings.connection.baseUrl || '未配置';
  $('#compose-file').value = settings.service.composeFile || '';
  $('#binary-path').value = settings.service.binaryPath || '';
  $('#working-directory').value = settings.service.workingDirectory || '';
  $('#binary-args').value = settings.service.binaryArgs || '';
  $('#lan-access-enabled').checked = Boolean(settings.service.allowLan);
  const selectedMode = settings.service.mode || 'cliproxy';
  const selectedRadio = $(`input[name="service-mode"][value="${selectedMode}"]`)
    || $('input[name="service-mode"][value="cliproxy"]');
  selectedRadio.checked = true;
  $('#hermes-path').value = settings.tools.hermesPath || 'hermes';
  $('#codex-path').value = settings.tools.codexPath || 'codex';
  $('#claude-path').value = settings.tools.claudePath || 'claude';
  renderServiceMode();
  renderServiceMetric();
  updateImageApiExample();
  setVideoProtocol($('#video-protocol').value);
  setVideoReferenceMode($('#video-reference-mode').value);
  updateVideoApiExample();
}

async function saveSettings(showToast = true) {
  state.settings = await window.studio.settings.save(readFormSettings());
  $('#top-endpoint').textContent = state.settings.connection.baseUrl || '未配置';
  renderServiceMetric();
  if (showToast) toast('配置已安全保存在本机', 'success');
  return state.settings;
}

function renderServiceMode() {
  const mode = $('input[name="service-mode"]:checked')?.value || 'cliproxy';
  $('#cliproxy-settings').classList.toggle('hidden', mode !== 'cliproxy');
  $('#integrated-settings').classList.toggle('hidden', mode !== 'integrated');
  $('#docker-settings').classList.toggle('hidden', mode !== 'docker');
  $('#binary-settings').classList.toggle('hidden', mode !== 'binary');
  if (mode === 'cliproxy') {
    $('#base-url').value = $('#cliproxy-url').textContent.trim();
    const key = $('#cliproxy-api-key').value;
    if (key && !key.startsWith('正在')) $('#api-key').value = key;
    $('#top-endpoint').textContent = $('#cliproxy-url').textContent.trim();
  } else if (mode === 'integrated') {
    $('#base-url').value = $('#integrated-url').value;
    $('#top-endpoint').textContent = $('#integrated-url').value;
  }
}

function renderServiceMetric() {
  const mode = $('input[name="service-mode"]:checked')?.value || 'cliproxy';
  $('#metric-service').textContent = mode === 'cliproxy'
    ? '轻量 OAuth'
    : mode === 'integrated'
      ? '完整 Sub2API'
    : mode === 'docker'
      ? 'Docker Compose'
      : mode === 'binary'
        ? '本地程序'
        : '外部模式';
  $('#metric-service-sub').textContent = mode === 'cliproxy'
    ? '登录账号后生成 OpenAI / Anthropic 兼容 API'
    : mode === 'integrated'
      ? '自动管理后端、数据库与缓存'
      : '使用自定义的服务启动方式';
}

function renderCliProxyAccounts(accounts) {
  const list = $('#cliproxy-accounts');
  const items = Array.isArray(accounts) ? accounts : [];
  list.textContent = '';
  $('#cliproxy-account-count').textContent = `${items.length} 个`;
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = '尚未连接账号';
    list.append(empty);
    return;
  }
  items.forEach((account) => {
    const row = document.createElement('div');
    row.className = 'account-item';
    const name = document.createElement('strong');
    name.textContent = account.email || account.name || '已连接账号';
    const provider = document.createElement('span');
    provider.textContent = account.provider || 'unknown';
    const detail = document.createElement('small');
    detail.textContent = account.disabled ? '已停用' : account.status || account.name || '可用';
    row.append(name, provider, detail);
    list.append(row);
  });
}

async function renderLanAccess(credentials = {}, status = {}) {
  const enabled = Boolean(credentials.lanAccessEnabled);
  const detail = $('#lan-access-detail');
  const badge = $('#lan-access-state');
  const qr = $('#lan-api-qr');
  const address = credentials.lanApiUrl || '';
  $('#lan-access-enabled').checked = enabled;
  detail.classList.toggle('hidden', !enabled);
  if (!enabled) {
    qr.removeAttribute('src');
    return;
  }

  if (!address) {
    $('#lan-api-url').textContent = '未检测到可用的 Wi-Fi / 以太网地址';
    badge.className = 'status-badge offline';
    badge.textContent = '未检测到局域网';
    qr.removeAttribute('src');
    return;
  }

  $('#lan-api-url').textContent = address;
  const active = Boolean(status.healthy && status.lanAccessActive);
  badge.className = `status-badge ${active ? 'online' : 'neutral'}`;
  badge.textContent = active ? 'API 已监听局域网' : '保存并启动后生效';
  const request = ++state.lanQrRequest;
  try {
    const dataUrl = await window.studio.network.qrCode(address);
    if (request === state.lanQrRequest) qr.src = dataUrl;
  } catch {
    if (request === state.lanQrRequest) qr.removeAttribute('src');
  }
}

async function refreshCliProxyInfo() {
  const mode = $('input[name="service-mode"]:checked')?.value || 'cliproxy';
  if (mode !== 'cliproxy') return;
  try {
    const [credentials, status, accounts] = await Promise.all([
      window.studio.service.credentials(),
      window.studio.service.status(),
      window.studio.service.accounts()
    ]);
    if (credentials) {
      $('#cliproxy-url').textContent = credentials.url;
      $('#cliproxy-api-key').value = credentials.apiKey;
      $('#cliproxy-management-key').value = credentials.managementKey;
      $('#base-url').value = credentials.url;
      $('#api-key').value = credentials.apiKey;
      $('#top-endpoint').textContent = credentials.url;
    }
    const badge = $('#cliproxy-state');
    badge.className = `status-badge ${status.healthy ? 'online' : status.state === 'error' ? 'offline' : 'neutral'}`;
    badge.textContent = status.healthy
      ? `运行正常 · ${status.accountCount || 0} 个账号`
      : status.state === 'starting'
        ? '正在启动轻量引擎'
        : status.state === 'error'
          ? `启动失败：${status.lastError || '请查看日志'}`
          : '服务尚未启动';
    await renderLanAccess(credentials, status);
    renderCliProxyAccounts(accounts);
  } catch (error) {
    $('#cliproxy-state').className = 'status-badge offline';
    $('#cliproxy-state').textContent = `状态读取失败：${error.message}`;
  }
}

async function refreshSelectedService() {
  const mode = $('input[name="service-mode"]:checked')?.value || 'cliproxy';
  if (mode === 'cliproxy') return refreshCliProxyInfo();
  if (mode === 'integrated') return refreshIntegratedInfo();
}

async function refreshIntegratedInfo() {
  const mode = $('input[name="service-mode"]:checked')?.value || 'external';
  if (mode !== 'integrated') return;
  try {
    const [credentials, status] = await Promise.all([
      window.studio.service.credentials(),
      window.studio.service.status()
    ]);
    if (credentials) {
      $('#integrated-url').value = credentials.url;
      $('#integrated-admin-email').value = credentials.adminEmail;
      $('#integrated-admin-password').value = credentials.adminPassword;
      $('#base-url').value = credentials.url;
      $('#top-endpoint').textContent = credentials.url;
    }
    const badge = $('#integrated-state');
    badge.className = `status-badge ${status.healthy ? 'online' : status.state === 'error' ? 'offline' : 'neutral'}`;
    badge.textContent = status.healthy
      ? '服务运行正常'
      : status.state === 'starting'
        ? '正在启动服务'
        : status.state === 'error'
          ? `启动失败：${status.lastError || '请查看日志'}`
          : '服务尚未启动';
  } catch (error) {
    $('#integrated-state').className = 'status-badge offline';
    $('#integrated-state').textContent = `状态读取失败：${error.message}`;
  }
}

async function startOAuth(provider, button) {
  try {
    await saveSettings(false);
    button.disabled = true;
    const result = await window.studio.oauth.start(provider);
    const code = result.userCode ? `，授权码：${result.userCode}` : '';
    $('#cliproxy-oauth-status').className = 'oauth-status';
    $('#cliproxy-oauth-status').textContent = `已打开 ${result.label} 登录网页${code}。完成授权后本页会自动更新。`;
    toast(`请在浏览器中完成 ${result.label} 登录`, 'info');
  } catch (error) {
    $('#cliproxy-oauth-status').className = 'oauth-status error';
    $('#cliproxy-oauth-status').textContent = `登录启动失败：${error.message}`;
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function handleOAuthStatus(result) {
  if (result.state === 'success') {
    $('#cliproxy-oauth-status').className = 'oauth-status success';
    $('#cliproxy-oauth-status').textContent = `${result.label} 登录成功，可以检测模型并供 AI 工具调用。`;
    toast(`${result.label} 登录成功`, 'success');
    await refreshCliProxyInfo();
    await testConnection({ save: true, notify: false });
  } else {
    $('#cliproxy-oauth-status').className = 'oauth-status error';
    $('#cliproxy-oauth-status').textContent = `${result.label || '账号'} 登录失败：${result.error || '未知错误'}`;
    toast(result.error || 'OAuth 登录失败', 'error');
  }
}

function renderModels(models) {
  state.models = models || [];
  const list = $('#models-list');
  list.textContent = '';
  state.models.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    list.append(option);
  });
  const imageList = $('#image-models-list');
  const knownImageModels = new Set(['gpt-image-2', 'gpt-image-1', 'gpt-image-1-mini']);
  state.models.filter((model) => /image|imagen|dall|flux|stable.diffusion/i.test(model)).forEach((model) => knownImageModels.add(model));
  imageList.textContent = '';
  knownImageModels.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    imageList.append(option);
  });
  const videoList = $('#video-models-list');
  const knownVideoModels = new Set([
    'jimeng-video-seedance-2.0-fast',
    'jimeng-video-seedance-2.0-pro',
    'jimeng-video-seedance-1.5-pro',
    'jimeng-video-3.0-pro',
    'jimeng-video-3.0'
  ]);
  state.models.filter((model) => /video|seedance|veo|sora|kling|wan/i.test(model)).forEach((model) => knownVideoModels.add(model));
  videoList.textContent = '';
  knownVideoModels.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    videoList.append(option);
  });
  $('#metric-models').textContent = String(state.models.length);
  if (!$('#default-model').value && state.models[0]) {
    $('#default-model').value = state.models[0];
    $('#play-model').value = state.models[0];
    $('#tool-model').value = state.models[0];
  }
}

function cleanIpcError(error) {
  return String(error?.message || error || '未知错误')
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '');
}

function imageFormOptions() {
  return {
    mode: state.imageMode,
    model: $('#image-model').value.trim() || 'gpt-image-2',
    prompt: $('#image-prompt').value.trim(),
    size: $('#image-size').value,
    quality: $('#image-quality').value,
    n: Number($('#image-count').value || 1),
    outputFormat: $('#image-format').value,
    background: $('#image-background').value,
    imagePaths: [...state.referenceImages]
  };
}

function setImageMode(mode) {
  state.imageMode = mode === 'edit' ? 'edit' : 'generate';
  $$('.image-mode-tab').forEach((tab) => {
    const active = tab.dataset.imageMode === state.imageMode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $('#reference-block').classList.toggle('hidden', state.imageMode !== 'edit');
  $('#image-endpoint').textContent = state.imageMode === 'edit' ? '/v1/images/edits' : '/v1/images/generations';
  $('#run-image').textContent = state.imageMode === 'edit' ? '开始编辑' : '开始生成';
  $('#image-error').classList.add('hidden');
  updateImageApiExample();
}

function updatePromptCount() {
  $('#image-prompt-count').textContent = String($('#image-prompt').value.length);
}

function renderReferenceImages() {
  const list = $('#reference-list');
  list.textContent = '';
  if (!state.referenceImages.length) {
    const empty = document.createElement('p');
    empty.textContent = '尚未选择参考图片';
    list.append(empty);
    return;
  }
  state.referenceImages.forEach((filePath, index) => {
    const row = document.createElement('div');
    row.className = 'reference-item';
    const badge = document.createElement('span');
    badge.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = filePath.split(/[\\/]/).pop() || filePath;
    name.title = filePath;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '移除';
    remove.addEventListener('click', () => {
      state.referenceImages.splice(index, 1);
      renderReferenceImages();
      updateImageApiExample();
    });
    row.append(badge, name, remove);
    list.append(row);
  });
}

async function pickReferenceImages() {
  const selected = await window.studio.dialog.pick('images');
  if (!Array.isArray(selected) || !selected.length) return;
  state.referenceImages = selected.slice(0, 4);
  renderReferenceImages();
  updateImageApiExample();
}

function updateImageApiExample() {
  const baseUrl = ($('#base-url')?.value || 'http://127.0.0.1:8317').replace(/\/+$/, '').replace(/\/v1$/, '');
  const options = imageFormOptions();
  const optionLines = [];
  if (options.size !== 'auto') optionLines.push(`  "size": ${JSON.stringify(options.size)},`);
  if (options.quality !== 'auto') optionLines.push(`  "quality": ${JSON.stringify(options.quality)},`);
  if (options.n > 1) optionLines.push(`  "n": ${options.n},`);
  if (options.outputFormat !== 'png') optionLines.push(`  "output_format": ${JSON.stringify(options.outputFormat)},`);
  if (options.background !== 'auto') optionLines.push(`  "background": ${JSON.stringify(options.background)},`);
  const prompt = options.prompt || '在这里填写图片提示词';
  let example;
  if (options.mode === 'edit') {
    example = `curl.exe -X POST "${baseUrl}/v1/images/edits" \`\n  -H "Authorization: Bearer $env:MODUGATE_API_KEY" \`\n  -F "model=${options.model}" \`\n  -F "image=@C:\\path\\reference.png" \`\n  -F ${JSON.stringify(`prompt=${prompt}`)}`;
  } else {
    const bodyLines = [
      `  "model": ${JSON.stringify(options.model)},`,
      `  "prompt": ${JSON.stringify(prompt)},`,
      ...optionLines
    ];
    bodyLines[bodyLines.length - 1] = bodyLines[bodyLines.length - 1].replace(/,$/, '');
    example = `curl.exe -X POST "${baseUrl}/v1/images/generations" \`\n  -H "Authorization: Bearer $env:MODUGATE_API_KEY" \`\n  -H "Content-Type: application/json" \`\n  --data-raw '{\n${bodyLines.join('\n')}\n}'`;
  }
  $('#image-api-example').textContent = example;
  return example;
}

async function copyImageApiExample() {
  await window.studio.clipboard.writeText(updateImageApiExample());
  toast('图片 API 示例已复制', 'success');
}

function setImageRunning(running) {
  $('#run-image').disabled = running;
  $('#run-image').textContent = running ? '生成中…' : state.imageMode === 'edit' ? '开始编辑' : '开始生成';
  $('#cancel-image').classList.toggle('hidden', !running);
  $('#image-api-state').textContent = running ? 'WORKING' : 'READY';
  $('#image-result-status').textContent = running ? 'GENERATING' : 'READY';
  $$('.image-mode-tab').forEach((tab) => { tab.disabled = running; });
}

function makeImageResultCard(item, compact = false) {
  const card = document.createElement('article');
  card.className = compact ? 'history-image-card' : 'generated-image-card';
  const imageButton = document.createElement('button');
  imageButton.type = 'button';
  imageButton.className = 'generated-image-preview';
  const image = document.createElement('img');
  image.src = compact ? item.thumbnailDataUrl : item.dataUrl;
  image.alt = item.prompt ? `生成图片：${item.prompt.slice(0, 80)}` : 'ModuGate 生成图片';
  imageButton.append(image);
  if (compact) imageButton.addEventListener('click', () => loadHistoryImage(item.id));

  const detail = document.createElement('div');
  detail.className = 'generated-image-detail';
  const title = document.createElement('strong');
  title.textContent = item.revisedPrompt || item.prompt || '生成图片';
  const meta = document.createElement('small');
  const time = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
  meta.textContent = [item.model, item.size, item.quality, time].filter(Boolean).join(' · ');
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'button button-secondary';
  save.textContent = '下载原图';
  save.addEventListener('click', () => downloadHistoryImage(item.id, save));
  detail.append(title, meta, save);
  card.append(imageButton, detail);
  return card;
}

function renderImageResults(items, metadata = {}) {
  const container = $('#image-results');
  container.textContent = '';
  container.classList.remove('empty');
  (items || []).forEach((item) => container.append(makeImageResultCard(item)));
  $('#image-result-count').textContent = `${items.length} 张图片 · 已自动保存到历史`;
  if (metadata.status) $('#image-result-status').textContent = `HTTP ${metadata.status}`;
  if (Number.isFinite(metadata.latencyMs)) $('#image-result-latency').textContent = `${metadata.latencyMs} ms`;
}

async function runImageRequest() {
  if (state.imageRequestId) return;
  const errorBox = $('#image-error');
  errorBox.classList.add('hidden');
  const options = imageFormOptions();
  if (!options.prompt) {
    errorBox.textContent = '请输入图片提示词。';
    errorBox.classList.remove('hidden');
    return;
  }
  if (options.mode === 'edit' && !options.imagePaths.length) {
    errorBox.textContent = '编辑图片时请先选择参考图片。';
    errorBox.classList.remove('hidden');
    return;
  }
  try {
    await saveSettings(false);
    const requestId = crypto.randomUUID();
    state.imageRequestId = requestId;
    setImageRunning(true);
    $('#image-result-latency').textContent = '计算中';
    const result = await window.studio.images.generate({ requestId, ...options });
    renderImageResults(result.images || [], result);
    await refreshImageHistory();
    toast(`图片${options.mode === 'edit' ? '编辑' : '生成'}完成`, 'success');
  } catch (error) {
    const message = cleanIpcError(error);
    const aborted = /取消|abort/i.test(message);
    $('#image-result-status').textContent = aborted ? 'CANCELLED' : 'ERROR';
    $('#image-result-latency').textContent = '— ms';
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    if (!aborted) toast(message, 'error');
  } finally {
    state.imageRequestId = null;
    setImageRunning(false);
  }
}

async function refreshImageHistory() {
  const items = await window.studio.images.history();
  const container = $('#image-history');
  container.textContent = '';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'image-history-empty';
    empty.textContent = '还没有图片历史记录。';
    container.append(empty);
    return;
  }
  items.forEach((item) => container.append(makeImageResultCard(item, true)));
}

async function loadHistoryImage(id) {
  try {
    const item = await window.studio.images.load(id);
    renderImageResults([item]);
    $('.content-scroll').scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    toast(cleanIpcError(error), 'error');
  }
}

async function downloadHistoryImage(id, button) {
  try {
    button.disabled = true;
    const result = await window.studio.images.save(id);
    if (result.saved) toast('图片已保存到指定位置', 'success');
  } catch (error) {
    toast(cleanIpcError(error), 'error');
  } finally {
    button.disabled = false;
  }
}

async function clearImageHistory() {
  if (!window.confirm('确定清空本机图片历史吗？该操作会删除历史原图，无法恢复。')) return;
  const result = await window.studio.images.clearHistory();
  await refreshImageHistory();
  toast(`已清理 ${result.cleared || 0} 张历史图片`, 'success');
}

function videoFormOptions() {
  return {
    connectionKind: $('#video-connection-kind').value === 'main' ? 'main' : 'jimeng',
    protocol: $('#video-protocol').value === 'chat' ? 'chat' : 'videos',
    model: $('#video-model').value.trim() || 'jimeng-video-seedance-2.0-fast',
    prompt: $('#video-prompt').value.trim(),
    ratio: $('#video-ratio').value,
    resolution: $('#video-resolution').value,
    duration: Number($('#video-duration').value || 5),
    referenceMode: $('#video-reference-mode').value === 'omni_reference' ? 'omni_reference' : 'first_last_frames',
    references: $('#video-protocol').value === 'chat'
      ? []
      : state.videoReferences.map(({ filePath, type }) => ({ filePath, type }))
  };
}

function setVideoProtocol(protocol) {
  const selected = protocol === 'chat' ? 'chat' : 'videos';
  $('#video-protocol').value = selected;
  $('#video-endpoint').textContent = selected === 'chat' ? '/v1/chat/completions' : '/v1/videos/generations';
  $('#video-reference-block').classList.toggle('hidden', selected === 'chat');
  updateVideoApiExample();
  renderJimengAccounts();
  refreshRouterStatus().catch(() => {});
}

function setVideoReferenceMode(mode) {
  const requiresOmni = state.videoReferences.some((item) => item.type !== 'image')
    || state.videoReferences.length > 2;
  const selected = mode === 'omni_reference' || requiresOmni ? 'omni_reference' : 'first_last_frames';
  $('#video-reference-mode').value = selected;
  const omni = selected === 'omni_reference';
  $('#video-reference-title').textContent = omni ? '全能参考素材（可选）' : '首帧 / 尾帧（可选）';
  $('#video-reference-summary').textContent = omni
    ? '图片最多 9 张、视频 3 个、音频 3 个；使用 @引用描述素材作用'
    : '最多 2 张图片，依次作为首帧和尾帧';
  $('#omni-reference-hint').classList.toggle('hidden', !omni);
  renderVideoReferenceImages();
  updateVideoApiExample();
}

function updateVideoPromptCount() {
  $('#video-prompt-count').textContent = String($('#video-prompt').value.length);
}

function assignVideoReferenceAliases() {
  const counters = { image: 0, video: 0, audio: 0 };
  state.videoReferences.forEach((reference) => {
    counters[reference.type] += 1;
    reference.alias = `${reference.type}_file_${counters[reference.type]}`;
  });
}

function rewriteVideoReferenceAliases(previousReferences) {
  const input = $('#video-prompt');
  const remaining = new Set(state.videoReferences);
  let prompt = input.value;
  previousReferences.forEach(({ reference, alias }, index) => {
    if (!alias) return;
    const replacement = remaining.has(reference) ? `\uE000${index}\uE001` : '';
    prompt = prompt.replace(new RegExp(`@${alias}\\b`, 'g'), replacement);
  });
  previousReferences.forEach(({ reference }, index) => {
    if (!remaining.has(reference)) return;
    prompt = prompt.replaceAll(`\uE000${index}\uE001`, `@${reference.alias}`);
  });
  input.value = prompt;
  updateVideoPromptCount();
}

function renderVideoReferenceImages() {
  const list = $('#video-reference-list');
  list.textContent = '';
  if (!state.videoReferences.length) {
    const empty = document.createElement('p');
    empty.textContent = '尚未选择参考素材';
    list.append(empty);
    return;
  }
  assignVideoReferenceAliases();
  state.videoReferences.forEach((reference, index) => {
    const row = document.createElement('div');
    row.className = `reference-item media-reference-item ${reference.type}`;
    const badge = document.createElement('span');
    badge.textContent = reference.type === 'image' ? '图' : reference.type === 'video' ? '视' : '音';
    const name = document.createElement('strong');
    name.textContent = reference.filePath.split(/[\\/]/).pop() || reference.filePath;
    name.title = reference.filePath;
    const actions = document.createElement('div');
    actions.className = 'reference-actions';
    const alias = document.createElement('code');
    alias.textContent = `@${reference.alias}`;
    const insert = document.createElement('button');
    insert.type = 'button';
    insert.textContent = '插入 @引用';
    insert.className = 'insert-reference';
    insert.addEventListener('click', () => insertVideoReference(reference.alias));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '移除';
    remove.addEventListener('click', () => {
      const previousReferences = state.videoReferences.map((item) => ({ reference: item, alias: item.alias }));
      state.videoReferences.splice(index, 1);
      assignVideoReferenceAliases();
      rewriteVideoReferenceAliases(previousReferences);
      renderVideoReferenceImages();
      updateVideoApiExample();
    });
    actions.append(alias, insert, remove);
    row.append(badge, name, actions);
    list.append(row);
  });
}

function insertVideoReference(alias) {
  const input = $('#video-prompt');
  const token = `@${alias}`;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const prefix = before && !/\s$/.test(before) ? ' ' : '';
  const suffix = after && !/^\s/.test(after) ? ' ' : '';
  input.value = `${before}${prefix}${token}${suffix}${after}`;
  const cursor = before.length + prefix.length + token.length + suffix.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
  updateVideoPromptCount();
  updateVideoApiExample();
}

function classifyVideoReference(filePath) {
  const extension = (filePath.match(/\.[^.\\/]+$/)?.[0] || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return 'image';
  if (['.mp4', '.mov', '.webm'].includes(extension)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac'].includes(extension)) return 'audio';
  return '';
}

async function pickVideoReferences() {
  const selected = await window.studio.dialog.pick('media');
  if (!Array.isArray(selected) || !selected.length) return;
  const limits = { image: 9, video: 3, audio: 3 };
  const next = [...state.videoReferences];
  let skipped = 0;
  selected.forEach((filePath) => {
    const type = classifyVideoReference(filePath);
    if (!type || next.some((item) => item.filePath.toLowerCase() === filePath.toLowerCase())) return;
    const count = next.filter((item) => item.type === type).length;
    if (count >= limits[type]) {
      skipped += 1;
      return;
    }
    next.push({ filePath, type });
  });
  state.videoReferences = next;
  const needsOmni = next.some((item) => item.type !== 'image') || next.length > 2;
  if (needsOmni) $('#video-reference-mode').value = 'omni_reference';
  setVideoReferenceMode($('#video-reference-mode').value);
  if (skipped) toast(`有 ${skipped} 个素材超过数量限制，未加入`, 'info');
}

function updateVideoApiExample() {
  const baseUrl = ($('#unified-api-url')?.textContent || 'http://127.0.0.1:8787/v1').replace(/\/+$/, '').replace(/\/v1$/, '');
  const options = videoFormOptions();
  const prompt = options.prompt || '在这里填写视频提示词';
  let example;
  if (options.protocol === 'chat') {
    const body = {
      model: options.model,
      messages: [{ role: 'user', content: `${prompt}\n\n生成参数：${options.ratio}，${options.resolution}，${options.duration}秒。` }],
      stream: false
    };
    example = `curl.exe -X POST "${baseUrl}/v1/chat/completions" \`\n  -H "Authorization: Bearer $env:MODUGATE_API_KEY" \`\n  -H "Content-Type: application/json" \`\n  --data-raw '${JSON.stringify(body, null, 2)}'`;
  } else if (options.references.length) {
    const counters = { image: 0, video: 0, audio: 0 };
    const extensions = { image: 'png', video: 'mp4', audio: 'mp3' };
    const files = options.references.map((reference) => {
      counters[reference.type] += 1;
      const field = `${reference.type}_file_${counters[reference.type]}`;
      return `  -F "${field}=@C:\\path\\reference-${counters[reference.type]}.${extensions[reference.type]}" \``;
    }).join('\n');
    example = `curl.exe -X POST "${baseUrl}/v1/videos/generations" \`\n  -H "Authorization: Bearer $env:MODUGATE_API_KEY" \`\n  -F "model=${options.model}" \`\n  --form-string ${JSON.stringify(`prompt=${prompt}`)} \`\n  -F "functionMode=${options.referenceMode}" \`\n  -F "ratio=${options.ratio}" \`\n  -F "resolution=${options.resolution}" \`\n  -F "duration=${options.duration}" \`\n${files}`.replace(/ \`$/, '');
  } else {
    const body = {
      model: options.model,
      prompt,
      ratio: options.ratio,
      resolution: options.resolution,
      duration: options.duration
    };
    example = `curl.exe -X POST "${baseUrl}/v1/videos/generations" \`\n  -H "Authorization: Bearer $env:MODUGATE_API_KEY" \`\n  -H "Content-Type: application/json" \`\n  --data-raw '${JSON.stringify(body, null, 2)}'`;
  }
  $('#video-api-example').textContent = example;
  return example;
}

async function copyVideoApiExample() {
  await window.studio.clipboard.writeText(updateVideoApiExample());
  toast('视频 API 示例已复制', 'success');
}

function setVideoRunning(running) {
  $('#run-video').disabled = running;
  $('#run-video').textContent = running ? '生成中…' : '开始测试';
  $('#cancel-video').classList.toggle('hidden', !running);
  $('#video-api-state').className = `status-badge ${running ? 'online' : 'neutral'}`;
  $('#video-api-state').textContent = running ? 'WORKING' : 'READY';
  $('#video-protocol').disabled = running;
  $('#video-connection-kind').disabled = running;
  $('#pick-video-images').disabled = running;
  if (running) $('#video-result-status').textContent = 'GENERATING';
}

function renderVideoResult(result) {
  const urls = Array.isArray(result.urls) ? result.urls : [];
  const url = urls[0] || '';
  state.videoResultUrl = url;
  $('#video-empty-state').classList.toggle('hidden', Boolean(url));
  const player = $('#video-player');
  player.classList.toggle('hidden', !url);
  if (url) {
    player.src = url;
    player.load();
  } else {
    player.removeAttribute('src');
    player.load();
    $('#video-empty-state strong').textContent = result.taskId ? '任务已受理' : '接口响应成功';
    $('#video-empty-state p').textContent = result.taskId
      ? '接口返回了任务 ID，但暂未返回视频地址。可在上游管理台继续查看任务状态。'
      : '响应中没有识别到视频地址，请展开下方原始响应检查接口格式。';
  }
  $('#video-result-detail').classList.remove('hidden');
  $('#video-task-state').textContent = result.state || (url ? 'completed' : 'accepted');
  $('#video-task-id').textContent = result.taskId || '未返回';
  $('#open-video-url').classList.toggle('hidden', !url);
  $('#video-result-status').textContent = `HTTP ${result.status}`;
  $('#video-result-latency').textContent = `${result.latencyMs} ms`;
  $('#video-result-summary').textContent = url ? `已识别 ${urls.length} 个结果地址` : '请求成功，未返回可播放地址';
  $('#video-raw').classList.remove('hidden');
  $('#video-raw-output').textContent = JSON.stringify(result.raw, null, 2);
}

async function runVideoRequest() {
  if (state.videoRequestId) return;
  const errorBox = $('#video-error');
  errorBox.classList.add('hidden');
  const options = videoFormOptions();
  if (!options.prompt) {
    errorBox.textContent = '请输入视频提示词。';
    errorBox.classList.remove('hidden');
    return;
  }
  try {
    await saveSettings(false);
    const requestId = crypto.randomUUID();
    state.videoRequestId = requestId;
    setVideoRunning(true);
    $('#video-result-latency').textContent = '生成中';
    const result = await window.studio.videos.generate({ requestId, ...options });
    renderVideoResult(result);
    toast(result.urls?.length ? '视频接口测试成功' : '视频任务已成功提交', 'success');
  } catch (error) {
    const message = cleanIpcError(error);
    const aborted = /取消|abort/i.test(message);
    $('#video-result-status').textContent = aborted ? 'CANCELLED' : 'ERROR';
    $('#video-result-latency').textContent = '— ms';
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    if (!aborted) toast(message, 'error');
  } finally {
    state.videoRequestId = null;
    setVideoRunning(false);
  }
}

async function openVideoResult() {
  if (!state.videoResultUrl) return;
  try {
    await window.studio.videos.open(state.videoResultUrl);
  } catch (error) {
    toast(cleanIpcError(error), 'error');
  }
}

function setGatewayVisual(result) {
  state.health = result;
  const online = Boolean(result.online);
  const statusText = online ? '运行正常' : '连接失败';
  $('#side-status-dot').className = `status-dot ${online ? 'online' : 'offline'}`;
  $('#side-status-text').textContent = statusText;
  $('#health-badge').className = `status-badge ${online ? 'online' : 'offline'}`;
  $('#health-badge').textContent = online ? 'ONLINE' : 'OFFLINE';
  $('#connection-state').className = `status-badge ${online ? 'online' : 'offline'}`;
  $('#connection-state').textContent = online ? '已连接' : '失败';
  $('#health-score').textContent = Number.isFinite(result.latencyMs) ? String(result.latencyMs) : '--';
  $('#health-title').textContent = online ? '网关响应正常' : '无法连接网关';
  $('#health-detail').textContent = online
    ? `已发现 ${result.models.length} 个模型`
    : result.modelsError || result.healthError || '请检查地址和服务状态';
  $('#health-checked').textContent = new Date(result.checkedAt).toLocaleTimeString('zh-CN', { hour12: false });
  $('#metric-gateway').textContent = online ? '在线' : '离线';
  $('#metric-gateway-sub').textContent = online ? `${result.latencyMs} ms · ${result.root}` : '检查地址、密钥或网络';
  $('#diag-health').textContent = result.healthStatus ? `HTTP ${result.healthStatus}` : result.healthError || '失败';
  $('#diag-models').textContent = result.modelsStatus ? `HTTP ${result.modelsStatus} · ${result.models.length} 个` : result.modelsError || '失败';
  $('#diag-latency').textContent = `${result.latencyMs} ms`;
  renderModels(result.models);
}

async function testConnection({ save = true, notify = true } = {}) {
  const buttons = [$('#quick-test'), $('#test-connection')].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });
  try {
    if (save) await saveSettings(false);
    const result = await window.studio.gateway.test({
      baseUrl: $('#base-url').value.trim(),
      apiKey: $('#api-key').value.trim()
    });
    setGatewayVisual(result);
    if (notify) toast(result.online ? `连接成功，发现 ${result.models.length} 个模型` : '连接失败，请查看诊断信息', result.online ? 'success' : 'error');
    return result;
  } catch (error) {
    if (notify) toast(error.message, 'error');
    return null;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

const jimengRegionMeta = {
  cn: { label: '中国站', prefix: '' },
  us: { label: '美国站', prefix: 'us-' },
  hk: { label: '香港站', prefix: 'hk-' },
  jp: { label: '日本站', prefix: 'jp-' },
  sg: { label: '新加坡站', prefix: 'sg-' }
};

function maskJimengSession(account) {
  const prefix = jimengRegionMeta[account.region]?.prefix || '';
  return `${prefix}••••••••${String(account.sessionId || '').slice(-4)}`;
}

function openJimengAccountForm() {
  $('#jimeng-account-form').classList.remove('hidden');
  $('#jimeng-account-panel').scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(() => $('#jimeng-account-name').focus(), 200);
}

function closeJimengAccountForm() {
  $('#jimeng-account-form').classList.add('hidden');
  $('#jimeng-account-name').value = '';
  $('#jimeng-account-region').value = 'cn';
  $('#jimeng-sessionid').value = '';
  $('#jimeng-sessionid').type = 'password';
  $('#toggle-jimeng-sessionid').textContent = '显示';
}

function renderJimengAccounts() {
  const list = $('#jimeng-account-list');
  if (!list) return;
  list.textContent = '';
  const selectedId = state.settings?.jimeng?.selectedAccountId || '';
  if (!state.jimengAccounts.length) {
    const empty = document.createElement('p');
    empty.className = 'jimeng-empty';
    empty.textContent = '还没有即梦账号。点击“添加账号”开始配置。';
    list.append(empty);
    $('#jimeng-runtime-state').className = `status-badge ${state.routerRunning ? 'online' : 'neutral'}`;
    $('#jimeng-runtime-state').textContent = state.routerRunning ? '路由在线 · 未添加账号' : '未配置';
    return;
  }
  state.jimengAccounts.forEach((account) => {
    const row = document.createElement('div');
    row.className = `jimeng-account-item${account.id === selectedId ? ' selected' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'jimeng-account-icon';
    icon.textContent = '梦';
    const info = document.createElement('div');
    info.className = 'jimeng-account-info';
    const name = document.createElement('strong');
    name.textContent = `${account.name}${account.id === selectedId ? ' · 当前使用' : ''}`;
    const detail = document.createElement('small');
    detail.textContent = `${jimengRegionMeta[account.region]?.label || '中国站'} · ${maskJimengSession(account)}`;
    info.append(name, detail);
    const testState = document.createElement('span');
    const status = state.jimengAccountStatus[account.id];
    testState.className = `jimeng-account-test-state ${status?.className || ''}`;
    testState.textContent = status?.text || '尚未检测';
    const actions = document.createElement('div');
    actions.className = 'jimeng-account-item-actions';
    const use = document.createElement('button');
    use.className = 'button button-secondary';
    use.textContent = account.id === selectedId ? '使用中' : '使用';
    use.disabled = account.id === selectedId;
    use.addEventListener('click', () => selectJimengAccount(account.id));
    const check = document.createElement('button');
    check.className = 'button button-secondary';
    check.textContent = '检测';
    check.addEventListener('click', () => checkJimengAccount(account.id));
    const remove = document.createElement('button');
    remove.className = 'button button-ghost';
    remove.textContent = '删除';
    remove.addEventListener('click', () => removeJimengAccount(account.id));
    actions.append(use, check, remove);
    row.append(icon, info, testState, actions);
    list.append(row);
  });
  $('#jimeng-runtime-state').className = `status-badge ${state.routerRunning ? 'online' : 'neutral'}`;
  $('#jimeng-runtime-state').textContent = `${state.routerRunning ? '路由在线 · ' : ''}${state.jimengAccounts.length} 个账号`;
}

async function saveJimengAccount() {
  const name = $('#jimeng-account-name').value.trim() || `即梦账号 ${state.jimengAccounts.length + 1}`;
  let region = $('#jimeng-account-region').value;
  let sessionId = $('#jimeng-sessionid').value.trim().replace(/^Bearer\s+/i, '');
  const detected = sessionId.match(/^(us|hk|jp|sg)-(.+)$/i);
  if (detected) {
    region = detected[1].toLowerCase();
    sessionId = detected[2];
  }
  if (sessionId.length < 8 || /[\s,;]/.test(sessionId)) {
    toast('sessionid 格式不正确，请只粘贴 Cookie 中 sessionid 的值', 'error');
    return;
  }
  const id = `account_${crypto.randomUUID().replaceAll('-', '')}`;
  state.jimengAccounts.push({ id, name, region, sessionId });
  state.settings.jimeng.selectedAccountId = id;
  $('#video-connection-kind').value = 'jimeng';
  try {
    const saved = await saveSettings(false);
    state.jimengAccounts = saved.jimeng.accounts.map((item) => ({ ...item }));
    closeJimengAccountForm();
    renderJimengAccounts();
    toast('即梦账号已加密保存，正在检测账号', 'success');
    await checkJimengAccount(id);
  } catch (error) {
    state.jimengAccounts = state.jimengAccounts.filter((item) => item.id !== id);
    toast(cleanIpcError(error), 'error');
  }
}

async function selectJimengAccount(id) {
  state.settings.jimeng.selectedAccountId = id;
  $('#video-connection-kind').value = 'jimeng';
  const saved = await saveSettings(false);
  state.jimengAccounts = saved.jimeng.accounts.map((item) => ({ ...item }));
  renderJimengAccounts();
  toast('已切换即梦账号；统一 API 会自动使用该账号', 'success');
}

async function removeJimengAccount(id) {
  const account = state.jimengAccounts.find((item) => item.id === id);
  if (!account || !window.confirm(`确定删除“${account.name}”吗？本机会移除已保存的 sessionid。`)) return;
  state.jimengAccounts = state.jimengAccounts.filter((item) => item.id !== id);
  delete state.jimengAccountStatus[id];
  if (state.settings.jimeng.selectedAccountId === id) {
    state.settings.jimeng.selectedAccountId = state.jimengAccounts[0]?.id || '';
  }
  const saved = await saveSettings(false);
  state.jimengAccounts = saved.jimeng.accounts.map((item) => ({ ...item }));
  renderJimengAccounts();
  toast('即梦账号已从本机删除', 'success');
}

async function checkJimengAccount(id) {
  state.jimengAccountStatus[id] = { text: '检测中…', className: '' };
  renderJimengAccounts();
  try {
    await saveSettings(false);
    const result = await window.studio.jimeng.checkAccount(id);
    const total = result.points?.totalCredit ?? result.points?.total_credit;
    state.jimengAccountStatus[id] = result.live
      ? { text: total == null ? `有效 · ${result.latencyMs} ms` : `有效 · ${total} 积分`, className: 'online' }
      : { text: '账号已失效', className: 'offline' };
    toast(result.live ? '即梦账号有效' : '即梦账号已失效，请重新获取 sessionid', result.live ? 'success' : 'error');
  } catch (error) {
    state.jimengAccountStatus[id] = { text: '检测失败', className: 'offline' };
    toast(cleanIpcError(error), 'error');
  }
  renderJimengAccounts();
}

async function refreshRouterStatus() {
  const result = await window.studio.router.status();
  state.routerRunning = Boolean(result.running);
  if (result.apiBase) $('#unified-api-url').textContent = result.apiBase;
  if (result.apiKey) $('#unified-api-key').value = result.apiKey;
  renderJimengAccounts();
  updateVideoApiExample();
}

async function applyJimengPreset() {
  $('#jimeng-gateway-url').value = 'http://127.0.0.1:8001';
  $('#video-model').value = 'jimeng-video-seedance-2.0-fast';
  $('#video-connection-kind').value = 'jimeng';
  $('#video-protocol').value = 'videos';
  $('#video-ratio').value = '16:9';
  $('#video-resolution').value = '720p';
  $('#video-duration').value = '5';
  $('#video-reference-mode').value = 'omni_reference';
  setVideoProtocol('videos');
  setVideoReferenceMode('omni_reference');
  updateVideoApiExample();
  await saveSettings(false);
  if (!state.jimengAccounts.length) openJimengAccountForm();
  toast('已应用即梦视频预设；主网关地址和 API Key 未被修改', 'success');
}

function selectPreset(preset) {
  state.activePreset = preset;
  $$('.preset-tab').forEach((item) => item.classList.toggle('active', item.dataset.preset === preset));
  $('#request-endpoint').textContent = presetMeta[preset].endpoint;
  $('#response-protocol').textContent = presetMeta[preset].label;
}

function setApiRunning(running) {
  $('#run-play').disabled = running;
  $('#run-play').textContent = running ? '请求中…' : '运行测试';
  $('#cancel-play').classList.toggle('hidden', !running);
  $('#response-status').textContent = running ? 'STREAMING' : 'READY';
}

function resetApiOutput() {
  const output = $('#response-output');
  output.textContent = '';
  output.classList.remove('empty');
  $('#response-latency').textContent = '— ms';
  $('#response-usage').textContent = 'Token 用量：—';
}

async function runApiTest() {
  if (state.apiRequestId) return;
  try {
    await saveSettings(false);
    const requestId = crypto.randomUUID();
    state.apiRequestId = requestId;
    resetApiOutput();
    setApiRunning(true);
    const result = await window.studio.gateway.run({
      requestId,
      preset: state.activePreset,
      model: $('#play-model').value.trim(),
      prompt: $('#play-prompt').value,
      options: { stream: true, maxTokens: 2048 }
    });
    $('#response-status').textContent = `HTTP ${result.status}`;
    $('#response-latency').textContent = `${result.latencyMs} ms`;
    if (!$('#response-output').textContent) $('#response-output').textContent = '请求成功，但响应中没有可显示的文本。';
    toast(`${presetMeta[state.activePreset].title} 协议测试成功`, 'success');
  } catch (error) {
    const aborted = /abort/i.test(error.name || '') || /aborted|取消/i.test(error.message || '');
    $('#response-status').textContent = aborted ? 'CANCELLED' : 'ERROR';
    $('#response-output').textContent += `\n\n[错误] ${aborted ? '请求已停止' : error.message}`;
    if (!aborted) toast(error.message, 'error');
  } finally {
    state.apiRequestId = null;
    setApiRunning(false);
  }
}

function handleApiChunk(chunk) {
  if (chunk.requestId !== state.apiRequestId) return;
  if (chunk.type === 'text') {
    $('#response-output').textContent += chunk.text;
    $('#response-output').scrollTop = $('#response-output').scrollHeight;
  } else if (chunk.type === 'usage') {
    const usage = chunk.usage || {};
    const input = usage.input_tokens ?? usage.prompt_tokens ?? '—';
    const output = usage.output_tokens ?? usage.completion_tokens ?? '—';
    $('#response-usage').textContent = `Token 用量：输入 ${input} · 输出 ${output}`;
  }
}

function selectTool(tool) {
  state.activeTool = tool;
  $$('[data-tool-card]').forEach((card) => card.classList.toggle('active', card.dataset.toolCard === tool));
  $('#runner-title').textContent = `${presetMeta[tool].title} 真实客户端测试`;
}

async function detectTools({ persist = true, notify = false } = {}) {
  try {
    if (persist) await saveSettings(false);
    state.toolStatus = await window.studio.tools.detect();
    let installed = 0;
    Object.entries(state.toolStatus).forEach(([name, info]) => {
      const badge = $(`[data-tool-state="${name}"]`);
      if (!badge) return;
      badge.className = `install-state ${info.installed ? 'installed' : 'missing'}`;
      badge.textContent = info.installed ? '已安装' : '未检测到';
      badge.title = info.resolved || info.command;
      if (info.installed) installed += 1;
    });
    $('#metric-clients').textContent = `${installed} / 3`;
    if (notify) toast(`检测完成：找到 ${installed} 个客户端`, installed ? 'success' : 'info');
  } catch (error) {
    if (notify) toast(error.message, 'error');
  }
}

function setToolRunning(running) {
  $('#run-tool').disabled = running;
  $('#run-tool').textContent = running ? '运行中…' : '运行真实 CLI';
  $('#runner-state').className = `status-badge ${running ? 'online' : 'neutral'}`;
  $('#runner-state').textContent = running ? 'RUNNING' : 'READY';
}

async function runTool() {
  if (state.toolRequestId) return;
  try {
    await saveSettings(false);
    await detectTools({ persist: false });
    if (!state.toolStatus[state.activeTool]?.installed) throw new Error(`${presetMeta[state.activeTool].title} 未安装或路径无效`);
    const requestId = crypto.randomUUID();
    state.toolRequestId = requestId;
    $('#tool-output').textContent = `$ ${presetMeta[state.activeTool].title} compatibility test\n\n`;
    setToolRunning(true);
    const result = await window.studio.tools.run({
      requestId,
      preset: state.activeTool,
      model: $('#tool-model').value.trim(),
      prompt: $('#tool-prompt').value
    });
    $('#runner-state').textContent = result.code === 0 ? 'PASSED' : `EXIT ${result.code}`;
    $('#runner-state').className = `status-badge ${result.code === 0 ? 'online' : 'offline'}`;
    toast(result.code === 0 ? '真实客户端测试完成' : '客户端返回了非零退出代码', result.code === 0 ? 'success' : 'error');
  } catch (error) {
    $('#runner-state').textContent = 'ERROR';
    $('#runner-state').className = 'status-badge offline';
    $('#tool-output').textContent += `\n[错误] ${error.message}`;
    toast(error.message, 'error');
  } finally {
    state.toolRequestId = null;
    setToolRunning(false);
  }
}

function handleToolChunk(chunk) {
  if (chunk.requestId !== state.toolRequestId) return;
  $('#tool-output').textContent += chunk.text;
  $('#tool-output').scrollTop = $('#tool-output').scrollHeight;
}

function appendServiceLog(entry) {
  const container = $('#service-log');
  $('.log-empty', container)?.remove();
  const row = document.createElement('p');
  row.className = entry.level || 'info';
  const time = document.createElement('time');
  time.textContent = new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false });
  const level = document.createElement('b');
  level.textContent = String(entry.level || 'info').toUpperCase();
  const message = document.createElement('span');
  message.textContent = entry.message;
  row.append(time, level, message);
  container.append(row);
  container.scrollTop = container.scrollHeight;
}

async function startService() {
  try {
    await saveSettings(false);
    $('#start-service').disabled = true;
    const result = await window.studio.service.start();
    toast(result.message || '服务启动命令已完成', result.started ? 'success' : 'info');
    await refreshSelectedService();
    setTimeout(() => testConnection({ save: false, notify: false }), 1800);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    $('#start-service').disabled = false;
  }
}

async function stopService() {
  try {
    $('#stop-service').disabled = true;
    const result = await window.studio.service.stop();
    toast(result.message || '服务已停止', result.stopped ? 'success' : 'info');
    await refreshSelectedService();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    $('#stop-service').disabled = false;
  }
}

async function openConsole() {
  try {
    await saveSettings(false);
    const result = await window.studio.console.open();
    if (!result.loaded) toast('管理窗口已打开，但当前引擎离线。请先启动服务后重试。', 'error');
  } catch (error) {
    toast(`无法打开管理控制台：${error.message}`, 'error');
  }
}

function bindEvents() {
  $$('.nav-item').forEach((item) => item.addEventListener('click', () => setPage(item.dataset.pageTarget)));
  $$('[data-go]').forEach((item) => item.addEventListener('click', () => setPage(item.dataset.go)));
  $('#quick-test').addEventListener('click', () => testConnection());
  $('#test-connection').addEventListener('click', () => testConnection());
  $('#save-connection').addEventListener('click', () => saveSettings());
  $('#quick-console').addEventListener('click', openConsole);
  $('#open-console').addEventListener('click', openConsole);
  $('#apply-jimeng-preset').addEventListener('click', applyJimengPreset);
  $('#open-jimeng-account-form').addEventListener('click', openJimengAccountForm);
  $('#add-jimeng-account').addEventListener('click', openJimengAccountForm);
  $('#cancel-jimeng-account').addEventListener('click', closeJimengAccountForm);
  $('#save-jimeng-account').addEventListener('click', saveJimengAccount);
  $('#toggle-jimeng-sessionid').addEventListener('click', () => {
    const input = $('#jimeng-sessionid');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggle-jimeng-sessionid').textContent = input.type === 'password' ? '显示' : '隐藏';
  });
  $('#toggle-unified-key').addEventListener('click', () => {
    const input = $('#unified-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggle-unified-key').textContent = input.type === 'password' ? '显示' : '隐藏';
  });
  $('#copy-unified-url').addEventListener('click', async () => {
    await window.studio.clipboard.writeText($('#unified-api-url').textContent.trim());
    toast('统一 Base URL 已复制', 'success');
  });
  $('#copy-unified-key').addEventListener('click', async () => {
    await window.studio.clipboard.writeText($('#unified-api-key').value.trim());
    toast('统一 API Key 已复制，请只提供给可信设备', 'success');
  });
  $('#jimeng-gateway-url').addEventListener('change', async () => {
    await saveSettings(false);
    toast('即梦专用网关地址已保存', 'success');
  });
  $('#toggle-secret').addEventListener('click', () => {
    const input = $('#api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggle-secret').textContent = input.type === 'password' ? '显示' : '隐藏';
  });
  $('#toggle-admin-password').addEventListener('click', () => {
    const input = $('#integrated-admin-password');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggle-admin-password').textContent = input.type === 'password' ? '显示' : '隐藏';
  });
  $('#toggle-cliproxy-key').addEventListener('click', () => {
    const input = $('#cliproxy-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggle-cliproxy-key').textContent = input.type === 'password' ? '显示' : '隐藏';
  });
  $('#toggle-management-key').addEventListener('click', () => {
    const input = $('#cliproxy-management-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggle-management-key').textContent = input.type === 'password' ? '显示' : '隐藏';
  });
  $('#lan-access-enabled').addEventListener('change', async () => {
    try {
      await saveSettings(false);
      await refreshCliProxyInfo();
      toast($('#lan-access-enabled').checked
        ? '局域网访问已选择，点击“保存并启动”让设置生效'
        : '局域网访问已关闭，点击“保存并启动”恢复仅本机监听');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
  $('#copy-lan-url').addEventListener('click', async () => {
    const value = $('#lan-api-url').textContent.trim();
    if (!/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/v1$/.test(value)) return toast('当前没有可复制的局域网地址', 'error');
    await window.studio.clipboard.writeText(value);
    toast('手机 Base URL 已复制', 'success');
  });
  $('#copy-lan-key').addEventListener('click', async () => {
    const value = $('#cliproxy-api-key').value.trim();
    if (!value || value.startsWith('正在')) return toast('API Key 尚未准备好', 'error');
    await window.studio.clipboard.writeText(value);
    toast('API Key 已复制，请只发送给你信任的设备', 'success');
  });
  $$('[data-oauth-provider]').forEach((button) => button.addEventListener('click', () => startOAuth(button.dataset.oauthProvider, button)));
  $$('.preset-tab').forEach((item) => item.addEventListener('click', () => selectPreset(item.dataset.preset)));
  $('#run-play').addEventListener('click', runApiTest);
  $('#cancel-play').addEventListener('click', () => state.apiRequestId && window.studio.gateway.cancel(state.apiRequestId));
  $('#clear-output').addEventListener('click', () => {
    $('#response-output').textContent = '等待下一次请求…';
    $('#response-output').classList.add('empty');
  });
  $$('.image-mode-tab').forEach((tab) => tab.addEventListener('click', () => setImageMode(tab.dataset.imageMode)));
  $('#pick-reference-images').addEventListener('click', pickReferenceImages);
  $('#run-image').addEventListener('click', runImageRequest);
  $('#cancel-image').addEventListener('click', () => state.imageRequestId && window.studio.images.cancel(state.imageRequestId));
  $('#copy-image-api').addEventListener('click', copyImageApiExample);
  $('#copy-image-api-secondary').addEventListener('click', copyImageApiExample);
  $('#clear-image-history').addEventListener('click', clearImageHistory);
  $('#image-prompt').addEventListener('input', () => { updatePromptCount(); updateImageApiExample(); });
  ['#image-model', '#image-size', '#image-quality', '#image-count', '#image-format', '#image-background', '#base-url']
    .forEach((selector) => $(selector).addEventListener('input', updateImageApiExample));
  $('#video-protocol').addEventListener('change', () => setVideoProtocol($('#video-protocol').value));
  $('#video-connection-kind').addEventListener('change', updateVideoApiExample);
  $('#video-reference-mode').addEventListener('change', () => setVideoReferenceMode($('#video-reference-mode').value));
  $('#pick-video-images').addEventListener('click', pickVideoReferences);
  $('#run-video').addEventListener('click', runVideoRequest);
  $('#cancel-video').addEventListener('click', () => state.videoRequestId && window.studio.videos.cancel(state.videoRequestId));
  $('#copy-video-api').addEventListener('click', copyVideoApiExample);
  $('#copy-video-api-secondary').addEventListener('click', copyVideoApiExample);
  $('#open-video-url').addEventListener('click', openVideoResult);
  $('#video-prompt').addEventListener('input', () => { updateVideoPromptCount(); updateVideoApiExample(); });
  ['#video-model', '#video-ratio', '#video-resolution', '#video-duration', '#base-url']
    .forEach((selector) => $(selector).addEventListener('input', updateVideoApiExample));
  $$('[data-select-tool]').forEach((item) => item.addEventListener('click', () => selectTool(item.dataset.selectTool)));
  $('#detect-tools').addEventListener('click', () => detectTools({ notify: true }));
  $('#save-tool-paths').addEventListener('click', async () => { await saveSettings(); await detectTools({ persist: false }); });
  $('#run-tool').addEventListener('click', runTool);
  $('#clear-tool-output').addEventListener('click', () => { $('#tool-output').textContent = '等待运行真实客户端…'; });
  $$('input[name="service-mode"]').forEach((input) => input.addEventListener('change', async () => {
    renderServiceMode();
    renderServiceMetric();
    await saveSettings(false);
    await refreshSelectedService();
  }));
  $$('[data-pick]').forEach((button) => button.addEventListener('click', async () => {
    const value = await window.studio.dialog.pick(button.dataset.pick);
    if (!value) return;
    if (button.dataset.pick === 'compose') $('#compose-file').value = value;
    else if (button.dataset.pick === 'binary') $('#binary-path').value = value;
    else $('#working-directory').value = value;
  }));
  $('#start-service').addEventListener('click', startService);
  $('#stop-service').addEventListener('click', stopService);
  $('#clear-logs').addEventListener('click', () => { $('#service-log').innerHTML = '<p class="log-empty">日志视图已清空。</p>'; });
  $$('[data-doc]').forEach((button) => button.addEventListener('click', () => window.studio.external.open(button.dataset.doc)));
  window.studio.gateway.onChunk(handleApiChunk);
  window.studio.tools.onChunk(handleToolChunk);
  window.studio.service.onLog(appendServiceLog);
  window.studio.oauth.onStatus(handleOAuthStatus);
}

async function init() {
  bindEvents();
  setImageMode('generate');
  updatePromptCount();
  renderReferenceImages();
  setVideoProtocol('videos');
  setVideoReferenceMode('first_last_frames');
  updateVideoPromptCount();
  renderVideoReferenceImages();
  try {
    applySettings(await window.studio.settings.get());
    const logs = await window.studio.service.logs();
    logs.forEach(appendServiceLog);
    if (['cliproxy', 'integrated'].includes(state.settings.service.mode)) {
      await refreshSelectedService();
      await window.studio.service.start();
      await refreshSelectedService();
    }
    await detectTools({ persist: false });
    await testConnection({ save: false, notify: false });
    await refreshImageHistory();
  } catch (error) {
    toast(`初始化失败：${error.message}`, 'error');
  }
}

init();
