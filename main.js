const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  shell,
  session,
  Tray
} = require('electron');
const { SettingsStore } = require('./core/settings-store');
const { testGateway, buildRequest, streamRequest, normalizeGatewayUrl } = require('./core/api-client');
const { ProcessManager } = require('./core/process-manager');
const { IntegratedRuntime } = require('./core/integrated-runtime');
const { CliProxyRuntime } = require('./core/cliproxy-runtime');
const { generateImages } = require('./core/image-api');
const { generateVideo, safeHttpUrl } = require('./core/video-api');
const { generateAgnesVideo } = require('./core/agnes-api');
const { checkJimengAccount, jimengCredential } = require('./core/jimeng-api');
const { JimengRuntime } = require('./core/jimeng-runtime');
const { UnifiedGateway } = require('./core/unified-gateway');
const { ImageHistoryStore, MIME_EXTENSION } = require('./core/image-history');
const { isPrivateIPv4 } = require('./core/network-access');
const QRCode = require('qrcode');

let mainWindow;
let tray;
let settingsStore;
let processManager;
let integratedRuntime;
let cliProxyRuntime;
let imageHistoryStore;
let jimengRuntime;
let unifiedGateway;
let allowQuit = false;
let shuttingDown = false;
let backgroundNoticeShown = false;
const apiControllers = new Map();
const imageControllers = new Map();
const videoControllers = new Map();
const TRAY_ICON_PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAARiSURBVFhH1VdZSFRRGJ63GW2bCFHnQpO26NwJbdFQU0mdyiwxKc2ybLOyKVPbhR4MLYOWh/aNCqmMHrQipiLENrIsCfHBbH0ookIIKkgiOPEd+28z59y5jS0P/fAxw5lz/+/f/zsm0/8oZR9eWicfP+JOP7ivnBBTUlEg3vurMqPhTPLsZk/Tkq62z2s+vWZ6WPayg02rr3s7fsOmo+bQqGGijt+S/BvX4wtbb3WKRHlNHh8sftzmY0zBnessZmXpxWC7GibqDFjmtjSdIoWrul8w17HDLDK3gFkUVRdhKVPZxNpabiA95zp25Js1JnGBqNtQkOOFHffbfio5zAbHTpQI/WFgdDw3BEZTNMLTMneJPH6FyEvedLGohcUSQaBQXNlaaoraW1j/qLh9IpckFHaQQwEpC83K5QiOiJWIjIBokBE5jeeZ2eYoETk1meVpzKCwk+dDUjNZ0rULzNV5jyPtYTOz5c+XiIyA2oBDXG9R8ddgmzpG5OYyt6X5GS6lH9jLH4S3Kc2XNXJCevttZh2fKhEZYdy6jVoH9Rs57pLIrXmPwqGCg6ciOSGytFwi+RUKW29yI2CMFIW8Js89b+8B+5JlEjEhp+0mi1ldzvpFjpGI/MG53M0NwNywKOohHwOWvmjvwY9Ds2ZpDwwYncjDLZIDS7ufc2XIbeqe3SxkQroPmV7RwlhqTevY5HcaOaYdDlGtotURK9wSuXPHdu49+puKFsi9coE5y9YaFi3u4C6ioaUBi8UrNBJCXNlsVGUlR3hOvs9vaNXMupPcs9KPr1jWk4eSwd5Fi2iBK65yC7PYonsX2PT603txCEUieaBAvyce3C+RE6hoQUy1FqREl3MDMutOnP1TA4Dh7tUSMWHEuvX8DrUjxrtZcVRxA1J37qzFISaVqDRQoAgLHtxikx/fl8gBFCTuYUeAC58WRd3MDUiqqSnGIYpKVBwIvGf+zAc3JHJ1W7V2d/q50/weithsUxdxA4bNm2en9ujL1gOwnmnMIoJoNaOipVUNo4OU6IQfjWgyZTec5286yJFIIoJ6fLS7VOtr5FS8JwLG4i5vd5v6xWS3WzQDEqurPfgR49LfdBMX09SuVrbo/VOWULVVuqsHRAgcaEWLojZq5JDQlCkTKI+8R4WH/S2mjI67AS0mhBy6adcEhTtm+hgAia1Yz/cBciqO1j9ZTIgoLaLeXeN4JHJzwWjENNRLhdFioh73Bwo9IoyBpes9SUh8WhWlAm1JXWG0mKjHRcABajuEHi8m0hbUk8jZhVepXfA5ck4RV6i3mLx73BvIOYUd5NBhtqktPpXvV+x2S0hCRqP3tkNqoMSox4mYvKaw4wzkg+yxVpHKUAaocTVoMRo0VKDYGRilmGZYq/iO4vL+cwKvcYac87AH5LmOmBXnJKsz4TYMwas1EfgDUoah1NtFjk7DguuLQJFZUevDkqf1wBh4jUgg3PgOaG9TNscVbc7/C0FUsMmwTn3hnNTXUH8Hy2LmgP8qK8YAAAAASUVORK5CYII=';

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function notifyRunningInBackground() {
  if (backgroundNoticeShown || !tray || process.platform !== 'win32') return;
  backgroundNoticeShown = true;
  tray.displayBalloon({
    iconType: 'info',
    title: 'ModuGate 正在后台运行',
    content: '本地 API 服务保持运行。点击系统托盘图标可重新打开窗口。',
    noSound: true
  });
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  notifyRunningInBackground();
}

