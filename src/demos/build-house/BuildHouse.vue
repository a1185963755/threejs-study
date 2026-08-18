<script setup>
// 盖房子 demo —— 地基 → 四面墙（带门窗）→ 人字斜顶。
// 场景元素：
//   - HemisphereLight 天光 + DirectionalLight 太阳光（带阴影）
//   - 30000×30000 地面 + GridHelper 网格线（每格 1000，工地标尺感）
//   - 地基 BoxGeometry(4000, 300, 3000)，底面贴地
//   - 门前台阶：3 级实体台阶接到地基顶，和地基一起浇筑长起
//   - 四面墙（厚 240）：侧墙挤出「矩形 + 三角山墙」轮廓并挖窗洞；
//     前墙轮廓带落地门洞、再挖两扇窗；后墙整块无洞
//   - 门窗：侧墙两扇窗、前墙两扇窗 + 一扇木门（白框 + 中梃 / 门板把手，玻璃半透明）
//   - 人字斜顶：屋脊沿长边，两块坡面板绕 X 转坡角，檐口出挑、脊部搭接盖缝
//   - 建造动画：地基与台阶浇筑 → 四面墙长高 → 门窗装上 → 屋顶吊装落位，各 1.2s 错峰
//   - OrbitControls 鼠标拖动旋转 / 滚轮缩放
// 渲染器 / 尺寸自适应 / 卸载清理等样板统一在 useThreeStage 里
import { ref } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useThreeStage } from '../../composables/useThreeStage.js';

const container = ref(null);
let controls = null;
let houseGroup = null; // 房子主体 Group，各部件都往里加
let foundationMesh = null; // 地基，浇筑动画改 scale.y
let stepsGroup = null; // 门前台阶，与地基同阶段从地面长起
let wallLeft = null; // 左侧墙（-X 侧，含山墙三角）
let wallRight = null; // 右侧墙（+X 侧）
let frontWall = null; // 前墙（+Z 侧，落地门洞 + 两扇窗洞）
let backWall = null; // 后墙（-Z 侧，整块无洞）
let roofGroup = null; // 屋顶两块坡面板，吊装动画整组下落
let fittings = []; // 门窗 Group（窗 + 门），安装阶段整组弹出
const clock = new THREE.Clock();

// ---------- 尺寸（世界单位，mm 心智模型） ----------
const FOUNDATION_L = 4000; // 长（X 向）
const FOUNDATION_W = 3000; // 宽（Z 向）
const FOUNDATION_H = 300;
const WALL_T = 240; // 墙厚（240 砖墙）
const WALL_H = 3000; // 墙体竖直部分高（从地基顶起算）
const WALL_RUN = FOUNDATION_L - WALL_T * 2; // 前后墙净长：夹在两面侧墙之间（3520）
const GABLE_RISE = 1500; // 山墙三角升起 → 屋面坡度恰好 45°
const ROOF_T = 200; // 屋面板厚
const ROOF_OVERHANG = 400; // 檐口沿坡面方向挑出
const ROOF_RIDGE_EXT = 150; // 每块板越过屋脊的搭接量，盖住脊部拼缝
const ROOF_X_OVERHANG = 300; // 山墙方向（X 向）挑出
const WINDOW_W = 900; // 侧墙窗洞宽（沿墙面）
const WINDOW_H = 1200; // 窗洞高
const WINDOW_SILL = 900; // 窗台离墙底的高度
const FRONT_WINDOW_W = 800; // 前墙窗洞宽
const DOOR_W = 900; // 门洞宽
const DOOR_H = 2100; // 门洞高
const STEP_COUNT = 3; // 台阶级数（3×100 恰好接到 300 高的地基顶）
const STEP_RISE = 100; // 每级高
const STEP_TREAD = 280; // 每级进深
const STEP_W = 1200; // 台阶宽（比门洞两侧各余 150）
const FRAME_T = 80; // 窗框边框粗细

// ---------- 建造动画 ----------
const PHASE = 1.2; // 每个建造阶段的时长（秒）
let buildTime = 0; // 开工以来累计时间
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3); // 先快后慢
// 第 start 秒开工的阶段进度（0~1，缓动后），未开工为 0、完工会钉在 1
const phaseAt = (start) => easeOutCubic(THREE.MathUtils.clamp((buildTime - start) / PHASE, 0, 1));

