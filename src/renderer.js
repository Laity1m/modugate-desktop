const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const pageMeta = {
  dashboard: ['WORKSPACE OVERVIEW', '运行概览'],
  connection: ['GATEWAY CONNECTION', '网关连接'],
  playground: ['PROTOCOL PLAYGROUND', '协议测试台'],
  images: ['IMAGE WORKSHOP', '图片工坊'],
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
    }
  };
}

function applySettings(settings) {
  state.settings = settings;
  $('#base-url').value = settings.connection.baseUrl || '';
  $('#api-key').value = settings.connection.apiKey || '';
  $('#default-model').value = settings.connection.defaultModel || '';
  $('#play-model').value = settings.connection.defaultModel || '';
  $('#tool-model').value = settings.connection.defaultModel || '';
  $('#image-model').value = settings.images?.model || 'gpt-image-2';
  $('#image-size').value = settings.images?.size || '1024x1024';
  $('#image-quality').value = settings.images?.quality || 'auto';
  $('#image-format').value = settings.images?.outputFormat || 'png';
  $('#image-background').value = settings.images?.background || 'auto';
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
