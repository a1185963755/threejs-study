// 通用 Three.js 舞台 composable —— 统一各 demo 里重复的样板：
//   1. 在容器内创建 scene / camera / renderer
//   2. ResizeObserver 容器尺寸自适应
//   3. requestAnimationFrame 渲染循环（可选，传 onFrame）
//   4. onUnmounted 时统一释放（rAF / observer / onReady 返回的清理函数 / renderer）
//
// 用法：onReady(scene, camera, renderer, el) 里写各 demo 自己的场景搭建，
// 返回值（若有）作为额外清理函数，在卸载时被调用。
import { onMounted, onUnmounted } from 'vue';
import * as THREE from 'three';

export function useThreeStage(
  containerRef,
  { fov = 50, near = 0.1, far = 1000, cameraPos = [0, 0, 60], background = '#1e1e1e', onReady, onFrame }
) {
  let renderer, camera, scene;
  let animationId = null;
  let observerRef = null;
  let extraDispose = null;

  onMounted(() => {
    const el = containerRef.value;
    const width = el.clientWidth;
    const height = el.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(background);

    camera = new THREE.PerspectiveCamera(fov, width / height, near, far);
    camera.position.set(...cameraPos);
    camera.lookAt(0, 0, 0);

    // preserveDrawingBuffer: true —— 让首页 hover 移开时能 drawImage 抓到画面
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);

    if (onReady) extraDispose = onReady(scene, camera, renderer, el) || null;

    function animate() {
      animationId = requestAnimationFrame(animate);
      if (onFrame) onFrame();
      renderer.render(scene, camera);
    }
    animate();

    // 容器尺寸变化时自适应。ResizeObserver 监听画布父容器，比 window resize 更准
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(el);
    observerRef = ro;
  });

  onUnmounted(() => {
    if (animationId) cancelAnimationFrame(animationId);
    if (observerRef) {
      observerRef.disconnect();
      observerRef = null;
    }
    if (extraDispose) {
      extraDispose();
      extraDispose = null;
    }
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    scene = camera = renderer = null;
  });
}
