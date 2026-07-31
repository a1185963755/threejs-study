import { createRouter, createWebHistory } from 'vue-router';
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
  history: createWebHistory(),
  routes,
});

export default router;
export { demos };
