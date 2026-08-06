import { streamChat, TransientError } from '../openai'

// 模拟建连假死：fetch 永不返回响应，但尊重 abort 信号（真实浏览器行为）
;(globalThis as any).fetch = (_url: string, init: any) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('Aborted', 'AbortError')),
    )
  })

const start = Date.now()
try {
  await streamChat('mock', [{ role: 'user', content: 'x' }], {}, { totalTimeoutMs: 1000, headersTimeoutMs: 400 })
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
    console.log('FAIL: 看门狗未及时中止')
    process.exit(1)
  }
  console.log('PASS: 建连假死被看门狗中止并抛错')
  process.exit(0)
}