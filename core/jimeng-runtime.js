const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function isBundledJimengUrl(value) {
  try {
    const url = new URL(String(value || '').includes('://') ? String(value) : `http://${value}`);
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && Number(url.port || 80) === 8001;
  } catch {
    return false;
  }
}

class JimengRuntime {
  constructor({ runtimeRoot, dataRoot, onLog = () => {} }) {
    this.runtimeRoot = runtimeRoot;
    this.dataRoot = dataRoot;
    this.onLog = onLog;
    this.child = null;
  }

  paths() {
    return {
      node: path.join(this.runtimeRoot, 'runtime', 'node.exe'),
      app: path.join(this.runtimeRoot, 'app'),
      entry: path.join(this.runtimeRoot, 'app', 'dist', 'index.js'),
      database: path.join(this.dataRoot, 'jimeng.db')
    };
  }

  async ping() {
    try {
      const response = await fetch('http://127.0.0.1:8001/ping', { signal: AbortSignal.timeout(1_500) });
      return response.ok && /pong/i.test(await response.text());
    } catch {
      return false;
    }
  }

  async start() {
    if (await this.ping()) return { running: true, url: 'http://127.0.0.1:8001', owned: Boolean(this.child) };
    const paths = this.paths();
    [paths.node, paths.entry].forEach((file) => {
      if (!fs.existsSync(file)) throw new Error(`内置即梦运行文件缺失：${path.basename(file)}`);
    });
    fs.mkdirSync(this.dataRoot, { recursive: true });
    const runtimePackage = path.join(this.dataRoot, 'package.json');
    if (!fs.existsSync(runtimePackage)) {
      fs.writeFileSync(runtimePackage, JSON.stringify({ name: 'modugate-jimeng-runtime', version: '1.0.0', type: 'module' }));
    }
    this.child = spawn(paths.node, ['--enable-source-maps', '--no-node-snapshot', paths.entry], {
      cwd: this.dataRoot,
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SERVER_ENV: 'portable',
        SERVER_PORT: '8001',
        SERVER_HOST: '127.0.0.1',
        DB_PATH: paths.database
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child.stdout.on('data', (chunk) => this.onLog(`即梦：${String(chunk).trim()}`, 'info'));
    this.child.stderr.on('data', (chunk) => this.onLog(`即梦：${String(chunk).trim()}`, 'error'));
    this.child.once('exit', (code) => {
      if (this.child) this.onLog(`即梦兼容服务已退出（${code ?? 'unknown'}）`, code ? 'error' : 'info');
      this.child = null;
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (await this.ping()) {
        this.onLog('内置即梦兼容服务已启动：仅监听 127.0.0.1:8001', 'info');
        return { running: true, url: 'http://127.0.0.1:8001', owned: true };
      }
      if (!this.child) break;
    }
    await this.stop();
    throw new Error('内置即梦兼容服务启动失败，请查看服务日志');
  }

  async ensureForUrl(url) {
    if (!isBundledJimengUrl(url)) {
      await this.stop();
      return { running: false, external: true, url };
    }
    return this.start();
  }

  async stop() {
    const child = this.child;
    if (!child) return false;
    this.child = null;
    child.kill();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    return true;
  }
}

module.exports = { isBundledJimengUrl, JimengRuntime };
