# ModuGate v0.3.0

ModuGate 的第一个公开版本。它把本地 AI 网关、账号授权、协议测试和真实 CLI 兼容性检查集中到一个 Windows 桌面界面中。

## 功能

- 内置轻量 CLIProxyAPI 和完整 Sub2API 双引擎；
- 支持 ChatGPT/Codex、Claude、Google/Gemini、Kimi 和 Grok 授权入口；
- 支持 Chat Completions、Responses 和 Anthropic Messages 协议测试；
- 支持检测并调用本机已经安装的 Hermes、Codex 和 Claude Code；
- 一体化安装 PostgreSQL、Redis 和必要运行组件，无需 Docker 或 WSL；
- API Key 和本地管理凭据使用 Windows 安全存储保护。

## 下载

仅提供 Windows x64 一体化安装包：

```text
ModuGate-Setup-0.3.0-x64.exe
```

SHA-256：

```text
F0EA4BC0DDAC1EDCBDC6230E3BD44E979D25E9AC37E0184B2DC5681793893604
```

## 注意

- 安装包未购买商业代码签名证书，Windows 可能显示安全提醒。
- Hermes、Codex 和 Claude Code 客户端不包含在安装包中，真实客户端测试需要用户自行安装对应 CLI。
- ModuGate 不是模型厂商的官方产品。网页订阅不等于官方 API 额度，兼容转接可能受到上游服务条款限制。
