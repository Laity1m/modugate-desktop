const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateIPv4, listLanIPv4, makeLanUrl } = require('../core/network-access');

test('private IPv4 detection accepts LAN ranges only', () => {
  assert.equal(isPrivateIPv4('192.168.1.107'), true);
  assert.equal(isPrivateIPv4('10.20.30.40'), true);
  assert.equal(isPrivateIPv4('172.16.0.1'), true);
  assert.equal(isPrivateIPv4('172.32.0.1'), false);
  assert.equal(isPrivateIPv4('8.8.8.8'), false);
  assert.equal(isPrivateIPv4('127.0.0.1'), false);
});

test('LAN address selection ignores virtual adapters and prefers Wi-Fi', () => {
  const result = listLanIPv4({
    'singbox TUN': [{ family: 'IPv4', address: '172.18.0.1', internal: false }],
    'VMware Network Adapter VMnet1': [{ family: 'IPv4', address: '192.168.121.1', internal: false }],
    Ethernet: [{ family: 'IPv4', address: '10.0.0.20', internal: false }],
    'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.107', internal: false }],
    Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }]
  });
  assert.deepEqual(result.map((item) => item.address), ['192.168.1.107', '10.0.0.20']);
});

test('LAN URL builder validates the host and port', () => {
  assert.equal(makeLanUrl('192.168.1.107', 8317, 'v1'), 'http://192.168.1.107:8317/v1');
  assert.equal(makeLanUrl('8.8.8.8', 8317, 'v1'), '');
  assert.equal(makeLanUrl('192.168.1.107', 70000), '');
});
