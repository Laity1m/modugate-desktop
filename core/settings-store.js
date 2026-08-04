const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeJimengAccount } = require('./jimeng-api');

const DEFAULTS = Object.freeze({
  connection: {
    baseUrl: 'http://127.0.0.1:8317',
    apiKey: '',
    defaultModel: ''
  },
  service: {
    mode: 'cliproxy',
    allowLan: false,
    composeFile: '',
    binaryPath: '',
    workingDirectory: '',
    binaryArgs: ''
  },
  tools: {
    hermesPath: 'hermes',
    codexPath: 'codex',
    claudePath: 'claude'
  },
  images: {
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'auto',
    outputFormat: 'png',
    background: 'auto'
  },
  jimeng: {
    gatewayUrl: 'http://127.0.0.1:8001',
    selectedAccountId: '',
    accounts: []
  },
  agnes: {
    baseUrl: 'https://apihub.agnes-ai.com',
    apiKey: '',
    pollIntervalSeconds: 10,
    timeoutSeconds: 900
  },
  router: {
    enabled: true,
    port: 8787,
    apiKey: ''
  },
  videos: {
    model: 'agnes-video-v2.0',
    connectionKind: 'agnes',
    protocol: 'videos',
    referenceMode: 'first_last_frames',
    ratio: '16:9',
    resolution: '720p',
    duration: 5
  }
});

function mergeSettings(input = {}) {
  const accounts = Array.isArray(input.jimeng?.accounts)
    ? input.jimeng.accounts.map((account) => ({ ...account }))
    : [];
  return {
    connection: { ...DEFAULTS.connection, ...(input.connection || {}) },
    jimeng: { ...DEFAULTS.jimeng, ...(input.jimeng || {}), accounts },
    agnes: { ...DEFAULTS.agnes, ...(input.agnes || {}) },
    router: { ...DEFAULTS.router, ...(input.router || {}) },
    service: { ...DEFAULTS.service, ...(input.service || {}) },
    tools: { ...DEFAULTS.tools, ...(input.tools || {}) },
    images: { ...DEFAULTS.images, ...(input.images || {}) },
    videos: { ...DEFAULTS.videos, ...(input.videos || {}) }
  };
}

class SettingsStore {
  constructor(filePath, safeStorage) {
    this.filePath = filePath;
    this.safeStorage = safeStorage;
  }

  encrypt(value) {
    const plain = String(value || '');
    if (!plain || !this.safeStorage?.isEncryptionAvailable?.()) return plain;
    return `safe:v1:${this.safeStorage.encryptString(plain).toString('base64')}`;
  }

  decrypt(value) {
    const stored = String(value || '');
    if (!stored.startsWith('safe:v1:')) return stored;
    try {
      const buffer = Buffer.from(stored.slice('safe:v1:'.length), 'base64');
      return this.safeStorage.decryptString(buffer);
    } catch {
      return '';
    }
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const settings = mergeSettings(raw);
      settings.connection.apiKey = this.decrypt(settings.connection.apiKey);
      settings.router.apiKey = this.decrypt(settings.router.apiKey);
      settings.agnes.apiKey = this.decrypt(settings.agnes.apiKey);
      settings.jimeng.accounts = settings.jimeng.accounts.map((account) => ({
        ...account,
        sessionId: this.decrypt(account.sessionId)
      }));
      return settings;
    } catch {
      return mergeSettings();
    }
  }

  save(input) {
    const settings = mergeSettings(input);
    if (!settings.router.apiKey) settings.router.apiKey = `mg-${crypto.randomBytes(24).toString('base64url')}`;
    const port = Number.parseInt(settings.router.port, 10);
    settings.router.port = port >= 1024 && port <= 65535 ? port : 8787;
    settings.jimeng.accounts = settings.jimeng.accounts.map(normalizeJimengAccount);
    if (!settings.jimeng.accounts.some((account) => account.id === settings.jimeng.selectedAccountId)) {
      settings.jimeng.selectedAccountId = settings.jimeng.accounts[0]?.id || '';
    }
    const persisted = mergeSettings(settings);
    persisted.connection.apiKey = this.encrypt(settings.connection.apiKey);
    persisted.router.apiKey = this.encrypt(settings.router.apiKey);
    persisted.agnes.apiKey = this.encrypt(settings.agnes.apiKey);
    persisted.jimeng.accounts = settings.jimeng.accounts.map((account) => ({
      ...account,
      sessionId: this.encrypt(account.sessionId)
    }));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(persisted, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return settings;
  }
}

module.exports = { DEFAULTS, mergeSettings, SettingsStore };
