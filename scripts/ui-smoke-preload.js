const { contextBridge } = require('electron');
const QRCode = require('qrcode');

const settings = {
  connection: { baseUrl: 'http://127.0.0.1:8317', apiKey: 'sk-local-ui-smoke', defaultModel: 'gpt-5' },
  service: {
    mode: 'cliproxy',
    allowLan: true,
    composeFile: '',
    binaryPath: '',
    workingDirectory: '',
    binaryArgs: ''
  },
  tools: { hermesPath: 'hermes', codexPath: 'codex', claudePath: 'claude' },
  images: { model: 'gpt-image-2', size: '1024x1024', quality: 'auto', outputFormat: 'png', background: 'auto' }
};

const subscribe = () => () => {};

contextBridge.exposeInMainWorld('studio', {
  settings: { get: async () => settings, save: async (value) => value },
  gateway: {
    test: async () => ({
      online: true,
      latencyMs: 32,
      root: 'http://127.0.0.1:8317',
      checkedAt: new Date().toISOString(),
      healthStatus: 200,
      modelsStatus: 200,
      models: ['gpt-5', 'gpt-image-2']
    }),
    run: async () => ({ status: 200, latencyMs: 20 }),
    cancel: async () => true,
    onChunk: subscribe
  },
  images: {
    generate: async () => ({ images: [] }),
    cancel: async () => true,
    history: async () => [],
    load: async () => ({}),
    save: async () => ({ saved: false }),
    clearHistory: async () => ({ cleared: 0 })
  },
  service: {
    start: async () => ({ started: true, message: 'UI smoke service' }),
    stop: async () => ({ stopped: true }),
    logs: async () => [],
    status: async () => ({ state: 'running', healthy: true, accountCount: 1, lanAccessEnabled: true, lanAccessActive: true }),
    credentials: async () => ({
      url: 'http://127.0.0.1:8317',
      apiKey: 'sk-local-ui-smoke',
      managementKey: 'mgmt-ui-smoke',
      lanAccessEnabled: true,
      lanAddresses: ['192.168.1.107'],
      lanUrl: 'http://192.168.1.107:8317',
      lanApiUrl: 'http://192.168.1.107:8317/v1'
    }),
    accounts: async () => [{ name: 'smoke.json', provider: 'codex', email: 'example@example.com', status: 'ready' }],
    onLog: subscribe
  },
  oauth: { start: async () => ({}), onStatus: subscribe },
  tools: {
    detect: async () => ({
      hermes: { installed: false, command: 'hermes' },
      codex: { installed: true, command: 'codex', resolved: 'codex.exe' },
      claude: { installed: false, command: 'claude' }
    }),
    run: async () => ({ code: 0 }),
    cancel: async () => true,
    onChunk: subscribe
  },
  dialog: { pick: async () => null },
  console: { open: async () => ({ opened: false, loaded: false }) },
  external: { open: async () => true },
  clipboard: { writeText: async () => true },
  network: { qrCode: (value) => QRCode.toDataURL(value, { margin: 1, width: 220 }) }
});