function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG, 'base64')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('ModuGate · 本地 AI 网关');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 ModuGate', click: showMainWindow },
    { type: 'separator' },
    { label: '退出 ModuGate', click: () => app.quit() }
  ]));
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 760,
    minHeight: 520,
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
  mainWindow.on('minimize', (event) => {
    if (allowQuit || shuttingDown) return;
    event.preventDefault();
    hideMainWindow();
  });
  mainWindow.on('close', (event) => {
    if (allowQuit || shuttingDown) return;
    event.preventDefault();
    hideMainWindow();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createImageThumbnail(buffer) {
  try {
    const source = nativeImage.createFromBuffer(buffer);
    if (source.isEmpty()) return buffer;
    const size = source.getSize();
    const thumbnail = size.width > 360
      ? source.resize({ width: 360, quality: 'good' })
      : source;
    return thumbnail.toPNG();
  } catch {
    return buffer;
  }
}

function imageDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settingsStore.load());
  ipcMain.handle('settings:save', async (_event, value) => {
    const settings = settingsStore.save(value);
    if (settings.jimeng.accounts.length) await jimengRuntime.ensureForUrl(settings.jimeng.gatewayUrl);
    else await jimengRuntime.stop();
    const desiredRouterHost = settings.service.allowLan ? '0.0.0.0' : '127.0.0.1';
    if (unifiedGateway?.server && unifiedGateway.boundHost !== desiredRouterHost) {
      await unifiedGateway.stop();
      await unifiedGateway.start();
    }
    return settings;
  });
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

  ipcMain.handle('image:generate', async (_event, payload) => {
    const requestId = String(payload?.requestId || '');
    if (!requestId) throw new Error('图片请求缺少 requestId');
    const controller = new AbortController();
    imageControllers.set(requestId, controller);
    try {
      const settings = settingsStore.load();
      const result = await generateImages(settings.connection, payload, {
        signal: controller.signal,
        timeoutMs: 300_000
      });
      const createdAt = new Date(result.created * 1000).toISOString();
      const images = result.images.map((image) => {
        const item = imageHistoryStore.add(image.buffer, {
          mimeType: image.mimeType,
          prompt: result.options.prompt,
          revisedPrompt: image.revisedPrompt,
          model: result.options.model,
          mode: result.options.mode,
          size: result.options.size,
          quality: result.options.quality,
          createdAt
        }, createImageThumbnail(image.buffer));
        return {
          ...item,
          dataUrl: imageDataUrl(image.buffer, image.mimeType)
        };
      });
      return {
        status: result.status,
        latencyMs: result.latencyMs,
        requestId: result.requestId,
        usage: result.usage,
        images
      };
    } finally {
      imageControllers.delete(requestId);
    }
  });
  ipcMain.handle('image:cancel', (_event, requestId) => {
    const controller = imageControllers.get(String(requestId || ''));
    if (!controller) return false;
    controller.abort();
    imageControllers.delete(String(requestId));
    return true;
  });
  ipcMain.handle('image:history', () => imageHistoryStore.list());
  ipcMain.handle('image:load', (_event, id) => {
    const item = imageHistoryStore.load(String(id || ''));
    return { ...item, buffer: undefined, dataUrl: imageDataUrl(item.buffer, item.mimeType) };
  });
  ipcMain.handle('image:save', async (_event, id) => {
    const item = imageHistoryStore.load(String(id || ''));
    const extension = MIME_EXTENSION[item.mimeType] || 'png';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存生成图片',
      defaultPath: `ModuGate-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`,
      filters: [{ name: `${extension.toUpperCase()} 图片`, extensions: [extension] }]
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, item.buffer);
    return { saved: true, filePath: result.filePath };
  });
  ipcMain.handle('image:history:clear', () => imageHistoryStore.clear());
  ipcMain.handle('video:generate', async (_event, payload) => {
    const requestId = String(payload?.requestId || '');
    if (!requestId) throw new Error('视频请求缺少 requestId');
    const controller = new AbortController();
    videoControllers.set(requestId, controller);
    try {
      const settings = settingsStore.load();
      if (payload?.connectionKind === 'agnes') {
        return await generateAgnesVideo(settings.agnes, payload, {
          signal: controller.signal,
          timeoutMs: Number(settings.agnes.timeoutSeconds || 900) * 1000
        });
      }
      let connection = settings.connection;
      if (payload?.connectionKind === 'jimeng') {
        const account = settings.jimeng.accounts.find((item) => item.id === settings.jimeng.selectedAccountId);
        if (!account) throw new Error('请先在“网关连接”中添加并选择一个即梦账号');
        connection = {
          baseUrl: settings.jimeng.gatewayUrl,
          apiKey: jimengCredential(account),
          defaultModel: settings.videos.model
        };
      }
      return await generateVideo(connection, payload, {
        signal: controller.signal,
        timeoutMs: 1_800_000
      });
    } finally {
      videoControllers.delete(requestId);
    }
  });
  ipcMain.handle('video:cancel', (_event, requestId) => {
    const controller = videoControllers.get(String(requestId || ''));
    if (!controller) return false;
    controller.abort();
    videoControllers.delete(String(requestId));
    return true;
  });
  ipcMain.handle('video:open', (_event, value) => {
    const url = safeHttpUrl(value);
    if (!url) throw new Error('视频地址无效');
    return shell.openExternal(url);
  });
  ipcMain.handle('jimeng:account:check', async (_event, accountId) => {
    const settings = settingsStore.load();
    const account = settings.jimeng.accounts.find((item) => item.id === String(accountId || ''));
    if (!account) throw new Error('即梦账号不存在，请重新添加');
    await jimengRuntime.ensureForUrl(settings.jimeng.gatewayUrl);
    return checkJimengAccount(settings.jimeng.gatewayUrl, account);
  });
  ipcMain.handle('router:status', () => ({
    ...unifiedGateway.status(),
    apiKey: settingsStore.load().router.apiKey
  }));
  ipcMain.handle('clipboard:write-text', (_event, value) => {
    clipboard.writeText(String(value || ''));
    return true;
  });
  ipcMain.handle('network:qr-code', async (_event, value) => {
    const text = String(value || '').trim();
    if (!text || text.length > 512) throw new Error('二维码地址无效');
    let target;
    try {
      target = new URL(text);
    } catch {
      throw new Error('二维码地址无效');
    }
    if (target.protocol !== 'http:' || !isPrivateIPv4(target.hostname)) {
      throw new Error('只能为局域网 HTTP 地址生成二维码');
    }
    return QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: '#07111eff', light: '#ffffffff' }
    });
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
    const properties = type === 'directory'
      ? ['openDirectory']
      : ['images', 'media'].includes(type)
        ? ['openFile', 'multiSelections']
        : ['openFile'];
    const filters = type === 'compose'
      ? [{ name: 'Docker Compose', extensions: ['yml', 'yaml'] }]
      : type === 'binary'
        ? [{ name: 'Executable', extensions: process.platform === 'win32' ? ['exe', 'cmd', 'bat'] : ['*'] }]
        : type === 'images'
          ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
          : type === 'media'
            ? [
                { name: '全能参考素材', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'webm', 'mp3', 'wav', 'm4a', 'aac', 'flac'] },
                { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
                { name: '视频', extensions: ['mp4', 'mov', 'webm'] },
                { name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac'] }
              ]
          : undefined;
    const result = await dialog.showOpenDialog(mainWindow, { properties, filters });
    if (result.canceled) return null;
    if (type === 'images') return result.filePaths.slice(0, 4);
    if (type === 'media') return result.filePaths.slice(0, 15);
    return result.filePaths[0];
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
      'https://github.com/zhizinan1997/jimeng-free-api-all',
      'https://github.com/iptag/jimeng-api',
      'https://jimeng.jianying.com',
      'https://hermes-agent.nousresearch.com',
      'https://docs.anthropic.com',
      'https://developers.openai.com'
    ];
    if (!allowed.some((prefix) => String(url).startsWith(prefix))) throw new Error('不允许打开该地址');
    return shell.openExternal(url);
  });
}

