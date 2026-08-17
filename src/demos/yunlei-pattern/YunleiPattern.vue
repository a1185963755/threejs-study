<script setup>
// 云雷纹 demo —— 同心圆组 + 回纹环：外圆细线 + 24 个相切小圆 + 外包络圆（5px）
// + 内圆（5px）+ 最外圈 20 个方形回纹。
// 场景元素：
//   - 外圆 LineLoop（EllipseCurve 采样点，1px）
//   - 24 个小圆与外圆外切（细线）
//   - 外包络圆 Line2（5px），半径 35 = 30 + 2×2.5，与小圆外缘相切
//   - 内圆 Line2 + LineMaterial（可设像素线宽，5px）
//   - 两环方形回纹（THREE.Line）：内环半径 43×20 个（与包络圆间隔 8），
//     外环半径 59×20 个（大一号）
//   - OrbitControls 鼠标拖动旋转 / 滚轮缩放
// 渲染器 / 尺寸自适应 / 卸载清理等样板统一在 useThreeStage 里
import { ref } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { useThreeStage } from '../../composables/useThreeStage.js';

const container = ref(null);
let controls = null;
let fatMaterial = null; // 两条 5px 宽线（内圆、外包络圆）共用的 LineMaterial
let rendererRef = null;
let innerSpiralRing = null; // 内圈回纹 Group（顺时针，快）
let outerSpiralRing = null; // 外圈回纹 Group（逆时针，慢）
let dotRing = null; // 24 个小圆 Group（逆时针，中速）
const clock = new THREE.Clock();

