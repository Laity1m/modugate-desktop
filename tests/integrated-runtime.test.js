const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IntegratedRuntime, randomSecret } = require('../core/integrated-runtime');

test('integrated runtime creates stable encrypted local credentials', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sub2api-integrated-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`protected:${value}`),
    decryptString: (buffer) => buffer.toString().replace(/^protected:/, '')
  };
  const runtime = new IntegratedRuntime({
    runtimeRoot: path.join(__dirname, '..', 'runtime'),
    dataRoot: directory,
    safeStorage
  });
  const first = runtime.getCredentials();
  const second = runtime.getCredentials();
  const stored = fs.readFileSync(path.join(directory, 'secrets.json'), 'utf8');

  assert.deepEqual(second, first);
  assert.equal(first.url, 'http://127.0.0.1:8080');
  assert.equal(first.adminEmail, 'admin@sub2api.local');
  assert.ok(first.adminPassword.length >= 20);
  assert.equal(stored.includes(first.adminPassword), false);
});

test('randomSecret returns URL-safe non-repeating values', () => {
  const first = randomSecret();
  const second = randomSecret();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
});
