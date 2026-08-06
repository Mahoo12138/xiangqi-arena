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

// 调用 OpenAI 兼容的 chat/completions（流式），通过 vite dev server 代理转发，
// Key 由服务端注入，前端不携带。
export async function streamChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  cb: StreamCallbacks = {},
): Promise<StreamResult> {
  const res = await fetch('/api/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.4,
    }),
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reasoning = ''
  let content = ''
  let promptTokens = 0
  let completionTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

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