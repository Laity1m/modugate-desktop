# ModuGate（模渡）

> 一个面向 Windows 的本地 AI API 网关与兼容性测试工具。

[下载最新版](https://github.com/Laity1m/modugate-desktop/releases/latest) · [安全说明](SECURITY.md) · [第三方组件](THIRD_PARTY_NOTICES.md)

ModuGate 把账号授权、本地网关和 AI 开发工具集中到一个可视化桌面界面中。官方一体化安装包内置轻量 CLIProxyAPI 与完整 Sub2API 运行环境，无需另外配置 Docker、PostgreSQL 或 Redis，即可启动本地兼容 API，并测试 Hermes Agent、OpenAI Codex 和 Claude Code 等客户端。

## 主要功能

- **双引擎模式**：内置轻量 CLIProxyAPI 和完整 Sub2API，可按需求切换。
- **可视化账号授权**：支持 ChatGPT/Codex、Claude、Google/Gemini、Kimi 和 Grok 授权接入。
- **三种兼容协议**：支持 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages。
- **内置协议测试台**：直接测试模型连接、流式响应、延迟和可用模型。
- **真实客户端测试**：检测并调用本机已经安装的 Hermes、Codex 和 Claude Code。
- **本地管理控制台**：支持服务启停、日志查看、账号管理和连接诊断。
- **本地安全存储**：API Key 和管理凭据通过 Electron `safeStorage` 使用 Windows 系统能力保护；服务默认仅监听 `127.0.0.1`。

> Hermes、Codex 和 Claude Code 客户端本身不包含在安装包内。内置测试台可以独立使用；真实客户端测试需要用户先安装对应 CLI。

## 下载

当前只发布最新版：**v0.3.0 · Windows x64**

前往 [Releases](https://github.com/Laity1m/modugate-desktop/releases/latest) 下载：

```text
ModuGate-Setup-0.3.0-x64.exe
```

安装包暂未购买商业代码签名证书，Windows 首次运行时可能显示安全提醒。请从本仓库 Release 下载，并核对 Release 页面公布的 SHA-256。

```text
F0EA4BC0DDAC1EDCBDC6230E3BD44E979D25E9AC37E0184B2DC5681793893604
```

## 快速开始

1. 安装并打开 ModuGate，进入“服务与日志”。
2. 保持“轻量 OAuth”模式，点击“保存并启动”。
3. 选择模型服务商，并在其官方网页完成授权。
4. 回到“网关连接”，点击“保存并检测”。
5. 在“协议测试”中运行 Hermes、Codex 或 Claude Code 预设。
6. 把软件显示的本地 API 地址和 API Key 填入支持自定义接口的 AI 工具。

需要多用户、账号池和分组管理时，可以切换到“完整 Sub2API”模式。也可以连接外部服务、Docker Compose 或自定义 Sub2API 可执行文件。

## 本地开发

需要 Node.js 20 或更高版本，以及 pnpm。

```powershell
pnpm install
pnpm test
pnpm start
```

官方一体化构建还需要准备 `runtime` 目录中的第三方运行组件。组件版本、来源和许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。这些大型二进制文件不进入 Git 历史。

```powershell
pnpm run build:win
```

## 安全与使用边界

ModuGate 是第三方开源工具，不是 OpenAI、Anthropic、Google 或其他模型厂商的官方产品。

网页订阅不等于官方 API 额度。通过第三方兼容网关转接订阅账号，可能违反对应服务商的使用条款，并可能导致账号限制。请仅连接你有权使用的账号和服务，不要尝试绕过访问控制、计费限制或地区限制。生产环境和重要业务优先使用官方 API。

配置与账号授权数据保存在当前 Windows 用户的应用数据目录中，不会随着安装包复制到另一台电脑。请不要提交账号凭据、API Key、授权文件或运行数据到 GitHub。

## 开源许可

ModuGate 桌面程序使用 [MIT License](LICENSE)。安装包内的 Sub2API、CLIProxyAPI、PostgreSQL、Redis 等组件分别遵循各自的许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

各产品名称和商标归其权利人所有。
