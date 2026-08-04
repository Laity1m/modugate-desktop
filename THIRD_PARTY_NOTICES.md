# Third-party notices

The official ModuGate all-in-one installer bundles the following unmodified runtime components. The large binaries are distributed in the GitHub Release installer and are not stored in this repository's Git history.

## CLIProxyAPI 7.2.111

- Project: https://github.com/router-for-me/CLIProxyAPI
- License: MIT
- Bundled source release: https://github.com/router-for-me/CLIProxyAPI/releases/tag/v7.2.111
- Windows x64 archive SHA-256: `F209A15A66DD2D2770723986477FA0F8F3F3E0B244E16028E86CE5A08315BD47`

## CLI Proxy API Management Center 1.21.1

- Project: https://github.com/router-for-me/Cli-Proxy-API-Management-Center
- License: MIT
- Bundled source release: https://github.com/router-for-me/Cli-Proxy-API-Management-Center/releases/tag/v1.21.1
- Bundled panel SHA-256: `3D53097D8F6532E2BD4A5EA7959332B6CDE46AFE3E3491BFFBE4DFFE8EA06F80`

## Sub2API 0.1.168

- Project: https://github.com/Wei-Shaw/sub2api
- License: GNU Lesser General Public License v3.0
- Exact source release: https://github.com/Wei-Shaw/sub2api/releases/tag/v0.1.168

The installer includes the upstream license and README next to the Sub2API binary. ModuGate invokes Sub2API as a separate local process and does not modify its binary.

## PostgreSQL 18.3

- Project: https://www.postgresql.org/
- License: PostgreSQL License
- Windows binaries: Zonky embedded PostgreSQL package

## Redis 7.2.14 and redis-windows 7.2.14

- Redis project: https://github.com/redis/redis/tree/7.2
- Redis license: BSD 3-Clause
- Windows port: https://github.com/redis-windows/redis-windows/releases/tag/7.2.14
- Windows port license: Apache License 2.0

## Microsoft Visual C++ Redistributable 14.44.35211 (x64)

- Official download: https://aka.ms/vs/17/release/vc_redist.x64.exe
- Publisher: Microsoft Corporation
- SHA-256: `CC0FF0EB1DC3F5188AE6300FAEF32BF5BEEBA4BDD6E8E445A9184072096B713B`

## node-qrcode 1.5.4

- Project: https://github.com/soldair/node-qrcode
- License: MIT
- Purpose: generates local-network Base URL QR codes entirely on the user's computer

All trademarks belong to their respective owners. These components are provided without warranty under their respective licenses.

## Jimeng API 1.0.0

- Project: https://github.com/iptag/jimeng-api
- Bundled upstream commit: `b9a4199e5a273415f9dd3155246e9bb39ace4395`
- License: GNU General Public License v3.0
- Bundled `dist/index.js` SHA-256: `417CCC78CA753677958E0EE57ECFDCF4F895AB4AA26C6CF88C137DAEEC2BC44C`
- Purpose: optional local Jimeng-compatible image/video upstream used by ModuGate's unified router

ModuGate distributes this separately executed runtime under GPL-3.0. The exact corresponding source tree, upstream README, license, Node.js license, and commit information are included under `resources/runtime/jimeng`. The service runs as a separate local process and is restricted by ModuGate to `127.0.0.1:8001`.

This reverse-engineered compatibility service is not an official Jimeng or ByteDance product. Its availability and compatibility may change with the website, and users remain responsible for account security, upstream service terms, and local law.
