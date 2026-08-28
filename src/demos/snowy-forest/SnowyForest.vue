<script setup>
// 林海雪原 —— 第一步：噪声山脉地形（漫反射材质 + 平行光阴影就位）。
// 思路：3000×3000 分段平面 + FBM（分形布朗运动）叠加多层 simplex 噪声 →
// 低频层勾出连绵山脉的大走向，高频层补山脊碎石细节；
// 材质用 MeshLambertMaterial（漫反射），平行光太阳已架好并开投影，
// 后续步骤直接在这套光照上做雪材质、森林与天空。
// 渲染器 / 尺寸自适应 / 卸载清理等样板统一在 useThreeStage 里
import { ref } from 'vue';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { useThreeStage } from '../../composables/useThreeStage.js';

const container = ref(null);

// ---------- 地形参数（GUI 可调，改动即时重算高度） ----------
const params = {
  wireframe: false, // 线框开关：默认关，想看地形骨架时随时切回
  amplitude: 380,   // 山体高度：噪声 [-1,1] 映射到 ±amplitude
  baseScale: 900,   // 基频波长：值越大山体越大越平缓，越小越碎
  octaves: 5,       // 细节层数：叠加几层噪声
  seed: 2026,       // 随机种子：同一种子地形固定，换种子换一套山
};
const SIZE = 3000;     // 地形边长
const SEGMENTS = 200;  // 每边分段数（200×200 ≈ 4 万顶点，线框密度刚好）

let geometry = null;
let material = null;
let controls = null;
let gui = null;

// mulberry32：极小的可复现伪随机数发生器，喂给 simplex 当种子源，
// 保证「同一种子出同一座山」，换种子才换地形
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FBM（分形布朗运动）：把多个倍频的 simplex 噪声加权叠加。
// 每加一层频率翻倍、振幅减半：第一层画大山轮廓，后面几层补山脊细节，
// 最后除以振幅总和，把结果归一化回 [-1, 1]
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

// 按当前 params 重算所有顶点高度（几何体不重建，只改 y，所以拖滑块不卡）
function rebuildTerrain() {
  if (!geometry) return;
  const noise2D = createNoise2D(mulberry32(params.seed));
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // 世界坐标先除以 baseScale 缩到噪声坐标：基频波长 = baseScale
    const h = fbm(noise2D, x / params.baseScale, z / params.baseScale, params.octaves);
    pos.setY(i, h * params.amplitude);
  }
  pos.needsUpdate = true;            // 通知 GPU 顶点数据变了
  geometry.computeVertexNormals();   // 顺手重算法线，后续上光照材质时直接能用
}

useThreeStage(container, {
  fov: 55,
  near: 10, // 抬高 near 改善大场景深度分辨率（同盖房子 demo）
  far: 30000,
  cameraPos: [2200, 1500, 2600], // 斜上方俯瞰整片山脉
  background: '#0e1622', // 雪夜深蓝底色，衬托冰蓝线框
  onReady(scene, camera, renderer, el) {
    // ---------- 1. 地形 ----------
    geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    geometry.rotateX(-Math.PI / 2); // 躺平到 XZ 水平面（地面）
    rebuildTerrain();

    // ---------- 2. 灯光：平行光太阳（投影）+ 半球光补光 ----------
    // 漫反射材质没有光就是全黑，先把后面阴影方案要用的平行光立起来：
    // 太阳负责投影，半球光补天光 / 雪地反光，避免背光面死黑
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const hemiLight = new THREE.HemisphereLight(0xdfe8f2, 0x8a95a5, 0.9);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sunLight.position.set(1800, 2600, 1200);
    sunLight.castShadow = true;
    // 平行光的阴影相机是正交的，范围要手动罩住整片 3000×3000 地形
    sunLight.shadow.camera.left = -2200;
    sunLight.shadow.camera.right = 2200;
    sunLight.shadow.camera.top = 2200;
    sunLight.shadow.camera.bottom = -2200;
    sunLight.shadow.camera.near = 100;
    sunLight.shadow.camera.far = 8000;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.normalBias = 2; // 大场景下把阴影判定往外推一点，消山面上的自阴影条纹
    scene.add(sunLight);
    scene.add(sunLight.target); // target 默认在原点，加进场景矩阵世界才会更新

    // ---------- 3. 地形 Mesh：漫反射材质，承接光照与阴影 ----------
    material = new THREE.MeshLambertMaterial({
      color: 0xf4f8fb, // 雪白
      wireframe: params.wireframe,
    });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.castShadow = true;    // 山脊互相投影（山影压山谷，雪山立体感全靠它）
    terrain.receiveShadow = true; // 同时承接别的山的影子
    scene.add(terrain);

    // ---------- 4. OrbitControls：拖拽环绕 / 滚轮缩放 ----------
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // 阻尼惯性，拖起来更顺
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49; // 别钻到地平线以下
    controls.minDistance = 300;
    controls.maxDistance = 12000;
    controls.target.set(0, 80, 0); // 视线中心稍微抬到山腰高度

    // ---------- 5. lil-gui 调参面板 ----------
    gui = new GUI({ container: el, title: '山脉地形' });
    gui.domElement.style.position = 'absolute';
    gui.domElement.style.top = '12px';
    gui.domElement.style.right = '12px';

    gui.add(params, 'wireframe').name('线框').onChange((v) => {
      material.wireframe = v;
    });
    gui.add(params, 'amplitude', 100, 800, 10).name('山体高度').onChange(rebuildTerrain);
    gui.add(params, 'baseScale', 300, 2000, 10).name('山体尺度').onChange(rebuildTerrain);
    gui.add(params, 'octaves', 1, 8, 1).name('细节层数').onChange(rebuildTerrain);
    const seedController = gui.add(params, 'seed', 0, 9999, 1).name('随机种子').onChange(rebuildTerrain);
    gui.add({
      // 掷个新种子再重算，seedController.updateDisplay() 让滑块跟着刷新
      roll() {
        params.seed = Math.floor(Math.random() * 10000);
        seedController.updateDisplay();
        rebuildTerrain();
      },
    }, 'roll').name('🎲 换一座山');

    // 返回清理函数，卸载时由 useThreeStage 调用
    return () => {
      gui.destroy();
      controls.dispose();
      sunLight.dispose(); // 连同阴影贴图一起释放
      geometry.dispose();
      material.dispose();
    };
  },
  onFrame() {
    controls.update(); // 阻尼模式必须每帧 update，惯性滚动才生效
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
    background: #0e1622;
  }
</style>
