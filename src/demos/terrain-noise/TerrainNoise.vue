<script setup>
// 改造自根目录原 main.js：地形 simplex noise + 鼠标视差。
// 关键改动：
//   1. renderer 挂到组件内容器，不再 document.body.appendChild
//   2. 尺寸用容器 clientWidth/Height，而非 window.innerWidth/Height
//   3. onUnmounted 补全资源清理（rAF / 事件 / geometry / material / renderer）
import { onMounted, onUnmounted, ref } from 'vue';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

const container = ref(null);

// 把运行时引用集中起来，卸载时统一回收
let renderer, camera, scene, geometry, material, cube, clock;
let animationId = null;
let onResize, onMouseMove;
// 持有视差相关状态，避免散落的全局变量
const mouse = { targetX: 0, targetY: 0, curX: 0, curY: 0 };
let camBase = null;

onMounted(() => {
  const el = container.value;
  const width = el.clientWidth;
  const height = el.clientHeight;

  // ---------- 1. 场景、相机、渲染器 ----------
  scene = new THREE.Scene();

  // 透视相机：视野角度(75°) / 宽高比 / 近裁剪面 / 远裁剪面
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
  camera.position.set(450, 150, 100);
  camera.lookAt(0, 0, 0); // 让相机对准原点（地形中心），替代原来 OrbitControls 做的事
  camBase = camera.position.clone();

  // preserveDrawingBuffer: true —— 让外层（首页 hover 移开时）能 drawImage 抓到画面。
  // 默认 false 时 WebGL 每帧合成后清缓冲，抓到的是空图。
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  el.appendChild(renderer.domElement);

  // ---------- 2. 用 PlaneGeometry 画一个分段平面 ----------
  // 参数：宽 / 高 / 宽方向分段数 / 高方向分段数
  // 分段数越大，顶点越密，后续可用着色器/位移做波浪、地形等效果
  geometry = new THREE.PlaneGeometry(3000, 3000, 100, 100);
  // PlaneGeometry 默认在 XY 平面上（面朝相机，Z 轴是法线方向）
  // 旋转 -90° 绕 X 轴，让它「躺平」到 XZ 水平面（地面）
  geometry.rotateX(-Math.PI / 2);

  // 拿到 position 属性，用 simplex 噪音给每个顶点赋高度，得到连续起伏的地形
  // simplex 返回值范围 [-1, 1]，相邻顶点的值平滑过渡，不像 Math.random 那样完全无序
  const noise2D = createNoise2D();
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // 采样频率 0.01：值越小地形越平缓（大山脉），越大越破碎（小丘陵）
    // 振幅 50：噪音 [-1,1] 映射到 [-50,50] 高度
    const y = noise2D(x / 300, z / 300) * 50;
    pos.setY(i, y);
  }
  pos.needsUpdate = true;            // 通知 GPU 顶点数据改了，需要重新上传
  geometry.computeVertexNormals();   // 顶点高度变了，法线也得重算（否则 MeshNormalMaterial 颜色不对）

  // 时钟：用来获取累计时间（保留备用，方便以后加波浪动画）
  clock = new THREE.Clock();

  // 切回 Mesh 网格模型，用 MeshNormalMaterial 显示彩色法线（不用打光也能看清结构）
  material = new THREE.MeshNormalMaterial({ wireframe: true }); // 默认开启线框
  cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  // ---------- GUI 调试参数（原 import 了 lil-gui 但未实例化，保持现状，仅保留参数对象） ----------
  const params = {
    autoRotate: true,
    rotationSpeed: { x: 0, y: 0.001, z: 0 },
  };

  // ---------- 3. 渲染循环 ----------
  function animate() {
    animationId = requestAnimationFrame(animate);

    // 自动旋转
    if (params.autoRotate) {
      cube.rotation.x += params.rotationSpeed.x;
      cube.rotation.y += params.rotationSpeed.y;
      cube.rotation.z += params.rotationSpeed.z;
    }

    // 鼠标视差：相机在基础位置上做小幅偏移，跟着鼠标轻微「探头」
    mouse.curX += (mouse.targetX - mouse.curX) * 0.05; // 缓动，系数越小越丝滑
    mouse.curY += (mouse.targetY - mouse.curY) * 0.05;
    // 偏移量 = NDC(-1~1) × 偏移幅度；幅度越大视差越明显
    camera.position.x = camBase.x + mouse.curX * 80;
    camera.position.y = camBase.y + mouse.curY * 50;
    camera.lookAt(0, 0, 0); // 始终盯住原点，偏移时像「歪着头看」

    renderer.render(scene, camera);
  }
  animate();

  // ---------- 4. 事件 ----------
  // 鼠标视差：屏幕坐标归一化到 [-1, 1]（NDC）
  // target 是鼠标实时位置；cur 是缓动后的位置，让相机移动更顺滑
  onMouseMove = (e) => {
    // 用容器尺寸而非 window 尺寸，画布不占满整个窗口时归一化才正确
    mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  window.addEventListener('mousemove', onMouseMove);

  // 容器尺寸变化时自适应。用 ResizeObserver 监听画布父容器，比 window resize 更准。
  onResize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(el);
  // 把 observer 存到外部，卸载时断开
  observerRef = ro;
});

let observerRef = null;

onUnmounted(() => {
  // 关键：补全原 main.js 缺失的全部清理，避免路由切换后内存泄漏 / 多实例冲突
  if (animationId) cancelAnimationFrame(animationId);
  if (observerRef) {
    observerRef.disconnect();
    observerRef = null;
  }
  if (onMouseMove) window.removeEventListener('mousemove', onMouseMove);
  if (onResize) window.removeEventListener('resize', onResize);

  // 释放 GPU 资源
  geometry?.dispose();
  material?.dispose();
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }
  // 解除引用，帮助 GC
  scene = camera = renderer = geometry = material = cube = clock = null;
});
</script>

<template>
  <div ref="container" class="terrain"></div>
</template>

<style scoped>
  /* 用 width/height:100% 撑满父容器（.demo__stage，flex:1）。
     不用 absolute，避免父级高度未定时高度塌缩成 0，导致 canvas 高度为 0。 */
  .terrain {
    width: 100%;
    height: 100%;
    background: #1e1e1e;
  }
</style>
