<script setup>
import { computed, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { demosById } from '../data/demos.js';

const route = useRoute();
const router = useRouter();

const demo = computed(() => demosById[route.params.id]);
// demos 里存的是 () => import('...') 工厂函数，
// 必须用 defineAsyncComponent 包一层，Vue 才会真正执行 import 并按异步组件渲染。
// （直接把工厂函数丢给 <component :is>，会被当成普通值渲染成 "[object Promise]"）
const AsyncDemo = computed(() => defineAsyncComponent(demo.value.component));

function back() {
  router.push('/');
}
</script>

<template>
  <div class="demo">
    <header class="demo__bar">
      <button class="demo__back" @click="back">← 返回</button>
      <h1 class="demo__name">{{ demo?.title }}</h1>
    </header>

    <div class="demo__stage">
      <!-- 懒加载当前 demo 组件；加载中/出错时给提示 -->
      <Suspense>
        <template #default>
          <component :is="AsyncDemo" />
        </template>
        <template #fallback>
          <div class="demo__loading">加载中…</div>
        </template>
      </Suspense>
    </div>
  </div>
</template>

<style scoped>
  .demo {
    display: flex;
    flex-direction: column;
    flex: 1;        /* 占满 #app 这个 flex 容器 */
    min-height: 0;  /* 允许内部 stage flex:1 正确收缩/展开 */
  }
  .demo__bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
    background: #161618;
    border-bottom: 1px solid #27272a;
    z-index: 10;
  }
  .demo__back {
    padding: 6px 12px;
    font-size: 13px;
    color: #e6e6e6;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    cursor: pointer;
    transition: background .15s ease;
  }
  .demo__back:hover { background: #3f3f46; }
  .demo__name {
    font-size: 15px;
    font-weight: 600;
    color: #d4d4d8;
  }

  .demo__stage {
    position: relative;
    flex: 1;
    overflow: hidden;
  }
  .demo__loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #777;
    font-size: 14px;
  }
</style>
