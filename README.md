# 象棋竞技场 · Xiangqi Arena

一个中国象棋（Xiangqi）LLM 对弈平台。引擎负责棋规与记谱，OpenAI 兼容接口负责驱动 AI，
Pinia 管理对局状态与调度，Vue 负责展示。

## 技术栈

- **引擎**（`src/engine`）：纯 TypeScript 棋规引擎——走法、将军/将死/困毙判定、中文与 WXF 记谱。
- **API**（`src/api`）：OpenAI 兼容流式接口（`/api/chat/completions`），带分阶段超时与解析。
- **状态**（`src/stores`）：对局状态、AI 调度与持久化。
- **存储**（`src/db`）：IndexedDB 多对局持久化（每局状态 + 每步思维链）。
- **UI**（`src/views`）：Vue 3 + Pinia + Vue Router，含「我的对局」历史页。

## 快速开始

```bash
npm install
cp .env.example .env   # 填入 LLM_BASE_URL 与 LLM_API_KEY
npm run dev            # Vite 开发服务器（含 /api 开发代理）
```

> 开发模式下 `/api/*` 由 Vite 的 `configureServer` 代理转发，API Key 不进入浏览器。
> Vite 代理天然支持并发：多个标签页同时调 `/api/chat/completions` 各自独立，互不阻塞。

### 多标签页多棋局

- 每个标签页用 `sessionStorage` 记住自己的「当前对局」，天然各自独立；对局数据统一存 IndexedDB。
- 正在执行的对局带「占用租约」，同一局不会被两个标签页同时续走（标签页崩溃后租赁 30s 过期可被接管）。
- 并发瓶颈在上游模型商家的速率/TPM 限制，以及生产服务器每 IP 的 `RATE_LIMIT_MAX`（多标签页时按需调大）。

## 生产部署

构建后由 Node 生产服务器同时提供静态资源与 `/api`：

```bash
npm run build
npm start              # node --env-file-if-exists=.env server/index.mjs
```

生产服务器（`server/index.mjs`）负责：

- 提供 `dist/` 静态资源，并对 `/game`、`/config` 等客户端路由做 SPA fallback；
- 在服务端注入 API Key，前端不接触密钥；
- 强制模型白名单、请求体大小限制、每 IP 限流；
- 客户端断开时中止上游请求，避免空耗额度；
- 不向前端返回内部错误原文。

相关环境变量见 `.env.example`。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `dev` | Vite 开发服务器 |
| `build` | TS 类型检查 + 生产构建 |
| `start` | 生产服务器（静态 + API） |
| `preview` | Vite 预览构建产物 |
| `test` | 运行引擎、持久化与 API 测试 |
| `test:engine` | 棋规引擎测试 |
| `test:persist` | 持久化往返测试 |
| `test:api` | 流式超时/中止测试 |