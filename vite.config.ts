import { defineConfig, loadEnv } from 'vite'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import vue from '@vitejs/plugin-vue'

// 转发 /api/* 到 LLM_BASE_URL，并在服务端注入 Authorization 头，
// 使 API Key 不暴露给浏览器。configureServer 是插件钩子，需放在插件里。
function llmProxy(): Plugin {
  let baseUrl = ''
  let apiKey = ''
  return {
    name: 'llm-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode || 'development', config.envDir || process.cwd(), '')
      baseUrl = env.LLM_BASE_URL || process.env.LLM_BASE_URL || ''
      apiKey = env.LLM_API_KEY || process.env.LLM_API_KEY || ''
    },
    async configureServer(server: ViteDevServer) {
      const { Readable } = await import('node:stream')
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          if (!req.url || !req.url.startsWith('/api/')) return next()

          const target = baseUrl + req.url.replace(/^\/api/, '')
          if (!baseUrl) {
            res.statusCode = 500
            res.end('LLM_BASE_URL not configured. Create a .env file (see .env.example).')
            return
          }

          try {
            const headers: Record<string, string> = {}
            for (const h of ['content-type', 'accept']) {
              const v = req.headers[h]
              if (v) headers[h] = String(v)
            }
            if (apiKey) headers.authorization = `Bearer ${apiKey}`

            const method = (req.method || 'GET').toUpperCase()
            const init: RequestInit = { method, headers }
            if (method !== 'GET' && method !== 'HEAD') {
              const chunks: Buffer[] = []
              for await (const chunk of req) chunks.push(Buffer.from(chunk))
              init.body = Buffer.concat(chunks)
            }

            const upstream = await fetch(target, init)
            res.statusCode = upstream.status
            upstream.headers.forEach((v, k) => {
              if (k.toLowerCase() === 'content-length' || k.toLowerCase() === 'content-encoding') return
              res.setHeader(k, v)
            })
            if (!res.getHeader('content-type')) {
              res.setHeader('content-type', 'text/event-stream; charset=utf-8')
            }
            res.flushHeaders?.()
            if (!upstream.body) {
              res.end()
              return
            }
            await Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res)
          } catch (err) {
            if (!res.writableEnded) {
              res.statusCode = 502
              res.end(`Proxy error: ${String(err)}`)
            }
          }
        },
      )
    },
  }
}

export default defineConfig({
  plugins: [vue(), llmProxy()],
  server: {
    port: 5173,
  },
})