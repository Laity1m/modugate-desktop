const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('studio', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (value) => ipcRenderer.invoke('settings:save', value)
  },
  gateway: {
    test: (override) => ipcRenderer.invoke('gateway:test', override),
    run: (payload) => ipcRenderer.invoke('gateway:run', payload),
    cancel: (requestId) => ipcRenderer.invoke('gateway:cancel', requestId),
    onChunk: (callback) => subscribe('gateway:chunk', callback)
  },
  images: {
    generate: (payload) => ipcRenderer.invoke('image:generate', payload),
    cancel: (requestId) => ipcRenderer.invoke('image:cancel', requestId),
    history: () => ipcRenderer.invoke('image:history'),
    load: (id) => ipcRenderer.invoke('image:load', id),
    save: (id) => ipcRenderer.invoke('image:save', id),
    clearHistory: () => ipcRenderer.invoke('image:history:clear')
  },
  videos: {
    generate: (payload) => ipcRenderer.invoke('video:generate', payload),
    cancel: (requestId) => ipcRenderer.invoke('video:cancel', requestId),
    open: (url) => ipcRenderer.invoke('video:open', url)
  },
  jimeng: {
    checkAccount: (accountId) => ipcRenderer.invoke('jimeng:account:check', accountId)
  },
  router: {
    status: () => ipcRenderer.invoke('router:status')
  },
  service: {
    start: () => ipcRenderer.invoke('service:start'),
    stop: () => ipcRenderer.invoke('service:stop'),
    logs: () => ipcRenderer.invoke('service:logs'),
    status: () => ipcRenderer.invoke('service:status'),
    credentials: () => ipcRenderer.invoke('service:credentials'),
    accounts: () => ipcRenderer.invoke('service:accounts'),
    onLog: (callback) => subscribe('service:log', callback)
  },
  oauth: {
    start: (provider) => ipcRenderer.invoke('oauth:start', provider),
    onStatus: (callback) => subscribe('oauth:status', callback)
  },
  tools: {
    detect: () => ipcRenderer.invoke('tools:detect'),
    run: (payload) => ipcRenderer.invoke('tools:run', payload),
    cancel: (requestId) => ipcRenderer.invoke('tools:cancel', requestId),
    onChunk: (callback) => subscribe('tools:chunk', callback)
  },
  dialog: {
    pick: (type) => ipcRenderer.invoke('dialog:pick', type)
  },
  console: {
    open: () => ipcRenderer.invoke('console:open')
  },
  external: {
    open: (url) => ipcRenderer.invoke('external:open', url)
  },
  clipboard: {
    writeText: (value) => ipcRenderer.invoke('clipboard:write-text', value)
  },
  network: {
    qrCode: (value) => ipcRenderer.invoke('network:qr-code', value)
  }
});
