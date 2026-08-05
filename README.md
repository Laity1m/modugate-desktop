# ModuGate（模渡）

<p align="center">
  <img src="$base/modugate-overview.svg" width="92%" alt="ModuGate Overview" />
</p>

> 一台 Windows 桌面网关，让你把多个模型服务接到同一套 OpenAI 兼容接口上。

## 产品简介

ModuGate 是一个本地运行的桌面网关。它帮助你把 AI 应用的图片、视频、文本任务统一到一个入口，减少“每家模型各接一套代码”的成本。

## 设计目标

- **统一协议**：以 OpenAI 风格请求为主，外部客户端改造成本更低。
- **可控安全**：API Key 由你本机持有，网关在本机运行。
- **可运维**：任务有状态、失败可追踪、长耗时任务更可控。
- **可扩展**：可继续接入更多模型或服务模块。

<p align="center">
  <img src="$base/modugate-flow.svg" width="92%" alt="ModuGate Flow" />
</p>

## v0.5.0 重点能力

### 1. Agnes 视频中转

- 新增 Agnes API 配置卡片与 `agnes-video-v2.0` 预设。
- 支持 `POST /v1/videos` 任务提交。
- 支持任务状态查询与结果地址回填。
- 自动兼容 `video_id`、`task_id` 及常见嵌套字段。
- 自动兼容时长、分辨率与比例策略（如 `8n+1` 帧策略）。

### 2. 任务治理增强

- 支持取消、超时、失败分支。
- 错误提示可读性提升，易于快速定位。
- 后台长任务可持续执行并可在托盘观察。

### 3. 统一能力持续完善

- 保留图片工坊、即梦视频、全能参考、局域网访问。
- `GET /v1/models` 会在配置 Agnes 后返回 `agnes-video-v2.0`。
- 继续强化统一日志与开发者可观测性。

<p align="center">
  <img src="$base/modugate-security.svg" width="92%" alt="Security" />
</p>

## 三步上手

1. 安装：`ModuGate-Setup-0.5.0-x64.exe`
2. 配置：在网关连接里填写 Agnes Key，并应用预设
3. 调用：外部应用使用统一 Base URL + 统一 API Key，模型名使用 `agnes-video-v2.0`

![价值图谱]($base/modugate-value.svg)

## 下载与校验

- `ModuGate-Setup-0.5.0-x64.exe`
- SHA-256：

```text
250D145E9116906BFDF562AA8B996CC190FA59022ED19454BE6CCE8584F25E2E
```

> Windows 首次运行可能出现安全提示（未使用商业代码签名）。请从 GitHub Release 官方页下载。

## 安全边界（建议）

- 密钥请仅保存在可信环境。
- 避免把本地网关 HTTP 服务直接对公网开放。
- 建议在局域网内使用，并加上最小化权限策略。
