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
  assert.equal(value.jimeng.gatewayUrl, 'http://127.0.0.1:8001');
  assert.deepEqual(value.jimeng.accounts, []);
  assert.equal(value.router.port, 8787);
  assert.equal(value.service.allowLan, false);
  assert.equal(value.tools.codexPath, 'codex');
  assert.equal(value.images.model, 'gpt-image-2');
  assert.equal(value.videos.model, 'jimeng-video-seedance-2.0-fast');
  assert.equal(value.videos.connectionKind, 'jimeng');
  assert.equal(value.videos.protocol, 'videos');
  assert.equal(value.videos.referenceMode, 'first_last_frames');
});

test('mergeSettings preserves the LAN sharing choice', () => {
  const value = mergeSettings({ service: { allowLan: true } });
  assert.equal(value.service.allowLan, true);
});

test('SettingsStore encrypts and decrypts API and Jimeng credentials', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (buffer) => buffer.toString().replace(/^encrypted:/, '')
  };
  const file = path.join(directory, 'settings.json');
  const store = new SettingsStore(file, safeStorage);
  store.save({
    connection: { apiKey: 'sk-secret' },
    jimeng: {
      selectedAccountId: 'account_12345678',
      accounts: [{ id: 'account_12345678', name: '我的即梦', region: 'cn', sessionId: 'session-secret-1234' }]
    }
  });
  const raw = fs.readFileSync(file, 'utf8');
  assert.equal(raw.includes('sk-secret'), false);
  assert.equal(raw.includes('session-secret-1234'), false);
  assert.equal(raw.includes('mg-'), false);
  assert.equal(store.load().connection.apiKey, 'sk-secret');
  assert.equal(store.load().jimeng.accounts[0].sessionId, 'session-secret-1234');
  assert.match(store.load().router.apiKey, /^mg-/);
});

test('splitArguments handles quoted values without invoking a shell', () => {
  assert.deepEqual(splitArguments('--config "C:\\My Config\\config.yaml" --port 8080'), [
    '--config',
    'C:\\My Config\\config.yaml',
    '--port',
    '8080'
  ]);
});
