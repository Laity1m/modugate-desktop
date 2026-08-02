const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeGatewayUrl } = require('./api-client');

function splitArguments(value) {
  const input = String(value || '').trim();
  if (!input) return [];
  const result = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) result.push(current);
  return result;
}

function runCapture(executable, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(executable, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
      shell: false
    });

    const timer = options.timeoutMs ? setTimeout(() => {
      if (!settled) {
        child.kill();
        reject(new Error(`命令运行超过 ${Math.round(options.timeoutMs / 1000)} 秒，已停止`));
      }
    }, options.timeoutMs) : null;

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onData?.({ stream: 'stdout', text });
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onData?.({ stream: 'stderr', text });
    });
    child.on('error', (error) => {
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    options.onSpawn?.(child);
  });
}

async function resolveCommand(command) {
  const value = String(command || '').trim();
  if (!value) return null;
  if (path.isAbsolute(value) || value.includes('/') || value.includes('\\')) {
    return fs.existsSync(value) ? path.resolve(value) : null;
  }

  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const result = await runCapture(locator, [value], { timeoutMs: 5_000 });
    if (result.code !== 0) return null;
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

class ProcessManager {
  constructor(onLog = () => {}, integratedRuntime = null, cliProxyRuntime = null) {
    this.onLog = onLog;
    this.integratedRuntime = integratedRuntime;
    this.cliProxyRuntime = cliProxyRuntime;
    this.serviceChild = null;
    this.toolChildren = new Map();
    this.logs = [];
  }

  log(message, level = 'info') {
    const entry = { at: new Date().toISOString(), level, message: String(message).replace(/\s+$/, '') };
    if (!entry.message) return;
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs.shift();
    this.onLog(entry);
  }

  getLogs() {
    return this.logs.slice();
  }

  async detectTools(settings) {
    const requested = {
      hermes: settings.tools?.hermesPath || 'hermes',
      codex: settings.tools?.codexPath || 'codex',
      claude: settings.tools?.claudePath || 'claude'
    };
    const entries = await Promise.all(Object.entries(requested).map(async ([name, command]) => {
      const resolved = await resolveCommand(command);
      return [name, { installed: Boolean(resolved), command, resolved }];
    }));
    return Object.fromEntries(entries);
  }

  async startService(service) {
    if (service.mode === 'cliproxy') {
      if (!this.cliProxyRuntime) throw new Error('CLIProxyAPI 轻量运行组件尚未初始化');
      this.cliProxyRuntime.setLanAccess(Boolean(service.allowLan));
      if (await this.cliProxyRuntime.isHealthy()
        && this.cliProxyRuntime.activeAllowLan !== null
        && this.cliProxyRuntime.activeAllowLan !== this.cliProxyRuntime.allowLan) {
        this.log('局域网访问设置已改变，正在安全重启轻量引擎…');
        await this.cliProxyRuntime.stop();
      }
      return this.cliProxyRuntime.start();
    }

    if (service.mode === 'integrated') {
      if (!this.integratedRuntime) throw new Error('一体化运行组件尚未初始化');
      return this.integratedRuntime.start();
    }

    if (service.mode === 'external') {
      this.log('外部服务模式：请确保 Sub2API 已在指定地址运行。');
      return { started: false, mode: 'external', message: '外部服务模式无需启动' };
    }

    if (service.mode === 'docker') {
      if (!service.composeFile || !fs.existsSync(service.composeFile)) throw new Error('请选择有效的 docker-compose.yml');
      const docker = await resolveCommand('docker');
      if (!docker) throw new Error('未检测到 Docker，请先安装并启动 Docker Desktop');
      this.log(`启动 Docker Compose：${service.composeFile}`);
      const result = await runCapture(docker, ['compose', '-f', service.composeFile, 'up', '-d'], {
        cwd: path.dirname(service.composeFile),
        timeoutMs: 120_000,
        onData: ({ text }) => this.log(text)
      });
      if (result.code !== 0) throw new Error(result.stderr || 'Docker Compose 启动失败');
      this.log('Docker Compose 服务已启动', 'success');
      return { started: true, mode: 'docker' };
    }

    if (!service.binaryPath || !fs.existsSync(service.binaryPath)) throw new Error('请选择有效的 Sub2API 可执行文件');
    if (this.serviceChild && !this.serviceChild.killed) return { started: true, mode: 'binary', alreadyRunning: true };
    const cwd = service.workingDirectory && fs.existsSync(service.workingDirectory)
      ? service.workingDirectory
      : path.dirname(service.binaryPath);
    const args = splitArguments(service.binaryArgs);
    this.log(`启动本地进程：${service.binaryPath} ${args.join(' ')}`);
    const child = spawn(service.binaryPath, args, {
      cwd,
      env: process.env,
      windowsHide: true,
      shell: false
    });
    this.serviceChild = child;
    child.stdout?.on('data', (chunk) => this.log(chunk.toString()));
    child.stderr?.on('data', (chunk) => this.log(chunk.toString(), 'warn'));
    child.on('error', (error) => this.log(error.message, 'error'));
    child.on('close', (code) => {
      this.log(`Sub2API 本地进程已退出，代码 ${code}`, code === 0 ? 'info' : 'warn');
      this.serviceChild = null;
    });
    return { started: true, mode: 'binary', pid: child.pid };
  }

  async stopService(service) {
    if (service.mode === 'cliproxy') {
      if (!this.cliProxyRuntime) throw new Error('CLIProxyAPI 轻量运行组件尚未初始化');
      return this.cliProxyRuntime.stop();
    }

    if (service.mode === 'integrated') {
      if (!this.integratedRuntime) throw new Error('一体化运行组件尚未初始化');
      return this.integratedRuntime.stop();
    }

    if (service.mode === 'docker') {
      if (!service.composeFile || !fs.existsSync(service.composeFile)) throw new Error('请选择有效的 docker-compose.yml');
      const docker = await resolveCommand('docker');
      if (!docker) throw new Error('未检测到 Docker');
      this.log('正在停止 Docker Compose 服务…');
      const result = await runCapture(docker, ['compose', '-f', service.composeFile, 'stop'], {
        cwd: path.dirname(service.composeFile),
        timeoutMs: 90_000,
        onData: ({ text }) => this.log(text)
      });
      if (result.code !== 0) throw new Error(result.stderr || 'Docker Compose 停止失败');
      this.log('Docker Compose 服务已停止', 'success');
      return { stopped: true };
    }

    if (this.serviceChild && !this.serviceChild.killed) {
      const pid = this.serviceChild.pid;
      this.serviceChild.kill();
      this.serviceChild = null;
      this.log(`已停止由本软件启动的本地进程 ${pid}`, 'success');
      return { stopped: true, pid };
    }
    return { stopped: false, message: '没有由本软件启动的本地进程' };
  }

  async runTool({ requestId, preset, prompt, model, settings, onData }) {
    const detected = await this.detectTools(settings);
    const item = detected[preset];
    if (!item?.installed) throw new Error(`未找到 ${preset} 命令，请在“客户端实验室”中配置路径`);
    const { root, apiBase } = normalizeGatewayUrl(settings.connection.baseUrl);
    const key = settings.connection.apiKey || '';
    const env = {
      OPENAI_API_KEY: key,
      OPENAI_BASE_URL: apiBase,
      ANTHROPIC_API_KEY: key,
      ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_BASE_URL: root
    };
    const query = String(prompt || '').trim();
    if (!query) throw new Error('请输入测试内容');
    const selectedModel = String(model || settings.connection.defaultModel || '').trim();
    let args;
    if (preset === 'codex') {
      args = ['exec', '--skip-git-repo-check', '--color', 'never'];
      if (selectedModel) args.push('--model', selectedModel);
      args.push(query);
    } else if (preset === 'claude') {
      args = ['-p', query, '--output-format', 'text'];
      if (selectedModel) args.push('--model', selectedModel);
    } else {
      args = ['chat', '--provider', 'openai-api', '-q', query];
      if (selectedModel) args.push('--model', selectedModel);
    }

    const cwd = settings.service.workingDirectory && fs.existsSync(settings.service.workingDirectory)
      ? settings.service.workingDirectory
      : process.cwd();
    this.log(`运行 ${preset} 客户端测试`);
    const result = await runCapture(item.resolved, args, {
      cwd,
      env,
      timeoutMs: 300_000,
      onData,
      onSpawn: (child) => this.toolChildren.set(requestId, child)
    });
    this.toolChildren.delete(requestId);
    return result;
  }

  cancelTool(requestId) {
    const child = this.toolChildren.get(requestId);
    if (!child) return false;
    child.kill();
    this.toolChildren.delete(requestId);
    return true;
  }

  async getServiceStatus(service) {
    if (service.mode === 'cliproxy' && this.cliProxyRuntime) {
      this.cliProxyRuntime.setLanAccess(Boolean(service.allowLan));
      return this.cliProxyRuntime.getStatus();
    }
    if (service.mode === 'integrated' && this.integratedRuntime) return this.integratedRuntime.getStatus();
    return { mode: service.mode, state: 'unknown', healthy: false, lastError: '' };
  }

  getServiceCredentials(service) {
    if (service.mode === 'cliproxy' && this.cliProxyRuntime) {
      this.cliProxyRuntime.setLanAccess(Boolean(service.allowLan));
      return this.cliProxyRuntime.getCredentials();
    }
    if (service.mode === 'integrated' && this.integratedRuntime) return this.integratedRuntime.getCredentials();
    return null;
  }

  async getServiceAccounts(service) {
    if (service.mode !== 'cliproxy' || !this.cliProxyRuntime) return [];
    return this.cliProxyRuntime.getAccounts();
  }

  async beginOAuth(service, provider) {
    if (service.mode !== 'cliproxy' || !this.cliProxyRuntime) {
      throw new Error('请先选择“轻量 OAuth”服务模式');
    }
    return this.cliProxyRuntime.beginOAuth(provider);
  }

  async pollOAuth(session) {
    if (!this.cliProxyRuntime) throw new Error('CLIProxyAPI 轻量运行组件尚未初始化');
    return this.cliProxyRuntime.pollOAuth(session);
  }

  async dispose() {
    if (this.cliProxyRuntime) await this.cliProxyRuntime.dispose();
    if (this.integratedRuntime) await this.integratedRuntime.dispose();
    if (this.serviceChild && !this.serviceChild.killed) this.serviceChild.kill();
    for (const child of this.toolChildren.values()) child.kill();
    this.toolChildren.clear();
  }
}

module.exports = { splitArguments, runCapture, resolveCommand, ProcessManager };
