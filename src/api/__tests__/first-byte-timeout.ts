import { streamChat, TransientError } from '../openai'

// 模拟“响应头已返回，但服务端一直不发送首个 SSE 数据块”：
// 之前 headersTimeout 已失效、dataTimeout 未生效，只能等总超时。
;(globalThis as any).fetch = (_url: string, init: any) =>
  new Promise((resolve) => {
    resolve(
      new Response(
        new ReadableStream({
          start(c) {
            init?.signal?.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            )
          },
        }),
        { status: 200 },
      ),
    )
  })

const start = Date.now()
try {
  await streamChat(
    'mock',
    [{ role: 'user', content: 'x' }],
    {},
    { totalTimeoutMs: 10_000, headersTimeoutMs: 100, firstByteTimeoutMs: 400, dataTimeoutMs: 60_000 },
  )
  console.log('FAIL: 应当抛错')
  process.exit(1)
} catch (e) {
  const elapsed = Date.now() - start
  const err = e as Error
  console.log(`抛错类型: ${err instanceof TransientError ? 'TransientError' : err.constructor.name}`)
  console.log(`耗时: ${elapsed}ms`)
  if (!(err instanceof TransientError)) {
    console.log('FAIL: 不是瞬态错误')
    process.exit(1)
  }
  if (elapsed > 3000) {
    console.log('FAIL: 首字节超时未及时中止')
    process.exit(1)
  }
  console.log('PASS: 响应头后无首字节能被首字节看门狗及时中止')
  process.exit(0)
}