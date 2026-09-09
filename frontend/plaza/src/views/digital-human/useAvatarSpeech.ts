/**
 * 讯飞数字人语音播报 Hook（Avatar Web SDK 3.2.3.1002）
 *
 * 只负责两件事：建立数字人连接、把文本交给数字人播报。
 * 已移除原项目的冷启动播报、画像推送、只读对话等逻辑。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import AvatarPlatform, { PlayerEvents, SDKEvents } from './sdk/avatar-sdk-web_3.2.3.1002/index.js'
import { AVATAR_CONFIG, AVATAR_ENABLED_KEY } from './avatar.config'

export type AvatarSpeechStatus = 'disabled' | 'connecting' | 'ready' | 'speaking' | 'permission-required' | 'error'

type SpeechPlayer = {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown
  off?: (event: string, listener: (...args: unknown[]) => void) => unknown
  resume?: () => Promise<void>
  stop?: () => void
  destroy?: () => void
}

type SpeechPlatform = InstanceType<typeof AvatarPlatform> & {
  player?: SpeechPlayer
}

const formatError = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message

  return String(error ?? '数字人连接失败，请稍后重试')
}

// 模块级连接队列：同一 sceneId 的 start/destroy 必须串行执行，
// 避免路由切换时新旧连接并发建立、互相挤掉线。
let connectionChain: Promise<unknown> = Promise.resolve()

const runExclusive = <T>(task: () => Promise<T>): Promise<T> => {
  const run = connectionChain.then(task, task)

  connectionChain = run.then(
    () => undefined,
    () => undefined
  )

  return run
}

export function useAvatarSpeech(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const containerRef = useRef<HTMLDivElement | null>(null)
  const platformRef = useRef<SpeechPlatform | null>(null)
  const playerRef = useRef<SpeechPlayer | null>(null)
  const handlersRef = useRef<Record<string, (...args: unknown[]) => void> | null>(null)
  const pendingTextRef = useRef('')
  const lastTextRef = useRef('')
  const enabledRef = useRef(true)
  const connectedRef = useRef(false)
  const permissionRef = useRef(false)
  const mountedRef = useRef(false)
  const speakingTimerRef = useRef<number | null>(null)
  const gestureCleanupRef = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState<AvatarSpeechStatus>('connecting')
  const [errorMessage, setErrorMessage] = useState('')

  const clearTimer = useCallback(() => {
    if (speakingTimerRef.current !== null) window.clearTimeout(speakingTimerRef.current)

    speakingTimerRef.current = null
  }, [])

  const setReady = useCallback(() => {
    if (mountedRef.current && enabledRef.current) setStatus('ready')
  }, [])

  const clearGestureListeners = useCallback(() => {
    gestureCleanupRef.current?.()
    gestureCleanupRef.current = null
  }, [])

  const writePending = useCallback(async () => {
    const text = pendingTextRef.current.trim()
    const platform = platformRef.current

    if (!text || !platform || !connectedRef.current || permissionRef.current || !enabledRef.current) return

    pendingTextRef.current = ''
    clearTimer()
    setStatus('speaking')

    try {
      await platform.writeText(text, { nlp: false })

      if (mountedRef.current) {
        speakingTimerRef.current = window.setTimeout(setReady, Math.max(1800, Math.min(20000, text.length * 100)))
      }
    } catch (error) {
      pendingTextRef.current = text

      if (mountedRef.current) {
        setStatus('error')
        setErrorMessage(formatError(error))
      }
    }
  }, [clearTimer, setReady])

  const cleanup = useCallback(() => {
    clearTimer()
    clearGestureListeners()

    const platform = platformRef.current
    const player = playerRef.current
    const handlers = handlersRef.current

    platformRef.current = null
    playerRef.current = null
    handlersRef.current = null
    connectedRef.current = false

    if (!platform && !player) return

    void runExclusive(async () => {
      if (handlers) {
        try {
          player?.off?.(PlayerEvents.playNotAllowed, handlers.playNotAllowed)
          player?.off?.(PlayerEvents.error, handlers.playerError)
          player?.off?.(PlayerEvents.stop, handlers.stop)
          platform
            ?.off?.(SDKEvents.connected, handlers.connected)
            ?.off?.(SDKEvents.disconnected, handlers.disconnected)
            ?.off?.(SDKEvents.tts_duration, handlers.ttsDuration)
            ?.off?.(SDKEvents.error, handlers.sdkError)
        } catch {
          // SDK 清理失败不阻断 React 生命周期
        }
      }

      try {
        platform?.stop?.()
      } catch {
        // ignore
      }

      try {
        player?.stop?.()
        player?.destroy?.()
        platform?.destroy?.()
      } catch {
        // ignore
      }
    })
  }, [clearGestureListeners, clearTimer])

  // 探测性恢复：silent=true 时不报错、不改状态（用于手势触发与 init 后探测）
  const tryResume = useCallback(
    async (silent: boolean) => {
      const player = playerRef.current

      if (!player?.resume) return

      try {
        await player.resume()
        permissionRef.current = false
        clearGestureListeners()

        if (mountedRef.current) setReady()

        await writePending()
      } catch (error) {
        if (silent) return

        if (mountedRef.current) {
          setStatus('permission-required')
          setErrorMessage(formatError(error))
        }
      }
    },
    [clearGestureListeners, setReady, writePending]
  )

  const resume = useCallback(() => tryResume(false), [tryResume])

  const armGestureListeners = useCallback(() => {
    clearGestureListeners()

    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    const handler = () => void tryResume(true)

    for (const event of events) document.addEventListener(event, handler, { capture: true })

    gestureCleanupRef.current = () => {
      for (const event of events) document.removeEventListener(event, handler, { capture: true })
    }
  }, [clearGestureListeners, tryResume])

  const init = useCallback(async () => {
    if (!mountedRef.current || !enabledRef.current || platformRef.current) return

    const wrapper = containerRef.current

    if (!wrapper) return

    const platform = new AvatarPlatform() as SpeechPlatform
    const player = (platform.player as SpeechPlayer | undefined) || (platform.createPlayer() as SpeechPlayer)

    platformRef.current = platform
    playerRef.current = player

    const handlers = {
      connected: () => {
        connectedRef.current = true
        setErrorMessage('')
        setReady()
        void writePending()
      },
      disconnected: () => {
        connectedRef.current = false

        if (mountedRef.current && enabledRef.current) setStatus('error')
      },
      playNotAllowed: () => {
        permissionRef.current = true

        if (mountedRef.current) setStatus('permission-required')

        armGestureListeners()
      },
      playerError: (error: unknown) => {
        if (mountedRef.current) {
          setStatus('error')
          setErrorMessage(formatError(error))
        }
      },
      sdkError: (error: unknown) => {
        connectedRef.current = false

        if (mountedRef.current) {
          setStatus('error')
          setErrorMessage(formatError(error))
        }
      },
      ttsDuration: () => {
        if (mountedRef.current) setStatus('speaking')
      },
      stop: () => setReady()
    }

    handlersRef.current = handlers

    platform
      .on(SDKEvents.connected, handlers.connected)
      .on(SDKEvents.disconnected, handlers.disconnected)
      .on(SDKEvents.tts_duration, handlers.ttsDuration)
      .on(SDKEvents.error, handlers.sdkError)

    player.on(PlayerEvents.playNotAllowed, handlers.playNotAllowed)
    player.on(PlayerEvents.error, handlers.playerError)
    player.on(PlayerEvents.stop, handlers.stop)

    platform.setApiInfo({
      serverUrl: AVATAR_CONFIG.serverUrl,
      appId: AVATAR_CONFIG.appId,
      apiKey: AVATAR_CONFIG.apiKey,
      apiSecret: AVATAR_CONFIG.apiSecret,
      sceneId: AVATAR_CONFIG.sceneId
    })

    platform.setGlobalParams({
      stream: { protocol: AVATAR_CONFIG.protocol },
      avatar: { avatar_id: AVATAR_CONFIG.avatarId, width: AVATAR_CONFIG.width, height: AVATAR_CONFIG.height },
      tts: { vcn: AVATAR_CONFIG.vcn }
    })

    setStatus('connecting')

    await runExclusive(async () => {
      try {
        await platform.start({ wrapper })
      } catch (error) {
        handlers.sdkError(error)

        return
      }

      if (!mountedRef.current || platformRef.current !== platform) return

      setReady()

      // Chrome 在用户无手势时会静默拦截音视频，且 SDK 不一定派发 playNotAllowed，
      // 因此连接成功后立即武装手势监听 + 探测性恢复。
      armGestureListeners()
      void tryResume(true)
    })
  }, [armGestureListeners, setReady, tryResume, writePending])

  useEffect(() => {
    mountedRef.current = true
    enabledRef.current = enabled && window.localStorage.getItem(AVATAR_ENABLED_KEY) !== '0'
    setStatus(enabledRef.current ? 'connecting' : 'disabled')

    if (enabledRef.current) void init()
    else cleanup()

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [cleanup, enabled, init])

  const speak = useCallback(
    async (text: string) => {
      const content = text.trim()

      if (!content || !enabledRef.current) return

      lastTextRef.current = content
      pendingTextRef.current = content

      if (!platformRef.current) {
        void init()

        return
      }

      try {
        await platformRef.current.interrupt()
      } catch {
        // 中断失败时仍继续写入最新回答
      }

      await writePending()
    },
    [init, writePending]
  )

  const stop = useCallback(async () => {
    pendingTextRef.current = ''
    clearTimer()

    try {
      await platformRef.current?.interrupt()
    } catch {
      // ignore
    }

    if (mountedRef.current && enabledRef.current) setReady()
  }, [clearTimer, setReady])

  const replay = useCallback(() => {
    if (lastTextRef.current) void speak(lastTextRef.current)
  }, [speak])

  const retry = useCallback(() => {
    cleanup()
    setErrorMessage('')
    setStatus('connecting')
    void init()
  }, [cleanup, init])

  return { containerRef, status, errorMessage, speak, stop, replay, resume, retry }
}
