// demo 注册表 —— playground 的「目录」。
// 后续新增作品时，在这里追加一条即可，首页卡片和路由会自动生成。
//
// 字段说明：
//   id        路由用的唯一标识，也用作卡片 key
//   title     卡片标题
//   date      完成日期（'YYYY-MM-DD'），显示在卡片上
//   desc      一句话描述
//   gradient  卡片封面占位用的 CSS 渐变（无需截图文件）
//   component 懒加载的 Vue 组件，点击进入 demo 时才打包加载

export const demos = [
  {
    id: 'terrain-noise',
    title: '随机山脉地形',
    date: '2026-07-22',
    desc: '分段平面 + simplex 噪声生成连续起伏地形，MeshNormalMaterial 显示彩色法线，鼠标视差。',
    gradient: 'linear-gradient(135deg, #1f5f8b 0%, #2d9ca6 45%, #7ed957 100%)',
    component: () => import('../demos/terrain-noise/TerrainNoise.vue'),
  },
];

// 按 id 建索引，方便路由查找
export const demosById = Object.fromEntries(demos.map((d) => [d.id, d]));
