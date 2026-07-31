const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const pageMeta = {
  dashboard: ['WORKSPACE OVERVIEW', '运行概览'],
  connection: ['GATEWAY CONNECTION', '网关连接'],
  playground: ['PROTOCOL PLAYGROUND', '协议测试台'],
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
  toolRequestId: null,
  toolStatus: {}
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
      composeFile: $('#compose-file').value.trim(),
      binaryPath: $('#binary-path').value.trim(),
      workingDirectory: $('#working-directory').value.trim(),
      binaryArgs: $('#binary-args').value.trim()
    },
    tools: {
      hermesPath: $('#hermes-path').value.trim() || 'hermes',
      codexPath: $('#codex-path').value.trim() || 'codex',
      claudePath: $('#claude-path').value.trim() || 'claude'
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
  $('#top-endpoint').textContent = settings.connection.baseUrl || '未配置';
  $('#compose-file').value = settings.service.composeFile || '';
  $('#binary-path').value = settings.service.binaryPath || '';
  $('#working-directory').value = settings.service.workingDirectory || '';
  $('#binary-args').value = settings.service.binaryArgs || '';
  const selectedMode = settings.service.mode || 'cliproxy';
  const selectedRadio = $(`input[name="service-mode"][value="${selectedMode}"]`)
    || $('input[name="service-mode"][value="cliproxy"]');
  selectedRadio.checked = true;
  $('#hermes-path').value = settings.tools.hermesPath || 'hermes';
  $('#codex-path').value = settings.tools.codexPath || 'codex';
  $('#claude-path').value = settings.tools.claudePath || 'claude';
  renderServiceMode();
  renderServiceMetric();
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
  $('#metric-models').textContent = String(state.models.length);
  if (!$('#default-model').value && state.models[0]) {
    $('#default-model').value = state.models[0];
    $('#play-model').value = state.models[0];
    $('#tool-model').value = state.models[0];
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
  $$('[data-oauth-provider]').forEach((button) => button.addEventListener('click', () => startOAuth(button.dataset.oauthProvider, button)));
  $$('.preset-tab').forEach((item) => item.addEventListener('click', () => selectPreset(item.dataset.preset)));
  $('#run-play').addEventListener('click', runApiTest);
  $('#cancel-play').addEventListener('click', () => state.apiRequestId && window.studio.gateway.cancel(state.apiRequestId));
  $('#clear-output').addEventListener('click', () => {
    $('#response-output').textContent = '等待下一次请求…';
    $('#response-output').classList.add('empty');
  });
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
  } catch (error) {
    toast(`初始化失败：${error.message}`, 'error');
  }
}

init();
