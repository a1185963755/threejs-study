// 松树模型重打包：
//   - 树叶（Blender 毛发式、完全离散的三角形卡片）：从原始模型按 keep 比例随机抽稀，
//     只保留完整卡片 —— meshopt simplify 对这种「三角形汤」会把小卡片整张删掉，不能用；
//   - 树干（有顶点共享的实体网格）：直接取 gltf-transform weld+simplify 的结果；
//   - 合并写成一套新的 tree.gltf + tree.bin（缓冲布局为 4 字节对齐）。
// 用法：node thin.mjs <原始模型目录> <简化模型目录> <输出目录> [树叶保留比例，默认 0.12]
import { readFileSync, writeFileSync } from 'node:fs';

const [origDir, simpDir, outDir, keepArg] = process.argv.slice(2);
const KEEP = parseFloat(keepArg ?? '0.12');

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMP = { 5126: [Float32Array, 4], 5125: [Uint32Array, 4], 5123: [Uint16Array, 2], 5121: [Uint8Array, 1] };
const NCOMP = { VEC3: 3, VEC2: 2, SCALAR: 1 };

const readSide = (dir) => ({
  gltf: JSON.parse(readFileSync(`${dir}/tree.gltf`, 'utf8')),
  bin: readFileSync(`${dir}/tree.bin`),
});

// 按 accessor 下标把二进制数据读成类型化数组（视图，不拷贝）
function readAccessor(side, accIdx) {
  const acc = side.gltf.accessors[accIdx];
  const [Arr] = COMP[acc.componentType];
  const ncomp = NCOMP[acc.type];
  const bv = side.gltf.bufferViews[acc.bufferView];
  const off = side.bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return {
    arr: new Arr(side.bin.buffer, off, acc.count * ncomp),
    count: acc.count,
    type: acc.type,
    componentType: acc.componentType,
  };
}

function findPrim(side, meshName) {
  const mesh = side.gltf.meshes.find((m) => m.name === meshName);
  if (!mesh) throw new Error(`mesh ${meshName} not found`);
  const prim = mesh.primitives[0];
  return {
    position: readAccessor(side, prim.attributes.POSITION),
    normal: readAccessor(side, prim.attributes.NORMAL),
    uv: readAccessor(side, prim.attributes.TEXCOORD_0),
    index: readAccessor(side, prim.indices),
    material: prim.material,
  };
}

const orig = readSide(origDir);
const simp = readSide(simpDir);
const leaves = findPrim(orig, 'leaves.002');
const trunk = findPrim(simp, 'Mesh.003');

// ---------- 1. 树叶：随机抽稀完整卡片 + 顶点紧凑化 ----------
const rng = mulberry32(20260828);
const triCount = leaves.index.count / 3;
const rawIndex = new Uint32Array(triCount * 3); // 上限，后面裁掉
const usedMask = new Uint8Array(leaves.position.count);
let keptTris = 0;
for (let tri = 0; tri < triCount; tri++) {
  if (rng() >= KEEP) continue;
  for (let k = 0; k < 3; k++) {
    const vi = leaves.index.arr[tri * 3 + k];
    rawIndex[keptTris * 3 + k] = vi;
    usedMask[vi] = 1;
  }
  keptTris++;
}
const keptIndex = rawIndex.subarray(0, keptTris * 3);

const remap = new Int32Array(leaves.position.count).fill(-1);
let keptVerts = 0;
for (let i = 0; i < usedMask.length; i++) if (usedMask[i]) remap[i] = keptVerts++;

const leafPos = new Float32Array(keptVerts * 3);
const leafNrm = new Float32Array(keptVerts * 3);
const leafUv = new Float32Array(keptVerts * 2);
for (let i = 0; i < remap.length; i++) {
  const j = remap[i];
  if (j < 0) continue;
  leafPos.set(leaves.position.arr.subarray(i * 3, i * 3 + 3), j * 3);
  leafNrm.set(leaves.normal.arr.subarray(i * 3, i * 3 + 3), j * 3);
  leafUv.set(leaves.uv.arr.subarray(i * 2, i * 2 + 2), j * 2);
}
for (let i = 0; i < keptIndex.length; i++) keptIndex[i] = remap[keptIndex[i]];

