// 极简静态服务器：serve 测试页 + 讯飞 Avatar SDK 目录（ES module，需正确 MIME）
// 用法: node server.mjs  (监听 18123)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SDK_DIR = path.resolve(__dirname, '../../frontend/plaza/src/views/digital-human/sdk')
const PORT = 18123

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css'
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let file
  if (url.pathname === '/' || url.pathname === '/test.html') {
    file = path.join(__dirname, 'test.html')
  } else if (url.pathname.startsWith('/sdk/')) {
    file = path.join(SDK_DIR, decodeURIComponent(url.pathname.slice(5)))
  } else {
    res.writeHead(404); res.end('not found'); return
  }
  if (!file.startsWith(SDK_DIR) && !file.startsWith(__dirname)) {
    res.writeHead(403); res.end('forbidden'); return
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + url.pathname); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    res.end(data)
  })
}).listen(PORT, () => console.log(`serving on http://127.0.0.1:${PORT}  (sdk dir: ${SDK_DIR})`))
