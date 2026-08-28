<script setup>
// 林海雪原 —— 雪原松林（对标参考图：黑色夜空 + 柔和亮白雪坡 + 大棵松树剪影）。
// 地形：1500×1500 分段平面 + 低频 FBM simplex 噪声（只有 2 层倍频）→
//   平缓连绵的雪丘，没有细碎抖动；顶点色上色：高度带（谷灰 → 峰白）
//   叠加坡度（陡坡露岩），MeshLambertMaterial 漫反射 + 强半球光；
// 森林：松树 glTF 只取树叶卡片网格（枝干体块减面后大片平坦锥面会穿帮，不渲染），
//   上松绿色后 InstancedMesh 一次画完（约 18 棵，性能优先），
//   种树用拒绝采样：雪线以上不长、坡太陡不长、格网占位防重叠，
//   每棵树的 y 直接采样地形同一套噪声函数，保证精准扎在坡面上；
// 下雪：三层 Points 点精灵（近层大而稀 / 远层小而密，顺便出视差），
//   snow.png 黑底借 alphaMap 当透明度用，每片随机下落速度 + 正弦风摆，落到谷底回顶部循环。
// 相机压得很低、平视远方，树在天幕前勾出剪影 —— 复刻参考图的构图。
// 渲染器 / 尺寸自适应 / 卸载清理等样板统一在 useThreeStage 里
import { ref } from 'vue';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useThreeStage } from '../../composables/useThreeStage.js';
import treeGltfUrl from '../../assets/tree/tree.gltf?url';
import treeBinUrl from '../../assets/tree/tree.bin?url';
import snowUrl from '../../assets/snow.png?url';

const container = ref(null);

// ---------- 场景参数（没有 GUI，要调直接改这里的常量） ----------
const params = {
  amplitude: 70,  // 山丘高度：噪声 [-1,1] 映射到 ±amplitude（参考图是平缓雪丘）
  baseScale: 650, // 基频波长：越大越平缓
  octaves: 2,     // 倍频层数：2 层 = 大轮廓 + 一点点起伏，山不「抖」
  seed: 2026,     // 随机种子：换种子换一套丘
  treeCount: 18,  // 种树棵数（每棵约 10.5 万三角形，别贪多）
  snowline: 60,   // 雪线：只在这条线以下种树
};
const SIZE = 1500;    // 地形边长（小场景，性能优先）
const SEGMENTS = 150; // 每边分段数（150×150 ≈ 2.2 万顶点）

// ---------- 下雪参数 ----------
// 三层不同大小的 Points：近层大而稀、远层小而密，顺便天然出远近视差。
// 每层一个 Points、一次 draw call，三层加起来约 1300 片也只有 3 次
const SNOW_LAYERS = [
  { count: 300, size: 11, speedMin: 26, speedMax: 46 },  // 近层：大而快
  { count: 420, size: 7.0, speedMin: 20, speedMax: 36 }, // 中层
  { count: 580, size: 4.0, speedMin: 14, speedMax: 28 }, // 远层：小而慢
];
const SNOW_AREA = 1400;   // 雪幕水平范围（略小于地形，盖满视野即可）
const SNOW_TOP = 300;     // 雪花生成高度
const SNOW_BOTTOM = -100; // 回收线放谷底以下，别在半空凭空消失
const SNOW_SWAY = 14;     // 风摆幅度

// ---------- 地形顶点色的颜色带 ----------
// 高度带：山谷灰 → 过渡浅灰 → 山顶白（想反过来"山谷积雪白、山顶露岩灰"就对调两头）
const COLOR_VALLEY = new THREE.Color(0x8a8f98);
const COLOR_MID = new THREE.Color(0xc9cfd6);
const COLOR_PEAK = new THREE.Color(0xffffff);
const COLOR_ROCK = new THREE.Color(0x6f7379); // 陡坡上露出的岩石色

let geometry = null;
let material = null;
let controls = null;
let activeNoise = null;   // 当前种子对应的噪声函数，种树时复用来查地面高度
let forestGroup = null;   // 林子整组，重种时整组换掉
let treeSrcMeshes = null; // 模型源 mesh（几何体 + 上好色的材质），实例化模板
let snowLayers = null;    // 三层雪花 [{points, baseX, speeds, phases, count}]
const snowClock = new THREE.Clock(); // 驱雪花下落的时钟（onFrame 里取 dt）
let disposed = false;     // 模型异步加载回来前组件可能已卸载

