/**
 * 数字人用户画像 / 用户信息
 *
 * 本项目没有独立的画像服务，这里做一份「轻量本地画像」：
 * - 身份信息：角色（学生 / 教师 / 研究人员 / 粮库技术人员）、会话 ID
 * - 行为信息：累计提问数、最近提问、命中的粮储关注方向
 * - 落 localStorage 跨会话保留；同时读取主聊天页已有的会话 ID，保持上下文一致
 *
 * 用途只有一个：给数字人接的讯飞大模型一段「用户画像」上下文，
 * 让简单对话能贴合用户身份与关注方向。不做推送、不做冷启动播报。
 */
import type { UserRole } from '@/types/grain'

export type GrainUserProfile = {
  /** 角色（对应后端 Role 枚举） */
  role: UserRole
  /** 会话 ID（复用主聊天页的 grain-learning-session） */
  sessionId: string
  /** 累计提问次数 */
  questionCount: number
  /** 命中的关注方向（粮储领域关键词标签，按最近命中排序） */
  interests: string[]
  /** 最近提问（最多 5 条，最新在前） */
  recentQuestions: string[]
  /** 最近更新时间 */
  updatedAt: string
}

const PROFILE_STORAGE_KEY = 'grain.avatar-profile.v1'
const SESSION_STORAGE_KEY = 'grain-learning-session'
const MAX_RECENT_QUESTIONS = 5
const MAX_INTERESTS = 4

export const ROLE_LABELS: Record<UserRole, string> = {
  student: '学生',
  teacher: '教师',
  researcher: '研究人员',
  technician: '粮库技术人员'
}

/** 粮储领域关注方向关键词表：命中即记为该用户的关注方向 */
const INTEREST_KEYWORDS: ReadonlyArray<{ label: string; words: readonly string[] }> = [
  { label: '低温储粮', words: ['低温', '控温', '谷冷', '制冷', '空调'] },
  { label: '气调储藏', words: ['气调', '氮气', '降氧', '二氧化碳', '密闭'] },
  { label: '熏蒸杀虫', words: ['熏蒸', '磷化氢', '杀虫', '害虫', '抗性', '环流'] },
  { label: '霉变防治', words: ['霉', '真菌', '毒素', '呕吐毒素', '黄曲霉', '发热'] },
  { label: '水分控制', words: ['水分', '干燥', '烘干', '降水', '吸湿', '结露'] },
  { label: '通风与粮温', words: ['通风', '粮温', '测温', '粮情', '测控'] },
  { label: '仓房与设施', words: ['仓房', '平房仓', '浅圆仓', '立筒仓', '仓型', '气密', '隔热'] },
  { label: '品质检验', words: ['品质', '检验', '脂肪酸', '面筋', '品尝', '陈化', '发芽率', '检测'] },
  { label: '绿色储粮', words: ['绿色', '减排', '节能', '惰性粉', '生物防治', '无公害'] },
  { label: '出入库管理', words: ['出入仓', '入库', '出库', '计量', '扦样', '堆存', '倒仓'] },
  { label: '安全管理', words: ['安全', '消防', '粉尘', '有限空间', '作业', '防护'] },
  { label: '标准与规程', words: ['标准', '规程', '规范', '制度', '条例', '国标'] }
]

const isBrowser = () => typeof window !== 'undefined'

export function createEmptyProfile(): GrainUserProfile {
  return {
    role: 'student',
    sessionId: '',
    questionCount: 0,
    interests: [],
    recentQuestions: [],
    updatedAt: new Date().toISOString()
  }
}

/** 读取本地画像；无数据时返回空画像 */
export function loadProfile(): GrainUserProfile {
  const empty = createEmptyProfile()

  if (!isBrowser()) return empty

  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY)

  if (!raw) return empty

  try {
    return normalizeProfile(JSON.parse(raw) as Partial<GrainUserProfile>)
  } catch {
    return empty
  }
}

