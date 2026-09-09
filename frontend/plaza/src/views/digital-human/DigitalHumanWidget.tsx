'use client'

/**
 * 粮储数字人悬浮助手
 *
 * 职责边界（相对原 jiebang-guashuai 项目已精简）：
 * - 保留：讯飞 Avatar Web SDK 形象连接 + 文本播报
 * - 保留：本项目用户画像 / 用户信息，作为上下文注入大模型
 * - 移除：冷启动播报、画像主动推送、只读对话、建议卡片与路由跳转
 * - 对话：只做简单问答，走本项目已有的讯飞大模型链路（/api/backend/chat）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { consumeSse } from '@/lib/consumeSse'
import { withBasePath } from '@/lib/base-path'
import type { UserRole } from '@/types/grain'

import { AVATAR_CLOSED_KEY, AVATAR_ENABLED_KEY, AVATAR_GREETING, AVATAR_LLM_CONFIG } from './avatar.config'
import {
  buildProfileBrief,
  composePrompt,
  createEmptyProfile,
  loadProfile,
  recordQuestion,
  resolveSessionId,
  ROLE_LABELS,
  saveProfile,
  updateRole
} from './user-profile'
import type { GrainUserProfile } from './user-profile'
import { useAvatarSpeech } from './useAvatarSpeech'
import './digital-human.css'

type Line = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
  error?: boolean
}

const createId = () => crypto.randomUUID()

const statusLabels: Record<string, string> = {
  disabled: '已停用',
  connecting: '连接中',
  ready: '已连接',
  speaking: '播报中',
  'permission-required': '待启用声音',
  error: '连接异常'
}

const DigitalHumanWidget = () => {
  const [isClosed, setIsClosed] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [speakEnabled, setSpeakEnabled] = useState(true)
  const [messages, setMessages] = useState<Line[]>([
    { id: 'greeting', role: 'assistant', content: AVATAR_GREETING }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [profile, setProfile] = useState<GrainUserProfile>(createEmptyProfile)

  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<string>('')

  const speech = useAvatarSpeech({ enabled: enabled && !isClosed })

  /* 初始化：读取本地画像与开关状态 */
  useEffect(() => {
    const stored = loadProfile()
    const sessionId = resolveSessionId(stored)

    sessionRef.current = sessionId

    if (sessionId !== stored.sessionId) {
      const next = { ...stored, sessionId }

      saveProfile(next)
      setProfile(next)
    } else {
      setProfile(stored)
    }

    setIsClosed(window.sessionStorage.getItem(AVATAR_CLOSED_KEY) === '1')
    setEnabled(window.localStorage.getItem(AVATAR_ENABLED_KEY) !== '0')
  }, [])

  useEffect(() => {
    const list = listRef.current

    list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const brief = useMemo(() => buildProfileBrief(profile), [profile])

  const updateLine = useCallback((id: string, update: (line: Line) => Line) => {
    setMessages(current => current.map(line => (line.id === id ? update(line) : line)))
  }, [])

  const toggleEnabled = () => {
    const next = !enabled

    setEnabled(next)
    window.localStorage.setItem(AVATAR_ENABLED_KEY, next ? '1' : '0')
  }

  const closePanel = () => {
    setIsClosed(true)
    window.sessionStorage.setItem(AVATAR_CLOSED_KEY, '1')
  }

  const openPanel = () => {
    setIsClosed(false)
    window.sessionStorage.setItem(AVATAR_CLOSED_KEY, '0')
  }

  const changeRole = (role: UserRole) => {
    setProfile(current => updateRole(current, role))
  }

  const requestAnswer = async (question: string, assistantId: string) => {
    const controller = new AbortController()

    abortRef.current = controller

    let answer = ''

    try {
      const useAssistant = AVATAR_LLM_CONFIG.channel === 'assistant' && Boolean(AVATAR_LLM_CONFIG.assistantId)

      const endpoint = useAssistant ? AVATAR_LLM_CONFIG.assistantEndpoint : AVATAR_LLM_CONFIG.knowledgeEndpoint

      const body = useAssistant
        ? {
            assistant_id: AVATAR_LLM_CONFIG.assistantId,
            uid: sessionRef.current,
            messages: [
              ...messages
                .filter(line => !line.pending && line.id !== 'greeting')
                .slice(-AVATAR_LLM_CONFIG.historyTurns)
                .map(line => ({ role: line.role, content: line.content })),
              { role: 'user' as const, content: composePrompt(profile, question) }
            ]
          }
        : {
            message: composePrompt(profile, question),
            session_id: sessionRef.current,
            role: profile.role
          }

      const response = await fetch(withBasePath(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { message?: string } | null

        throw new Error(error?.message || `请求失败（HTTP ${response.status}）`)
      }

      await consumeSse(response, (event, data) => {
        const payload = data as Record<string, unknown>

        if (event === 'delta' && typeof payload.content === 'string') {
          answer += payload.content

          updateLine(assistantId, current => ({
            ...current,
            content: current.content + payload.content,
            pending: true
          }))
        }

        if (event === 'error') {
          const text = typeof payload.message === 'string' ? payload.message : '生成回答时发生错误。'

          updateLine(assistantId, current => ({ ...current, content: current.content || text, error: true, pending: false }))
        }

        if (event === 'done') {
          updateLine(assistantId, current => ({ ...current, pending: false }))
        }
      })

      updateLine(assistantId, current => {
        if (current.pending) return { ...current, pending: false }

        return current
      })

      // 回答完成后交给数字人播报（超长截断，避免念太久）
      if (answer && speakEnabled) void speech.speak(answer.slice(0, AVATAR_LLM_CONFIG.maxSpeakChars))
    } catch (error) {
      const stopped = error instanceof DOMException && error.name === 'AbortError'

      updateLine(assistantId, current => ({
        ...current,
        content:
          current.content || (stopped ? '已停止本次回答。' : error instanceof Error ? error.message : '请求失败。'),
        error: !stopped,
        pending: false
      }))
    } finally {
      abortRef.current = null
      setStreaming(false)
    }
  }

  const send = async (text?: string) => {
    const content = (text ?? input).trim()

    if (!content || streaming) return

    const userLine: Line = { id: createId(), role: 'user', content }
    const assistantId = createId()

    setMessages(current => [...current, userLine, { id: assistantId, role: 'assistant', content: '', pending: true }])
    setInput('')
    setStreaming(true)
    setProfile(current => recordQuestion(current, content))

    await requestAnswer(content, assistantId)
  }

  const stopAnswer = () => {
    abortRef.current?.abort()
    void speech.stop()
  }

  const connectionLabel = statusLabels[speech.status] ?? '连接中'
  const isConnected = speech.status === 'ready' || speech.status === 'speaking'

  if (isClosed) {
    return (
      <button type='button' className='dh-fab' onClick={openPanel} aria-label='打开数字人助手'>
        <span className='dh-fab-dot' />
        数字助手
      </button>
    )
  }

  return (
    <section className='dh-panel'>
      <header className='dh-header'>
        <div className='dh-header-main'>
          <strong>粮储数字助手</strong>
          <span className={`dh-status dh-status-${speech.status}`}>
            <i />
            {connectionLabel}
          </span>
        </div>
        <div className='dh-header-actions'>
          <button
            type='button'
            className={speakEnabled ? 'dh-icon-button is-on' : 'dh-icon-button'}
            title={speakEnabled ? '关闭语音播报' : '开启语音播报'}
            onClick={() => setSpeakEnabled(current => !current)}
          >
            {speakEnabled ? '播报开' : '播报关'}
          </button>
          <button
            type='button'
            className='dh-icon-button'
            title={enabled ? '停用数字人' : '启用数字人'}
            onClick={toggleEnabled}
          >
            {enabled ? '停用' : '启用'}
          </button>
          <button type='button' className='dh-icon-button' title='收起助手' onClick={closePanel}>
            收起
          </button>
        </div>
      </header>

      <div className='dh-stage'>
        <div ref={speech.containerRef} className='dh-stage-canvas' />

        {speech.status === 'connecting' ? (
          <div className='dh-stage-mask'>
            <span className='dh-spinner' />
            数字人正在连接
          </div>
        ) : null}

        {speech.status === 'permission-required' ? (
          <button type='button' className='dh-stage-mask dh-stage-action' onClick={() => void speech.resume()}>
            点击启用声音
          </button>
        ) : null}

        {speech.status === 'error' ? (
          <div className='dh-stage-mask dh-stage-error'>
            <p>{speech.errorMessage || '数字人连接失败'}</p>
            <button type='button' onClick={speech.retry}>
              重新连接
            </button>
          </div>
        ) : null}

        {speech.status === 'disabled' ? <div className='dh-stage-mask'>数字人已停用，可直接文字提问</div> : null}
      </div>

      <div className='dh-profile'>
        {brief.map(item => (
          <span key={item.label} className='dh-profile-item'>
            {item.label}：{item.value}
          </span>
        ))}
        <label className='dh-role-select'>
          身份
          <select value={profile.role} onChange={event => changeRole(event.target.value as UserRole)}>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map(role => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={listRef} className='dh-messages'>
        {messages.map(line => (
          <article key={line.id} className={`dh-row dh-row-${line.role}`}>
            <span className='dh-row-tag'>{line.role === 'user' ? '你' : '数字人'}</span>
            <div className={`dh-bubble ${line.error ? 'is-error' : ''}`}>
              {line.content || (line.pending ? '正在思考…' : '')}
            </div>
          </article>
        ))}
      </div>

      <footer className='dh-composer'>
        <input
          type='text'
          value={input}
          placeholder={isConnected ? '输入问题，回车发送' : '数字人连接中，仍可文字提问'}
          aria-label='输入问题'
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void send()
            }
          }}
        />
        {streaming ? (
          <button type='button' className='dh-send is-stop' onClick={stopAnswer}>
            停止
          </button>
        ) : (
          <button type='button' className='dh-send' disabled={!input.trim()} onClick={() => void send()}>
            发送
          </button>
        )}
      </footer>
    </section>
  )
}

export default DigitalHumanWidget
