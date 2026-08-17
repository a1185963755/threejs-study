<script setup>
// 隧道穿梭 demo —— CatmullRomCurve3 样条穿过 6 个点，
// TubeGeometry 沿曲线放样出管道（100 段 × 30 边，半径 5），石纹贴图 + AO。
// 相机沿曲线的 1000 个均匀采样点前进，lookAt 看向下一个点，实现管道内部穿梭。
import { ref } from 'vue';
import * as THREE from 'three';
import { useThreeStage } from '../../composables/useThreeStage.js';
import stoneUrl from '../../assets/stone.png';

const container = ref(null);
let cameraRef = null; // onFrame 不带参数，onReady 里存下 camera 供渲染循环使用
let flyPoints = []; // 沿曲线均匀采样出的穿梭路径点
let flyIndex = 0; // 当前前进进度（浮点，0 ~ 1000）
const clock = new THREE.Clock();
const FLY_SPEED = 60; // 每秒前进的采样点数：1000 点约 17 秒跑完全程

useThreeStage(container, {
  cameraPos: [0, 0, -120], // 曲线起点，首帧即被 onFrame 接管
  onReady(scene, camera, renderer) {
    cameraRef = camera;

    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-100, 20, 90),
      new THREE.Vector3(-40, 80, 100),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(60, -60, 0),
      new THREE.Vector3(100, -40, 80),
      new THREE.Vector3(150, 60, 60),
    ]);

    const geometry = new THREE.TubeGeometry(path, 100, 5, 30);

    // 石纹贴图：RepeatWrapping 才能平铺；TubeGeometry 的 uv
    // u 沿管道长度（约 524 单位）、v 绕圆周（约 31.4 单位），
    // 33 : 2 让两个方向纹理密度接近，每块石纹约 16×16 单位
    const texture = new THREE.TextureLoader().load(stoneUrl);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(33, 2);
    texture.colorSpace = THREE.SRGBColorSpace; // 按 PNG 原色彩显示，避免整体发灰

    // map 与 color 相乘，不设 color（默认白）才能看到贴图原色。
    // aoMap 复用同一张石纹：只取红通道 —— 亮处 ≈ 不遮挡，暗的石缝被压暗，
    // 石缝「踩」下去、石面凸出来，增强凹凸颗粒感。
    // r160 里 Texture.channel 默认 0，aoMap 直接用 TubeGeometry 的 uv，无需另配 uv1
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      aoMap: texture,
      side: THREE.DoubleSide, // 相机在管道内部，必须双面渲染才能看到内壁
    });
    scene.add(new THREE.Mesh(geometry, material));

    // getSpacedPoints 按弧长均匀取 1000 段（返回 1001 个点）；
    // 若用 getPoints 则按参数 t 均匀，弯道处点会变稀，穿梭速度忽快忽慢
    flyPoints = path.getSpacedPoints(1000);

    // 返回清理函数，卸载时由 useThreeStage 调用
    return () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  },
  onFrame() {
    if (!cameraRef || flyPoints.length === 0) return;
    // 乘 delta 与帧率无关：60fps 时恰好每帧前进 1 个点，到终点后从头循环
    flyIndex = (flyIndex + clock.getDelta() * FLY_SPEED) % (flyPoints.length - 1);
    const i = Math.floor(flyIndex);
    cameraRef.position.copy(flyPoints[i]);
    cameraRef.lookAt(flyPoints[i + 1]);
  },
});
</script>

<template>
  <div ref="container" class="tunnel"></div>
</template>

<style scoped>
  .tunnel {
    width: 100%;
    height: 100%;
    background: #1e1e1e;
  }
</style>
