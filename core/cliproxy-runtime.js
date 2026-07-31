const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { isPortOpen, randomSecret, waitFor } = require('./integrated-runtime');

const OAUTH_PROVIDERS = Object.freeze({
  claude: { label: 'Claude Code', endpoint: 'anthropic-auth-url' },
  codex: { label: 'ChatGPT / Codex', endpoint: 'codex-auth-url' },
  google: { label: 'Google / Gemini', endpoint: 'antigravity-auth-url' },
  kimi: { label: 'Kimi', endpoint: 'kimi-auth-url' },
  xai: { label: 'xAI / Grok', endpoint: 'xai-auth-url' }
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(target, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeoutMs || 5_000
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        resolve({ status: response.statusCode || 0, data, text });
      });
    });
    req.once('timeout', () => req.destroy(new Error('本地服务请求超时')));
    req.once('error', reject);
    if (options.body != null) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

function yamlQuote(value) {
  return JSON.stringify(String(value).replace(/\\/g, '/'));
}

class CliProxyRuntime {
  constructor(options = {}) {
    this.runtimeRoot = path.resolve(options.runtimeRoot || path.join(__dirname, '..', 'runtime', 'cliproxy'));
    this.dataRoot = path.resolve(options.dataRoot || path.join(process.cwd(), '.cliproxy-data'));
    this.safeStorage = options.safeStorage;
    this.onLog = options.onLog || (() => {});
    this.port = Number(options.port || 8317);
    this.binaryPath = path.join(this.runtimeRoot, 'cli-proxy-api.exe');
    this.configPath = path.join(this.dataRoot, 'config.yaml');
    this.authDir = path.join(this.dataRoot, 'auth');
    this.staticDir = path.join(this.dataRoot, 'static');
    this.bundledPanelPath = path.join(this.runtimeRoot, 'management.html');
    this.secretsPath = path.join(this.dataRoot, 'studio-secrets.json');
    this.child = null;
    this.startPromise = null;
    this.state = 'stopped';
    this.lastError = '';
    this.stopping = false;
  }

  log(message, level = 'info') {
    this.onLog(String(message).replace(/\s+$/, ''), level);
  }

