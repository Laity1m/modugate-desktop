const test = require('node:test');
const assert = require('node:assert/strict');
const { isBundledJimengUrl } = require('../core/jimeng-runtime');

test('bundled Jimeng runtime only owns the fixed local endpoint', () => {
  assert.equal(isBundledJimengUrl('http://127.0.0.1:8001'), true);
  assert.equal(isBundledJimengUrl('localhost:8001/v1'), true);
  assert.equal(isBundledJimengUrl('http://127.0.0.1:5100'), false);
  assert.equal(isBundledJimengUrl('https://example.com:8001'), false);
});
