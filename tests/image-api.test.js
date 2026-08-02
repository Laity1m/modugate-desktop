const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { generateImages, normalizeImageOptions } = require('../core/image-api');

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=',
  'base64'
);

test('normalizeImageOptions validates generate and edit inputs', () => {
  assert.equal(normalizeImageOptions({ prompt: 'test' }).model, 'gpt-image-2');
  assert.equal(normalizeImageOptions({ prompt: 'test', n: 9 }).n, 4);
  assert.throws(() => normalizeImageOptions({ prompt: '' }), /提示词/);
  assert.throws(() => normalizeImageOptions({ mode: 'edit', prompt: 'edit' }), /参考图片/);
});

test('image generation handles OpenAI-compatible base64 responses', async (t) => {
  let receivedBody = null;
  const server = http.createServer((request, response) => {
    if (request.url !== '/v1/images/generations') return response.writeHead(404).end();
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'req-image-test' });
      response.end(JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG.toString('base64') }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const result = await generateImages({
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiKey: 'sk-test'
  }, {
    prompt: 'A teal gate',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'medium'
  });
  assert.equal(result.status, 200);
  assert.equal(result.requestId, 'req-image-test');
  assert.equal(result.images[0].mimeType, 'image/png');
  assert.deepEqual(result.images[0].buffer, ONE_PIXEL_PNG);
  assert.equal(receivedBody.size, '1024x1024');
  assert.equal(receivedBody.quality, 'medium');
});

test('image editing sends multipart image data', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-image-edit-'));
  const imagePath = path.join(directory, 'source.png');
  fs.writeFileSync(imagePath, ONE_PIXEL_PNG);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let contentType = '';
  let bodyText = '';
  const server = http.createServer((request, response) => {
    contentType = request.headers['content-type'] || '';
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      bodyText = Buffer.concat(chunks).toString('latin1');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG.toString('base64') }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const result = await generateImages({
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiKey: 'sk-test'
  }, {
    mode: 'edit',
    prompt: 'Add a teal frame',
    imagePaths: [imagePath]
  });
  assert.equal(result.images.length, 1);
  assert.match(contentType, /^multipart\/form-data; boundary=/);
  assert.match(bodyText, /name="image"; filename="source.png"/);
  assert.match(bodyText, /Add a teal frame/);
});

test('image generation returns a clear message when the gateway is offline', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(() => generateImages({
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey: ''
  }, { prompt: 'test' }, { timeoutMs: 1_000 }), /无法连接图片网关/);
});
