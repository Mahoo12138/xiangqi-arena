<template>
  <div class="shell">
    <nav class="topbar">
      <RouterLink to="/" class="brand">
        <span class="seal">弈</span>
        <span class="zh">弈境 · 象棋 LLM 竞技场</span>
        <span class="en">XIANGQI ARENA</span>
      </RouterLink>
      <nav class="links">
        <RouterLink to="/game">对局</RouterLink>
        <RouterLink to="/history">历史</RouterLink>
        <RouterLink to="/config">配置</RouterLink>
      </nav>
    </nav>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>