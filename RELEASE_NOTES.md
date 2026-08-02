# ModuGate v0.3.1

**发布日期：2026 年 8 月 2 日 · Windows x64**

ModuGate v0.3.1 在现有双引擎、图片工坊、响应式界面和系统托盘后台运行能力上，新增安全可控的手机 / 局域网 API 访问。轻量 OAuth 引擎默认仍只监听本机；用户主动打开开关并重新启动服务后，同一 Wi-Fi 下的手机、平板或另一台电脑可以通过 OpenAI 兼容接口调用模型。

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
- 新增“允许同一局域网访问”开关，并在切换后自动安全重启轻量引擎；
- 自动识别真实 Wi-Fi / 以太网地址，过滤常见 TUN、VMware、Docker 等虚拟网卡；
- 提供手机 Base URL、离线二维码、Base URL 与 API Key 独立复制按钮；
- 显示局域网监听状态与 Windows 防火墙排查提示；
- 管理接口继续限制在本机，PostgreSQL 与 Redis 不对局域网开放；
- API Key 和本地管理凭据使用 Windows 安全存储保护。

## 下载

仅提供 Windows x64 一体化安装包：

```text
ModuGate-Setup-0.3.1-x64.exe
```

SHA-256：

```text
6273D82948D839D890BB8772695CABF12C3C9B6B9DEF4C7AF7CF37BBF0106F39
```

## 注意

- 安装包未购买商业代码签名证书，Windows 可能显示安全提醒。
- Hermes、Codex 和 Claude Code 客户端不包含在安装包中，真实客户端测试需要用户自行安装对应 CLI。
- ModuGate 不是模型厂商的官方产品。网页订阅不等于官方 API 额度，兼容转接可能受到上游服务条款限制。
- 图片功能是否可用取决于所连接的模型和上游服务能力；ModuGate 不会绕过上游地区、账号或内容安全限制。
- 局域网共享只适合可信的家庭或办公专用网络。不要进行路由器端口映射，也不要把 HTTP 接口直接暴露到公网。
- 二维码只包含 Base URL，不包含 API Key；API Key 应仅提供给你信任的设备。
