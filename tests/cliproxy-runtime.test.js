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

test('CLIProxy runtime can expose only the API on the local network', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-lan-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const runtime = new CliProxyRuntime({
    dataRoot: directory,
    port: 28318,
    allowLan: true,
    lanAddressResolver: () => ['192.168.1.107']
  });
  const credentials = runtime.getCredentials();
  const secrets = runtime.loadOrCreateSecrets();
  runtime.writeConfig(secrets);
  const config = fs.readFileSync(path.join(directory, 'config.yaml'), 'utf8');

  assert.equal(credentials.url, 'http://127.0.0.1:28318');
  assert.equal(credentials.lanUrl, 'http://192.168.1.107:28318');
  assert.equal(credentials.lanApiUrl, 'http://192.168.1.107:28318/v1');
  assert.match(config, /^host: "0\.0\.0\.0"$/m);
  assert.match(config, /^  allow-remote: false$/m);
});

test('CLIProxy runtime can select, disable, and delete OAuth accounts', async () => {
  const runtime = new CliProxyRuntime({ dataRoot: path.join(os.tmpdir(), 'modugate-account-actions'), port: 28319 });
  const accounts = [
    { name: 'codex-a.json', provider: 'codex', email: 'a@example.com', disabled: false },
    { name: 'codex-b.json', provider: 'codex', email: 'b@example.com', disabled: false },
    { name: 'claude-a.json', provider: 'claude', email: 'c@example.com', disabled: false }
  ];
  const requests = [];
  runtime.isHealthy = async () => true;
  runtime.managementRequest = async (endpoint, options = {}) => {
    requests.push({ endpoint, ...options });
    if (endpoint === 'auth-files' && !options.method) return { files: accounts };
    return { status: 'ok' };
  };

  await runtime.selectAccount('codex-b.json');
  assert.deepEqual(requests.slice(1, 3).map((item) => item.body), [
    { name: 'codex-b.json', disabled: false },
    { name: 'codex-a.json', disabled: true }
  ]);
  await runtime.setAccountDisabled('codex-b.json', true);
  assert.deepEqual(requests.at(-1).body, { name: 'codex-b.json', disabled: true });
  await runtime.deleteAccount('codex-a.json');
  assert.equal(requests.at(-1).method, 'DELETE');
  assert.deepEqual(requests.at(-1).body, { names: ['codex-a.json'] });
});
