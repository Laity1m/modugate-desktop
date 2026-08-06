const { writeFileSync } = require('node:fs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = process.env.CLI_PROXY_REPO || 'router-for-me/CLIProxyAPI';
const VERSION = process.env.CLI_PROXY_VERSION || 'latest';
const TARGET_ROOT = path.join(__dirname, '..', 'runtime', 'cliproxy');
const TARGET_EXECUTABLES = ['cli-proxy-api.exe', 'CLIProxyAPI.exe'];

function headers() {
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}`, 'User-Agent': 'modugate-desktop' } : { 'User-Agent': 'modugate-desktop' };
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function hasBinary(runtimeRoot) {
  return TARGET_EXECUTABLES.some((name) => fs.existsSync(path.join(runtimeRoot, name)));
}

function quote(value) {
  return JSON.stringify(String(value));
}

function extractArchive(zipPath, destination) {
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Path ${quote(zipPath)} -DestinationPath ${quote(destination)} -Force`
  ], { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(`展开 CLIProxyAPI 压缩包失败：${(result.stderr || result.stdout || '').toString()}`);
  }
}

function findFile(root, targetNames) {
  const names = new Set(targetNames.map((item) => String(item).toLowerCase()));
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
      } else if (names.has(entry.name.toLowerCase())) {
        return next;
      }
    }
  }
  return null;
}

function normalizeTag(version) {
  return String(version || '').trim();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: headers()
  });
  if (!response.ok) {
    throw new Error(`读取发布信息失败：${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function downloadToFile(url, target) {
  const response = await fetch(url, {
    headers: headers()
  });
  if (!response.ok) {
    throw new Error(`下载资源失败：${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('下载响应中没有可用内容');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(target, buffer);
}

function selectAssetByName(versionTag, assets) {
  const candidates = (assets || []).filter((item) => /windows/i.test(item.name) && /amd64/i.test(item.name) && /zip$/i.test(item.name) && /cliproxy|cli-proxy-api/i.test(item.name));
  if (!candidates.length) return null;
  const exactTag = normalizeTag(versionTag).replace(/^v/i, '');
  return (
    candidates.find((item) => new RegExp(`_${exactTag}_`, 'i').test(item.name))
    || candidates.find((item) => /cli-proxy-api_windows_amd64\.zip/i.test(item.name))
    || candidates[0]
  );
}

(async () => {
  try {
    if (process.platform !== 'win32') {
      log('非 Windows 环境，跳过 CLIProxyAPI 运行组件补齐。');
      return;
    }
    if (process.env.SKIP_CLIPROXY_RUNTIME_DOWNLOAD === '1') {
      log('已设置 SKIP_CLIPROXY_RUNTIME_DOWNLOAD=1，跳过 CLIProxyAPI 运行组件检查。');
      return;
    }

    fs.mkdirSync(TARGET_ROOT, { recursive: true });
    if (hasBinary(TARGET_ROOT)) {
      log('CLIProxyAPI 运行组件已存在。');
      return;
    }

    const release = VERSION === 'latest'
      ? await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
      : await fetchJson(`https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(VERSION)}`);
    const versionTag = release.tag_name || VERSION;
    const asset = selectAssetByName(versionTag, release.assets || []);
    if (!asset?.browser_download_url) {
      throw new Error(`未找到可用的 CLIProxyAPI Windows amd64 发布包（repo=${REPO} version=${versionTag}）。`);
    }

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-cliproxy-'));
    const zipPath = path.join(temp, `${versionTag}.zip`);
    const extractPath = path.join(temp, 'payload');
    log(`开始下载 CLIProxyAPI ${versionTag}：${asset.name}`);
    await downloadToFile(asset.browser_download_url, zipPath);
    log(`开始解压 CLIProxyAPI ${versionTag} 到临时目录。`);
    extractArchive(zipPath, extractPath);

    const executable = findFile(extractPath, TARGET_EXECUTABLES);
    if (!executable) {
      throw new Error(`在下载的 CLIProxyAPI 压缩包中未找到可执行文件 (${TARGET_EXECUTABLES.join(' / ')})。`);
    }
    fs.copyFileSync(executable, path.join(TARGET_ROOT, path.basename(executable)));
    log(`已提取执行文件：${path.basename(executable)}`);

    const management = findFile(extractPath, ['management.html']);
    if (management) {
      fs.copyFileSync(management, path.join(TARGET_ROOT, 'management.html'));
      log('已提取 management.html 控制面板文件。');
    }

    log('CLIProxyAPI 运行组件补齐完成。');
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
})();
