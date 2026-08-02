# ModuGate（模渡）

> 一个面向 Windows 的本地 AI API 网关与兼容性测试工具。

[下载最新版](https://github.com/Laity1m/modugate-desktop/releases/latest) · [安全说明](SECURITY.md) · [第三方组件](THIRD_PARTY_NOTICES.md)

ModuGate 把账号授权、本地网关和 AI 开发工具集中到一个可视化桌面界面中。官方一体化安装包内置轻量 CLIProxyAPI 与完整 Sub2API 运行环境，无需另外配置 Docker、PostgreSQL 或 Redis，即可启动本地兼容 API，并测试 Hermes Agent、OpenAI Codex 和 Claude Code 等客户端。

## 当前版本：v0.3.1

**发布日期：2026 年 8 月 2 日 · 适用于 Windows x64**

v0.3.1 在一体化桌面版中补齐手机与局域网设备访问能力。轻量 OAuth 引擎可以按需从仅本机监听切换为局域网监听，界面会自动识别真实 Wi-Fi / 以太网地址，并提供 Base URL、独立 API Key 复制按钮和离线二维码。

- **新增手机访问**：可让同一 Wi-Fi 下的手机、平板或另一台电脑调用 ModuGate 生成的 API。
- **自动识别网卡**：优先选择真实 Wi-Fi / 以太网地址，并过滤常见 TUN、VMware、Docker 等虚拟网卡。
- **安全默认值不变**：功能默认关闭；管理接口、PostgreSQL 和 Redis 始终保持本机访问，二维码也不会包含 API Key。
- **连接状态提示**：显示局域网监听状态，并提供 Windows 防火墙排查说明。
- **新增图片能力**：支持 OpenAI 兼容的图片生成与图片编辑接口，可添加最多 4 张参考图，并设置尺寸、质量、数量、格式和背景。
- **完整结果工作流**：支持生成中取消、结果预览与下载、PowerShell API 示例复制，以及最多 24 条本机历史记录。
- **修复界面溢出**：长页面可以独立滚动，导航栏、表单和结果面板会随窗口宽度自动调整，低高度窗口也能查看全部内容。
- **支持后台运行**：最小化或关闭主窗口后，本地网关可以继续在系统托盘中运行，并可随时恢复窗口或完全退出。
- **一体化安装**：安装包继续内置轻量 CLIProxyAPI、完整 Sub2API、PostgreSQL 和 Redis 运行环境，普通用户无需另行配置 Docker 或 WSL。

完整变更与安装注意事项见 [v0.3.1 发布说明](RELEASE_NOTES.md)。

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
- **手机与局域网访问**：轻量引擎可按需共享给同一局域网设备，并提供地址复制与二维码。
- **本地安全存储**：API Key 和管理凭据通过 Electron `safeStorage` 使用 Windows 系统能力保护；服务默认仅监听 `127.0.0.1`，局域网共享需手动开启。

> Hermes、Codex 和 Claude Code 客户端本身不包含在安装包内。内置测试台可以独立使用；真实客户端测试需要用户先安装对应 CLI。

## 下载

当前只发布最新版：**v0.3.1 · Windows x64**

前往 [Releases](https://github.com/Laity1m/modugate-desktop/releases/latest) 下载：

```text
ModuGate-Setup-0.3.1-x64.exe
```

安装包暂未购买商业代码签名证书，Windows 首次运行时可能显示安全提醒。请从本仓库 Release 下载，并核对 Release 页面公布的 SHA-256。

```text
6273D82948D839D890BB8772695CABF12C3C9B6B9DEF4C7AF7CF37BBF0106F39
```

## 快速开始

1. 安装并打开 ModuGate，进入“服务与日志”。
2. 保持“轻量 OAuth”模式，点击“保存并启动”。
3. 选择模型服务商，并在其官方网页完成授权。
4. 回到“网关连接”，点击“保存并检测”。
5. 文本模型可在“协议测试”中运行 Hermes、Codex 或 Claude Code 预设。
6. 图片模型可在“图片工坊”中生成或编辑图片；所连接的上游账号/服务需要支持 `/v1/images/generations` 或 `/v1/images/edits`。
7. 把软件显示的本地 API 地址和 API Key 填入支持自定义接口的 AI 工具。

### 让手机使用电脑上的 API

1. 让手机与电脑连接同一个 Wi-Fi，不要使用访客网络或启用了设备隔离的热点。
2. 在“服务与日志 → 轻量 OAuth”中打开“允许同一局域网访问”。
3. 点击“保存并启动”，等待状态变为“API 已监听局域网”。
4. 用手机扫描二维码，或复制界面显示的 `http://电脑局域网地址:8317/v1`。
5. 在手机端支持自定义 OpenAI 接口的应用中填写该 Base URL，并单独填写 ModuGate 显示的 API Key。

如果手机连接超时，请将当前 Windows 网络设为“专用网络”，并在 Windows Defender 防火墙中允许 ModuGate 或 `cli-proxy-api.exe` 的专用网络入站访问。不要做路由器端口映射，也不要把此 HTTP 地址直接暴露到公网。

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
