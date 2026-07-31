const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CliProxyRuntime, OAUTH_PROVIDERS, yamlQuote } = require('../core/cliproxy-runtime');

test('CLIProxy runtime creates stable encrypted keys and a local-only config', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sub2api-cliproxy-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`protected:${value}`),
    decryptString: (buffer) => buffer.toString().replace(/^protected:/, '')
  };
  const runtime = new CliProxyRuntime({ dataRoot: directory, safeStorage, port: 28317 });
  const first = runtime.getCredentials();
  const second = runtime.getCredentials();
  const secrets = runtime.loadOrCreateSecrets();
  runtime.writeConfig(secrets);
  const stored = fs.readFileSync(path.join(directory, 'studio-secrets.json'), 'utf8');
  const config = fs.readFileSync(path.join(directory, 'config.yaml'), 'utf8');

  assert.deepEqual(second, first);
  assert.equal(first.url, 'http://127.0.0.1:28317');
  assert.match(first.apiKey, /^sk-local-/);
  assert.equal(stored.includes(first.apiKey), false);
  assert.match(config, /^host: "127\.0\.0\.1"/m);
  assert.match(config, /^port: 28317$/m);
  assert.match(config, /^  allow-remote: false$/m);
  assert.match(config, new RegExp(yamlQuote(first.apiKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('CLIProxy runtime exposes supported OAuth providers', () => {
  assert.deepEqual(Object.keys(OAUTH_PROVIDERS).sort(), ['claude', 'codex', 'google', 'kimi', 'xai']);
  assert.equal(OAUTH_PROVIDERS.codex.endpoint, 'codex-auth-url');
});