/** 兼容旧数据 / 手改数据：字段缺失时补默认值 */
export function normalizeProfile(input: Partial<GrainUserProfile>): GrainUserProfile {
  const role = (['student', 'teacher', 'researcher', 'technician'] as const).includes(input.role as UserRole)
    ? (input.role as UserRole)
    : 'student'

  return {
    role,
    sessionId: typeof input.sessionId === 'string' ? input.sessionId : '',
    questionCount: Number.isFinite(input.questionCount) ? Number(input.questionCount) : 0,
    interests: Array.isArray(input.interests)
      ? input.interests.filter(item => typeof item === 'string').slice(0, MAX_INTERESTS)
      : [],
    recentQuestions: Array.isArray(input.recentQuestions)
      ? input.recentQuestions.filter(item => typeof item === 'string').slice(0, MAX_RECENT_QUESTIONS)
      : [],
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString()
  }
}

export function saveProfile(profile: GrainUserProfile): void {
  if (!isBrowser()) return

  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

/** 会话 ID：优先用画像里已存的，其次复用主聊天页的 session，最后新建 */
export function resolveSessionId(profile: GrainUserProfile): string {
  if (profile.sessionId) return profile.sessionId

  if (isBrowser()) {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY)

    if (stored) return stored
  }

  return `avatar-${Date.now()}`
}

/** 从提问文本中提取关注方向 */
export function extractInterests(text: string): string[] {
  return INTEREST_KEYWORDS.filter(item => item.words.some(word => text.includes(word))).map(item => item.label)
}

/**
 * 记录一次提问：累计次数、追加最近提问、合并关注方向（最新命中排前）
 * 返回更新后的画像（同时写入 localStorage）
 */
export function recordQuestion(profile: GrainUserProfile, question: string): GrainUserProfile {
  const content = question.trim()

  if (!content) return profile

  const recentQuestions = [content, ...profile.recentQuestions.filter(item => item !== content)].slice(
    0,
    MAX_RECENT_QUESTIONS
  )

  const interests = [...extractInterests(content), ...profile.interests]
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, MAX_INTERESTS)

  const next: GrainUserProfile = {
    ...profile,
    questionCount: profile.questionCount + 1,
    recentQuestions,
    interests,
    updatedAt: new Date().toISOString()
  }

  saveProfile(next)

  return next
}

/** 更新角色（主聊天页切换身份时同步） */
export function updateRole(profile: GrainUserProfile, role: UserRole): GrainUserProfile {
  const next: GrainUserProfile = { ...profile, role, updatedAt: new Date().toISOString() }

  saveProfile(next)

  return next
}

/**
 * 生成注入给讯飞大模型的画像摘要。
 * 只在有信息时输出对应片段，无信息时不编造。
 */
export function buildProfileSummary(profile: GrainUserProfile): string {
  const parts: string[] = [`用户身份：${ROLE_LABELS[profile.role]}`]

  if (profile.questionCount > 0) parts.push(`历史提问次数：${profile.questionCount}`)
  if (profile.interests.length > 0) parts.push(`关注方向：${profile.interests.join('、')}`)
  if (profile.recentQuestions.length > 0) {
    parts.push(`最近提问：${profile.recentQuestions.slice(0, 3).join(' / ')}`)
  }

  return parts.join('；')
}

/**
 * 把画像摘要拼到用户问题前，作为一次「简单对话」的输入。
 * 走的是本项目已有的 /v1/chat 链路，后端不需要新增字段。
 */
export function composePrompt(profile: GrainUserProfile, question: string): string {
  return `【用户画像】${buildProfileSummary(profile)}\n\n【用户问题】${question.trim()}`
}

/** 面板上展示的画像条目（无数据的项不展示） */
export function buildProfileBrief(profile: GrainUserProfile): Array<{ label: string; value: string }> {
  const brief: Array<{ label: string; value: string }> = [{ label: '身份', value: ROLE_LABELS[profile.role] }]

  if (profile.interests.length > 0) brief.push({ label: '关注方向', value: profile.interests.join('、') })
  if (profile.questionCount > 0) brief.push({ label: '提问次数', value: `${profile.questionCount} 次` })

  return brief
}
