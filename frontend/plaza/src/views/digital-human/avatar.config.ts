/**
 * 讯飞数字人接入配置（Avatar Web SDK 3.2.3.1002）
 *
 * 本文件是数字人唯一的「配置入口」：换账号 / 换形象 / 换音色 / 换大模型通道，
 * 只改这里即可，不需要动组件代码。
 *
 * 一、数字人形象通道（Avatar Web SDK，WebSocket 直连）
 *   - sceneId / appId / apiKey / apiSecret：讯飞开放平台「数字人交互」服务凭证
 *   - serverUrl：网关地址（华东一区，与 SDK 默认一致）
 *   - avatarId：形象 ID，vcn：音色，protocol：推流协议（xrtc | webrtc）
 *   以上均可用 .env.local 里的 NEXT_PUBLIC_XF_AVATAR_* 覆盖。
 *
 * 二、大模型通道（数字人的「大脑」，走本项目后端，不额外暴露主账号密钥）
 *   - knowledge：/api/backend/chat            → FastAPI /v1/chat → 讯飞 MaaS（带知识库检索）
 *   - assistant：/api/backend/assistant-chat  → FastAPI /v1/assistant/chat → 讯飞星火助手
 *   默认 knowledge，与本项目主链路一致。
 */

export const AVATAR_CONFIG = {
  /** 服务 ID */
  sceneId: process.env.NEXT_PUBLIC_XF_AVATAR_SCENE_ID || '356356451834400768',

  /** APPID */
  appId: process.env.NEXT_PUBLIC_XF_AVATAR_APP_ID || 'f5d7b8f7',

  /** APIKey */
  apiKey: process.env.NEXT_PUBLIC_XF_AVATAR_API_KEY || 'fd9cf69e48d14ae73c7d14ef9ef1a30d',

  /** APISecret */
  apiSecret: process.env.NEXT_PUBLIC_XF_AVATAR_API_SECRET || 'MWRjZWFmNDMxMmQ4ZDQxNzYxYTQ3NzQ0',

  /** WebSocket 网关（华东一区） */
  serverUrl: process.env.NEXT_PUBLIC_XF_AVATAR_SERVER_URL || 'wss://avatar.cn-huadong-1.xf-yun.com/v1/interact',

  /** 数字人形象 ID */
  avatarId: process.env.NEXT_PUBLIC_XF_AVATAR_ID || '111204004',

  /** 音色 */
  vcn: process.env.NEXT_PUBLIC_XF_AVATAR_VCN || 'x4_yezi',

  /** 推流协议：xrtc | webrtc（xrtc 播放器在生产构建压缩后会损坏，默认用 webrtc） */
  protocol: (process.env.NEXT_PUBLIC_XF_AVATAR_PROTOCOL || 'webrtc') as 'xrtc' | 'webrtc' | 'rtmp',

  /** 画面尺寸 */
  width: 480,
  height: 854
} as const

/** 大模型通道：knowledge = 项目知识库链路（讯飞 MaaS）；assistant = 星火助手智能体 */
export type AvatarLlmChannel = 'knowledge' | 'assistant'

export const AVATAR_LLM_CONFIG = {
  /** 通道选择，可用 NEXT_PUBLIC_XF_AVATAR_LLM_CHANNEL 覆盖 */
  channel: (process.env.NEXT_PUBLIC_XF_AVATAR_LLM_CHANNEL || 'knowledge') as AvatarLlmChannel,

  /** 知识库链路（讯飞 MaaS + ChatDoc 检索） */
  knowledgeEndpoint: '/api/backend/chat',

  /** 星火助手链路 */
  assistantEndpoint: '/api/backend/assistant-chat',

  /** 星火助手 ID（channel=assistant 时必填，对应 configs/agents 里的 assistantId） */
  assistantId: process.env.NEXT_PUBLIC_XF_ASSISTANT_ID || '',

  /** 单次播报的最大字数（超出截断，避免数字人念太久） */
  maxSpeakChars: 220,

  /** 携带的历史轮数 */
  historyTurns: 6
} as const

/** 数字人总开关（localStorage） */
export const AVATAR_ENABLED_KEY = 'grain.avatar-enabled.v1'

/** 面板收起状态（localStorage，跨会话记住；默认收起，用户打开过后保持展开） */
export const AVATAR_CLOSED_KEY = 'grain.avatar-closed.v1'

/** 首次进入时的问候语 */
export const AVATAR_GREETING =
  '你好，我是粮储数字助手。储藏技术、仓房管理、虫霉防治、品质检验都可以直接问我。'
