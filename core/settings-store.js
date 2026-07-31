const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  connection: {
    baseUrl: 'http://127.0.0.1:8317',
    apiKey: '',
    defaultModel: ''
  },
  service: {
    mode: 'cliproxy',
    composeFile: '',
    binaryPath: '',
    workingDirectory: '',
    binaryArgs: ''
  },
  tools: {
    hermesPath: 'hermes',
    codexPath: 'codex',
    claudePath: 'claude'
  }
});

function mergeSettings(input = {}) {
  return {
    connection: { ...DEFAULTS.connection, ...(input.connection || {}) },
    service: { ...DEFAULTS.service, ...(input.service || {}) },
    tools: { ...DEFAULTS.tools, ...(input.tools || {}) }
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
      return settings;
    } catch {
      return mergeSettings();
    }
  }

  save(input) {
    const settings = mergeSettings(input);
    const persisted = mergeSettings(settings);
    persisted.connection.apiKey = this.encrypt(settings.connection.apiKey);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(persisted, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return settings;
  }
}

module.exports = { DEFAULTS, mergeSettings, SettingsStore };
