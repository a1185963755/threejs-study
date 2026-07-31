# Three.js Playground

一个用于学习和展示 Three.js 作品的个人 playground。基于 Vue 3 + Vite 构建，暗色主题，首页以卡片形式陈列作品，点击卡片进入对应的交互式 demo。

## 技术栈

- **Three.js** `^0.160` — 3D 渲染
- **Vue 3** + **Vue Router** — UI 与路由
- **Vite** `^5` — 开发与构建
- **lil-gui** — 调试参数面板
- **simplex-noise** — 程序化噪声（地形等）

## 目录结构

```
.
├── index.html              # Vue 应用挂载点
├── vite.config.js
├── package.json
├── src/
│   ├── main.js             # 应用入口
│   ├── App.vue             # 顶层布局壳（路由出口 + 页面切换动画）
│   ├── router.js
│   ├── pages/              # Home（作品卡片列表）/ Demo（动态加载 demo）
│   ├── data/demos.js       # demo 注册表 —— 新增作品时在此追加一条
│   └── demos/              # 各 demo 的实现（每个一个目录 / .vue 文件）
└── scroll-frame-demo/      # 独立 demo：SVG 滚动帧动画
```

## 新增一个作品

在 `src/data/demos.js` 的 `demos` 数组里追加一项即可，首页卡片和路由会自动生成：

```js
{
  id: 'my-demo',                          // 唯一标识，用作路由
  title: '我的作品',
  date: '2026-07-31',
  desc: '一句话描述',
  gradient: 'linear-gradient(135deg, ...)', // 卡片封面占位渐变
  component: () => import('../demos/my-demo/MyDemo.vue'), // 懒加载
}
```

## 本地开发

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器
npm run build    # 生产构建
npm run preview  # 预览构建产物
```
