# ModuGate v0.3.0

**发布日期：2026 年 8 月 1 日 · Windows x64**

ModuGate v0.3.0 把本地 AI 网关、账号授权、文本与图片接口测试，以及真实 CLI 兼容性检查集中到一个 Windows 桌面界面中。本版本延续轻量 CLIProxyAPI 与完整 Sub2API 双引擎设计，新增图片工坊，同时修复长页面溢出和无法下滑的问题，并加入系统托盘后台运行能力。

对于普通用户，下载一个安装包即可获得完整本地运行环境；对于开发者，可以使用 OpenAI Chat Completions、Responses、Images 和 Anthropic Messages 等兼容接口，将 ModuGate 作为本机 AI 工具的统一连接入口。

## 功能

- 内置轻量 CLIProxyAPI 和完整 Sub2API 双引擎；
- 支持 ChatGPT/Codex、Claude、Google/Gemini、Kimi 和 Grok 授权入口；
- 支持 Chat Completions、Responses 和 Anthropic Messages 协议测试；
- 新增图片工坊，支持 OpenAI 兼容的 `/v1/images/generations` 与 `/v1/images/edits` 接口；
- 支持文生图、多参考图编辑、取消请求、结果预览与下载、API 示例复制，以及最多 24 条本机历史；
- 支持检测并调用本机已经安装的 Hermes、Codex 和 Claude Code；
- 一体化安装 PostgreSQL、Redis 和必要运行组件，无需 Docker 或 WSL；
- 修复长页面被窗口撑开、无法继续下滑的问题，并增加窄窗口与低高度适配；
- 增加系统托盘后台模式：最小化或关闭窗口后继续运行本地服务；
- API Key 和本地管理凭据使用 Windows 安全存储保护。

## 下载

仅提供 Windows x64 一体化安装包：

```text
ModuGate-Setup-0.3.0-x64.exe
```

SHA-256：

```text
ABA323FEF9AD053F07DA0750927CF4A9760B7E8262A107E75BEB6DF4C4FCE3F5
```

## 注意

- 安装包未购买商业代码签名证书，Windows 可能显示安全提醒。
- Hermes、Codex 和 Claude Code 客户端不包含在安装包中，真实客户端测试需要用户自行安装对应 CLI。
- ModuGate 不是模型厂商的官方产品。网页订阅不等于官方 API 额度，兼容转接可能受到上游服务条款限制。
- 图片功能是否可用取决于所连接的模型和上游服务能力；ModuGate 不会绕过上游地区、账号或内容安全限制。
