const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { runCapture } = require('./process-manager');

const DEFAULT_PORTS = Object.freeze({
  api: 8080,
  postgres: 15432,
  redis: 16379
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function randomSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function isPortOpen(host, port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function requestHealth(url, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.once('error', () => resolve(false));
  });
}

async function waitFor(check, options = {}) {
  const timeoutMs = options.timeoutMs || 30_000;
  const intervalMs = options.intervalMs || 350;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) return true;
    await delay(intervalMs);
  }
  throw new Error(options.message || '等待本地服务启动超时');
}

class IntegratedRuntime {
  constructor(options = {}) {
    this.runtimeRoot = path.resolve(options.runtimeRoot || path.join(__dirname, '..', 'runtime'));
    this.dataRoot = path.resolve(options.dataRoot || path.join(process.cwd(), '.modugate-data'));
    this.safeStorage = options.safeStorage;
    this.onLog = options.onLog || (() => {});
    this.ports = { ...DEFAULT_PORTS, ...(options.ports || {}) };
    this.processes = { postgres: null, redis: null, sub2api: null };
    this.state = 'stopped';
    this.lastError = '';
    this.startPromise = null;
    this.stopping = false;

    this.paths = {
      sub2api: path.join(this.runtimeRoot, 'sub2api', 'sub2api.exe'),
      initdb: path.join(this.runtimeRoot, 'postgresql', 'bin', 'initdb.exe'),
      postgres: path.join(this.runtimeRoot, 'postgresql', 'bin', 'postgres.exe'),
      pgCtl: path.join(this.runtimeRoot, 'postgresql', 'bin', 'pg_ctl.exe'),
      redisServer: path.join(this.runtimeRoot, 'redis', 'redis-server.exe'),
      redisCli: path.join(this.runtimeRoot, 'redis', 'redis-cli.exe'),
      pgData: path.join(this.dataRoot, 'postgresql'),
      redisData: path.join(this.dataRoot, 'redis'),
      sub2apiData: path.join(this.dataRoot, 'sub2api'),
      secrets: path.join(this.dataRoot, 'secrets.json')
    };
  }

  log(message, level = 'info') {
    this.onLog(String(message), level);
  }

  assertRuntime() {
    const required = [
      this.paths.sub2api,
      this.paths.initdb,
      this.paths.postgres,
      this.paths.pgCtl,
      this.paths.redisServer,
      this.paths.redisCli
    ];
    const missing = required.filter((item) => !fs.existsSync(item));
    if (missing.length) throw new Error(`一体化运行组件不完整：${missing.map((item) => path.basename(item)).join('、')}`);
  }

