<template>
  <div class="shell">
    <nav class="topbar">
      <RouterLink to="/" class="brand">
        <span class="seal">弈</span>
        <span class="zh">弈境 · 象棋 LLM 竞技场</span>
        <span class="en">XIANGQI ARENA</span>
      </RouterLink>
    </nav>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>