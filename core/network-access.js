const os = require('node:os');

const VIRTUAL_INTERFACE = /(?:loopback|virtual|vmware|vbox|hyper-v|vethernet|wsl|docker|podman|tun|tap|singbox|tailscale|zerotier|host-only)/i;
const PREFERRED_INTERFACE = /(?:wi-?fi|wlan|wireless|ethernet|以太网|无线)/i;

function isPrivateIPv4(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return parts[0] === 192 && parts[1] === 168;
}

function addressScore(name, address) {
  let score = 0;
  if (PREFERRED_INTERFACE.test(name)) score += 40;
  if (address.startsWith('192.168.')) score += 30;
  else if (address.startsWith('10.')) score += 20;
  else score += 10;
  return score;
}

function listLanIPv4(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces || {})) {
    if (VIRTUAL_INTERFACE.test(name)) continue;
    for (const item of addresses || []) {
      const family = typeof item.family === 'string' ? item.family : item.family === 4 ? 'IPv4' : '';
      if (family !== 'IPv4' || item.internal || !isPrivateIPv4(item.address)) continue;
      candidates.push({ address: item.address, name, score: addressScore(name, item.address) });
    }
  }
  return Array.from(new Map(
    candidates
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .map((item) => [item.address, item])
  ).values());
}

function makeLanUrl(address, port, suffix = '') {
  if (!isPrivateIPv4(address)) return '';
  const normalizedPort = Number(port);
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) return '';
  const normalizedSuffix = suffix ? `/${String(suffix).replace(/^\/+/, '')}` : '';
  return `http://${address}:${normalizedPort}${normalizedSuffix}`;
}

module.exports = { isPrivateIPv4, listLanIPv4, makeLanUrl };
