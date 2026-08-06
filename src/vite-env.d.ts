/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_MODELS?: string
  readonly VITE_LLM_TOTAL_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}