if (!app.requestSingleInstanceLock()) {
  allowQuit = true;
  app.quit();
}

app.on('second-instance', showMainWindow);

app.whenReady().then(async () => {
  if (allowQuit) return;
  if (process.platform === 'win32') app.setAppUserModelId('com.modugate.desktop');
  settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), safeStorage);
  let settings = settingsStore.load();
  if (!settings.router.apiKey) settings = settingsStore.save(settings);
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
  imageHistoryStore = new ImageHistoryStore(path.join(app.getPath('userData'), 'image-history'), { maxItems: 24 });
  processManager = new ProcessManager(
    (entry) => sendToMain('service:log', entry),
    integratedRuntime,
    cliProxyRuntime
  );
  jimengRuntime = new JimengRuntime({
    runtimeRoot: path.join(runtimeRoot, 'jimeng'),
    dataRoot: path.join(app.getPath('userData'), 'jimeng'),
    onLog: (message, level) => processManager?.log(message, level)
  });
  unifiedGateway = new UnifiedGateway({
    getSettings: () => settingsStore.load(),
    ensureJimeng: async () => {
      const current = settingsStore.load();
      await jimengRuntime.ensureForUrl(current.jimeng.gatewayUrl);
    },
    onLog: (message, level) => processManager?.log(message, level)
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerIpc();
  createTray();
  createWindow();
  await unifiedGateway.start().catch((error) => processManager.log(`统一 API 启动失败：${error.message}`, 'error'));
  if (settings.jimeng.accounts.length) {
    jimengRuntime.ensureForUrl(settings.jimeng.gatewayUrl).catch((error) => processManager.log(error.message, 'error'));
  }
  if (['cliproxy', 'integrated'].includes(settings.service.mode)) {
    processManager.startService(settings.service).catch((error) => processManager.log(error.message, 'error'));
  }
  app.on('activate', showMainWindow);
});

app.on('before-quit', (event) => {
  if (allowQuit || !processManager) return;
  event.preventDefault();
  if (shuttingDown) return;
  shuttingDown = true;
  Promise.allSettled([
    processManager.dispose(),
    unifiedGateway?.stop(),
    jimengRuntime?.stop()
  ]).finally(() => {
    allowQuit = true;
    app.quit();
  });
});
app.on('window-all-closed', () => {
  // Keep the process and local services alive until the tray menu explicitly exits.
});
