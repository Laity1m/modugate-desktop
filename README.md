# ModuGate（模渡）

> 一个面向 Windows 的本地 AI API 网关与兼容性测试工具。

[下载最新版](https://github.com/Laity1m/modugate-desktop/releases/latest) · [安全说明](SECURITY.md) · [第三方组件](THIRD_PARTY_NOTICES.md)

ModuGate 把账号授权、本地网关和 AI 开发工具集中到一个可视化桌面界面中。官方一体化安装包内置轻量 CLIProxyAPI 与完整 Sub2API 运行环境，无需另外配置 Docker、PostgreSQL 或 Redis，即可启动本地兼容 API，并测试 Hermes Agent、OpenAI Codex 和 Claude Code 等客户端。

## 当前版本：v0.3.0

**发布日期：2026 年 8 月 1 日 · 适用于 Windows x64**

v0.3.0 是 ModuGate 当前的一体化桌面版本。在原有双引擎网关、OAuth 账号接入、三类文本协议测试和真实 CLI 兼容性检查基础上，本版本新增完整的图片工坊，并重点改善了小屏幕、低分辨率和长期后台运行时的桌面体验。

- **新增图片能力**：支持 OpenAI 兼容的图片生成与图片编辑接口，可添加最多 4 张参考图，并设置尺寸、质量、数量、格式和背景。
- **完整结果工作流**：支持生成中取消、结果预览与下载、PowerShell API 示例复制，以及最多 24 条本机历史记录。
- **修复界面溢出**：长页面可以独立滚动，导航栏、表单和结果面板会随窗口宽度自动调整，低高度窗口也能查看全部内容。
- **支持后台运行**：最小化或关闭主窗口后，本地网关可以继续在系统托盘中运行，并可随时恢复窗口或完全退出。
- **一体化安装**：安装包继续内置轻量 CLIProxyAPI、完整 Sub2API、PostgreSQL 和 Redis 运行环境，普通用户无需另行配置 Docker 或 WSL。

完整变更与安装注意事项见 [v0.3.0 发布说明](RELEASE_NOTES.md)。

## 主要功能

- **双引擎模式**：内置轻量 CLIProxyAPI 和完整 Sub2API，可按需求切换。
- **可视化账号授权**：支持 ChatGPT/Codex、Claude、Google/Gemini、Kimi 和 Grok 授权接入。
- **三种兼容协议**：支持 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages。
- **图片工坊**：支持 OpenAI 兼容的图片生成与编辑接口，可预览、下载、复制 API 示例，并在本机保留最近 24 条历史。
- **内置协议测试台**：直接测试模型连接、流式响应、延迟和可用模型。
- **真实客户端测试**：检测并调用本机已经安装的 Hermes、Codex 和 Claude Code。
- **本地管理控制台**：支持服务启停、日志查看、账号管理和连接诊断。
- **响应式桌面界面**：长页面可独立滚动，并适配窄窗口与低高度屏幕。
- **系统托盘后台运行**：最小化或关闭窗口后服务继续运行，可从托盘恢复或退出。
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
ABA323FEF9AD053F07DA0750927CF4A9760B7E8262A107E75BEB6DF4C4FCE3F5
```

## 快速开始

1. 安装并打开 ModuGate，进入“服务与日志”。
2. 保持“轻量 OAuth”模式，点击“保存并启动”。
3. 选择模型服务商，并在其官方网页完成授权。
4. 回到“网关连接”，点击“保存并检测”。
5. 文本模型可在“协议测试”中运行 Hermes、Codex 或 Claude Code 预设。
6. 图片模型可在“图片工坊”中生成或编辑图片；所连接的上游账号/服务需要支持 `/v1/images/generations` 或 `/v1/images/edits`。
7. 把软件显示的本地 API 地址和 API Key 填入支持自定义接口的 AI 工具。

最小化或关闭主窗口不会停止本地服务。单击系统托盘中的 ModuGate 图标可以恢复窗口；需要完全结束程序时，请在托盘菜单中选择“退出 ModuGate”。

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

图片工坊的生成结果和缩略图也只保存在当前 Windows 用户的本地应用数据目录中；可以在图片工坊里一键清空历史。

## 开源许可

ModuGate 桌面程序使用 [MIT License](LICENSE)。安装包内的 Sub2API、CLIProxyAPI、PostgreSQL、Redis 等组件分别遵循各自的许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

各产品名称和商标归其权利人所有。
