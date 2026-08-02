const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CliProxyRuntime, request } = require('../core/cliproxy-runtime');
const { listLanIPv4 } = require('../core/network-access');

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-lan-smoke-'));
  const port = 28319;
  const addresses = listLanIPv4().map((item) => item.address);
  if (!addresses.length) throw new Error('未检测到可用于测试的局域网 IPv4 地址');
  const runtime = new CliProxyRuntime({
    runtimeRoot: path.join(__dirname, '..', 'runtime', 'cliproxy'),
    dataRoot: directory,
    port,
    allowLan: true,
    lanAddressResolver: () => addresses,
    onLog: (message, level) => process.stdout.write(`[${level}] ${message}\n`)
  });

  try {
    const started = await runtime.start();
    const credentials = runtime.getCredentials();
    const headers = { Authorization: `Bearer ${credentials.apiKey}` };
    const local = await request(`http://127.0.0.1:${port}/v1/models`, { headers, timeoutMs: 5_000 });
    const lan = await request(`http://${addresses[0]}:${port}/v1/models`, { headers, timeoutMs: 5_000 });
    const lanManagement = await request(`http://${addresses[0]}:${port}/v0/management/auth-files`, {
      headers: { Authorization: `Bearer ${credentials.managementKey}` },
      timeoutMs: 5_000
    });
    const status = await runtime.getStatus();
    const result = {
      started: started.started,
      localStatus: local.status,
      lanStatus: lan.status,
      lanManagementStatus: lanManagement.status,
      lanApiUrl: credentials.lanApiUrl,
      lanAccessActive: status.lanAccessActive
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (local.status !== 200 || lan.status !== 200 || lanManagement.status < 400 || !status.lanAccessActive) process.exitCode = 1;
  } finally {
    await runtime.stop().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
