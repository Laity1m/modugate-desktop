const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { CliProxyRuntime } = require('../core/cliproxy-runtime');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers, timeout: 5_000 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('timeout', () => request.destroy(new Error('HTTP request timed out')));
    request.once('error', reject);
  });
}

async function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sub2api-cliproxy-e2e-'));
  const runtime = new CliProxyRuntime({
    runtimeRoot: process.env.CLIPROXY_E2E_RUNTIME_ROOT || path.join(__dirname, '..', 'runtime', 'cliproxy'),
    dataRoot,
    port: 28317,
    onLog: (message, level) => process.stdout.write(`[${level}] ${String(message).trim()}\n`)
  });
  let passed = false;
  try {
    const started = await runtime.start();
    const credentials = runtime.getCredentials();
    const models = await get(`${started.url}/v1/models`, { Authorization: `Bearer ${credentials.apiKey}` });
    const consolePage = await get(`${started.url}/management.html?safe-mode=configure`);
    const oauth = await runtime.beginOAuth('codex');
    if (!/^https:\/\//.test(oauth.url) || !oauth.state) throw new Error('Codex OAuth did not return a valid login URL');
    await runtime.managementRequest(`oauth-session?state=${encodeURIComponent(oauth.state)}`, { method: 'DELETE' });
    const accounts = await runtime.getAccounts();
    const status = await runtime.getStatus();
    if (!status.healthy || models.status !== 200 || consolePage.status >= 500 || !Array.isArray(accounts)) {
      throw new Error(`Unexpected result: models=${models.status}, console=${consolePage.status}, healthy=${status.healthy}`);
    }
    JSON.parse(models.body);
    process.stdout.write(`E2E_OK models=${models.status} console=${consolePage.status} oauth=codex accounts=${accounts.length}\n`);
    passed = true;
  } finally {
    await runtime.stop().catch(() => {});
    if (passed && path.basename(dataRoot).startsWith('sub2api-cliproxy-e2e-')) {
      fs.rmSync(dataRoot, { recursive: true, force: true });
    } else if (!passed) {
      process.stderr.write(`E2E data retained at ${dataRoot}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
