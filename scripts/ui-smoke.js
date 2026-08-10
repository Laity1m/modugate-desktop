const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const outputDirectory = path.resolve(process.env.MODUGATE_UI_SMOKE_DIR || path.join(os.tmpdir(), 'modugate-ui-smoke'));
fs.mkdirSync(outputDirectory, { recursive: true });
fs.mkdirSync(path.join(outputDirectory, 'profile'), { recursive: true });
app.setPath('userData', path.join(outputDirectory, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

app.whenReady().then(async () => {
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
      accountActions: Array.from(document.querySelectorAll('#cliproxy-accounts .account-item-actions button')).map((item) => item.textContent),
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
  await window.webContents.executeJavaScript("setPage('connection'); document.querySelector('.page.active').style.animation = 'none'; document.querySelector('#jimeng-account-panel').scrollIntoView({ block: 'center' })");
  await wait(350);
  const accountImage = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, 'jimeng-account-800x600.png'), accountImage.toPNG());
  const accountResult = await window.webContents.executeJavaScript(`(() => ({
    activePage: document.querySelector('.page.active')?.dataset.page,
    unifiedUrl: document.querySelector('#unified-api-url')?.textContent,
    accountName: document.querySelector('.jimeng-account-info strong')?.textContent,
    masked: document.querySelector('.jimeng-account-info small')?.textContent,
    runtimeState: document.querySelector('#jimeng-runtime-state')?.textContent,
    hasAddButton: Boolean(document.querySelector('#add-jimeng-account'))
  }))()`);
  await window.webContents.executeJavaScript(`(() => {
    setPage('videos');
    state.videoReferences = [
      { filePath: 'C:\\\\media\\\\opening.png', type: 'image' },
      { filePath: 'C:\\\\media\\\\character.png', type: 'image' },
      { filePath: 'C:\\\\media\\\\motion.mp4', type: 'video' },
      { filePath: 'C:\\\\media\\\\music.mp3', type: 'audio' }
    ];
    document.querySelector('#video-prompt').value = '让 @image_file_2 参考 @video_file_1 的动作，并跟随 @audio_file_1 的节奏。';
    setVideoReferenceMode('omni_reference');
    updateVideoPromptCount();
    document.querySelector('.reference-item button:last-child').click();
    document.querySelector('.page.active').style.animation = 'none';
    document.querySelector('.content-scroll').scrollTop = 0;
  })()`);
  await wait(400);
  const videoImage = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, 'video-800x600.png'), videoImage.toPNG());
  await window.webContents.executeJavaScript("document.querySelector('#video-reference-block').scrollIntoView({ block: 'center' })");
  await wait(250);
  const omniImage = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, 'video-omni-800x600.png'), omniImage.toPNG());
  const videoResult = await window.webContents.executeJavaScript(`(() => ({
    activePage: document.querySelector('.page.active')?.dataset.page,
    endpoint: document.querySelector('#video-endpoint')?.textContent,
    model: document.querySelector('#video-model')?.value,
    referenceMode: document.querySelector('#video-reference-mode')?.value,
    omniHintVisible: !document.querySelector('#omni-reference-hint')?.classList.contains('hidden'),
    promptCount: document.querySelector('#video-prompt-count')?.textContent,
    prompt: document.querySelector('#video-prompt')?.value,
    aliases: Array.from(document.querySelectorAll('#video-reference-list code')).map((item) => item.textContent),
    referenceTypes: Array.from(document.querySelectorAll('#video-reference-list .media-reference-item')).map((item) => item.classList[2]),
    hasRunButton: Boolean(document.querySelector('#run-video'))
  }))()`);
  process.stdout.write(`${JSON.stringify({ outputDirectory, service: result, jimeng: accountResult, video: videoResult }, null, 2)}\n`);

  const valid = result.activePage === 'service'
    && result.lanDetailVisible
    && result.lanUrl === 'http://192.168.1.107:8317/v1'
    && result.qrReady
    && result.documentScrollWidth <= result.viewportWidth
    && result.canScroll
    && result.accountActions.join(',') === '当前账号,停用,退出并删除'
    && accountResult.activePage === 'connection'
    && accountResult.unifiedUrl === 'http://127.0.0.1:8787/v1'
    && accountResult.accountName.includes('我的即梦会员')
    && accountResult.masked.includes('1234')
    && accountResult.runtimeState === '路由在线 · 1 个账号'
    && accountResult.hasAddButton
    && videoResult.activePage === 'videos'
    && videoResult.endpoint === '/v1/videos/generations'
    && videoResult.model === 'jimeng-video-seedance-2.0-fast'
    && videoResult.referenceMode === 'omni_reference'
    && videoResult.omniHintVisible
    && Number(videoResult.promptCount) > 0
    && videoResult.prompt.includes('@image_file_1')
    && !videoResult.prompt.includes('@image_file_2')
    && videoResult.aliases.join(',') === '@image_file_1,@video_file_1,@audio_file_1'
    && videoResult.referenceTypes.join(',') === 'image,video,audio'
    && videoResult.hasRunButton;
  await window.close();
  app.exit(valid ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  app.exit(1);
});
