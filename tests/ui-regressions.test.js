const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Agnes preset selects the video protocol without recursion', () => {
  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
  const body = renderer.match(/function setVideoConnectionKind\(kind\) \{([\s\S]*?)\n\}/)?.[1];

  assert.ok(body);
  assert.doesNotMatch(body, /setVideoConnectionKind\s*\(/);
  assert.match(body, /setVideoProtocol\(\$\('#video-protocol'\)\.value\)/);
  assert.match(renderer, /async function applyAgnesPreset\(\)[\s\S]*?setPage\('videos'\)/);
});

test('Agnes platform is allowed as an external link', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

  assert.match(main, /'https:\/\/platform\.agnes-ai\.com'/);
});
