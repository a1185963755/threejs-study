<script setup>
import { onMounted, onUnmounted, ref, defineAsyncComponent, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { demos } from '../data/demos.js';

const router = useRouter();
function open(id) {
  router.push(`/demo/${id}`);
}

// 底图：初始一律渐变色；hover 移开时抓 demo 最后一帧当底图，存内存即可。
// 刷新页面回到渐变是符合预期的（"初始就渐变色"）。
const thumbs = ref({});

// hover 实时预览：只挂载当前悬停的那一个 demo（同一时刻最多 1 个 WebGL 上下文在跑）。
// 鼠标移开即卸载，demo 组件自己的 onUnmounted 会 dispose 掉 renderer/geometry 等。
// demos 里存的是 () => import() 工厂函数，必须 defineAsyncComponent 包一层才会真正执行 import
// （否则 <component :is> 会把它当普通值渲染成 "[object Promise]"）。
const demoComponents = demos.reduce((acc, d) => {
  acc[d.id] = defineAsyncComponent(d.component);
  return acc;
}, {});

const hoveredId = ref(null);
// 不用 matchMedia 做前置门控：环境若不支持 hover，mouseenter 事件本就不会触发，
// 逻辑天然安全；触摸设备点一下直接走 click 进 demo，不会停留触发预览。

function onEnter(id) {
  hoveredId.value = id;
}

// 从某张卡片的实时渲染层里抓最后一帧，存为该卡片底图。
// 用离屏 canvas 缩到 480px 宽 jpeg dataURL（彩色渲染 jpeg 体积更小）。
function captureFromCard(id) {
  const liveEl = document.querySelector(`[data-card="${id}"] .viewport__live canvas`);
  if (!liveEl || liveEl.width === 0) return;
  const MAX_W = 480;
  const scale = Math.min(1, MAX_W / liveEl.width);
  const w = Math.round(liveEl.width * scale);
  const h = Math.round(liveEl.height * scale);
  try {
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d').drawImage(liveEl, 0, 0, w, h);
    thumbs.value = { ...thumbs.value, [id]: tmp.toDataURL('image/jpeg', 0.82) };
  } catch {
    // WebGL 缓冲未保留或跨域，抓空则忽略，底图保持渐变
  }
}

function onLeave(id) {
  if (hoveredId.value !== id) return;
  // 关键：先抓最后一帧（canvas 还在），再置 null 触发卸载，顺序不能反
  captureFromCard(id);
  hoveredId.value = null;
}

// 签名元素：真实测量页面自身刷新率的帧计数器。
const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const frameCount = ref(0);
const fps = ref(0);
let raf = null;
let lastSample = 0;
let framesInWindow = 0;

onMounted(() => {
  if (prefersReduced) return;
  lastSample = performance.now();
  const tick = (now) => {
    frameCount.value++;
    framesInWindow++;
    const elapsed = now - lastSample;
    if (elapsed >= 500) {
      fps.value = Math.round((framesInWindow * 1000) / elapsed);
      lastSample = now;
      framesInWindow = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
});

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="console">
    <!-- 控制台头栏：左 identity，右 HUD 计数器 -->
    <header class="bar">
      <div class="bar__id">
        <span class="bar__mark" aria-hidden="true"></span>
        <span class="bar__label">three.js_playground</span>
        <span class="bar__sep">/</span>
        <span class="bar__sub">render lab</span>
      </div>
      <div class="bar__hud" :class="{ 'is-static': prefersReduced }">
        <span class="hud__cell">
          <span class="hud__k">FPS</span>
          <span class="hud__v">{{ prefersReduced ? '—' : fps.toString().padStart(2, '0') }}</span>
        </span>
        <span class="hud__sep"></span>
        <span class="hud__cell">
          <span class="hud__k">FRAME</span>
          <span class="hud__v">{{ prefersReduced ? '—' : frameCount.toString().padStart(6, '0') }}</span>
        </span>
      </div>
    </header>

    <!-- 区域导引：一句话说明这是什么，而不是营销大标题 -->
    <div class="lead">
      <h1 class="lead__title">Render Lab</h1>
      <p class="lead__sub">
        实时 WebGL 实验。每个单元是一个独立的 Three.js 场景，点击进入。
      </p>
      <div class="lead__count">
        <span class="lead__n">{{ demos.length }}</span>
        <span class="lead__unit">unit{{ demos.length === 1 ? '' : 's' }} loaded</span>
      </div>
    </div>

    <!-- 卡片网格：作品库的真正主角 -->
    <main class="grid">
      <button
        v-for="d in demos"
        :key="d.id"
        :data-card="d.id"
        class="unit"
        @click="open(d.id)"
        @mouseenter="onEnter(d.id)"
        @mouseleave="onLeave(d.id)"
      >
        <!-- 渲染视口：hover 时实时渲染 demo，否则显示上一帧截图 / 渐变底图 -->
        <div class="viewport">
          <!-- 底图层：有 hover 离开时抓的最后一帧用截图，否则渐变 -->
          <img
            v-if="thumbs[d.id]"
            class="viewport__shot"
            :src="thumbs[d.id]"
            :alt="d.title + ' 渲染截图'"
          />
          <div v-else class="viewport__cover" :style="{ background: d.gradient }"></div>

          <!-- 实时渲染层：仅当前 hover 的卡片挂载，移开即卸载。
               pointer-events:none 让点击穿透到卡片，仍能进入 demo 页 -->
          <div
            v-if="hoveredId === d.id"
            class="viewport__live"
          >
            <component :is="demoComponents[d.id]" />
          </div>

          <span class="viewport__wire" aria-hidden="true"></span>
          <!-- 四角取景括号 -->
          <span class="bracket bracket--tl" aria-hidden="true"></span>
          <span class="bracket bracket--tr" aria-hidden="true"></span>
          <span class="bracket bracket--bl" aria-hidden="true"></span>
          <span class="bracket bracket--br" aria-hidden="true"></span>
          <span class="viewport__tag">
            {{ hoveredId === d.id ? '● rendering' : (thumbs[d.id] ? '● captured' : '● live') }}
          </span>
        </div>

        <!-- 单元元数据：标题 + 描述 -->
        <div class="meta">
          <h2 class="meta__title">{{ d.title }}</h2>
          <p class="meta__desc">{{ d.desc }}</p>
          <span class="meta__enter">enter →</span>
        </div>

        <!-- 完成日期：卡片右下角 -->
        <div class="meta__date">
          <span class="meta__date-k">DATE</span>
          <time :datetime="d.date">{{ d.date }}</time>
        </div>
      </button>
    </main>

    <footer class="foot" v-if="!demos.length">
      empty — 在 <code>src/data/demos.js</code> 注册第一个单元
    </footer>
  </div>
</template>

<style scoped>
  /* ============ 令牌：中性深底 + 唯一 HUD 琥珀强调色 ============ */
  .console {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: #0a0b0d;
    color: #d6d8db;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }
  .console::before {
    /* 极淡的全局网格底纹，读作"绘图栅格"，非装饰噪点 */
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(255, 180, 84, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 180, 84, 0.035) 1px, transparent 1px);
    background-size: 48px 48px;
    z-index: 0;
  }

  /* ============ 头栏 ============ */
  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 28px;
    background: rgba(10, 11, 13, 0.88);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #1c1d21;
  }
  .bar__id {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  .bar__mark {
    width: 10px; height: 10px;
    background: #ffb454;
    box-shadow: 0 0 8px rgba(255, 180, 84, 0.6);
  }
  .bar__label { color: #e8eaec; font-weight: 500; }
  .bar__sep { color: #3a3c42; }
  .bar__sub { color: #7a7d83; }

  .bar__hud {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 11px;
  }
  .hud__cell { display: flex; align-items: baseline; gap: 6px; }
  .hud__k { color: #5c5f66; letter-spacing: 0.1em; }
  .hud__v {
    color: #ffb454;
    font-variant-numeric: tabular-nums;
    min-width: 4ch;
    text-align: right;
  }
  .hud__sep { width: 1px; height: 12px; background: #2a2b30; }
  .bar__hud.is-static .hud__v { color: #5c5f66; }

  /* ============ 导引区 ============ */
  .lead {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 64px 28px 40px;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 24px;
  }
  .lead__title {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: clamp(40px, 7vw, 84px);
    line-height: 0.95;
    letter-spacing: -0.03em;
    color: #f2f3f5;
    margin-bottom: 14px;
  }
  .lead__sub {
    font-size: 13px;
    line-height: 1.6;
    color: #8a8d93;
    max-width: 46ch;
  }
  .lead__count {
    display: flex;
    align-items: baseline;
    gap: 8px;
    color: #ffb454;
    font-variant-numeric: tabular-nums;
  }
  .lead__n {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 40px;
    font-weight: 700;
    line-height: 1;
  }
  .lead__unit { font-size: 11px; color: #7a7d83; letter-spacing: 0.08em; }

  /* ============ 卡片网格 ============ */
  .grid {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px 28px 88px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 22px;
  }

  .unit {
    position: relative;
    display: flex;
    flex-direction: column;
    text-align: left;
    background: #101114;
    border: 1px solid #1c1d21;
    cursor: pointer;
    color: inherit;
    font-family: inherit;
    transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease;
  }
  .unit:hover {
    border-color: #3a3c42;
    transform: translateY(-3px);
    box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.7);
  }
  .unit:focus-visible {
    outline: none;
    border-color: #ffb454;
    box-shadow: 0 0 0 1px #ffb454;
  }

  /* 视口：封面包在四角括号里，读作"渲染表面" */
  .viewport {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #07080a;
  }
  .viewport__cover { position: absolute; inset: 0; }
  .viewport__shot {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* 实时渲染层：铺满视口，盖在底图之上；pointer-events:none 让点击穿透进 demo 页 */
  .viewport__live {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }
  .viewport__wire {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    background-size: 24px 24px;
    mix-blend-mode: overlay;
  }
  .viewport__tag {
    position: absolute;
    top: 10px;
    left: 12px;
    font-size: 10px;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.92);
    background: rgba(0, 0, 0, 0.35);
    padding: 3px 7px;
    border-radius: 2px;
    backdrop-filter: blur(2px);
  }

  /* 四角取景括号 */
  .bracket {
    position: absolute;
    width: 14px;
    height: 14px;
    border-color: rgba(255, 255, 255, 0.55);
    border-style: solid;
    border-width: 0;
  }
  .bracket--tl { top: 8px;    left: 8px;    border-top-width: 1.5px; border-left-width: 1.5px; }
  .bracket--tr { top: 8px;    right: 8px;   border-top-width: 1.5px; border-right-width: 1.5px; }
  .bracket--bl { bottom: 8px; left: 8px;    border-bottom-width: 1.5px; border-left-width: 1.5px; }
  .bracket--br { bottom: 8px; right: 8px;   border-bottom-width: 1.5px; border-right-width: 1.5px; }

  /* 元数据 */
  .meta { padding: 16px 18px 20px; }
  .meta__title {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 19px;
    font-weight: 600;
    color: #eceef0;
    letter-spacing: -0.01em;
  }
  /* 完成日期：绝对定位到卡片右下角，HUD 键值对风格 */
  .meta__date {
    position: absolute;
    right: 18px;
    bottom: 16px;
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 11px;
    z-index: 3;
  }
  .meta__date-k {
    color: #5c5f66;
    letter-spacing: 0.1em;
  }
  .meta__date time {
    color: #ffb454;
    font-variant-numeric: tabular-nums;
  }
  .meta__desc {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.6;
    color: #8a8d93;
  }
  .meta__enter {
    display: inline-block;
    margin-top: 14px;
    font-size: 11px;
    color: #6c6f76;
    letter-spacing: 0.08em;
    transition: color .2s ease, transform .2s ease;
  }
  .unit:hover .meta__enter {
    color: #ffb454;
    transform: translateX(4px);
  }

  /* ============ 空态 ============ */
  .foot {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 28px 80px;
    color: #7a7d83;
    font-size: 13px;
  }
  .foot code { color: #ffb454; }

  /* ============ 响应式 ============ */
  @media (max-width: 640px) {
    .lead { grid-template-columns: 1fr; padding: 44px 20px 32px; }
    .grid { padding: 8px 20px 64px; gap: 16px; }
    .bar { padding: 12px 20px; }
    .bar__sub { display: none; }
  }
</style>
