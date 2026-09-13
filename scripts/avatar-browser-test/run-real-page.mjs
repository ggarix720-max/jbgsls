// 驱动真实项目页面 http://localhost:5173/agents/ 抓数字人面板现场
// mock 登录（localStorage token + 拦截 /api/auths/**），观察 .dh-* 组件状态
import { chromium } from 'playwright-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:5173/agents/'

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:5173' })

await ctx.addInitScript(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('grain.avatar-closed.v1', '0') // 面板默认展开
  localStorage.removeItem('grain.avatar-enabled.v1')
})

const page = await ctx.newPage()

// mock 鉴权接口
await page.route('**/api/auths/**', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ token: 'test-token', id: '1', email: 't@t.com', name: 'tester', role: 'admin' })
}))

page.on('console', msg => console.log(`[console.${msg.type()}]`, msg.text().slice(0, 1200)))
page.on('pageerror', err => console.log('[pageerror]', String(err).slice(0, 1200)))
page.on('request', req => {
  const u = req.url()
  if (/xf-yun\.com/.test(u)) console.log('[xf-req]', req.method(), u.slice(0, 180))
  if (/\/_next\/static\/chunks\/2303/.test(u)) console.log('[chunk-2303-req]', u.slice(0, 180))
})
page.on('response', res => {
  const u = res.url()
  if (/xf-yun\.com/.test(u)) console.log('[xf-res]', res.status(), u.slice(0, 180))
  if (/\/_next\/static\/chunks\/2303/.test(u)) console.log('[chunk-2303-res]', res.status(), u.slice(0, 180))
})
page.on('requestfailed', req => {
  const u = req.url()
  if (/xf-yun\.com/.test(u)) console.log('[xf-fail]', u.slice(0, 180), req.failure()?.errorText)
  else if (!/auths/.test(u)) console.log('[req-fail]', req.method(), u.slice(0, 150), req.failure()?.errorText)
})

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  console.log('[TEST] page loaded, waiting for dashboard / dh panel...')

  // 等数字人组件出现（面板 dh-panel 或悬浮球 dh-fab 都算）
  try {
    await page.waitForSelector('[class*="dh-"]', { timeout: 15000 })
    console.log('[TEST] dh-* 元素已出现')
  } catch {
    console.log('[TEST] 15 秒内没有 dh-* 元素！body 片段:', (await page.evaluate(() => document.body.innerHTML.slice(0, 500))))
  }

  // 如果只见到悬浮球，点它展开
  const fab = await page.$('.dh-fab')
  const panel = await page.$('.dh-panel')
  console.log('[TEST] dh-fab:', !!fab, '| dh-panel:', !!panel)
  if (fab && !panel) {
    console.log('[TEST] 面板未展开，点击 dh-fab')
    await fab.click()
    await page.waitForTimeout(1500)
  }

  // 等会话建立 + 采样
  const sample = async tag => {
    const s = await page.evaluate(() => {
      const txt = sel => document.querySelector(sel)?.textContent?.trim() ?? null
      const stage = document.querySelector('.dh-stage-canvas') || document.querySelector('[class*="dh-stage"]')
      const media = stage ? [...stage.querySelectorAll('video,audio')].map(el => ({
        tag: el.tagName.toLowerCase(),
        paused: el.paused, muted: el.muted, readyState: el.readyState,
        videoWidth: el.videoWidth, videoHeight: el.videoHeight,
        currentTime: Math.round(el.currentTime * 100) / 100,
        hasSrcObject: !!el.srcObject,
        srcObjectActive: el.srcObject ? el.srcObject.active : null,
        tracks: el.srcObject ? el.srcObject.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState })) : [],
        display: getComputedStyle(el).display,
        rect: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect())
      })) : []
      return {
        statusBadge: txt('.dh-status'),
        stageExists: !!stage,
        stageChildTags: stage ? [...stage.querySelectorAll('*')].map(e => e.tagName.toLowerCase()).slice(0, 25) : [],
        stageHTMLSnippet: stage ? stage.innerHTML.slice(0, 400) : null,
        media
      }
    })
    console.log(`\n--- 采样[${tag}] ---`)
    console.log(JSON.stringify(s, null, 1))
    return s
  }

  await page.waitForTimeout(10000)
  await sample('t+10s')
  await page.waitForTimeout(6000)
  await sample('t+16s')

  // 截图：优先截数字人面板区域，否则右下角
  const shot = path.join(__dirname, 'real-page.png')
  const panelEl = await page.$('.dh-panel')
  if (panelEl) {
    await panelEl.screenshot({ path: shot })
    console.log('[TEST] 面板截图 ->', shot)
  }
  await page.screenshot({ path: shot.replace('.png', '-full.png') })
  console.log('[TEST] 整页截图 ->', shot.replace('.png', '-full.png'))
} catch (e) {
  console.log('[TEST] 异常:', String(e).slice(0, 800))
} finally {
  await browser.close()
}
console.log('\n=== 真实页面测试结束 ===')
