import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TOTAL = 100;
const OUT_DIR = path.resolve(process.cwd(), 'public', 'fallback-covers');

const pad = (n) => String(n).padStart(3, '0');

const SCENES = [
  { key: 'smart-office', label: 'Smart Office Collaboration', zh: '智能办公协作' },
  { key: 'ai-control-room', label: 'AI Control Room', zh: 'AI 控制中心' },
  { key: 'engineering-hub', label: 'Engineering Workflow Hub', zh: '工程工作流中心' },
  { key: 'creative-studio', label: 'Creative AI Studio', zh: '创意 AI 工作室' },
  { key: 'data-ops', label: 'Data Ops Workspace', zh: '数据运营工作区' },
  { key: 'product-lab', label: 'Product Experiment Lab', zh: '产品实验室' }
];

export const makeSvg = (index) => {
  const hueA = (index * 37) % 360;
  const hueB = (hueA + 48) % 360;
  const hueC = (hueA + 120) % 360;
  const scene = SCENES[(index - 1) % SCENES.length];
  const id = `g${index}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="AIGC fallback cover ${index}" data-scene="${scene.key}">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueA}, 78%, 16%)"/>
      <stop offset="55%" stop-color="hsl(${hueB}, 82%, 24%)"/>
      <stop offset="100%" stop-color="hsl(${hueC}, 74%, 14%)"/>
    </linearGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="28"/>
    </filter>
  </defs>

  <rect width="1200" height="675" fill="url(#${id})"/>
  <rect y="450" width="1200" height="225" fill="rgba(5, 10, 24, 0.62)"/>

  <circle cx="210" cy="130" r="124" fill="hsl(${(hueA + 84) % 360}, 92%, 60%)" opacity="0.2" filter="url(#blur)"/>
  <circle cx="980" cy="115" r="112" fill="hsl(${(hueB + 30) % 360}, 94%, 66%)" opacity="0.16" filter="url(#blur)"/>
  <circle cx="1010" cy="520" r="160" fill="hsl(${(hueC + 10) % 360}, 90%, 62%)" opacity="0.12" filter="url(#blur)"/>

  <g id="workspace-desk">
    <rect x="110" y="332" width="980" height="230" rx="26" fill="rgba(8, 16, 32, 0.42)" stroke="rgba(158,198,255,0.34)"/>
    <rect x="168" y="364" width="406" height="138" rx="16" fill="rgba(18, 38, 70, 0.82)" stroke="rgba(150,210,255,0.58)"/>
    <rect x="626" y="352" width="406" height="146" rx="18" fill="rgba(12, 28, 56, 0.82)" stroke="rgba(120,230,255,0.56)"/>
    <rect x="216" y="404" width="264" height="14" rx="7" fill="rgba(130, 240, 255, 0.72)"/>
    <rect x="674" y="396" width="254" height="14" rx="7" fill="rgba(120, 255, 198, 0.72)"/>
    <rect x="188" y="530" width="824" height="18" rx="9" fill="rgba(185, 220, 255, 0.24)"/>
  </g>

  <g id="ai-network" stroke-linecap="round">
    <line x1="688" y1="226" x2="796" y2="282" stroke="rgba(147, 250, 255, 0.62)" stroke-width="3"/>
    <line x1="796" y1="282" x2="916" y2="236" stroke="rgba(120, 255, 214, 0.62)" stroke-width="3"/>
    <line x1="796" y1="282" x2="886" y2="342" stroke="rgba(147, 250, 255, 0.58)" stroke-width="3"/>
    <circle cx="688" cy="226" r="15" fill="rgba(132, 235, 255, 0.8)"/>
    <circle cx="796" cy="282" r="18" fill="rgba(119, 255, 221, 0.85)"/>
    <circle cx="916" cy="236" r="14" fill="rgba(143, 232, 255, 0.8)"/>
    <circle cx="886" cy="342" r="13" fill="rgba(99, 255, 199, 0.82)"/>
  </g>

  <text x="130" y="158" fill="rgba(238,244,255,0.92)" font-family="'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="56" font-weight="700" letter-spacing="1.2">AIGC Insight Vault</text>
  <text x="130" y="224" fill="rgba(218,232,255,0.82)" font-family="'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="34" font-weight="600">${scene.label}</text>
  <text x="130" y="272" fill="rgba(210,226,255,0.72)" font-family="'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="28" font-weight="500">${scene.zh}</text>
  <text x="130" y="626" fill="rgba(230,240,255,0.72)" font-family="'JetBrains Mono', 'Menlo', monospace" font-size="25" font-weight="600">NO MEDIA • TECH COVER #${pad(index)}</text>
</svg>`;
};

export const generateFallbackCovers = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const writes = [];
  for (let i = 1; i <= TOTAL; i += 1) {
    const filePath = path.join(OUT_DIR, `cover-${pad(i)}.svg`);
    writes.push(fs.writeFile(filePath, makeSvg(i), 'utf8'));
  }

  await Promise.all(writes);
  console.log(`Generated ${TOTAL} fallback covers in ${OUT_DIR}`);
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  generateFallbackCovers().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
