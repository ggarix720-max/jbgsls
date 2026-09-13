// 讯飞数字人「启动会话」业务握手测试
// 模拟 Avatar Web SDK 3.2.3.1002 的 start 帧（sdk 源码 index.js 中 ko() 构造函数），
// 抓取服务端对 start 帧的真实响应（header.code / header.message / payload.avatar.stream_url）。
// 用法: node scripts/test-avatar-session.mjs
import crypto from 'node:crypto'

const config = {
  serverUrl: 'wss://avatar.cn-huadong-1.xf-yun.com/v1/interact',
  appId: 'f5d7b8f7',
  apiKey: 'fd9cf69e48d14ae73c7d14ef9ef1a30d',
  apiSecret: 'MWRjZWFmNDMxMmQ4ZDQxNzYxYTQ3NzQ0',
  sceneId: '356356451834400768',
  avatarId: '111204004',
  vcn: 'x4_yiting',
  // 推流协议，可用环境变量覆盖: AVATAR_PROTOCOL=xrtc node scripts/test-avatar-session.mjs
  protocol: process.env.AVATAR_PROTOCOL || 'webrtc',
  width: 480,
  height: 854
}

// ---------- 鉴权 URL（与 test-avatar-auth.mjs / SDK Oe() 同款 hmac-sha256 签名） ----------
function buildSignedUrl() {
  const m = config.serverUrl.match(/^wss?:\/\/([^/]+)(\/.*)/)
  const host = m[1]
  const path = m[2]
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signature = crypto.createHmac('sha256', config.apiSecret).update(signatureOrigin).digest('base64')
  const authorizationOrigin =
    `api_key="${config.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')
  return (
    `wss://${host}${path}?authorization=${authorization}` +
    `&date=${encodeURIComponent(date)}&host=${host}`
  )
}

// ---------- start 帧（字段组织与 SDK ko() 完全一致） ----------
function buildStartFrame() {
  return {
    header: {
      app_id: config.appId,
      ctrl: 'start',
      scene_id: config.sceneId,
      scene_version: '',
      request_id: crypto.randomUUID().replaceAll('-', '')
    },
    parameter: {
      avatar_dispatch: { enable_action_status: 1 },
      avatar: {
        stream: { fps: 25, alpha: 0, protocol: config.protocol, bitrate: 976 }, // 1e6/1024 向下取整
        avatar_id: config.avatarId,
        width: config.width,
        height: config.height,
        audio_format: 1
      },
      tts: {
        vcn: config.vcn,
        speed: 50,
        pitch: 50,
        volume: 100,
        audio: { sample_rate: 16000 }
      },
      air: { air: 0, add_nonsemantic: 0 }
    }
  }
}

// ---------- 文本驱动帧（SDK writeText / ctrl=text_driver，用于验证 TTS/vcn） ----------
function buildTextFrame(text) {
  return {
    header: {
      uid: '',
      app_id: config.appId,
      request_id: crypto.randomUUID().replaceAll('-', ''),
      ctrl: 'text_driver',
      session: '',
      scene_id: config.sceneId,
      scene_version: ''
    },
    parameter: {
      avatar_dispatch: { interactive_mode: 0, enable_action_status: 1, content_analysis: 0 },
      tts: {
        vcn: config.vcn,
        speed: 50,
        pitch: 50,
        volume: 100,
        audio: { sample_rate: 16000 }
      },
      air: { air: 0, add_nonsemantic: 0 }
    },
    payload: { text: { content: text } }
  }
}

const pretty = obj => {
  const s = JSON.stringify(obj, null, 2)
  return s.length > 2000 ? s.slice(0, 2000) + '\n... <截断, 共 ' + s.length + ' 字符>' : s
}

console.log('=== 讯飞数字人 start 会话测试 ===')
console.log('serverUrl:', config.serverUrl)
console.log('appId:', config.appId, '| sceneId:', config.sceneId)
console.log('avatarId:', config.avatarId, '| vcn:', config.vcn, '| protocol:', config.protocol)
console.log()

