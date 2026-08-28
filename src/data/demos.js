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
  {
    id: 'tunnel-flythrough',
    title: '隧道穿梭',
    date: '2026-08-17',
    desc: 'CatmullRomCurve3 样条穿过 6 个控制点，TubeGeometry 沿曲线放样出 100 段 × 30 边、半径 5 的三维管道。',
    gradient: 'linear-gradient(135deg, #0b1026 0%, #1b3a5c 55%, #4cc9f0 100%)',
    component: () => import('../demos/tunnel-flythrough/TunnelFlythrough.vue'),
  },
  {
    id: 'yunlei-pattern',
    title: '云雷纹',
    date: '2026-08-17',
    desc: '用回旋曲线绘制商周青铜器上的云雷纹，第一步：以原点为圆心的圆曲线 + 坐标轴 + 鼠标拖动。',
    gradient: 'linear-gradient(135deg, #3a2f1b 0%, #8a6d2f 50%, #e8c47a 100%)',
    component: () => import('../demos/yunlei-pattern/YunleiPattern.vue'),
  },
  {
    id: 'infinite-tunnel',
    title: '无限时空隧道',
    date: '2026-08-17',
    desc: '风暴纹理作 alpha 贴图 —— 透明发光的隧道内壁滚动向前，色相沿色环循环流转。',
    gradient: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    component: () => import('../demos/infinite-tunnel/InfiniteTunnel.vue'),
  },
  {
    id: 'build-house',
    title: '盖房子',
    date: '2026-08-18',
    desc: '浇筑 4000×3000×300 地基 → 砌四面墙（侧墙开窗、前墙门窗）→ 吊装 45° 人字斜顶，四段依次盖起来，光照投影，鼠标拖动查看。',
    gradient: 'linear-gradient(135deg, #4a5568 0%, #a0aec0 55%, #cbd5e0 100%)',
    component: () => import('../demos/build-house/BuildHouse.vue'),
  },
  {
    id: 'snowy-forest',
    title: '林海雪原',
    date: '2026-08-28',
    desc: '低频 FBM 噪声铺出平缓雪丘，松树 glTF 上色后 InstancedMesh 种下 18 棵大松树；低机位平视，树影立在纯黑夜幕前。',
    gradient: 'linear-gradient(135deg, #0b1d3a 0%, #2c5f8a 50%, #eaf4fb 100%)',
    component: () => import('../demos/snowy-forest/SnowyForest.vue'),
  },
];

// 按 id 建索引，方便路由查找
export const demosById = Object.fromEntries(demos.map((d) => [d.id, d]));