// mulberry32：极小的可复现伪随机数发生器，喂给 simplex 当种子源
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FBM（分形布朗运动）：把多个倍频的 simplex 噪声加权叠加，
// 每加一层频率翻倍、振幅减半，最后除以振幅总和归一化回 [-1, 1]
function fbm(noise2D, x, z, octaves) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

// 查 (x,z) 处的地面高度 —— 地形顶点和种树共用同一套噪声，
// 所以每棵树都能精准踩在坡面上
function terrainHeightAt(x, z) {
  return fbm(activeNoise, x / params.baseScale, z / params.baseScale, params.octaves) * params.amplitude;
}

// 按当前 params 重算所有顶点高度，再按「高度带 + 坡度」填顶点色：
//   第一遍赋高度顺手统计实际 min/max（FBM 的极值不满 [-1,1]，不能用拍脑袋的范围归一化）；
//   computeVertexNormals 之后第二遍读法线算坡度 —— 缓坡按高度上雪色，陡坡露出岩石
function rebuildTerrain() {
  if (!geometry) return;
  activeNoise = createNoise2D(mulberry32(params.seed));
  const pos = geometry.attributes.position;
  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const h = terrainHeightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
  pos.needsUpdate = true;            // 通知 GPU 顶点数据变了
  geometry.computeVertexNormals();   // 光照法线 + 坡度都靠它

  const range = maxH - minH || 1;    // 防一手全平地形除零
  const nrm = geometry.attributes.normal;
  const colors = geometry.attributes.color;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - minH) / range, 0, 1);
    // 高度带三段插值：谷灰 → 浅灰 → 峰白
    if (t < 0.5) c.lerpColors(COLOR_VALLEY, COLOR_MID, t * 2);
    else c.lerpColors(COLOR_MID, COLOR_PEAK, (t - 0.5) * 2);
    // 坡度：法线 y 分量越小说面越陡（0.9 ≈ 26° 起坡、0.72 ≈ 44° 全岩），
    // 用 smoothstep 软过渡，陡的地方把雪色 lerp 成岩石色
    const rock = 1 - THREE.MathUtils.smoothstep(nrm.getY(i), 0.72, 0.9);
    c.lerp(COLOR_ROCK, rock);
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  colors.needsUpdate = true;
}

