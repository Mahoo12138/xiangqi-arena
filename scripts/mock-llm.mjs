// 本地 mock OpenAI 兼容服务器，用于验证 vite 代理转发 + SSE 流式。
import { createServer } from 'node:http'

const PORT = 9999

createServer((req, res) => {
  res.setHeader('content-type', 'text/event-stream')
  const auth = req.headers['authorization'] || ''
  if (!auth.startsWith('Bearer test-key')) {
    res.statusCode = 401
    res.end('bad auth')
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}')
    console.log('>>> mock got model =', parsed.model)
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    // 模拟推理模型：先 reasoning_content，再 content，最后 usage
    send({ choices: [{ delta: { role: 'assistant', reasoning_content: '思考中：红炮平五，威胁中路。' } }] })
    setTimeout(() => send({ choices: [{ delta: { content: '{"move":"h2e2"}' } }] }), 50)
    setTimeout(() => send({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 42 } }), 100)
    setTimeout(() => {
      res.write('data: [DONE]\n\n')
      res.end()
    }, 120)
  })
}).listen(PORT, () => console.log(`mock LLM server on http://localhost:${PORT}`))