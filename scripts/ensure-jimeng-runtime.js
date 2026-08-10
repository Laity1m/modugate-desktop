const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = process.env.JIMENG_RUNTIME_REPO || 'zhizinan1997/jimeng-free-api-all';
const VERSION = process.env.JIMENG_RUNTIME_VERSION || 'v1.2.5';
const TARGET_ROOT = path.join(__dirname, '..', 'runtime', 'jimeng');
const ASSET_NAME = 'jimeng-free-api-windows-x64-portable.zip';

function headers() {
  const token = process.env.GITHUB_TOKEN;
  return token
    ? { Authorization: `Bearer ${token}`, 'User-Agent': 'modugate-desktop' }
    : { 'User-Agent': 'modugate-desktop' };
}

function requiredPaths(root) {
  return [
    path.join(root, 'runtime', 'node.exe'),
    path.join(root, 'app', 'dist', 'index.js'),
    path.join(root, 'app', 'node_modules')
  ];
}

function isComplete(root) {
  return requiredPaths(root).every((item) => fs.existsSync(item));
}

function quote(value) {
  return JSON.stringify(String(value));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`读取即梦驱动发布信息失败：${response.status} ${response.statusText}`);
  return response.json();
}

async function download(url, target) {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`下载即梦驱动失败：${response.status} ${response.statusText}`);
  if (!response.body) throw new Error('即梦驱动下载响应中没有内容');
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

function extract(zipPath, destination) {
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath ${quote(zipPath)} -DestinationPath ${quote(destination)} -Force`
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`解压即梦驱动失败：${result.stderr || result.stdout || '未知错误'}`);
  }
}

(async () => {
  if (process.platform !== 'win32') {
    console.log('非 Windows 环境，跳过即梦驱动补齐。');
    return;
  }
  if (isComplete(TARGET_ROOT)) {
    console.log('即梦驱动已存在且结构完整。');
    return;
  }

  const release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(VERSION)}`);
  const asset = (release.assets || []).find((item) => item.name === ASSET_NAME);
  if (!asset?.browser_download_url) {
    throw new Error(`即梦驱动 ${VERSION} 未提供 ${ASSET_NAME}`);
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-jimeng-'));
  try {
    const zipPath = path.join(temporary, ASSET_NAME);
    const extracted = path.join(temporary, 'payload');
    console.log(`开始下载即梦驱动 ${VERSION}：${ASSET_NAME}`);
    await download(asset.browser_download_url, zipPath);
    extract(zipPath, extracted);
    if (!isComplete(extracted)) {
      throw new Error(`即梦驱动压缩包结构不完整，缺少：${requiredPaths(extracted).filter((item) => !fs.existsSync(item)).join('、')}`);
    }
    fs.mkdirSync(TARGET_ROOT, { recursive: true });
    fs.cpSync(extracted, TARGET_ROOT, { recursive: true, force: true });
    console.log(`即梦驱动 ${VERSION} 已补齐。`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
