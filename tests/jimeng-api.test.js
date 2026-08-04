const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { normalizeJimengAccount, jimengCredential, maskJimengAccount, checkJimengAccount } = require('../core/jimeng-api');

test('Jimeng accounts normalize region prefixes and mask session ids', () => {
  const account = normalizeJimengAccount({
    id: 'account_12345678',
    name: '海外账号',
    region: 'cn',
    sessionId: 'Bearer us-session-secret-1234'
  });
  assert.equal(account.region, 'us');
  assert.equal(account.sessionId, 'session-secret-1234');
  assert.equal(jimengCredential(account), 'us-session-secret-1234');
  assert.equal(maskJimengAccount(account), 'us-••••••••1234');
});

test('Jimeng accounts accept cookie pairs and sessionid_ss', () => {
  const fromCookie = normalizeJimengAccount({
    id: 'account_cookie_1',
    name: 'Cookie account',
    region: 'cn',
    sessionId: 'foo=bar; sessionid=real-session-value; sessionid_ss=secondary-value'
  });
  assert.equal(fromCookie.sessionId, 'real-session-value');

  const fromSecureCookie = normalizeJimengAccount({
    id: 'account_cookie_2',
    name: 'Secure cookie account',
    region: 'cn',
    sessionId: 'sessionid_ss=secure-session-value; other=value'
  });
  assert.equal(fromSecureCookie.sessionId, 'secure-session-value');
});

test('Jimeng account check uses the dedicated token endpoints without returning the token', async (t) => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ url: request.url, authorization: request.headers.authorization, body });
      response.setHeader('content-type', 'application/json');
      if (request.url === '/token/check') response.end(JSON.stringify({ live: true }));
      else response.end(JSON.stringify([{ points: { totalCredit: 88, vipCredit: 80 } }]));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const result = await checkJimengAccount(`http://127.0.0.1:${address.port}`, {
    id: 'account_12345678', name: '测试账号', region: 'cn', sessionId: 'session-secret-1234'
  });
  assert.equal(result.live, true);
  assert.equal(result.points.totalCredit, 88);
  assert.equal(JSON.stringify(result).includes('session-secret'), false);
  assert.equal(JSON.parse(requests[0].body).token, 'session-secret-1234');
  assert.equal(requests[1].authorization, 'Bearer session-secret-1234');
});

test('Jimeng account check falls back to credits when the legacy live check is inconclusive', async (t) => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/token/check') response.end(JSON.stringify({ live: false }));
    else response.end(JSON.stringify([{ points: { totalCredit: 12 } }]));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const result = await checkJimengAccount(`http://127.0.0.1:${address.port}`, {
    id: 'account_12345678', name: 'Fallback account', region: 'cn', sessionId: 'session-secret-1234'
  });
  assert.equal(result.live, true);
  assert.equal(result.status, 'valid');
  assert.equal(result.points.totalCredit, 12);
});
