import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // GitHub Pages 项目页地址带仓库名前缀（username.github.io/threejs-study/），
  // 必须告诉 Vite 资源从这个子路径加载，否则线上白屏；仓库名不同的话这里要同步改
  base: '/threejs-study/',
  plugins: [vue()],
});
