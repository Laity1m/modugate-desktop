const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ImageHistoryStore } = require('../core/image-history');

test('image history persists, loads, prunes, and clears local images', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-image-history-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new ImageHistoryStore(directory, { maxItems: 2 });
  const first = store.add(Buffer.from('first'), { mimeType: 'image/png', prompt: 'first' }, Buffer.from('thumb1'));
  store.add(Buffer.from('second'), { mimeType: 'image/jpeg', prompt: 'second' }, Buffer.from('thumb2'));
  store.add(Buffer.from('third'), { mimeType: 'image/webp', prompt: 'third' }, Buffer.from('thumb3'));

  const items = store.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].prompt, 'third');
  assert.match(items[0].thumbnailDataUrl, /^data:image\/png;base64,/);
  assert.throws(() => store.load(first.id), /不存在/);
  assert.equal(store.load(items[0].id).buffer.toString(), 'third');
  assert.equal(store.clear().cleared, 2);
  assert.deepEqual(store.list(), []);
});
