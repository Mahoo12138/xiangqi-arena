// 生产服务器：同时提供 dist 静态资源（含 SPA fallback）与 /api/chat/completions。
// API Key 只保存在服务端，不暴露给浏览器。
//
// 需要的环境变量：
//   LLM_BASE_URL      上游 OpenAI 兼容 API 根地址，如 https://.../v1
//   LLM_API_KEY      上游 API Key（仅服务端持有）
//   LLM_ALLOWED_MODELS 逗号分隔的模型白名单（服务端强制校验）。缺省回退到 VITE_LLM_MODELS
//   PORT              监听端口，默认 3000
//   DIST_DIR          dist 目录，默认 <仓库>/dist
//   MAX_REQUEST_BODY_BYTES 请求体大小上限，默认 1MB
//   RATE_LIMIT_WINDOW_MS   限流时间窗（毫秒），默认 60000
//   RATE_LIMIT_MAX         每个 IP 每个时间窗的最大请求数，默认 30
import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = process.env.DIST_DIR || path.join(ROOT, 'dist')

const PORT = Number(process.env.PORT || 3000)
const BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '')
const API_KEY = process.env.LLM_API_KEY || ''
const ALLOWED_MODELS = new Set(
  (process.env.LLM_ALLOWED_MODELS || process.env.VITE_LLM_MODELS || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean),
)
const MAX_BODY_BYTES = Number(process.env.MAX_REQUEST_BODY_BYTES || 1_000_000)
const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000)
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX || 30)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

/* ---------- 限流（按 IP 滑动窗口） ---------- */
const buckets = new Map()
function rateLimited(ip) {
  const now = Date.now()
  let b = buckets.get(ip)
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS }
    buckets.set(ip, b)
  }
  b.count++
  return b.count > RATE_MAX
}
setInterval(() => {
  const now = Date.now()
  for (const [ip, b] of buckets) if (now >= b.resetAt) buckets.delete(ip)
}, RATE_WINDOW_MS).unref()

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string') return fwd.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

/* ---------- 静态资源 + SPA fallback ---------- */
function safeJoin(base, rel) {
  const target = path.resolve(base, rel)
  return target.startsWith(path.resolve(base) + path.sep) ? target : null
}

async function sendFile(res, filePath) {
  const info = await stat(filePath)
  if (!info.isFile()) throw new Error('not a file')
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, {
    'content-type': type,
    'content-length': info.size,
    'cache-control': type.startsWith('text/') ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(res)
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const filePath = safeJoin(DIST, rel)
  if (filePath) {
    try {
      await sendFile(res, filePath)
      return
    } catch {
      /* fall through to SPA fallback */
    }
  }
  // SPA fallback：客户端路由（/game、/config 等）回退到 index.html
  const index = safeJoin(DIST, 'index.html')
  if (index) {
    try {
      await sendFile(res, index)
      return
    } catch {
      /* build missing */
    }
  }
  res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Build not found. Run `npm run build` first, or set DIST_DIR.')
}

/* ---------- /api/chat/completions ---------- */
async function handleChat(req, res) {
  // 读取请求体并限制大小
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      res.writeHead(413, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Request body too large' } }))
      return
    }
    chunks.push(chunk)
  }

  let payload
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }))
    return
  }

  // 服务端再次校验模型白名单（前端下拉框不是安全控制）
  const model = typeof payload?.model === 'string' ? payload.model : ''
  if (ALLOWED_MODELS.size > 0 && !ALLOWED_MODELS.has(model)) {
    res.writeHead(403, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: `Model "${model}" is not allowed` } }))
    return
  }

  if (!BASE_URL) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'LLM_BASE_URL not configured' } }))
    return
  }

  const target = `${BASE_URL}/chat/completions`
  const headers = {
    'content-type': 'application/json',
    accept: payload.stream ? 'text/event-stream' : 'application/json',
  }
  if (API_KEY) headers.authorization = `Bearer ${API_KEY}`

  let upstream
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[llm-proxy] upstream connect error:', err.message)
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'Upstream unavailable' } }))
    return
  }

  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') || 'application/json',
  })

  if (!upstream.body) {
    res.end()
    return
  }

  // 流式回传；客户端断开时中止上游，避免继续消耗额度
  const reader = upstream.body.getReader()
  req.on('close', () => {
    reader.cancel().catch(() => {})
  })
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } catch {
    res.destroy()
  }
}

/* ---------- 路由 ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  if (pathname.startsWith('/api/')) {
    if (pathname !== '/api/chat/completions') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Not found' } }))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' })
      res.end(JSON.stringify({ error: { message: 'Method not allowed' } }))
      return
    }
    if (rateLimited(clientIp(req))) {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Too many requests' } }))
      return
    }
    handleChat(req, res).catch((err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Upstream error' } }))
      }
      console.error('[llm-proxy] upstream error:', err.message)
    })
    return
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(res, pathname).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' })
        res.end('Internal error')
      }
    })
    return
  }

  res.writeHead(405)
  res.end()
})

server.listen(PORT, () => {
  console.log(`xiangqi-arena server listening on http://localhost:${PORT}`)
  console.log(`DIST_DIR=${DIST}  LLM_BASE_URL=${BASE_URL ? 'set' : '(not set)'}  models=${ALLOWED_MODELS.size}`)
})