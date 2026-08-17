<script setup>
// 无限时空隧道 demo —— 无限隧道的「视觉欺骗」方案：纹理滚动。
// 一根直的空心圆柱体（CylinderGeometry openEnded 去盖），相机固定在轴线上。
// 风暴纹理不作颜色贴图，而是作 alpha 贴图：亮纹处不透明、暗处全透明，
// 再让材质颜色沿色环循环 —— 彩色光纹迎面涌来、从身后流去，永不停止。
// 每帧真正在变的只有两个数字：texture.offset.y 和 material.color 的色相。
import { ref } from 'vue';
import * as THREE from 'three';
import { useThreeStage } from '../../composables/useThreeStage.js';
import stormUrl from './assets/storm.png';

const container = ref(null);
let stormTexture = null; // onFrame 里滚动它的 offset
let stormMaterial = null; // onFrame 里改它的色相
let hue = 0; // 当前色相 0 ~ 1
const clock = new THREE.Clock();
const TUNNEL_LENGTH = 500; // 圆柱高度 = 隧道长度
const SCROLL_SPEED = 0.8; // 每秒滚动的纹理周期数，越大飞得越快
const HUE_SPEED = 0.1; // 色相变化速度，0.1 → 色环约 10 秒转一圈

useThreeStage(container, {
  fov: 70, // 比默认 50 广角，增强穿梭的速度感
  onReady(scene, camera, renderer) {
    // 直空心圆柱：半径 5、圆周 30 边、轴向 1 段（v 沿轴线性变化，无需多段）。
    // 圆柱默认沿 Y 轴，rotateX(π/2) 转到 Z 轴，让相机沿 -z 望向 +z
    const geometry = new THREE.CylinderGeometry(5, 5, TUNNEL_LENGTH, 30, 1, true);
    geometry.rotateX(Math.PI / 2);

    // CylinderGeometry 的 uv 与 TubeGeometry 相反：u 绕圆周、v 沿轴线。
    // 滚动只发生在 v 方向，只需 wrapT 可平铺；
    // repeat(1, 2)：绕圆周整圈一张图，沿 500 单位轴线平铺 2 份，每份 250 单位
    const texture = new THREE.TextureLoader().load(stormUrl);
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 2);
    stormTexture = texture;

    // alphaMap 取纹理绿通道当不透明度：风暴亮纹 → 发光实体，暗处 → 透明。
    // transparent 开启 alpha 混合；depthWrite 关掉，
    // 避免近处内壁先写深度把远处的光纹整个挡掉
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      alphaMap: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide, // 相机在圆柱内部，双面渲染才能看到内壁
    });
    stormMaterial = material;
    scene.add(new THREE.Mesh(geometry, material));

    // 相机固定在轴线上靠近一端，看向另一端
    camera.position.set(0, 0, -TUNNEL_LENGTH / 2 + 30);
    camera.lookAt(0, 0, TUNNEL_LENGTH / 2);

    // 返回清理函数，卸载时由 useThreeStage 调用
    return () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  },
  onFrame() {
    if (!stormTexture || !stormMaterial) return;
    const dt = clock.getDelta();
    // 圆柱 v=0 在 +Z 端（前方远处）、v=1 在 -Z 端（身后）。
    // offset.y 减小 → 花纹向 +v 滑动 → 从前方涌来、流到身后，像在前进。
    // 归一回 [0, 1)，防止长时间运行后 offset 无限增大损失浮点精度
    stormTexture.offset.y = (stormTexture.offset.y - dt * SCROLL_SPEED + 1) % 1;
    // 色相沿色环循环；饱和度 1、亮度 0.5 是色环上最鲜艳的一圈
    hue = (hue + dt * HUE_SPEED) % 1;
    stormMaterial.color.setHSL(hue, 1, 0.5);
  },
});
</script>

<template>
  <div ref="container" class="infinite-tunnel"></div>
</template>

<style scoped>
  .infinite-tunnel {
    width: 100%;
    height: 100%;
    background: #1e1e1e;
  }
</style>
