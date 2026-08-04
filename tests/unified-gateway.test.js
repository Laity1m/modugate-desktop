const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { extractRequestModel, selectUpstream, UnifiedGateway } = require('../core/unified-gateway');

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
    }
  };
  const gateway = new UnifiedGateway({ getSettings: () => settings });
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
  assert.equal(main.requests[0].auth, 'Bearer main-secret');
  assert.equal(jimeng.requests[0].auth, 'Bearer session-secret-1234');
  const models = await fetch(`${root}/v1/models`, { headers: { authorization: 'Bearer unified-secret' } }).then((response) => response.json());
  const modelIds = models.data.map((item) => item.id);
  assert.equal(modelIds.includes('jimeng-model'), true);
  assert.equal(modelIds.includes('main-model'), true);
  assert.equal(modelIds.includes('jimeng-video-seedance-2.0-fast'), true);
  assert.equal((await fetch(`${root}/v1/models`, { headers: { authorization: 'Bearer wrong' } })).status, 401);
});