  loadOrCreateSecrets() {
    fs.mkdirSync(this.dataRoot, { recursive: true });
    try {
      const stored = JSON.parse(fs.readFileSync(this.secretsPath, 'utf8'));
      if (stored.encrypted && this.safeStorage?.isEncryptionAvailable?.()) {
        return JSON.parse(this.safeStorage.decryptString(Buffer.from(stored.data, 'base64')));
      }
      if (!stored.encrypted && stored.data) return stored.data;
    } catch {
      // Generate a new local-only API and management key below.
    }
    const secrets = {
      apiKey: `sk-local-${randomSecret(24)}`,
      managementKey: `mgmt-${randomSecret(32)}`
    };
    const canEncrypt = Boolean(this.safeStorage?.isEncryptionAvailable?.());
    const payload = canEncrypt
      ? { version: 1, encrypted: true, data: this.safeStorage.encryptString(JSON.stringify(secrets)).toString('base64') }
      : { version: 1, encrypted: false, data: secrets };
    fs.writeFileSync(this.secretsPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    this.log('已生成 CLIProxyAPI 本机访问密钥。', 'success');
    return secrets;
  }

  writeConfig(secrets) {
    fs.mkdirSync(this.authDir, { recursive: true });
    const content = [
      'host: "127.0.0.1"',
      `port: ${this.port}`,
      'tls:',
      '  enable: false',
      '  cert: ""',
      '  key: ""',
      'remote-management:',
      '  allow-remote: false',
      `  secret-key: ${yamlQuote(secrets.managementKey)}`,
      '  disable-control-panel: false',
      '  disable-auto-update-panel: true',
      `auth-dir: ${yamlQuote(this.authDir)}`,
      'api-keys:',
      `  - ${yamlQuote(secrets.apiKey)}`,
      'debug: false',
      'logging-to-file: true',
      'logs-max-total-size-mb: 100',
      'error-logs-max-files: 10',
      'usage-statistics-enabled: true',
      'request-retry: 3',
      'max-retry-interval: 30',
      'routing:',
      '  strategy: "round-robin"',
      'ws-auth: true',
      ''
    ].join('\n');
    fs.writeFileSync(this.configPath, content, { encoding: 'utf8', mode: 0o600 });
  }

  prepareManagementPanel() {
    if (!fs.existsSync(this.bundledPanelPath)) return;
    fs.mkdirSync(this.staticDir, { recursive: true });
    const target = path.join(this.staticDir, 'management.html');
    const sourceSize = fs.statSync(this.bundledPanelPath).size;
    const targetSize = fs.existsSync(target) ? fs.statSync(target).size : -1;
    if (sourceSize !== targetSize) fs.copyFileSync(this.bundledPanelPath, target);
  }

  managementHeaders() {
    const secrets = this.loadOrCreateSecrets();
    return { Authorization: `Bearer ${secrets.managementKey}` };
  }

  async managementRequest(endpoint, options = {}) {
    const result = await request(`http://127.0.0.1:${this.port}/v0/management/${endpoint}`, {
      ...options,
      headers: {
        ...this.managementHeaders(),
        ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    if (result.status >= 400) throw new Error(`CLIProxyAPI 管理接口 HTTP ${result.status}: ${result.text}`);
    return result.data;
  }

  async isHealthy() {
    try {
      const secrets = this.loadOrCreateSecrets();
      const result = await request(`http://127.0.0.1:${this.port}/v1/models`, {
        headers: { Authorization: `Bearer ${secrets.apiKey}` },
        timeoutMs: 2_000
      });
      return result.status === 200;
    } catch {
      return false;
    }
  }

  async isManagedInstance() {
    try {
      const result = await this.managementRequest('auth-files');
      return Boolean(result && Array.isArray(result.files));
    } catch {
      return false;
    }
  }

  async start() {
    if (await this.isHealthy()) {
      this.state = 'running';
      return { started: true, mode: 'cliproxy', alreadyRunning: true, message: 'CLIProxyAPI 已在运行' };
    }
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async startInternal() {
    this.state = 'starting';
    this.lastError = '';
    this.stopping = false;
    try {
      if (!fs.existsSync(this.binaryPath)) throw new Error('CLIProxyAPI 运行组件不完整');
      const secrets = this.loadOrCreateSecrets();
      this.writeConfig(secrets);
      this.prepareManagementPanel();
      if (await isPortOpen('127.0.0.1', this.port)) {
        if (await this.isManagedInstance()) {
          this.state = 'running';
          return { started: true, mode: 'cliproxy', alreadyRunning: true, message: 'CLIProxyAPI 已在运行' };
        }
        throw new Error(`端口 ${this.port} 已被其他程序占用`);
      }
      this.log(`正在启动 CLIProxyAPI 轻量引擎（127.0.0.1:${this.port}）…`);
      const child = spawn(this.binaryPath, ['-config', this.configPath], {
        cwd: this.dataRoot,
        env: { ...process.env, MANAGEMENT_STATIC_PATH: this.staticDir },
        windowsHide: true,
        shell: false
      });
      this.child = child;
      child.stdout?.on('data', (chunk) => this.log(`[CLIProxyAPI] ${chunk.toString()}`));
      child.stderr?.on('data', (chunk) => this.log(`[CLIProxyAPI] ${chunk.toString()}`, 'warn'));
      child.once('error', (error) => {
        this.lastError = error.message;
        this.state = 'error';
        this.log(error.message, 'error');
      });
      child.once('close', (code) => {
        if (this.child === child) this.child = null;
        if (!this.stopping && code !== 0) {
          this.lastError = `CLIProxyAPI 意外退出，代码 ${code}`;
          this.state = 'error';
          this.log(this.lastError, 'error');
        }
      });
      await waitFor(() => this.isHealthy(), {
        timeoutMs: 45_000,
        intervalMs: 500,
        message: 'CLIProxyAPI 启动超时，请查看服务日志'
      });
      this.state = 'running';
      this.log('CLIProxyAPI 轻量引擎已就绪。', 'success');
      return {
        started: true,
        mode: 'cliproxy',
        url: `http://127.0.0.1:${this.port}`,
        message: 'CLIProxyAPI 轻量引擎已启动'
      };
    } catch (error) {
      this.state = 'error';
      this.lastError = error.message;
      this.log(error.message, 'error');
      throw error;
    }
  }

  async stop() {
    this.stopping = true;
    if (this.child && !this.child.killed) this.child.kill();
    this.child = null;
    await waitFor(async () => !(await isPortOpen('127.0.0.1', this.port)), {
      timeoutMs: 8_000,
      intervalMs: 250,
      message: 'CLIProxyAPI 停止超时'
    }).catch(() => {});
    this.state = 'stopped';
    this.stopping = false;
    this.log('CLIProxyAPI 轻量引擎已停止。', 'success');
    return { stopped: true, mode: 'cliproxy' };
  }

  getCredentials() {
    const secrets = this.loadOrCreateSecrets();
    const root = `http://127.0.0.1:${this.port}`;
    return {
      url: root,
      apiKey: secrets.apiKey,
      managementKey: secrets.managementKey,
      consoleUrl: `${root}/management.html?safe-mode=configure`
    };
  }

  async getAccounts() {
    if (!(await this.isHealthy())) return [];
    const result = await this.managementRequest('auth-files');
    return Array.isArray(result?.files) ? result.files.map((item) => ({
      name: item.name || '',
      provider: item.provider || item.type || 'unknown',
      email: item.email || '',
      disabled: Boolean(item.disabled),
      status: item.status || ''
    })) : [];
  }

  async beginOAuth(provider) {
    const metadata = OAUTH_PROVIDERS[provider];
    if (!metadata) throw new Error('不支持的 OAuth 服务商');
    await this.start();
    const result = await this.managementRequest(`${metadata.endpoint}?is_webui=true`);
    if (!result?.url || !result?.state) throw new Error(`${metadata.label} 未返回有效的登录地址`);
    return {
      provider,
      label: metadata.label,
      url: result.url,
      state: result.state,
      userCode: result.user_code || '',
      expiresIn: Number(result.expires_in || 0),
      flow: result.flow || ''
    };
  }

  async pollOAuth(session) {
    const timeoutSeconds = session.expiresIn > 0 ? session.expiresIn : 300;
    const deadline = Date.now() + Math.min(timeoutSeconds, 1_800) * 1000;
    while (Date.now() < deadline) {
      await delay(2_000);
      const result = await this.managementRequest(`get-auth-status?state=${encodeURIComponent(session.state)}`);
      if (result?.status === 'ok') {
        this.log(`${session.label} OAuth 登录成功。`, 'success');
        return { ok: true, provider: session.provider, label: session.label };
      }
      if (result?.status === 'error') throw new Error(result.error || `${session.label} 登录失败`);
    }
    throw new Error(`${session.label} 登录等待超时`);
  }

  async getStatus() {
    const healthy = await this.isHealthy();
    if (healthy) this.state = 'running';
    else if (this.state === 'running') this.state = 'stopped';
    return {
      mode: 'cliproxy',
      state: this.state,
      healthy,
      lastError: this.lastError,
      port: this.port,
      accountCount: healthy ? (await this.getAccounts().catch(() => [])).length : 0
    };
  }

  async dispose() {
    if (this.state === 'stopped' && !this.child) return;
    await this.stop().catch(() => {});
  }
}

module.exports = { CliProxyRuntime, OAUTH_PROVIDERS, request, yamlQuote };
