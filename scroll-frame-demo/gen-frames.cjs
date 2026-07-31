// 生成 SVG 测试帧。
// 设计：用一个"小球沿抛物线移动 + 颜色渐变"作为动画内容，
// 这样多帧连起来看，是一个连贯的抛物线动画，比单纯换数字更像真实序列帧。
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "frames");
fs.mkdirSync(dir, { recursive: true });

// 清空旧帧
for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));

const N = 150; // ← 改这个数字就能生成任意帧数，制造性能压力
for (let i = 0; i < N; i++) {
  const t = i / (N - 1); // 0 → 1 的进度
  // 小球做抛物线运动：x 从左到右，y 先上后下
  const x = 140 + t * 1000;
  const y = 600 - Math.sin(t * Math.PI) * 450;
  const hue = Math.round(t * 280); // 颜色随进度变化

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},45%,12%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 30) % 360},45%,22%)"/>
    </linearGradient>
    <radialGradient id="ball">
      <stop offset="0%" stop-color="hsl(${(hue + 180) % 360},90%,75%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 180) % 360},90%,45%)"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <path d="M 140 600 Q 640 150 1140 600" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" stroke-dasharray="6 8"/>
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="36" fill="url(#ball)"/>
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="36" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
  <text x="40" y="60" font-family="monospace" font-size="22" fill="rgba(255,255,255,0.5)">frame ${i} / ${N - 1}</text>
</svg>`;
  fs.writeFileSync(path.join(dir, `frame_${String(i).padStart(3, "0")}.svg`), svg, "utf8");
}
console.log(`Generated ${N} SVG frames`);
