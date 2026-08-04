const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', 'runtime', 'jimeng');
const node = path.join(root, 'runtime', 'node.exe');
const app = path.join(root, 'app');
const entry = path.join(app, 'dist', 'index.js');

for (const required of [node, entry, path.join(app, 'node_modules')]) {
  if (!fs.existsSync(required)) {
    throw new Error(`Missing bundled Jimeng runtime path: ${required}`);
  }
}

const probe = [
  "import axios from 'axios';",
  "import fsExtra from 'fs-extra';",
  "import Koa from 'koa';",
  "if (!axios || !fsExtra || !Koa) process.exit(2);"
].join('\n');

const result = spawnSync(node, ['--input-type=module', '--eval', probe], {
  cwd: app,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30_000
});

if (result.error || result.status !== 0) {
  const detail = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n').trim();
  throw new Error(`Bundled Jimeng dependencies are incomplete or incompatible.\n${detail}`);
}

console.log('Bundled Jimeng runtime dependency check passed.');