const ws = new WebSocket(buildSignedUrl())
let frameCount = 0
let startResult = null // { code, message }
let finished = false

const finish = (ok, msg) => {
  if (finished) return
  finished = true
  console.log('\n=== 结论 ===')
  console.log(ok ? '✅ ' + msg : '❌ ' + msg)
  try {
    ws.send(JSON.stringify({ header: { app_id: config.appId, request_id: 'bye', ctrl: 'stop' } }))
  } catch {}
  setTimeout(() => {
    try { ws.close() } catch {}
    process.exit(ok ? 0 : 1)
  }, 500)
}

ws.addEventListener('open', () => {
  console.log('[1] HTTP 101 握手成功，发送 start 帧...')
  const startFrame = buildStartFrame()
  console.log('start 帧内容:\n' + pretty(startFrame))
  ws.send(JSON.stringify(startFrame))
})

ws.addEventListener('message', event => {
  const text = typeof event.data === 'string' ? event.data : '[二进制帧 ' + event.data.byteLength + ' 字节]'
  frameCount++
  console.log(`\n[帧 #${frameCount}] ${new Date().toISOString()}`)

  let frame = null
  try {
    frame = JSON.parse(text)
    console.log(pretty(frame))
  } catch {
    console.log('(非 JSON)', text.slice(0, 500))
    return
  }

  const code = frame?.header?.code
  const message = frame?.header?.message ?? ''
  const ctrl = frame?.header?.ctrl ?? ''

  // start 帧的响应
  if (startResult === null && code !== undefined) {
    startResult = { code, message }
    if (code !== 0) {
      finish(false, `start 被拒绝: header.code=${code}, header.message="${message}"`)
      return
    }
    const streamUrl = frame?.payload?.avatar?.stream_url
    console.log('>>> start 成功 (code=0)')
    console.log('>>> sid:', frame?.header?.sid)
    console.log('>>> stream_url:', streamUrl || '(无)')
    if (streamUrl) {
      console.log('>>> stream_extend:', JSON.stringify(frame?.payload?.avatar?.stream_extend ?? null))
      // 会话建立成功，再发一条文本驱动，验证 TTS/vcn 是否正常
      console.log('\n[2] 3 秒后发送 text_driver 测试帧验证 TTS...')
      setTimeout(() => {
        const f = buildTextFrame('你好，这是一条连通性测试。')
        console.log('text_driver 帧已发送')
        ws.send(JSON.stringify(f))
      }, 3000)
      // 再等 TTS/推流事件
      setTimeout(() => finish(true, '会话建立成功且 15 秒内无错误帧（详见上方帧日志）'), 15000)
    } else {
      finish(false, `start 返回 code=0 但没有 stream_url，header.message="${message}"`)
    }
    return
  }

  // start 之后的业务帧：检查内嵌错误码（nlp/asr/tts/avatar）
  for (const key of ['nlp', 'asr', 'tts', 'avatar']) {
    const seg = frame?.payload?.[key]
    if (seg && seg.error_code !== undefined && seg.error_code !== 0) {
      finish(false, `${key} 段报错: error_code=${seg.error_code}, error_message="${seg.error_message ?? ''}"`)
      return
    }
  }
  if (code !== undefined && code !== 0) {
    finish(false, `后续帧报错: header.code=${code}, header.message="${message}" ctrl=${ctrl}`)
  }
})

ws.addEventListener('error', e => {
  console.log('[ws error]', e.message || e.type)
})

ws.addEventListener('close', e => {
  if (finished) return
  if (startResult === null) {
    finish(false, `连接在收到 start 响应前被关闭 code=${e.code} reason="${e.reason || '(无)'}"`)
  } else if (startResult.code !== 0) {
    finish(false, `start 失败后被关闭: code=${startResult.code} message="${startResult.message}" wsClose=${e.code}`)
  } else {
    finish(true, `会话建立成功，连接正常结束 wsClose=${e.code}`)
  }
})

setTimeout(() => finish(false, '整体超时（30 秒），startResult=' + JSON.stringify(startResult)), 30000)
