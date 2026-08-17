<script setup>
// 地形 simplex noise + 鼠标视差。
// 渲染器 / 尺寸自适应 / 卸载清理等样板统一在 useThreeStage 里，
// 这里只保留地形生成、自动旋转、鼠标视差这些 demo 自己的逻辑。
import { ref } from 'vue';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { useThreeStage } from '../../composables/useThreeStage.js';

const container = ref(null);

// 持有视差相关状态，避免散落的全局变量
const mouse = { targetX: 0, targetY: 0, curX: 0, curY: 0 };
let camBase = null;
// onReady 里创建、onFrame 里使用，放外面共享
let cube = null;
let cameraRef = null;

// GUI 调试参数
const params = {
  autoRotate: true,
  rotationSpeed: { x: 0, y: 0.001, z: 0 },
};

useThreeStage(container, {
  fov: 75,
  far: 10000,
  cameraPos: [450, 150, 100], // 对准原点（地形中心），替代原来 OrbitControls 做的事
  onReady(scene, camera) {
    camBase = camera.position.clone();
    cameraRef = camera;

    // ---------- 1. 用 PlaneGeometry 画一个分段平面 ----------
    // 参数：宽 / 高 / 宽方向分段数 / 高方向分段数
    // 分段数越大，顶点越密，后续可用着色器/位移做波浪、地形等效果
    const geometry = new THREE.PlaneGeometry(3000, 3000, 100, 100);
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

    // 切回 Mesh 网格模型，用 MeshNormalMaterial 显示彩色法线（不用打光也能看清结构）
    const material = new THREE.MeshNormalMaterial({ wireframe: true }); // 默认开启线框
    const mesh = new THREE.Mesh(geometry, material);
    cube = mesh;
    scene.add(mesh);

    // ---------- 2. 事件：鼠标视差 ----------
    // 屏幕坐标归一化到 [-1, 1]（NDC）
    // target 是鼠标实时位置；cur 是缓动后的位置，让相机移动更顺滑
    const onMouseMove = (e) => {
      // 用容器尺寸而非 window 尺寸，画布不占满整个窗口时归一化才正确
      mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouseMove);

    // 返回清理函数，卸载时由 useThreeStage 调用
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      geometry.dispose();
      material.dispose();
    };
  },
  onFrame() {
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
    cameraRef.position.x = camBase.x + mouse.curX * 80;
    cameraRef.position.y = camBase.y + mouse.curY * 50;
    cameraRef.lookAt(0, 0, 0); // 始终盯住原点，偏移时像「歪着头看」
  },
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
