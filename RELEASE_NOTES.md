# ModuGate v0.5.0

**发布日期：2026 年 8 月 4 日 · Windows x64**

ModuGate v0.5.0 新增 Agnes 视频中转。客户端只需调用 ModuGate 的 OpenAI 兼容视频接口，软件会负责向 Agnes 提交任务、循环查询状态，并在成功后一次性返回最终视频 URL。

## 新功能

- 新增 Agnes API 配置卡片和 `agnes-video-v2.0` 视频预设；
- Agnes API Key 使用 Windows 安全存储加密，仅保存在当前用户本机；
- 支持 `POST /v1/videos` 提交任务、`/agnesapi` 状态轮询及旧任务查询路径回退；
- 自动识别 `video_id`、`task_id` 和常见嵌套视频地址字段；
- 自动把界面的时长换算成 Agnes 要求的 `8n+1` 帧，并转换比例与分辨率；
- 本机统一接口 `/v1/videos/generations` 会根据 `agnes-*` 模型自动分流；
- 手机或其他电脑调用统一接口时，也可直接等待并取得最终视频地址；
- 支持取消、超时、失败状态以及上游错误的中文提示；
- `/v1/models` 在配置 Agnes Key 后会公开 `agnes-video-v2.0`；
- 保留图片工坊、即梦视频、全能参考、后台托盘、响应式界面和局域网访问能力。

## 使用方法

1. 在 Agnes 平台创建自己的 API Key；
2. 打开“网关连接”，在“Agnes 视频中转”中粘贴 Key；
3. 点击“应用 Agnes 预设”，保存设置；
4. 在“视频工坊”输入提示词并开始测试；
5. 外部客户端使用 ModuGate 显示的统一 Base URL、统一 API Key，并指定模型 `agnes-video-v2.0`。

v0.5.0 的 Agnes 中转先支持文生视频，不接受本地参考素材。任务可能需要数分钟；关闭主窗口后 ModuGate 可继续在系统托盘后台运行。

## 安全边界

- 仅使用你自己从 Agnes 平台申请且有权使用的 API Key；
- ModuGate 不绕过 Agnes 的额度、计费、内容审核、风控或地区规则；
- 不要把 Agnes Key、统一 API Key、即梦 sessionid 或应用数据上传到 GitHub；
- 手机访问只建议用于可信局域网，不要把未加密的本地 HTTP 服务映射到公网。

## 下载文件

```text
ModuGate-Setup-0.5.0-x64.exe
```

SHA-256：

```text
250D145E9116906BFDF562AA8B996CC190FA59022ED19454BE6CCE8584F25E2E
```

安装包未购买商业代码签名证书，Windows 首次运行时可能显示安全提醒。请仅从本仓库 Release 页面下载，并核对 SHA-256。