// 在雪坡上种树：拒绝采样挑位置 → 每个源 mesh 一个 InstancedMesh 一次画完
function plantForest(scene) {
  if (!treeSrcMeshes) return; // 模型还没加载好，等 onLoad 里再种
  // 清掉上一批（instanceMatrix 是每棵实例各自的 GPU 缓冲，要逐个释放；
  // 几何体是所有实例共享的模板，最后卸载时统一释放一次就够）
  if (forestGroup) {
    forestGroup.traverse((obj) => obj.isInstancedMesh && obj.dispose());
    scene.remove(forestGroup);
  }
  forestGroup = new THREE.Group();

  // 种树随机序列也用 terrain 的种子，换种子时山和林一起换
  const rng = mulberry32(params.seed * 131 + 17);
  const CELL = 48; // 占位格边长 ≥ 放大后的树冠直径，用于防两棵树叠在一起
  const occupied = new Set();
  const spots = [];
  const HALF = SIZE / 2 - 50; // 留边距，别种到地形边缘外
  let attempts = 0;
  while (spots.length < params.treeCount && attempts < params.treeCount * 40) {
    attempts++;
    const x = (rng() * 2 - 1) * HALF;
    const z = (rng() * 2 - 1) * HALF;
    const h = terrainHeightAt(x, z);
    if (h > params.snowline) continue; // 雪线以上太冷，不长树
    // 坡度 = 前后左右四个采样点的高差 / 间距，太陡「站不住」
    const gx = terrainHeightAt(x + 8, z) - terrainHeightAt(x - 8, z);
    const gz = terrainHeightAt(x, z + 8) - terrainHeightAt(x, z - 8);
    if (Math.hypot(gx, gz) / 16 > 0.65) continue;
    // 3×3 邻域占位检查：有任何邻居就换个地方
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let taken = false;
    for (let dx = -1; dx <= 1 && !taken; dx++) {
      for (let dz = -1; dz <= 1 && !taken; dz++) {
        if (occupied.has(`${cx + dx},${cz + dz}`)) taken = true;
      }
    }
    if (taken) continue;
    occupied.add(`${cx},${cz}`);
    spots.push({ x, h, z, r: rng() }); // r 留给朝向 / 大小
  }

  // 每个源 mesh（树冠 / 枝干）各建一个 InstancedMesh，所有树共享同一份几何体
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const src of treeSrcMeshes) {
    if (spots.length === 0) break;
    const instanced = new THREE.InstancedMesh(src.geometry, src.material, spots.length);
    instanced.castShadow = true;    // 树影落在雪面上
    instanced.receiveShadow = true;
    spots.forEach((spot, i) => {
      const scale = 4.5 + spot.r * 1.5;  // 4.5 ~ 6.0 倍 → 树高约 81 ~ 108，比雪丘还高（参考图比例）
      euler.set(0, spot.r * Math.PI * 2, 0); // 绕 Y 随机朝向（松树垂直地面长，不歪）
      quat.setFromEuler(euler);
      // 稍微往土里按 scale*1.2，坡面上树根不会悬空
      p.set(spot.x, spot.h - scale * 1.2, spot.z);
      s.set(scale, scale, scale);
      matrix.compose(p, quat, s);
      instanced.setMatrixAt(i, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    forestGroup.add(instanced);
  }
  scene.add(forestGroup);
}

// 造一层雪花 Points：初始 x / 下落速度 / 摆相位记在旁边的类型化数组里，
// 每帧用「初始 x + 正弦偏移」重算 x —— 风摆只是绕原位晃，不会越漂越远
function buildSnowLayer(texture, { count, size, speedMin, speedMax }) {
  const rng = mulberry32(9000 + count); // 每层固定随机序列，刷新页面雪幕分布不变
  const baseX = new Float32Array(count);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    baseX[i] = (rng() * 2 - 1) * (SNOW_AREA / 2);
    positions[i * 3] = baseX[i];
    positions[i * 3 + 1] = SNOW_BOTTOM + rng() * (SNOW_TOP - SNOW_BOTTOM); // 初始就铺满整层空域
    positions[i * 3 + 2] = (rng() * 2 - 1) * (SNOW_AREA / 2);
    speeds[i] = speedMin + rng() * (speedMax - speedMin);
    phases[i] = rng() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: texture,      // 雪花图案
    alphaMap: texture, // 借绿色通道把黑底抠成透明（snow.png 没有透明通道）
    color: 0xc9d9ea,   // 淡蓝白偏灰：黑夜空里亮、白雪地上也有可感知的青色遮蔽
    size,              // 点大小（世界单位），配合 sizeAttenuation 近大远小
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false, // 透明物不写深度，雪花互相叠加不出方块硬边
  });
  return { points: new THREE.Points(geo, mat), baseX, speeds, phases, count };
}

