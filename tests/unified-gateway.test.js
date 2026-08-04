const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { extractRequestModel, isAgnesModel, selectUpstream, UnifiedGateway } = require('../core/unified-gateway');

function upstream(label) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ url: request.url, auth: request.headers.authorization, body });
      response.setHeader('content-type', 'application/json');
      if (request.url === '/v1/models') response.end(JSON.stringify({ data: [{ id: `${label}-model` }] }));
      else response.end(JSON.stringify({ label, model: JSON.parse(body || '{}').model }));
    });
  });
  return { server, requests };
}

test('unified routing recognizes Jimeng models', () => {
  assert.equal(extractRequestModel('application/json', Buffer.from('{"model":"jimeng-video-3.0"}')), 'jimeng-video-3.0');
  assert.equal(selectUpstream('/v1/chat/completions', 'jimeng-video-3.0', true), 'jimeng');
  assert.equal(selectUpstream('/v1/responses', 'gpt-5', true), 'main');
  assert.equal(selectUpstream('/v1/videos/generations', '', true), 'jimeng');
  assert.equal(isAgnesModel('agnes-video-v2.0'), true);
  assert.equal(selectUpstream('/v1/videos/generations', 'agnes-video-v2.0', true, true), 'agnes');
});

test('unified gateway exposes one key and routes requests by model', async (t) => {
  const main = upstream('main');
  const jimeng = upstream('jimeng');
  await new Promise((resolve) => main.server.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => jimeng.server.listen(0, '127.0.0.1', resolve));
  const settings = {
    router: { port: 0, apiKey: 'unified-secret' },
    connection: { baseUrl: `http://127.0.0.1:${main.server.address().port}`, apiKey: 'main-secret' },
    jimeng: {
      gatewayUrl: `http://127.0.0.1:${jimeng.server.address().port}`,
      selectedAccountId: 'account_12345678',
      accounts: [{ id: 'account_12345678', name: '即梦', region: 'cn', sessionId: 'session-secret-1234' }]
    },
    agnes: { baseUrl: 'https://apihub.agnes-ai.com', apiKey: 'agnes-secret', timeoutSeconds: 10 },
    videos: { connectionKind: 'agnes' }
  };
  const gateway = new UnifiedGateway({
    getSettings: () => settings,
    generateAgnes: async (_connection, payload) => ({ taskId: 'agnes-1', state: 'completed', urls: [`https://cdn.example/${payload.model}.mp4`] })
  });
  await gateway.start();
  t.after(async () => {
    await gateway.stop();
    main.server.close();
    jimeng.server.close();
  });
  const root = gateway.status().root;
  const call = (model) => fetch(`${root}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: 'Bearer unified-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ model })
  }).then((response) => response.json());
  assert.equal((await call('gpt-5')).label, 'main');
  assert.equal((await call('jimeng-video-3.0')).label, 'jimeng');
  const agnesResult = await fetch(`${root}/v1/videos/generations`, {
    method: 'POST',
    headers: { authorization: 'Bearer unified-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'agnes-video-v2.0', prompt: 'test' })
  }).then((response) => response.json());
  assert.equal(agnesResult.data[0].url, 'https://cdn.example/agnes-video-v2.0.mp4');
  assert.equal(main.requests[0].auth, 'Bearer main-secret');
  assert.equal(jimeng.requests[0].auth, 'Bearer session-secret-1234');
  const models = await fetch(`${root}/v1/models`, { headers: { authorization: 'Bearer unified-secret' } }).then((response) => response.json());
  const modelIds = models.data.map((item) => item.id);
  assert.equal(modelIds.includes('jimeng-model'), true);
  assert.equal(modelIds.includes('main-model'), true);
  assert.equal(modelIds.includes('jimeng-video-seedance-2.0-fast'), true);
  assert.equal(modelIds.includes('agnes-video-v2.0'), true);
  assert.equal((await fetch(`${root}/v1/models`, { headers: { authorization: 'Bearer wrong' } })).status, 401);
});
