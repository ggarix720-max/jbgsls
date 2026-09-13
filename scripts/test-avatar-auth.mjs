// 讯飞数字人凭证连通性测试（不依赖项目代码，仅验证新凭证能否通过网关鉴权）
import crypto from 'node:crypto'

const config = {
  host: 'avatar.cn-huadong-1.xf-yun.com',
  path: '/v1/interact',
  appId: 'f5d7b8f7',
  apiKey: 'fd9cf69e48d14ae73c7d14ef9ef1a30d',
  apiSecret: 'MWRjZWFmNDMxMmQ4ZDQxNzYxYTQ3NzQ0'
}

const date = new Date().toUTCString()
const signatureOrigin = `host: ${config.host}\ndate: ${date}\nGET ${config.path} HTTP/1.1`
const signature = crypto.createHmac('sha256', config.apiSecret).update(signatureOrigin).digest('base64')
const authorizationOrigin =
  `api_key="${config.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
const authorization = Buffer.from(authorizationOrigin).toString('base64')

const url =
  `wss://${config.host}${config.path}?host=${config.host}` +
  `&date=${encodeURIComponent(date)}&authorization=${encodeURIComponent(authorization)}`

console.log('连接地址:', `wss://${config.host}${config.path}`)
console.log('APPID:', config.appId)
console.log('正在发起 WebSocket 握手...')

const ws = new WebSocket(url)
let settled = false

const finish = (ok, msg) => {
  if (settled) return
  settled = true
  console.log(ok ? `\n✅ ${msg}` : `\n❌ ${msg}`)
  try { ws.close() } catch {}
  process.exit(ok ? 0 : 1)
}

ws.addEventListener('open', () => {
  console.log('握手成功（HTTP 101），网关已接受凭证，等待服务端首帧...')
  // 等 10 秒看服务端是否主动报错帧
  setTimeout(() => finish(true, '鉴权通过：凭证有效，网关接受了连接（10 秒内未收到鉴权错误帧）'), 10000)
})

ws.addEventListener('message', event => {
  const text = typeof event.data === 'string' ? event.data : '[二进制帧]'
  console.log('收到服务端帧:', text.slice(0, 300))

  try {
    const frame = JSON.parse(text)
    const code = frame?.header?.code ?? frame?.code

    if (code !== undefined && code !== 0) {
      finish(false, `服务端返回错误 code=${code} message=${frame?.header?.message ?? frame?.message ?? ''}`)
    }
  } catch {
    // 非 JSON 帧，忽略
  }
})

ws.addEventListener('error', event => {
  console.log('传输层 error 事件:', event.message || event.type, '(等待 close 事件拿关闭码...)')
})

ws.addEventListener('close', event => {
  if (settled) return

  if (event.code === 1000 || event.code === 1005) {
    finish(true, `鉴权通过：握手成功且连接正常结束 code=${event.code}（服务端未报鉴权错误）`)
  } else {
    finish(false, `连接被关闭 code=${event.code} reason=${event.reason || '(无)'}`)
  }
})

setTimeout(() => finish(false, '超时（15 秒无响应）'), 15000)
