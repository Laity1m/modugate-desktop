const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  session
} = require('electron');
const { SettingsStore } = require('./core/settings-store');
const { testGateway, buildRequest, streamRequest, normalizeGatewayUrl } = require('./core/api-client');
const { ProcessManager } = require('./core/process-manager');
const { IntegratedRuntime } = require('./core/integrated-runtime');
const { CliProxyRuntime } = require('./core/cliproxy-runtime');

let mainWindow;
let settingsStore;
let processManager;
let integratedRuntime;
let cliProxyRuntime;
let allowQuit = false;
let shuttingDown = false;
const apiControllers = new Map();

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#08111f',
    title: 'ModuGate',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settingsStore.load());
  ipcMain.handle('settings:save', (_event, value) => settingsStore.save(value));
  ipcMain.handle('gateway:test', (_event, override) => {
    const settings = settingsStore.load();
    return testGateway({ ...settings.connection, ...(override || {}) });
  });
  ipcMain.handle('gateway:run', async (event, payload) => {
    const settings = settingsStore.load();
    const requestId = payload.requestId;
    const controller = new AbortController();
    apiControllers.set(requestId, controller);
    try {
      const request = buildRequest(settings.connection, payload.preset, payload.prompt, payload.model, payload.options);
      return await streamRequest(settings.connection, request, (chunk) => {
        event.sender.send('gateway:chunk', { requestId, ...chunk });
      }, { signal: controller.signal, timeoutMs: 300_000 });
    } finally {
      apiControllers.delete(requestId);
    }
  });
  ipcMain.handle('gateway:cancel', (_event, requestId) => {
    const controller = apiControllers.get(requestId);
    if (!controller) return false;
    controller.abort();
    apiControllers.delete(requestId);
    return true;
  });

  ipcMain.handle('service:start', async () => processManager.startService(settingsStore.load().service));
  ipcMain.handle('service:stop', async () => processManager.stopService(settingsStore.load().service));
  ipcMain.handle('service:logs', () => processManager.getLogs());
  ipcMain.handle('service:status', () => processManager.getServiceStatus(settingsStore.load().service));
  ipcMain.handle('service:credentials', () => processManager.getServiceCredentials(settingsStore.load().service));
  ipcMain.handle('service:accounts', () => processManager.getServiceAccounts(settingsStore.load().service));
  ipcMain.handle('oauth:start', async (_event, provider) => {
    const settings = settingsStore.load();
    const oauthSession = await processManager.beginOAuth(settings.service, provider);
    await shell.openExternal(oauthSession.url);
    processManager.pollOAuth(oauthSession).then((result) => {
      sendToMain('oauth:status', { ...result, state: 'success' });
    }).catch((error) => {
      sendToMain('oauth:status', {
        provider: oauthSession.provider,
        label: oauthSession.label,
        state: 'error',
        error: error.message
      });
    });
    return { ...oauthSession, state: 'pending' };
  });
  ipcMain.handle('tools:detect', () => processManager.detectTools(settingsStore.load()));
  ipcMain.handle('tools:run', async (event, payload) => {
    const settings = settingsStore.load();
    return processManager.runTool({
      ...payload,
      settings,
      onData: (data) => event.sender.send('tools:chunk', { requestId: payload.requestId, ...data })
    });
  });
  ipcMain.handle('tools:cancel', (_event, requestId) => processManager.cancelTool(requestId));

  ipcMain.handle('dialog:pick', async (_event, type) => {
    const properties = type === 'directory' ? ['openDirectory'] : ['openFile'];
    const filters = type === 'compose'
      ? [{ name: 'Docker Compose', extensions: ['yml', 'yaml'] }]
      : type === 'binary'
        ? [{ name: 'Executable', extensions: process.platform === 'win32' ? ['exe', 'cmd', 'bat'] : ['*'] }]
        : undefined;
    const result = await dialog.showOpenDialog(mainWindow, { properties, filters });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('console:open', async () => {
    const settings = settingsStore.load();
    if (['cliproxy', 'integrated'].includes(settings.service.mode)) await processManager.startService(settings.service);
    const credentials = processManager.getServiceCredentials(settings.service);
    const { root } = normalizeGatewayUrl(credentials?.url || settings.connection.baseUrl);
    const consoleUrl = credentials?.consoleUrl || root;
    const admin = new BrowserWindow({
      width: 1240,
      height: 820,
      parent: mainWindow,
      title: settings.service.mode === 'cliproxy' ? '轻量引擎管理控制台' : 'Sub2API 管理控制台',
      autoHideMenuBar: true,
      show: false,
      backgroundColor: '#07101c',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    admin.once('ready-to-show', () => admin.show());
    admin.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    try {
      await admin.loadURL(consoleUrl);
      return { opened: true, loaded: true, root, consoleUrl };
    } catch (error) {
      if (admin.isDestroyed()) return { opened: false, loaded: false, root, error: error.message };
      await admin.loadFile(path.join(__dirname, 'src', 'console-offline.html'), {
        query: { root, reason: error.message || '无法连接网关' }
      });
      return { opened: true, loaded: false, root, error: error.message };
    }
  });
  ipcMain.handle('external:open', (_event, url) => {
    const allowed = [
      'https://github.com/Wei-Shaw/sub2api',
      'https://github.com/router-for-me/CLIProxyAPI',
      'https://hermes-agent.nousresearch.com',
      'https://docs.anthropic.com',
      'https://developers.openai.com'
    ];
    if (!allowed.some((prefix) => String(url).startsWith(prefix))) throw new Error('不允许打开该地址');
    return shell.openExternal(url);
  });
}

app.whenReady().then(() => {
  settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), safeStorage);
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'runtime')
    : path.join(__dirname, 'runtime');
  integratedRuntime = new IntegratedRuntime({
    runtimeRoot,
    dataRoot: path.join(app.getPath('userData'), 'integrated'),
    safeStorage,
    onLog: (message, level) => processManager?.log(message, level)
  });
  cliProxyRuntime = new CliProxyRuntime({
    runtimeRoot: path.join(runtimeRoot, 'cliproxy'),
    dataRoot: path.join(app.getPath('userData'), 'cliproxy'),
    safeStorage,
    onLog: (message, level) => processManager?.log(message, level)
  });
  processManager = new ProcessManager(
    (entry) => sendToMain('service:log', entry),
    integratedRuntime,
    cliProxyRuntime
  );
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerIpc();
  createWindow();
  const settings = settingsStore.load();
  if (['cliproxy', 'integrated'].includes(settings.service.mode)) {
    processManager.startService(settings.service).catch((error) => processManager.log(error.message, 'error'));
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', (event) => {
  if (allowQuit || !processManager) return;
  event.preventDefault();
  if (shuttingDown) return;
  shuttingDown = true;
  processManager.dispose().finally(() => {
    allowQuit = true;
    app.quit();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
