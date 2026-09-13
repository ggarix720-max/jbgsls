// 真实页面 + 运行时把 protocol 热替换为 webrtc（拦截配置 chunk 改写），验证 webrtc 播放器在 Next 产物里是否健康
import { chromium } from 'playwright-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:5173/agents/'

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })

await ctx.addInitScript(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('grain.avatar-closed.v1', '0')
  localStorage.removeItem('grain.avatar-enabled.v1')
})

const page = await ctx.newPage()
await page.route('**/api/auths/**', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ token: 'test-token', id: '1', email: 't@t.com', name: 'tester', role: 'admin' })
}))

// 热替换 protocol: xrtc -> webrtc
await page.route('**/_next/static/chunks/9685.*.js', async route => {
  const resp = await route.fetch()
  let body = await resp.text()
  const before = body.includes('AVATAR_PROTOCOL||"xrtc"')
  body = body.replace('AVATAR_PROTOCOL||"xrtc"', 'AVATAR_PROTOCOL||"webrtc"')
  console.log('[patch] 9685 chunk protocol 替换:', before ? '成功' : '未找到目标串!')
  await route.fulfill({ response: resp, body })
})

page.on('console', msg => console.log(`[console.${msg.type()}]`, msg.text().slice(0, 1200)))
page.on('pageerror', err => console.log('[pageerror]', String(err).slice(0, 1200)))
page.on('response', res => {
  const u = res.url()
  if (/xf-yun\.com/.test(u)) console.log('[xf-res]', res.status(), u.slice(0, 160))
  if (/\/chunks\/3086\./.test(u)) console.log('[chunk-3086(webrtc)]', res.status())
})
page.on('requestfailed', req => {
  if (/xf-yun\.com/.test(req.url())) console.log('[xf-fail]', req.url().slice(0, 160), req.failure()?.errorText)
})

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('[class*="dh-"]', { timeout: 15000 })
  const fab = await page.$('.dh-fab')
  if (fab && !(await page.$('.dh-panel'))) { await fab.click(); await page.waitForTimeout(1500) }

  const sample = async tag => {
    const s = await page.evaluate(() => {
      const stage = document.querySelector('.dh-stage-canvas') || document.querySelector('[class*="dh-stage"]')
      return {
        statusBadge: document.querySelector('.dh-status')?.textContent?.trim() ?? null,
        stageHTMLLength: stage ? stage.innerHTML.length : -1,
        media: stage ? [...stage.querySelectorAll('video,audio')].map(el => ({
          tag: el.tagName.toLowerCase(), paused: el.paused, muted: el.muted,
          readyState: el.readyState, videoWidth: el.videoWidth,
          currentTime: Math.round(el.currentTime * 100) / 100,
          srcActive: el.srcObject ? el.srcObject.active : null
        })) : []
      }
    })
    console.log(`--- 采样[${tag}] ---`, JSON.stringify(s))
  }

  await page.waitForTimeout(10000)
  await sample('t+10s')
  await page.waitForTimeout(6000)
  await sample('t+16s')

  const panelEl = await page.$('.dh-panel')
  if (panelEl) await panelEl.screenshot({ path: path.join(__dirname, 'real-page-webrtc.png') })
} catch (e) {
  console.log('[TEST] 异常:', String(e).slice(0, 500))
} finally {
  await browser.close()
}
console.log('=== webrtc 真实页面测试结束 ===')
