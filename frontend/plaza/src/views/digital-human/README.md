# 粮储数字人（讯飞 Avatar）

从 `jiebang-guashuai` 项目平移并精简后的数字人模块，已挂到 `(dashboard)` 布局右下角。

## 保留了什么

- 讯飞 Avatar Web SDK 3.2.3.1002 的形象连接与文本播报（`useAvatarSpeech.ts`）
- 单一配置入口 `avatar.config.ts`（形象 / 音色 / 网关 / 大模型通道）

## 去掉了什么

- 冷启动播报（原 `cold-start/cold-start-speech.ts`）
- 画像主动推送、建议卡片、路由跳转（原 `avatar-content.ts` 与推送定时器）
- 只读对话、本地规则回复（原项目的输入逻辑）

## 对话链路（数字人的「大脑」）

数字人不直连大模型，走本项目后端已有的讯飞链路，避免前端暴露主账号密钥：

| channel     | 前端接口                       | 后端           | 说明                          |
| ----------- | ------------------------------ | -------------- | ----------------------------- |
| `knowledge` | `/api/backend/chat`            | `/v1/chat`     | 讯飞 MaaS + ChatDoc 检索，默认 |
| `assistant` | `/api/backend/assistant-chat`  | `/v1/assistant/chat` | 讯飞星火助手，需配置 assistantId |

切换方式：`avatar.config.ts` 的 `AVATAR_LLM_CONFIG.channel`，或环境变量 `NEXT_PUBLIC_XF_AVATAR_LLM_CHANNEL`。

## 用户画像 / 用户信息

`user-profile.ts` 维护一份轻量本地画像（localStorage）：

- 身份：学生 / 教师 / 研究人员 / 粮库技术人员（面板右上角可切换）
- 行为：累计提问次数、最近提问、命中的粮储关注方向（低温储粮、气调储藏、熏蒸杀虫、品质检验…）
- 注入方式：`composePrompt()` 把画像摘要拼在问题前，一起发给讯飞大模型；后端无需新增字段
- 会话 ID 复用主聊天页的 `grain-learning-session`，保持上下文一致

## 配置

默认值已在 `avatar.config.ts` 写死，可直接在代码里改；也可用 `frontend/plaza/.env.local` 覆盖：

```bash
NEXT_PUBLIC_XF_AVATAR_SCENE_ID=
NEXT_PUBLIC_XF_AVATAR_APP_ID=
NEXT_PUBLIC_XF_AVATAR_API_KEY=
NEXT_PUBLIC_XF_AVATAR_API_SECRET=
NEXT_PUBLIC_XF_AVATAR_SERVER_URL=wss://avatar.cn-huadong-1.xf-yun.com/v1/interact
NEXT_PUBLIC_XF_AVATAR_ID=
NEXT_PUBLIC_XF_AVATAR_VCN=x4_yiting
NEXT_PUBLIC_XF_AVATAR_PROTOCOL=xrtc
NEXT_PUBLIC_XF_AVATAR_LLM_CHANNEL=knowledge
NEXT_PUBLIC_XF_ASSISTANT_ID=
```

## 交互

- 右下角悬浮按钮展开 / 收起；收起状态存 sessionStorage
- 「播报开 / 关」控制回答是否由数字人念出；「停用」关闭数字人连接（仍可文字提问）
- 数字人连接失败时面板内可直接点「重新连接」