// ---------- 2. 组装输出缓冲 ----------
const chunks = [];
const bufferViews = [];
let offset = 0;
function pushView(arr, target) {
  // Buffer.from(ArrayBuffer, byteOffset, len) 定位到池里的真实字节，再拷一份干净出来
  const copy = Buffer.from(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  const view = { buffer: 0, byteOffset: offset, byteLength: copy.byteLength };
  if (target) view.target = target;
  bufferViews.push(view);
  chunks.push(copy);
  offset += copy.byteLength;
  return bufferViews.length - 1;
}
// POSITION accessor 规范要求 min/max
function minMax(vec3or2) {
  const n = vec3or2.ncomp;
  const min = new Array(n).fill(Infinity);
  const max = new Array(n).fill(-Infinity);
  for (let i = 0; i < vec3or2.length; i += n) {
    for (let k = 0; k < n; k++) {
      const v = vec3or2.arr[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return [min.map((v) => Math.round(v * 1e5) / 1e5), max.map((v) => Math.round(v * 1e5) / 1e5)];
}

const views = {
  leafPos: pushView(leafPos, 34962),
  leafNrm: pushView(leafNrm, 34962),
  leafUv: pushView(leafUv, 34962),
  leafIdx: pushView(keptIndex, 34963),
  trunkPos: pushView(trunk.position.arr, 34962),
  trunkNrm: pushView(trunk.normal.arr, 34962),
  trunkUv: pushView(trunk.uv.arr, 34962),
  trunkIdx: pushView(trunk.index.arr, 34963),
};
const acc = (viewIdx, componentType, type, count, mm) => ({
  bufferView: viewIdx,
  componentType,
  count,
  type,
  ...(mm ? { min: mm[0], max: mm[1] } : {}),
});
const accessors = [
  acc(views.leafPos, 5126, 'VEC3', keptVerts, minMax({ arr: leafPos, length: leafPos.length, ncomp: 3 })),
  acc(views.leafNrm, 5126, 'VEC3', keptVerts),
  acc(views.leafUv, 5126, 'VEC2', keptVerts),
  acc(views.leafIdx, 5125, 'SCALAR', keptTris * 3),
  acc(views.trunkPos, 5126, 'VEC3', trunk.position.count, minMax(trunk.position)),
  acc(views.trunkNrm, 5126, 'VEC3', trunk.normal.count),
  acc(views.trunkUv, 5126, 'VEC2', trunk.uv.count),
  acc(views.trunkIdx, trunk.index.componentType, 'SCALAR', trunk.index.count),
];

const outGltf = {
  asset: { generator: 'thin-leaves.mjs (card thinning + meshopt trunk)', version: '2.0' },
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [2] }],
  nodes: orig.gltf.nodes, // 层级原样：Pine_Tree → tree.001(干) → leaves.001(叶)
  materials: orig.gltf.materials,
  meshes: [
    {
      name: 'leaves.002',
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: leaves.material }],
    },
    {
      name: 'Mesh.003',
      primitives: [{ attributes: { POSITION: 4, NORMAL: 5, TEXCOORD_0: 6 }, indices: 7, material: trunk.material }],
    },
  ],
  accessors,
  bufferViews,
  buffers: [{ byteLength: offset, uri: 'tree.bin' }],
};

writeFileSync(`${outDir}/tree.bin`, Buffer.concat(chunks));
writeFileSync(`${outDir}/tree.gltf`, JSON.stringify(outGltf, null, '\t'));
console.log(`树叶卡片: ${triCount} → ${keptTris} (${(KEEP * 100).toFixed(0)}%), 顶点 ${leaves.position.count} → ${keptVerts}`);
console.log(`树干: 顶点 ${trunk.position.count}, 三角形 ${trunk.index.count / 3}`);
console.log(`tree.bin: ${(offset / 1048576).toFixed(2)} MB`);