useThreeStage(container, {
  fov: 55,
  near: 40, // 近截面抬高：把贴脸飘过的雪花裁掉，不然会突然出现占半屏的巨大晶体
  far: 15000,
  cameraPos: [140, 85, 800],  // 低机位贴着雪原、平视远方，复刻参考图构图
  background: '#000000',      // 参考图的纯黑夜空
  onReady(scene, camera, renderer, el) {
    // ---------- 1. 灯光：强半球天光 + 温柔的平行光 ----------
    // 参考图里雪面几乎均匀亮白、没有硬阴影：半球光当主光，太阳只补一点立体感
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const hemiLight = new THREE.HemisphereLight(0xf5f9ff, 0xe8eef4, 1.35);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff6e8, 1.0);
    sunLight.position.set(600, 900, 400);
    sunLight.castShadow = true;
    // 正交阴影相机罩住整片 1500×1500 地形；范围小，1024 贴图足够细
    sunLight.shadow.camera.left = -1100;
    sunLight.shadow.camera.right = 1100;
    sunLight.shadow.camera.top = 1100;
    sunLight.shadow.camera.bottom = -1100;
    sunLight.shadow.camera.near = 50;
    sunLight.shadow.camera.far = 5000;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.normalBias = 1; // 消雪面上的自阴影条纹
    scene.add(sunLight);
    scene.add(sunLight.target); // target 默认在原点，加进场景矩阵世界才会更新

    // ---------- 2. 雪原地形 ----------
    geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    geometry.rotateX(-Math.PI / 2); // 躺平到 XZ 水平面（地面）
    // 顶点色属性：rebuildTerrain 里按高度带 + 坡度填
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3)
    );
    rebuildTerrain();

    // vertexColors: true 让顶点色参与光照（材质本色保持白，顶点色是什么就显示什么）
    material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.castShadow = true;    // 雪丘互相投影
    terrain.receiveShadow = true; // 承接树影
    scene.add(terrain);

    // ---------- 3. 加载松树模型：遍历 mesh 上色，再种下 ----------
    // gltf 里 tree.bin 是相对路径，构建后文件名带 hash，
    // 用 URLModifier 把它指到 Vite 处理过的真实地址（开发 / 构建都通吃）
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (url.endsWith('tree.bin') ? treeBinUrl : url));
    new GLTFLoader(manager).load(
      treeGltfUrl,
      (gltf) => {
        if (disposed) {
          gltf.scene.traverse((obj) => obj.isMesh && obj.geometry.dispose());
          return;
        }
        treeSrcMeshes = [];
        gltf.scene.traverse((obj) => {
          if (!obj.isMesh) return;
          // 只渲染树叶卡片：枝干体块减面后是大片平坦锥面，会从叶层底下露出「裙边」穿帮，
          // 直接不画（树叶卡片覆盖全树高，没有它树照样成立）
          if (!obj.name.startsWith('leaves')) return;
          obj.material = new THREE.MeshLambertMaterial({
            color: 0x2e6141, // 松绿
            // 薄壳几何翻到背面也得画出来，不然远看漏光
            side: THREE.DoubleSide,
          });
          treeSrcMeshes.push({ geometry: obj.geometry, material: obj.material });
        });
        plantForest(scene);
      },
      undefined,
      (err) => console.error('松树模型加载失败', err)
    );

    // ---------- 4. 下雪：三层 Points 点精灵，一次铺满天 ----------
    const snowTexture = new THREE.TextureLoader().load(snowUrl);
    snowTexture.colorSpace = THREE.SRGBColorSpace;
    snowLayers = SNOW_LAYERS.map((opt) => buildSnowLayer(snowTexture, opt));
    snowLayers.forEach(({ points }) => scene.add(points));

    // ---------- 5. OrbitControls：拖拽环绕 / 滚轮缩放 ----------
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // 阻尼惯性，拖起来更顺
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49; // 别钻到地平线以下
    controls.minDistance = 100;
    controls.maxDistance = 4000;
    controls.target.set(0, 55, 0); // 视线落在树干中部的高度

    // 相机自动绕 target 做圆周巡游（update() 每帧都在转，阻尼恰好也依赖它）
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2; // 2.0 = 30 秒一圈，1.2 更慢更电影感（负数反向）
    // 用户拖动时暂停巡游，松手后接着转，两边不打架
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    controls.addEventListener('end', () => { controls.autoRotate = true; });

    // 返回清理函数，卸载时由 useThreeStage 调用
    return () => {
      disposed = true;
      controls.dispose();
      sunLight.dispose(); // 连同阴影贴图一起释放
      snowTexture.dispose();
      if (snowLayers) {
        snowLayers.forEach(({ points }) => {
          points.geometry.dispose();
          points.material.dispose();
        });
      }
      geometry.dispose();
      material.dispose();
      if (forestGroup) {
        forestGroup.traverse((obj) => obj.isInstancedMesh && obj.dispose());
      }
      if (treeSrcMeshes) {
        treeSrcMeshes.forEach((src) => {
          src.geometry.dispose();
          src.material.dispose();
        });
      }
    };
  },
  onFrame() {
    controls.update(); // 阻尼模式必须每帧 update，惯性滚动才生效

    // 雪花下落：y 直接积分，x 用「初始位置 + 正弦偏移」重算（风摆不累积漂移）
    if (!snowLayers) return;
    const dt = Math.min(snowClock.getDelta(), 0.05); // 切后台回来 dt 会很大，夹一下防雪片瞬移
    const t = snowClock.elapsedTime;
    for (const { points, baseX, speeds, phases, count } of snowLayers) {
      const pos = points.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        let y = pos.getY(i) - speeds[i] * dt;
        if (y < SNOW_BOTTOM) y += SNOW_TOP - SNOW_BOTTOM; // 落出回收线就抬回顶部循环
        pos.setY(i, y);
        pos.setX(i, baseX[i] + Math.sin(t * 0.9 + phases[i]) * SNOW_SWAY);
      }
      pos.needsUpdate = true;
    }
  },
});
</script>

<template>
  <div ref="container" class="snowy-forest"></div>
</template>

<style scoped>
  /* 用 width/height:100% 撑满父容器（.demo__stage，flex:1）。
     不用 absolute，避免父级高度未定时高度塌缩成 0，导致 canvas 高度为 0。 */
  .snowy-forest {
    width: 100%;
    height: 100%;
    background: #000000;
  }
</style>
