const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mergeSettings, SettingsStore } = require('../core/settings-store');
const { splitArguments } = require('../core/process-manager');

test('mergeSettings preserves defaults for partial input', () => {
  const value = mergeSettings({ connection: { baseUrl: 'https://example.com' } });
  assert.equal(value.connection.baseUrl, 'https://example.com');
  assert.equal(value.service.mode, 'cliproxy');
  assert.equal(value.tools.codexPath, 'codex');
});

test('SettingsStore encrypts and decrypts the API key', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (buffer) => buffer.toString().replace(/^encrypted:/, '')
  };
  const file = path.join(directory, 'settings.json');
  const store = new SettingsStore(file, safeStorage);
  store.save({ connection: { apiKey: 'sk-secret' } });
  assert.equal(fs.readFileSync(file, 'utf8').includes('sk-secret'), false);
  assert.equal(store.load().connection.apiKey, 'sk-secret');
});

test('splitArguments handles quoted values without invoking a shell', () => {
  assert.deepEqual(splitArguments('--config "C:\\My Config\\config.yaml" --port 8080'), [
    '--config',
    'C:\\My Config\\config.yaml',
    '--port',
    '8080'
  ]);
});
