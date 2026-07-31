<script setup>
// 顶层布局壳：固定头部 + 路由出口
</script>

<template>
  <div class="app">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style scoped>
  /* .app 是 #app(flex column) 和页面根元素之间的中间层。
     它本身也要成为 flex 容器并占满 #app，flex 高度链才不会断在它这里。 */
  .app {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>

<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  /* #app 用 flex 容器，子级（router-view 输出的根元素）用 flex:1 即可占满，
     不依赖 height:100% 链（在某些布局下 height:100% 会塌缩成内容高度）。 */
  #app {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  body {
    background: #0e0e10;
    color: #e6e6e6;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* 全局页面切换淡入淡出 */
  .fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
