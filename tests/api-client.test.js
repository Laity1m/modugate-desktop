const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  normalizeGatewayUrl,
  buildRequest,
  extractText,
  testGateway,
  streamRequest
} = require('../core/api-client');

test('normalizeGatewayUrl removes a trailing /v1', () => {
  assert.deepEqual(normalizeGatewayUrl('http://localhost:8080/v1/'), {
    root: 'http://localhost:8080',
    apiBase: 'http://localhost:8080/v1'
  });
});

test('buildRequest maps all three client presets', () => {
  const connection = { baseUrl: 'http://localhost:8080', apiKey: 'sk-test', defaultModel: 'gpt-test' };
  assert.equal(buildRequest(connection, 'codex', 'hi').endpoint, 'http://localhost:8080/v1/responses');
  assert.equal(buildRequest(connection, 'hermes', 'hi').endpoint, 'http://localhost:8080/v1/chat/completions');
  const claude = buildRequest(connection, 'claude', 'hi');
  assert.equal(claude.endpoint, 'http://localhost:8080/v1/messages');
  assert.equal(claude.headers['x-api-key'], 'sk-test');
});

test('extractText recognizes common streaming shapes', () => {
  assert.equal(extractText({ delta: 'hello' }), 'hello');
  assert.equal(extractText({ choices: [{ delta: { content: 'world' } }] }), 'world');
  assert.equal(extractText({ delta: { text: 'claude' } }), 'claude');
});

test('gateway health, model discovery, and streaming request work end-to-end', async (t) => {
  const server = http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"status":"ok"}');
      return;
    }
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"data":[{"id":"gpt-test"},{"id":"claude-test"}]}');
      return;
    }
    if (request.url === '/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"content":"连"}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":"接成功"}}]}\n\n');
      response.end('data: [DONE]\n\n');
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, apiKey: 'sk-test', defaultModel: 'gpt-test' };

  const health = await testGateway(connection);
  assert.equal(health.online, true);
  assert.deepEqual(health.models, ['gpt-test', 'claude-test']);

  const chunks = [];
  const request = buildRequest(connection, 'hermes', 'test');
  const result = await streamRequest(connection, request, (chunk) => {
    if (chunk.type === 'text') chunks.push(chunk.text);
  });
  assert.equal(result.status, 200);
  assert.equal(chunks.join(''), '连接成功');
});

