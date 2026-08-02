const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

app.whenReady().then(async () => {
  const outputDirectory = path.resolve(process.env.MODUGATE_UI_SMOKE_DIR || path.join(os.tmpdir(), 'modugate-ui-smoke'));
  fs.mkdirSync(outputDirectory, { recursive: true });
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 0,
    minHeight: 0,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'ui-smoke-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await wait(1_200);
  await window.webContents.executeJavaScript("setPage('service'); document.querySelector('.page.active').style.animation = 'none'");
  await window.webContents.executeJavaScript("document.querySelector('#lan-access-card').scrollIntoView({ block: 'center' })");
  await wait(700);
  window.webContents.invalidate();
  await window.webContents.capturePage();
  await wait(150);

  const firstImage = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, 'service-800x600.png'), firstImage.toPNG());
  const result = await window.webContents.executeJavaScript(`(() => {
    const scroll = document.querySelector('.content-scroll');
    const before = scroll.scrollTop;
    scroll.scrollTop = scroll.scrollHeight;
    const after = scroll.scrollTop;
    const detail = document.querySelector('#lan-access-detail');
    const qr = document.querySelector('#lan-api-qr');
    return {
      activePage: document.querySelector('.page.active')?.dataset.page,
      lanDetailVisible: !detail.classList.contains('hidden'),
      lanUrl: document.querySelector('#lan-api-url')?.textContent,
      qrReady: Boolean(qr?.complete && qr?.naturalWidth),
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      contentClientHeight: scroll.clientHeight,
      contentScrollHeight: scroll.scrollHeight,
      before,
      after,
      canScroll: after > before
    };
  })()`);
  await wait(400);
  window.webContents.invalidate();
  await window.webContents.capturePage();
  await wait(150);
  const bottomImage = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, 'service-800x600-bottom.png'), bottomImage.toPNG());
  process.stdout.write(`${JSON.stringify({ outputDirectory, ...result }, null, 2)}\n`);

  const valid = result.activePage === 'service'
    && result.lanDetailVisible
    && result.lanUrl === 'http://192.168.1.107:8317/v1'
    && result.qrReady
    && result.documentScrollWidth <= result.viewportWidth
    && result.canScroll;
  await window.close();
  app.exit(valid ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  app.exit(1);
});
