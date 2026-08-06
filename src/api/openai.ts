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
  /** 整个请求（含 fetch 建连）总时长上限（毫秒），默认 180000 */
  totalTimeoutMs?: number
  /** 等待 HTTP 响应（建连）超时（毫秒），默认 30000 */
  headersTimeoutMs?: number
  /** 响应头已收到但迟迟无首个数据块（毫秒），默认 60000 */
  firstByteTimeoutMs?: number
  /** 收到数据后，相邻数据块间隔看门狗（毫秒），默认 60000 */
  dataTimeoutMs?: number
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
  const totalTimeoutMs = opts.totalTimeoutMs ?? 180_000
  const dataTimeoutMs = opts.dataTimeoutMs ?? 60_000
  const headersTimeoutMs = opts.headersTimeoutMs ?? 30_000
  const firstByteTimeoutMs = opts.firstByteTimeoutMs ?? 60_000

  const controller = new AbortController()
  const onOuterAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onOuterAbort, { once: true })
  }

  const startAt = Date.now()
  let respondedAt = 0 // 收到响应头
  let lastChunkAt = 0 // 收到最后一个数据块
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  // 看门狗覆盖整个请求，按阶段区分：
  //  建连超时（无响应头）> 首字节超时（有响应头、无数据块）> 数据块间隔超时 > 总时长。
  // 必须在 fetch 之前创建，否则建连假死时无人中止，调用方会永远挂起。
  const watchdog = setInterval(() => {
    const now = Date.now()
    if (now - startAt > totalTimeoutMs) controller.abort()
    else if (respondedAt === 0 && now - startAt > headersTimeoutMs) controller.abort()
    else if (respondedAt !== 0 && lastChunkAt === 0 && now - startAt > firstByteTimeoutMs) controller.abort()
    else if (lastChunkAt !== 0 && now - lastChunkAt > dataTimeoutMs) controller.abort()
  }, 500)

  try {
    let res: Response
    try {
      res = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.4 }),
        signal: controller.signal,
      })
    } catch (e) {
      if (controller.signal.aborted) throw new TransientError('请求超时或中止')
      throw new TransientError(`请求失败：${String(e)}`)
    }
    respondedAt = Date.now()

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status >= 500) throw new TransientError(`服务端错误 HTTP ${res.status}`)
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    if (!res.body) throw new TransientError('无响应体')

    reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let reasoning = ''
    let content = ''
    let promptTokens = 0
    let completionTokens = 0

    const handleLine = (line: string) => {
      if (!line.startsWith('data:')) return
      const data = line.slice(5).trim()
      if (data === '[DONE]' || !data) return
      let parsed: any
      try {
        parsed = JSON.parse(data)
      } catch {
        return
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

    const processBuffer = () => {
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        handleLine(line)
      }
    }

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (e) {
        if (controller.signal.aborted) throw new TransientError('流式响应超时或中止')
        throw new TransientError(`读取中断：${String(e)}`)
      }
      if (chunk.done) break
      lastChunkAt = Date.now()
      buffer += decoder.decode(chunk.value, { stream: true })
      processBuffer()
    }

    // 冲刷解码器余量，处理最后一个没有换行符的 SSE 片段，避免末条消息丢失
    buffer += decoder.decode()
    processBuffer()

    // provider 未给 usage 时估算
    if (!promptTokens && completionTokens === 0) {
      completionTokens = estimateTokens(content + reasoning)
    }

    cb.onUsage?.({ promptTokens, completionTokens })
    return { reasoning, content, promptTokens, completionTokens }
  } finally {
    clearInterval(watchdog)
    reader?.cancel().catch(() => {})
    if (opts.signal) opts.signal.removeEventListener('abort', onOuterAbort)
  }
}

function estimateTokens(text: string): number {
  // 粗略估算：中文按字、英文按词
  const cjk = (text.match(/[一-鿿　-〿]/g) || []).length
  const rest = text.replace(/[一-鿿　-〿]/g, ' ')
  const words = rest.trim() ? rest.trim().split(/\s+/).length : 0
  return Math.ceil(cjk * 0.6 + words)
}

// 从模型回答中解析走法编号（容忍 JSON、引号、空白与多余文字）。只取第一个整数。
export function extractMoveIndex(text: string): number | null {
  const cleaned = text.replace(/```/g, '').replace(/[{}"'\s]/g, '')
  const m = cleaned.match(/\d+/)
  if (!m) return null
  return Number(m[0])
}