useThreeStage(container, {
  cameraPos: [0, 0, 150], // 图案扩到半径 66，拉远让两圈回纹都可见
  onReady(scene, camera, renderer) {
    // ---------- 1. 同心圆 ----------
    // 外圆：普通 LineLoop 即可（1px 细线）
    // EllipseCurve 是 XY 平面上的参数曲线，长短轴相等就是圆
    const outerCurve = new THREE.EllipseCurve(0, 0, 30, 30, 0, Math.PI * 2);
    const outerGeometry = new THREE.BufferGeometry().setFromPoints(outerCurve.getPoints(128));
    const outerMaterial = new THREE.LineBasicMaterial({ color: 0xe8c47a });
    scene.add(new THREE.LineLoop(outerGeometry, outerMaterial));

    // 内圆：LineBasicMaterial 的 linewidth 在多数平台被 WebGL 限制为 1px，
    // 真正可控的线宽（像素单位）要用 examples/jsm/lines 的 Line2 + LineMaterial
    rendererRef = renderer;
    const innerCurve = new THREE.EllipseCurve(0, 0, 26, 26, 0, Math.PI * 2);
    const innerGeometry = new LineGeometry();
    // LineGeometry 需要扁平的 [x,y,z, x,y,z, ...] 数组
    innerGeometry.setPositions(innerCurve.getPoints(128).flatMap((p) => [p.x, p.y, 0]));
    fatMaterial = new LineMaterial({ color: 0xe8c47a, linewidth: 5 });
    // resolution 必须同步画布像素尺寸，否则线宽计算错乱；resize 后在 onFrame 里更新
    fatMaterial.resolution.set(renderer.domElement.width, renderer.domElement.height);
    scene.add(new Line2(innerGeometry, fatMaterial));

    // ---------- 3. 外包络圆（线宽 5，与 24 个小圆外切） ----------
    // 半径 35 = 30 + 2×2.5：小圆中心在 32.5、半径 2.5，包络圆恰好与小圆外缘相切，
    // 每个小圆只有一个切点
    const ringCurve = new THREE.EllipseCurve(0, 0, 35, 35, 0, Math.PI * 2);
    const ringGeometry = new LineGeometry();
    ringGeometry.setPositions(ringCurve.getPoints(128).flatMap((p) => [p.x, p.y, 0]));
    scene.add(new Line2(ringGeometry, fatMaterial));

    // ---------- 4. 外圈两环回纹（方形螺旋，各 20 个） ----------
    // 回纹原始点阵跨度 40×40，几何体只建一份，各环用 scale 缩放
    const spiralPts = [
      [0, 0],
      [10, 0],
      [10, 10],
      [-10, 10],
      [-10, -10],
      [20, -10],
      [20, 20],
      [-20, 20],
      [-20, -20],
      [20, -20],
    ];
    const spiralGeometry = new THREE.BufferGeometry().setFromPoints(
      spiralPts.map(([x, y]) => new THREE.Vector3(x, y, 0))
    );
    // 每圈回纹放进一个 Group，整组旋转（onFrame 里转，方向/速度各不相同）
    const addSpiralRing = (ringRadius, scale) => {
      const group = new THREE.Group();
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const spiral = new THREE.Line(spiralGeometry, outerMaterial);
        spiral.scale.setScalar(scale);
        spiral.position.set(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, 0);
        spiral.rotation.z = angle - Math.PI / 2; // 局部 +Y 转到径向，回纹朝外
        group.add(spiral);
      }
      scene.add(group);
      return group;
    };
    // 内环：半径 43 = 包络圆 35 + 间距 8，缩放 0.25（约 10×10，弧长间隔 13.5 不重叠）
    innerSpiralRing = addSpiralRing(43, 0.25);
    // 外环：大一号，缩放 0.35（约 14×14）；内环外缘 48 + 间隔 4 + 半宽 7 → 半径 59
    outerSpiralRing = addSpiralRing(59, 0.35);

    // ---------- 2. 外圆外侧环绕 24 个小圆（与外圆相切） ----------
    // 小圆共用同一份几何体和材质，只挪位置；圆心放在半径 30 + dotRadius 处，
    // 与外圆外切 —— 每个小圆和外圆只有一个交点（切点）
    // 整圈装进 Group，onFrame 里旋转
    const dotRadius = 2.5; // 相邻切点弧长间隔 ≈7.85，直径 5 不会互相重叠
    const dotCurve = new THREE.EllipseCurve(0, 0, dotRadius, dotRadius, 0, Math.PI * 2);
    const dotGeometry = new THREE.BufferGeometry().setFromPoints(dotCurve.getPoints(64));
    dotRing = new THREE.Group();
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const dot = new THREE.LineLoop(dotGeometry, outerMaterial);
      dot.position.set(
        Math.cos(angle) * (30 + dotRadius),
        Math.sin(angle) * (30 + dotRadius),
        0
      );
      dotRing.add(dot);
    }
    scene.add(dotRing);

    // ---------- 5. 鼠标拖动 / 缩放 ----------
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // 惯性阻尼，拖动更顺滑
    controls.dampingFactor = 0.08;

    // 返回清理函数，卸载时由 useThreeStage 调用
    return () => {
      controls.dispose();
      outerGeometry.dispose();
      outerMaterial.dispose();
      dotGeometry.dispose();
      innerGeometry.dispose();
      ringGeometry.dispose();
      spiralGeometry.dispose();
      fatMaterial?.dispose();
      fatMaterial = null;
    };
  },
  onFrame() {
    // 三层各自旋转，方向/速度错开（rad/s，乘 delta 与帧率无关）：
    // 小圆圈 +0.2 逆时针中速，内圈回纹 -0.3 顺时针快，外圈回纹 +0.15 逆时针慢
    const dt = clock.getDelta();
    if (dotRing) dotRing.rotation.z += 0.2 * dt;
    if (innerSpiralRing) innerSpiralRing.rotation.z -= 0.3 * dt;
    if (outerSpiralRing) outerSpiralRing.rotation.z += 0.15 * dt;

    // LineMaterial 的线宽按屏幕像素算，画布尺寸变化时要同步 resolution
    if (fatMaterial && rendererRef) {
      fatMaterial.resolution.set(rendererRef.domElement.width, rendererRef.domElement.height);
    }
    // damping 需要每帧更新
    controls && controls.update();
  },
});
</script>

<template>
  <div ref="container" class="yunlei"></div>
</template>

<style scoped>
  .yunlei {
    width: 100%;
    height: 100%;
    background: #1e1e1e;
  }
</style>
