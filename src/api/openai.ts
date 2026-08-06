export interface StreamCallbacks {
  onReasoning?: (text: string) => void
  onContent?: (text: string) => void
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void
}

export interface StreamResult {
  reasoning: string
  content: string
  promptTokens: number
  completionTokens: number
}

export interface StreamOptions {
  /** 无数据块的看门狗超时（毫秒），默认 60000 */
  timeoutMs?: number
  /** 整个流式请求的总时长上限（毫秒），默认 180000。模型推理卡死反复输出时触发 */
  totalTimeoutMs?: number
  /** 外部取消信号 */
  signal?: AbortSignal
}

// 可识别的瞬态错误（网络中断 / HTTP 5xx / 看门狗超时 / 中止）
export class TransientError extends Error {}

// 调用 OpenAI 兼容的 chat/completions（流式），通过 vite dev server 代理转发，
// Key 由服务端注入，前端不携带。
export async function streamChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  cb: StreamCallbacks = {},
  opts: StreamOptions = {},
): Promise<StreamResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const totalTimeoutMs = opts.totalTimeoutMs ?? 180_000
  const controller = new AbortController()
  const onOuterAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onOuterAbort, { once: true })
  }

  let res: Response
  try {
    res = await fetch('/api/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.4 }),
      signal: controller.signal,
    })
  } catch (e) {
    throw new TransientError(`请求失败：${String(e)}`)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status >= 500) {
      throw new TransientError(`服务端错误 HTTP ${res.status}`)
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  if (!res.body) {
    throw new TransientError('无响应体')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reasoning = ''
  let content = ''
  let promptTokens = 0
  let completionTokens = 0

  // 看门狗：N 秒无数据，或总时长超限（推理卡死）则中止，视为瞬态失败
  const startAt = Date.now()
  let lastChunk = Date.now()
  const watchdog = setInterval(() => {
    if (Date.now() - startAt > totalTimeoutMs) controller.abort()
    else if (Date.now() - lastChunk > timeoutMs) controller.abort()
  }, 2000)

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (e) {
        if (controller.signal.aborted) {
          throw new TransientError('流式响应超时或中止')
        }
        throw new TransientError(`读取中断：${String(e)}`)
      }
      if (chunk.done) break
      lastChunk = Date.now()
      buffer += decoder.decode(chunk.value, { stream: true })

      // 按行切分 SSE
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        if (!data) continue

        let parsed: any
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }

        const choice = parsed.choices?.[0]
        if (choice?.delta) {
          const d = choice.delta
          if (typeof d.reasoning_content === 'string' && d.reasoning_content) {
            reasoning += d.reasoning_content
            cb.onReasoning?.(reasoning)
          }
          if (typeof d.content === 'string' && d.content) {
            content += d.content
            cb.onContent?.(content)
          }
        }
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens ?? 0
          completionTokens = parsed.usage.completion_tokens ?? 0
        }
      }
    }
  } catch (e) {
    if (e instanceof TransientError) throw e
    if (controller.signal.aborted) throw new TransientError('流式响应中止')
    throw e
  } finally {
    clearInterval(watchdog)
    reader.cancel().catch(() => {})
    if (opts.signal) opts.signal.removeEventListener('abort', onOuterAbort)
  }

  // provider 未给 usage 时估算
  if (!promptTokens && completionTokens === 0) {
    completionTokens = estimateTokens(content + reasoning)
  }

  cb.onUsage?.({ promptTokens, completionTokens })
  return { reasoning, content, promptTokens, completionTokens }
}

function estimateTokens(text: string): number {
  // 粗略估算：中文按字、英文按词
  const cjk = (text.match(/[一-鿿　-〿]/g) || []).length
  const rest = text.replace(/[一-鿿　-〿]/g, ' ')
  const words = rest.trim() ? rest.trim().split(/\s+/).length : 0
  return Math.ceil(cjk * 0.6 + words)
}

// 从模型回答中解析走法坐标（容忍 JSON、引号、括号、多余文字）
export function extractMove(text: string): string | null {
  const cleaned = text
    .replace(/```/g, '')
    .replace(/[{}"']/g, '')
    .replace(/move\s*[:：]\s*/i, '')
  const m = cleaned.match(/([a-i]{1}\d{1}\s*[-—－]?\s*[a-i]{1}\d{1})/)
  if (!m) return null
  return m[1].replace(/\s*[-—－]\s*/g, '')
}