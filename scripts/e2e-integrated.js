const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { IntegratedRuntime } = require('../core/integrated-runtime');

function getStatus(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 5_000 }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.once('timeout', () => request.destroy(new Error('HTTP request timed out')));
    request.once('error', reject);
  });
}

async function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-e2e-'));
  const runtime = new IntegratedRuntime({
    runtimeRoot: process.env.SUB2API_E2E_RUNTIME_ROOT || path.join(__dirname, '..', 'runtime'),
    dataRoot,
    ports: { api: 28080, postgres: 25432, redis: 26379 },
    onLog: (message, level) => process.stdout.write(`[${level}] ${String(message).trim()}\n`)
  });
  let passed = false;
  try {
    const started = await runtime.start();
    const healthStatus = await getStatus(`${started.url}/health`);
    const consoleStatus = await getStatus(started.url);
    const status = await runtime.getStatus();
    if (!status.healthy || healthStatus !== 200 || consoleStatus >= 500) {
      throw new Error(`Unexpected result: health=${healthStatus}, console=${consoleStatus}, healthy=${status.healthy}`);
    }
    process.stdout.write(`E2E_OK health=${healthStatus} console=${consoleStatus}\n`);
    passed = true;
  } finally {
    await runtime.stop().catch(() => {});
    if (passed && path.basename(dataRoot).startsWith('modugate-e2e-')) {
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