  loadOrCreateSecrets() {
    fs.mkdirSync(this.dataRoot, { recursive: true });
    try {
      const stored = JSON.parse(fs.readFileSync(this.paths.secrets, 'utf8'));
      if (stored.encrypted && this.safeStorage?.isEncryptionAvailable?.()) {
        const plain = this.safeStorage.decryptString(Buffer.from(stored.data, 'base64'));
        return JSON.parse(plain);
      }
      if (!stored.encrypted && stored.data) return stored.data;
    } catch {
      // Create a fresh set only when the file is absent or unreadable.
    }

    const secrets = {
      adminEmail: 'admin@sub2api.local',
      adminPassword: `S2A-${randomSecret(18)}`,
      databasePassword: randomSecret(24),
      redisPassword: randomSecret(24),
      jwtSecret: randomSecret(48),
      totpEncryptionKey: crypto.randomBytes(32).toString('hex')
    };
    const canEncrypt = Boolean(this.safeStorage?.isEncryptionAvailable?.());
    const payload = canEncrypt
      ? { version: 1, encrypted: true, data: this.safeStorage.encryptString(JSON.stringify(secrets)).toString('base64') }
      : { version: 1, encrypted: false, data: secrets };
    fs.writeFileSync(this.paths.secrets, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    this.log('已生成本机专用的数据库、缓存和管理员密码。', 'success');
    return secrets;
  }

  spawnManaged(name, executable, args, options = {}) {
    const child = spawn(executable, args, {
      cwd: options.cwd || path.dirname(executable),
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
      shell: false
    });
    this.processes[name] = child;
    const label = options.label || name;
    child.stdout?.on('data', (chunk) => this.log(`[${label}] ${chunk.toString()}`));
    child.stderr?.on('data', (chunk) => this.log(`[${label}] ${chunk.toString()}`, options.stderrLevel || 'info'));
    child.once('error', (error) => {
      this.lastError = `${label}: ${error.message}`;
      this.log(this.lastError, 'error');
    });
    child.once('close', (code) => {
      if (this.processes[name] === child) this.processes[name] = null;
      if (!this.stopping && code !== 0) {
        this.lastError = `${label} 意外退出，代码 ${code}`;
        this.state = 'error';
        this.log(this.lastError, 'error');
      }
    });
    return child;
  }

  async initializePostgres(secrets) {
    if (fs.existsSync(path.join(this.paths.pgData, 'PG_VERSION'))) return;
    fs.mkdirSync(this.paths.pgData, { recursive: true });
    const passwordFile = path.join(this.dataRoot, `.pg-password-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(passwordFile, `${secrets.databasePassword}\r\n`, { encoding: 'utf8', mode: 0o600 });
    this.log('首次运行：正在初始化内置 PostgreSQL 数据库…');
    try {
      const result = await runCapture(this.paths.initdb, [
        '-D', this.paths.pgData,
        '--username=sub2api',
        `--pwfile=${passwordFile}`,
        '--auth=scram-sha-256',
        '--encoding=UTF8'
      ], { cwd: path.dirname(this.paths.initdb), timeoutMs: 120_000 });
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || 'PostgreSQL 初始化失败');
      this.log('PostgreSQL 数据目录初始化完成。', 'success');
    } finally {
      try { fs.unlinkSync(passwordFile); } catch {}
    }
  }

  async postgresAlreadyRunning() {
    if (!fs.existsSync(path.join(this.paths.pgData, 'PG_VERSION'))) return false;
    const result = await runCapture(this.paths.pgCtl, ['status', '-D', this.paths.pgData], {
      cwd: path.dirname(this.paths.pgCtl),
      timeoutMs: 8_000
    }).catch(() => ({ code: 1 }));
    return result.code === 0;
  }

  async startPostgres(secrets) {
    await this.initializePostgres(secrets);
    if (await this.postgresAlreadyRunning()) {
      this.log('检测到本软件的数据目录已有 PostgreSQL 进程，继续复用。');
      return;
    }
    if (await isPortOpen('127.0.0.1', this.ports.postgres)) {
      throw new Error(`端口 ${this.ports.postgres} 已被其他程序占用，无法启动内置 PostgreSQL`);
    }
    this.log('正在启动内置 PostgreSQL…');
    this.spawnManaged('postgres', this.paths.postgres, [
      '-D', this.paths.pgData,
      '-h', '127.0.0.1',
      '-p', String(this.ports.postgres)
    ], { label: 'PostgreSQL', cwd: path.dirname(this.paths.postgres) });
    await waitFor(() => isPortOpen('127.0.0.1', this.ports.postgres), {
      timeoutMs: 45_000,
      message: 'PostgreSQL 启动超时，请查看服务日志'
    });
    this.log('PostgreSQL 已就绪。', 'success');
  }

  async redisResponds(secrets) {
    const result = await runCapture(this.paths.redisCli, [
      '-h', '127.0.0.1', '-p', String(this.ports.redis), 'PING'
    ], {
      cwd: path.dirname(this.paths.redisCli),
      env: { REDISCLI_AUTH: secrets.redisPassword },
      timeoutMs: 5_000
    }).catch(() => ({ code: 1, stdout: '' }));
    return result.code === 0 && /PONG/i.test(result.stdout);
  }

  async startRedis(secrets) {
    fs.mkdirSync(this.paths.redisData, { recursive: true });
    if (await isPortOpen('127.0.0.1', this.ports.redis)) {
      if (await this.redisResponds(secrets)) {
        this.log('检测到本软件的 Redis 已运行，继续复用。');
        return;
      }
      throw new Error(`端口 ${this.ports.redis} 已被其他程序占用，无法启动内置 Redis`);
    }
    this.log('正在启动内置 Redis…');
    this.spawnManaged('redis', this.paths.redisServer, [
      '--bind', '127.0.0.1',
      '--protected-mode', 'yes',
      '--port', String(this.ports.redis),
      '--requirepass', secrets.redisPassword,
      '--dir', this.paths.redisData,
      '--appendonly', 'yes',
      '--appendfsync', 'everysec',
      '--save', '60', '1'
    ], { label: 'Redis', cwd: path.dirname(this.paths.redisServer), stderrLevel: 'info' });
    await waitFor(() => this.redisResponds(secrets), {
      timeoutMs: 30_000,
      message: 'Redis 启动超时，请查看服务日志'
    });
    this.log('Redis 已就绪。', 'success');
  }

  sub2apiEnvironment(secrets) {
    return {
      DATA_DIR: this.paths.sub2apiData,
      AUTO_SETUP: 'true',
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: String(this.ports.api),
      SERVER_MODE: 'release',
      DATABASE_HOST: '127.0.0.1',
      DATABASE_PORT: String(this.ports.postgres),
      DATABASE_USER: 'sub2api',
      DATABASE_PASSWORD: secrets.databasePassword,
      DATABASE_DBNAME: 'postgres',
      DATABASE_SSLMODE: 'disable',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: String(this.ports.redis),
      REDIS_PASSWORD: secrets.redisPassword,
      REDIS_DB: '0',
      ADMIN_EMAIL: secrets.adminEmail,
      ADMIN_PASSWORD: secrets.adminPassword,
      JWT_SECRET: secrets.jwtSecret,
      TOTP_ENCRYPTION_KEY: secrets.totpEncryptionKey,
      RUN_MODE: 'simple',
      SIMPLE_MODE_CONFIRM: 'true',
      TZ: 'UTC'
    };
  }

  async startSub2api(secrets) {
    fs.mkdirSync(this.paths.sub2apiData, { recursive: true });
    const healthUrl = `http://127.0.0.1:${this.ports.api}/health`;
    if (await requestHealth(healthUrl)) {
      this.log('检测到本机 Sub2API 已可访问，继续复用。');
      return;
    }
    if (await isPortOpen('127.0.0.1', this.ports.api)) {
      throw new Error(`端口 ${this.ports.api} 已被其他程序占用，无法启动 Sub2API`);
    }
    this.log('正在启动 Sub2API；首次建表可能需要几十秒…');
    this.spawnManaged('sub2api', this.paths.sub2api, [], {
      label: 'Sub2API',
      cwd: this.paths.sub2apiData,
      env: this.sub2apiEnvironment(secrets),
      stderrLevel: 'warn'
    });
    await waitFor(() => requestHealth(healthUrl), {
      timeoutMs: 180_000,
      intervalMs: 700,
      message: 'Sub2API 启动超时，请查看服务日志'
    });
    this.log('Sub2API 一体化本地服务已就绪。', 'success');
  }

  async start() {
    if (this.state === 'running' && await requestHealth(`http://127.0.0.1:${this.ports.api}/health`)) {
      return { started: true, mode: 'integrated', alreadyRunning: true, url: this.getCredentials().url };
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
      this.assertRuntime();
      const secrets = this.loadOrCreateSecrets();
      await this.startPostgres(secrets);
      await this.startRedis(secrets);
      await this.startSub2api(secrets);
      this.state = 'running';
      return {
        started: true,
        mode: 'integrated',
        url: `http://127.0.0.1:${this.ports.api}`,
        message: '一体化本地服务已启动'
      };
    } catch (error) {
      this.state = 'error';
      this.lastError = error.message;
      this.log(error.message, 'error');
      await this.stop().catch(() => {});
      this.state = 'error';
      throw error;
    }
  }

  async stop() {
    this.stopping = true;
    this.state = 'stopping';
    const secrets = this.loadOrCreateSecrets();

    const sub2api = this.processes.sub2api;
    if (sub2api && !sub2api.killed) sub2api.kill();
    this.processes.sub2api = null;

    if (await this.redisResponds(secrets)) {
      await runCapture(this.paths.redisCli, [
        '-h', '127.0.0.1', '-p', String(this.ports.redis), 'SHUTDOWN', 'SAVE'
      ], {
        cwd: path.dirname(this.paths.redisCli),
        env: { REDISCLI_AUTH: secrets.redisPassword },
        timeoutMs: 15_000
      }).catch(() => {});
    }
    const redis = this.processes.redis;
    if (redis && !redis.killed) redis.kill();
    this.processes.redis = null;

    if (fs.existsSync(path.join(this.paths.pgData, 'PG_VERSION'))) {
      await runCapture(this.paths.pgCtl, ['stop', '-D', this.paths.pgData, '-m', 'fast', '-w'], {
        cwd: path.dirname(this.paths.pgCtl),
        timeoutMs: 30_000
      }).catch(() => {});
    }
    const postgres = this.processes.postgres;
    if (postgres && !postgres.killed) postgres.kill();
    this.processes.postgres = null;

    this.state = 'stopped';
    this.stopping = false;
    this.log('一体化本地服务已停止。', 'success');
    return { stopped: true, mode: 'integrated' };
  }

  getCredentials() {
    const secrets = this.loadOrCreateSecrets();
    return {
      url: `http://127.0.0.1:${this.ports.api}`,
      adminEmail: secrets.adminEmail,
      adminPassword: secrets.adminPassword
    };
  }

  async getStatus() {
    const healthy = await requestHealth(`http://127.0.0.1:${this.ports.api}/health`);
    if (healthy) this.state = 'running';
    else if (this.state === 'running') this.state = 'stopped';
    return {
      mode: 'integrated',
      state: this.state,
      healthy,
      lastError: this.lastError,
      ports: { ...this.ports }
    };
  }

  async dispose() {
    if (this.state === 'stopped' && !Object.values(this.processes).some(Boolean)) return;
    await this.stop().catch(() => {});
  }
}

module.exports = {
  DEFAULT_PORTS,
  IntegratedRuntime,
  isPortOpen,
  randomSecret,
  requestHealth,
  waitFor
};
