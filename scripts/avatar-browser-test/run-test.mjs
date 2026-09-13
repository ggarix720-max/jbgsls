// Playwright-core + 本机 Edge(channel: msedge) 驱动 test.html，验证 SDK 播放链路
// 用法:
//   node run-test.mjs                  -> xrtc, 默认自动播放策略
//   PROTOCOL=webrtc node run-test.mjs  -> webrtc
//   AUTOPLAY=1 node run-test.mjs       -> 加 --autoplay-policy=no-user-gesture-required
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROTOCOL = process.env.PROTOCOL || 'xrtc'
const AUTOPLAY = process.env.AUTOPLAY === '1'
const PORT = 18123

// 起静态服务器（子进程，测试结束杀掉）
const server = spawn(process.execPath, [path.join(__dirname, 'server.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((resolve, reject) => {
  server.stdout.on('data', d => { if (String(d).includes('serving on')) resolve() })
  server.stderr.on('data', d => console.error('[server]', String(d)))
  server.on('exit', code => reject(new Error('server exited ' + code)))
  setTimeout(() => reject(new Error('server start timeout')), 5000)
})

const args = ['--use-fake-ui-for-media-stream']
if (AUTOPLAY) args.push('--autoplay-policy=no-user-gesture-required')

console.log(`=== 浏览器实测: protocol=${PROTOCOL} autoplayBypass=${AUTOPLAY} ===`)
const browser = await chromium.launch({ channel: 'msedge', headless: true, args })
const page = await browser.newPage({ viewport: { width: 800, height: 1000 } })

const mediaRequests = []
page.on('console', msg => console.log(`[console.${msg.type()}]`, msg.text().slice(0, 1500)))
page.on('pageerror', err => console.log('[pageerror]', String(err).slice(0, 1500)))
page.on('request', req => {
  const u = req.url()
  if (/xf-yun\.com/.test(u) && !/avatar\.cn-huadong/.test(u)) {
    mediaRequests.push({ url: u.slice(0, 200), status: 'pending' })
    console.log('[media-req]', req.method(), u.slice(0, 200))
  }
})
page.on('response', res => {
  const u = res.url()
  if (/xf-yun\.com/.test(u) && !/avatar\.cn-huadong/.test(u)) {
    const r = mediaRequests.find(x => x.url === u.slice(0, 200) && x.status === 'pending')
    if (r) r.status = res.status()
    console.log('[media-res]', res.status(), u.slice(0, 200))
  }
})
page.on('requestfailed', req => {
  const u = req.url()
  if (/xf-yun\.com/.test(u)) console.log('[media-fail]', u.slice(0, 200), req.failure()?.errorText)
})

try {
  await page.goto(`http://127.0.0.1:${PORT}/test.html?protocol=${PROTOCOL}`, { waitUntil: 'load', timeout: 30000 })

  // 在 8s / 15s / 22s 各采样一次 video 状态
  for (const wait of [8000, 7000, 7000]) {
    await page.waitForTimeout(wait)
    const state = await page.evaluate(() => ({
      inspect: window.__inspect ? window.__inspect() : null,
      startResolved: window.__state?.startResolved,
      startError: window.__state?.startError,
      eventNames: window.__state?.events.map(e => e.name) ?? []
    }))
    console.log(`\n--- 采样 (t≈${wait / 1000}s 增量) ---`)
    console.log('startResolved:', state.startResolved, '| startError:', JSON.stringify(state.startError))
    console.log('事件序列:', state.eventNames.join(' -> ') || '(无)')
    console.log('inspect:', JSON.stringify(state.inspect, null, 1))
  }
} finally {
  // 释放会话，避免占用并发数
  try { await page.evaluate(() => { window.__platform?.stop(); window.__platform?.destroy() }) } catch {}
  await page.waitForTimeout(800)
  await browser.close()
  server.kill()
}
console.log('\n=== 测试结束 ===')
