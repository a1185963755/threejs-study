import { createRouter, createWebHashHistory } from 'vue-router';
import Home from './pages/Home.vue';
import { demos, demosById } from './data/demos.js';

// 路由表：
//   /                  首页（卡片网格）
//   /demo/:id          进入某个 demo，组件按 id 懒加载
//   未知 id            重定向回首页
const routes = [
  { path: '/', component: Home },
  {
    path: '/demo/:id',
    component: () => import('./pages/Demo.vue'),
    beforeEnter: (to) => {
      if (!demosById[to.params.id]) return '/';
    },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  // hash 模式：GitHub Pages 是纯静态托管，没有服务端路由兜底，
  // history 模式在子页面刷新会 404；hash 模式地址形如 /#/demo/snowy-forest
  history: createWebHashHistory(),
  routes,
});

export default router;
export { demos };