useThreeStage(container, {
  fov: 50,
  near: 10, // 相机不会贴到 10 以内；抬高 near 改善万级大场景的深度分辨率
  far: 50000, // 场景尺度到万级，默认 far=1000 裁掉了
  cameraPos: [5800, 4800, 7600], // 房子总高约 4800，再拉远拉高看全屋顶
  background: '#a9bdd1', // 浅灰蓝天色，配光影比深色自然
  onReady(scene, camera, renderer) {
    // ---------- 1. 灯光与阴影 ----------
    // MeshStandardMaterial 需要光照，开启阴影贴图：
    // 太阳平行光负责投影，半球光补天光 / 地面反光，避免暗部死黑
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const hemiLight = new THREE.HemisphereLight(0xdfe8f2, 0x8a8578, 0.9);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sunLight.position.set(5000, 8000, 3000);
    sunLight.castShadow = true;
    // 平行光的阴影由一台正交相机框出，范围要盖住整栋房和影子延伸的区域
    sunLight.shadow.camera.left = -6000;
    sunLight.shadow.camera.right = 6000;
    sunLight.shadow.camera.top = 6000;
    sunLight.shadow.camera.bottom = -6000;
    sunLight.shadow.camera.near = 500;
    sunLight.shadow.camera.far = 30000;
    sunLight.shadow.mapSize.set(2048, 2048);
    scene.add(sunLight);

    // ---------- 2. 地面 ----------
    const groundGeometry = new THREE.PlaneGeometry(30000, 30000);
    groundGeometry.rotateX(-Math.PI / 2); // PlaneGeometry 默认立在 XY 平面，放平到 XZ
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x8f9299 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.receiveShadow = true;
    scene.add(ground);

    // 网格线：20000 见方、20 格，每格 1000 —— 工地上的标尺，顺带点出比例感
    const grid = new THREE.GridHelper(20000, 20, 0x5b6470, 0x6d7684);
    grid.position.y = 2; // 略微抬高，避免与地面 z-fighting 闪烁
    scene.add(grid);

    // ---------- 3. 地基 ----------
    houseGroup = new THREE.Group();

    // 几何体沿 +Y 平移 H/2，让底面落在 y=0：之后 scale.y 动画就是从地面往上长
    const foundationGeometry = new THREE.BoxGeometry(FOUNDATION_L, FOUNDATION_H, FOUNDATION_W);
    foundationGeometry.translate(0, FOUNDATION_H / 2, 0);
    const foundationMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8b5ad, // 混凝土灰
      roughness: 0.9,
    });
    foundationMesh = new THREE.Mesh(foundationGeometry, foundationMaterial);
    foundationMesh.castShadow = true;
    foundationMesh.receiveShadow = true;
    foundationMesh.scale.y = 0; // 从 0 开始，onFrame 里「浇筑」到 1
    houseGroup.add(foundationMesh);

    // ---------- 4. 两面侧墙（含三角山墙） ----------
    // 轮廓画在局部 XY（x 对应世界 Z、y 对应高度），沿局部 Z 挤出墙厚，
    // 再 rotateY(π/2) 把挤出方向对到世界 X —— 一次挤出同时得到矩形墙体和山墙三角。
    // 两面墙共用同一份几何体，只挪位置
    const halfSpan = FOUNDATION_W / 2;
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-halfSpan, 0);
    wallShape.lineTo(halfSpan, 0);
    wallShape.lineTo(halfSpan, WALL_H);
    wallShape.lineTo(0, WALL_H + GABLE_RISE); // 山墙尖
    wallShape.lineTo(-halfSpan, WALL_H);
    wallShape.closePath();
    // 窗洞挖在轮廓中央（矩形墙体部分）：ExtrudeGeometry 会把洞沿墙厚整个挖穿，
    // 从外面能透过玻璃隐约看到对面墙的窗
    const winHalfW = WINDOW_W / 2;
    const windowHole = new THREE.Path();
    windowHole.moveTo(-winHalfW, WINDOW_SILL);
    windowHole.lineTo(winHalfW, WINDOW_SILL);
    windowHole.lineTo(winHalfW, WINDOW_SILL + WINDOW_H);
    windowHole.lineTo(-winHalfW, WINDOW_SILL + WINDOW_H);
    windowHole.closePath();
    wallShape.holes.push(windowHole);
    const wallGeometry = new THREE.ExtrudeGeometry(wallShape, {
      depth: WALL_T,
      bevelEnabled: false,
    });
    wallGeometry.rotateY(Math.PI / 2);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xb5654a, // 砖红
      roughness: 0.85,
    });
    wallRight = new THREE.Mesh(wallGeometry, wallMaterial);
    wallLeft = new THREE.Mesh(wallGeometry, wallMaterial);
    // 外皮贴齐地基边线：+X 侧占 [L/2−T, L/2]，−X 侧占 [−L/2, −L/2+T]
    wallRight.position.set(FOUNDATION_L / 2 - WALL_T, FOUNDATION_H, 0);
    wallLeft.position.set(-FOUNDATION_L / 2, FOUNDATION_H, 0);
    for (const wall of [wallLeft, wallRight]) {
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.scale.y = 0; // 轮廓底部在局部 y=0，动画时从地基顶往上长
      houseGroup.add(wall);
    }

    // ---------- 5. 前后墙 + 门前台阶 ----------
    // 夹在两面侧墙之间，墙顶正好接到屋坡的檐口线。
    // 前墙（+Z，默认相机看得到的一面）：门洞做在外轮廓上（落地缺口，
    // 比把 hole 挖到边界更稳，三角化不会出问题），两扇窗用 holes 挖；后墙整块
    const wallRunHalf = WALL_RUN / 2;
    const frontShape = new THREE.Shape();
    frontShape.moveTo(-wallRunHalf, 0);
    frontShape.lineTo(-DOOR_W / 2, 0);
    frontShape.lineTo(-DOOR_W / 2, DOOR_H); // 门洞左沿，向上收进轮廓
    frontShape.lineTo(DOOR_W / 2, DOOR_H);
    frontShape.lineTo(DOOR_W / 2, 0);
    frontShape.lineTo(wallRunHalf, 0);
    frontShape.lineTo(wallRunHalf, WALL_H);
    frontShape.lineTo(-wallRunHalf, WALL_H);
    frontShape.closePath();
    for (const cx of [1100, -1100]) {
      const hole = new THREE.Path();
      hole.moveTo(cx - FRONT_WINDOW_W / 2, WINDOW_SILL);
      hole.lineTo(cx + FRONT_WINDOW_W / 2, WINDOW_SILL);
      hole.lineTo(cx + FRONT_WINDOW_W / 2, WINDOW_SILL + WINDOW_H);
      hole.lineTo(cx - FRONT_WINDOW_W / 2, WINDOW_SILL + WINDOW_H);
      hole.closePath();
      frontShape.holes.push(hole);
    }
    // 轮廓画在局部 XY（对应世界 X/Y），挤出方向正好是世界 +Z，不用旋转
    const frontWallGeometry = new THREE.ExtrudeGeometry(frontShape, {
      depth: WALL_T,
      bevelEnabled: false,
    });
    frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    frontWall.position.set(0, FOUNDATION_H, FOUNDATION_W / 2 - WALL_T); // 外皮贴齐 z=1500
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    frontWall.scale.y = 0;
    houseGroup.add(frontWall);

    const backWallGeometry = new THREE.BoxGeometry(WALL_RUN, WALL_H, WALL_T);
    backWallGeometry.translate(0, WALL_H / 2, 0); // 底面落到局部 y=0，砌墙动画从地基顶长起
    backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, FOUNDATION_H, -(FOUNDATION_W / 2 - WALL_T));
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    backWall.scale.y = 0;
    houseGroup.add(backWall);

    // 门前台阶：金字塔式逐级整高叠放，最高一级贴着地基、顶面正好是地基顶（300），
    // 逐级向外降；用同地基的混凝土材质，属于基础工程，和地基一起「浇筑」
    stepsGroup = new THREE.Group();
    const stepGeometries = [];
    for (let i = 0; i < STEP_COUNT; i++) {
      const height = STEP_RISE * (STEP_COUNT - i); // 越靠地基越高
      const stepGeometry = new THREE.BoxGeometry(STEP_W, height, STEP_TREAD);
      stepGeometry.translate(0, height / 2, 0); // 底面落到局部 y=0，随动画从地面长起
      const step = new THREE.Mesh(stepGeometry, foundationMaterial);
      step.position.set(0, 0, FOUNDATION_W / 2 + STEP_TREAD * (i + 0.5)); // 紧贴地基向外铺
      step.castShadow = true;
      step.receiveShadow = true;
      stepsGroup.add(step);
      stepGeometries.push(stepGeometry);
    }
    stepsGroup.scale.y = 0;
    houseGroup.add(stepsGroup);

    // ---------- 6. 门窗（侧墙两扇窗 + 前墙两扇窗一扇门） ----------
    // 窗 = 白框（上下横框 + 左右竖框 + 中间竖梃）+ 半透明玻璃；
    // 门 = 白框（上框 + 两侧框，落地不做下框）+ 木门板 + 门把手。
    // 组件都以洞口中心为 Group 原点、深度沿局部 X；装到前墙上的整组转 90°
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e8e3, // 白框
      roughness: 0.6,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x9fc4dd,
      roughness: 0.35, // 太光滑（低 roughness）的硬高光会在转动时像素间跳变，看着「闪」
      transparent: true,
      opacity: 0.35, // 半透明，能望进室内
      depthWrite: false, // 透明面不写深度：透过玻璃看对面窗时不会被深度测试错误剔除
    });
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a5138, // 木门
      roughness: 0.7,
    });
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3f45, // 金属把手
      roughness: 0.3,
      metalness: 0.6,
    });
    const fittingGeometries = []; // 门窗几何体收集起来，清理时统一 dispose
    const track = (geometry) => (fittingGeometries.push(geometry), geometry);

    const makeWindow = (width, height) => {
      // 玻璃比洞口四周各缩 2，避免与洞口侧壁完全共面导致深度抖动；缝隙藏在窗框后
      const glassGeometry = track(new THREE.BoxGeometry(20, height - 4, width - 4));
      const railHGeometry = track(new THREE.BoxGeometry(220, FRAME_T, width + FRAME_T * 2));
      const railVGeometry = track(new THREE.BoxGeometry(220, height, FRAME_T));
      const mullionGeometry = track(new THREE.BoxGeometry(200, height, 60));
      const win = new THREE.Group();
      win.add(new THREE.Mesh(glassGeometry, glassMaterial)); // 玻璃不投影，透光
      const rails = [
        [railHGeometry, height / 2 + FRAME_T / 2, 0], // 上框
        [railHGeometry, -(height / 2 + FRAME_T / 2), 0], // 下框
        [railVGeometry, 0, width / 2 + FRAME_T / 2], // +Z 侧框
        [railVGeometry, 0, -(width / 2 + FRAME_T / 2)], // -Z 侧框
        [mullionGeometry, 0, 0], // 中梃
      ];
      for (const [geometry, y, z] of rails) {
        const rail = new THREE.Mesh(geometry, frameMaterial);
        rail.position.set(0, y, z);
        rail.castShadow = true;
        win.add(rail);
      }
      return win;
    };

    const makeDoor = () => {
      const door = new THREE.Group();
      const leafGeometry = track(new THREE.BoxGeometry(60, DOOR_H - 4, DOOR_W - 4));
      const railHGeometry = track(new THREE.BoxGeometry(220, FRAME_T, DOOR_W + FRAME_T * 2));
      const railVGeometry = track(new THREE.BoxGeometry(220, DOOR_H, FRAME_T));
      const handleGeometry = track(new THREE.BoxGeometry(50, 140, 40));
      const leaf = new THREE.Mesh(leafGeometry, doorMaterial);
      leaf.castShadow = true;
      door.add(leaf);
      const rails = [
        [railHGeometry, DOOR_H / 2 + FRAME_T / 2, 0], // 上框（落地洞口不做下框）
        [railVGeometry, 0, DOOR_W / 2 + FRAME_T / 2], // 左框
        [railVGeometry, 0, -(DOOR_W / 2 + FRAME_T / 2)], // 右框
      ];
      for (const [geometry, y, z] of rails) {
        const rail = new THREE.Mesh(geometry, frameMaterial);
        rail.position.set(0, y, z);
        rail.castShadow = true;
        door.add(rail);
      }
      // 把手装在局部 +X 一侧；门组装上前墙时转 -90°，局部 +X 恰好朝外（世界 +Z）
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);
      handle.position.set(55, -80, DOOR_W / 2 - 160);
      door.add(handle);
      return door;
    };

    // 侧墙两扇窗：深度方向就是世界 X，不用转
    const windowY = FOUNDATION_H + WINDOW_SILL + WINDOW_H / 2;
    const wallCenterX = FOUNDATION_L / 2 - WALL_T / 2;
    for (const x of [wallCenterX, -wallCenterX]) {
      const win = makeWindow(WINDOW_W, WINDOW_H);
      win.position.set(x, windowY, 0);
      houseGroup.add(win);
      fittings.push(win);
    }
    // 前墙两扇窗 + 一扇门：整组转 90°，深度对准世界 Z；门用 -90° 让把手朝外
    const frontWallCenterZ = FOUNDATION_W / 2 - WALL_T / 2;
    for (const x of [1100, -1100]) {
      const win = makeWindow(FRONT_WINDOW_W, WINDOW_H);
      win.rotation.y = Math.PI / 2;
      win.position.set(x, windowY, frontWallCenterZ);
      houseGroup.add(win);
      fittings.push(win);
    }
    const door = makeDoor();
    door.rotation.y = -Math.PI / 2;
    door.position.set(0, FOUNDATION_H + DOOR_H / 2, frontWallCenterZ);
    houseGroup.add(door);
    fittings.push(door);

    // ---------- 7. 人字斜顶 ----------
    // 屋脊沿长边（X）方向；两块坡面板关于 XZ 中央对称，共用一份几何体。
    // +Z 坡绕 X 转 +pitch 让局部 +Z 指向「向下向 +Z」的坡向，−Z 坡转 π − pitch；
    // 面板中心放在脊线沿坡面下移 dCenter 处，两端分别探出搭接量和出檐
    const ridgeY = FOUNDATION_H + WALL_H + GABLE_RISE; // 屋脊标高 4800
    const pitch = Math.atan2(GABLE_RISE, halfSpan); // 坡角 = 45°
    const slopeToEaves = Math.hypot(halfSpan, GABLE_RISE); // 脊 → 檐口的坡面长
    const slopeLen = slopeToEaves + ROOF_OVERHANG + ROOF_RIDGE_EXT; // 板的坡向全长
    const roofGeometry = new THREE.BoxGeometry(
      FOUNDATION_L + ROOF_X_OVERHANG * 2,
      ROOF_T,
      slopeLen
    );
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x51606f, // 青灰瓦
      roughness: 0.7,
    });
    roofGroup = new THREE.Group();
    const dCenter = (slopeToEaves + ROOF_OVERHANG - ROOF_RIDGE_EXT) / 2;
    const drop = Math.sin(pitch) * dCenter; // 面板中心相对屋脊的落低
    const spread = Math.cos(pitch) * dCenter; // 面板中心相对屋脊的水平外移
    const roofPlus = new THREE.Mesh(roofGeometry, roofMaterial);
    roofPlus.rotation.x = pitch;
    roofPlus.position.set(0, ridgeY - drop, spread);
    const roofMinus = new THREE.Mesh(roofGeometry, roofMaterial);
    roofMinus.rotation.x = Math.PI - pitch;
    roofMinus.position.set(0, ridgeY - drop, -spread);
    for (const slab of [roofPlus, roofMinus]) {
      slab.castShadow = true;
      slab.receiveShadow = true;
      roofGroup.add(slab);
    }
    houseGroup.add(roofGroup);

    scene.add(houseGroup);

    // ---------- 8. 鼠标拖动 / 缩放 ----------
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // 惯性阻尼，拖动更顺滑
    controls.dampingFactor = 0.08;
    controls.target.set(0, 2000, 0); // 视线中心抬到房子中部
    controls.update();

    // 返回清理函数，卸载时由 useThreeStage 调用
    return () => {
      controls.dispose();
      hemiLight.dispose();
      sunLight.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      foundationGeometry.dispose();
      foundationMaterial.dispose();
      for (const geometry of stepGeometries) geometry.dispose();
      stepsGroup = null;
      wallGeometry.dispose();
      frontWallGeometry.dispose();
      backWallGeometry.dispose();
      wallMaterial.dispose();
      frameMaterial.dispose();
      glassMaterial.dispose();
      doorMaterial.dispose();
      handleMaterial.dispose();
      for (const geometry of fittingGeometries) geometry.dispose();
      fittings = [];
      roofGeometry.dispose();
      roofMaterial.dispose();
      foundationMesh = null;
      wallLeft = wallRight = null;
      frontWall = backWall = null;
      roofGroup = null;
      houseGroup = null;
    };
  },
  onFrame() {
    const dt = clock.getDelta();
    buildTime += dt;

    // 四段建造，各 1.2s、错峰 1.2s 开工：
    //   0.0s 地基与门前台阶浇筑（scale.y 0→1，从地面往上长）
    //   1.2s 四面墙长高（轮廓底在局部原点，从地基顶往上砌）
    //   2.4s 门窗装上（窗、门都以洞口中心整组弹出）
    //   3.6s 屋顶吊装（整组从空中 2600 高处落位，easeOutCubic 有「就位」感）
    foundationMesh.scale.y = phaseAt(0);
    stepsGroup.scale.y = phaseAt(0);
    wallLeft.scale.y = wallRight.scale.y = frontWall.scale.y = backWall.scale.y = phaseAt(PHASE);
    for (const fitting of fittings) fitting.scale.setScalar(phaseAt(PHASE * 2));
    roofGroup.position.y = (1 - phaseAt(PHASE * 3)) * 2600;

    // damping 需要每帧更新
    controls && controls.update();
  },
});
</script>

<template>
  <div ref="container" class="build-house"></div>
</template>

<style scoped>
.build-house {
  width: 100%;
  height: 100%;
  background: #a9bdd1;
}
</style>
