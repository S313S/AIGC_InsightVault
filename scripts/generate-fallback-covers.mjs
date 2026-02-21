import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TOTAL = 10;
const WIDTH = 1200;
const HEIGHT = 675;
const OUT_DIR = path.resolve(process.cwd(), 'public', 'fallback-covers');

const pad = (n) => String(n).padStart(3, '0');

const makeRng = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const rand = (rng, min, max) => min + (max - min) * rng();
const randInt = (rng, min, max) => Math.floor(rand(rng, min, max + 1));
const hsl = (h, s, l) => `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;

const sky = (hA, hB, hC, idx) => `
  <defs>
    <linearGradient id="sky-${idx}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${hsl(hA, 70, 74)}"/>
      <stop offset="55%" stop-color="${hsl(hB, 64, 56)}"/>
      <stop offset="100%" stop-color="${hsl(hC, 46, 34)}"/>
    </linearGradient>
    <filter id="grain-${idx}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${idx * 17}" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.05"/></feComponentTransfer>
    </filter>
    <filter id="soft-${idx}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
    <radialGradient id="vignette-${idx}" cx="50%" cy="45%" r="72%">
      <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.42)"/>
    </radialGradient>
  </defs>`;

const mountainRanges = (rng, hue, baseY) => {
  const layers = [];
  for (let l = 0; l < 3; l += 1) {
    const y = baseY + l * 36;
    let d = `M 0 ${y}`;
    for (let x = 0; x <= WIDTH + 120; x += 120) {
      const peak = y - randInt(rng, 30 + l * 10, 120 - l * 10);
      d += ` L ${x} ${peak}`;
    }
    d += ` L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`;
    layers.push(`<path d="${d}" fill="${hsl(hue + l * 8, 28 + l * 6, 24 + l * 8)}" opacity="${(0.85 - l * 0.18).toFixed(2)}"/>`);
  }
  return layers.join('');
};

const sceneAlpineLake = (rng, hue) => {
  const baseY = randInt(rng, 300, 360);
  return `
    ${mountainRanges(rng, hue, baseY)}
    <rect y="${baseY + 40}" width="${WIDTH}" height="${HEIGHT - baseY}" fill="rgba(20,70,110,0.45)"/>
    <ellipse cx="${randInt(rng, 520, 700)}" cy="${baseY + 120}" rx="${randInt(rng, 260, 430)}" ry="${randInt(rng, 50, 90)}" fill="rgba(160,220,255,0.18)"/>
  `;
};

const sceneForestRiver = (rng, hue) => {
  const trees = Array.from({ length: 28 }, () => {
    const x = randInt(rng, 0, WIDTH);
    const y = randInt(rng, 220, 520);
    const h = randInt(rng, 70, 180);
    return `<g><rect x="${x - 4}" y="${y}" width="8" height="${h}" fill="rgba(55,35,20,0.55)"/><circle cx="${x}" cy="${y}" r="${randInt(rng, 18, 42)}" fill="${hsl(hue + randInt(rng, -20, 20), 42, randInt(rng, 28, 44))}" opacity="0.85"/></g>`;
  }).join('');
  const river = `<path d="M -40 ${randInt(rng, 460, 520)} C 260 ${randInt(rng, 420, 500)}, 460 ${randInt(rng, 520, 620)}, 1240 ${randInt(rng, 500, 620)} L 1240 700 L -40 700 Z" fill="rgba(135,205,240,0.42)"/>`;
  return `${river}${trees}`;
};

const sceneDesertDunes = (rng, hue) => {
  const dunes = Array.from({ length: 5 }, (_, i) => {
    const y = 350 + i * 55;
    return `<path d="M -40 ${y} C 220 ${y - randInt(rng, 20, 70)}, 520 ${y + randInt(rng, 10, 70)}, 1240 ${y - randInt(rng, 20, 60)} L 1240 700 L -40 700 Z" fill="${hsl(hue + i * 4, 54, 56 - i * 6)}" opacity="0.9"/>`;
  }).join('');
  return dunes;
};

const sceneCoastline = (rng, hue) => {
  const cliffs = Array.from({ length: 6 }, (_, i) => {
    const x = i * 220 + randInt(rng, -40, 40);
    const w = randInt(rng, 180, 300);
    const h = randInt(rng, 140, 300);
    return `<rect x="${x}" y="${HEIGHT - h - 80}" width="${w}" height="${h}" rx="12" fill="${hsl(hue + i * 6, 24, 30)}" opacity="0.85"/>`;
  }).join('');
  const sea = `<rect y="${randInt(rng, 360, 430)}" width="${WIDTH}" height="${HEIGHT}" fill="rgba(78,150,198,0.52)"/>`;
  return `${sea}${cliffs}`;
};

const sceneWaterfall = (rng, hue) => {
  const cliff = `<rect x="${randInt(rng, 420, 520)}" y="${randInt(rng, 150, 220)}" width="${randInt(rng, 180, 260)}" height="${randInt(rng, 350, 430)}" rx="14" fill="${hsl(hue, 20, 28)}"/>`;
  const water = `<rect x="${randInt(rng, 470, 560)}" y="${randInt(rng, 140, 200)}" width="${randInt(rng, 80, 120)}" height="${randInt(rng, 380, 460)}" fill="rgba(190,235,255,0.6)" />`;
  const pool = `<ellipse cx="${randInt(rng, 560, 680)}" cy="${randInt(rng, 560, 620)}" rx="${randInt(rng, 220, 320)}" ry="${randInt(rng, 50, 80)}" fill="rgba(125,200,240,0.5)"/>`;
  return `${cliff}${water}${pool}`;
};

const sceneMeadow = (rng, hue) => {
  const hills = Array.from({ length: 4 }, (_, i) => {
    const y = 350 + i * 45;
    return `<path d="M -20 ${y} C 260 ${y - randInt(rng, 40, 80)}, 640 ${y + randInt(rng, 20, 80)}, 1220 ${y - randInt(rng, 30, 70)} L 1220 700 L -20 700 Z" fill="${hsl(hue + i * 7, 40, 42 - i * 4)}"/>`;
  }).join('');
  return hills;
};

const sceneCanyon = (rng, hue) => {
  const left = `<path d="M 0 250 C 180 260, 210 440, 240 675 L 0 675 Z" fill="${hsl(hue + 8, 44, 36)}"/>`;
  const right = `<path d="M 1200 220 C 1020 280, 980 470, 940 675 L 1200 675 Z" fill="${hsl(hue + 2, 42, 34)}"/>`;
  const valley = `<path d="M 320 675 C 520 520, 760 520, 900 675 Z" fill="rgba(70,120,155,0.38)"/>`;
  return `${left}${right}${valley}`;
};

const sceneSnowfield = (rng, hue) => {
  const mts = mountainRanges(rng, hue - 20, randInt(rng, 280, 340));
  const snow = `<path d="M 0 430 C 260 380, 640 500, 1200 420 L 1200 700 L 0 700 Z" fill="rgba(225,238,248,0.8)"/>`;
  return `${mts}${snow}`;
};

const sceneVolcanic = (rng, hue) => {
  const cone = `<path d="M ${randInt(rng, 460, 560)} 640 L ${randInt(rng, 620, 760)} 640 L ${randInt(rng, 620, 700)} ${randInt(rng, 240, 320)} Z" fill="${hsl(hue + 4, 36, 24)}"/>`;
  const glow = `<circle cx="${randInt(rng, 640, 700)}" cy="${randInt(rng, 230, 290)}" r="${randInt(rng, 30, 60)}" fill="rgba(255,140,80,0.35)" />`;
  return `${cone}${glow}`;
};

const sceneAurora = (rng, hue) => {
  const bands = Array.from({ length: 4 }, (_, i) => {
    const y = 120 + i * 60;
    return `<path d="M -30 ${y} C 240 ${y - randInt(rng, 30, 80)}, 760 ${y + randInt(rng, 20, 70)}, 1230 ${y - randInt(rng, 30, 70)}" fill="none" stroke="${hsl(hue + i * 12, 70, 68)}" stroke-width="${randInt(rng, 18, 30)}" opacity="0.22"/>`;
  }).join('');
  const land = `<rect y="${randInt(rng, 430, 500)}" width="${WIDTH}" height="${HEIGHT}" fill="rgba(20,40,50,0.65)"/>`;
  return `${bands}${land}`;
};

const SCENES = [
  sceneAlpineLake,
  sceneForestRiver,
  sceneDesertDunes,
  sceneCoastline,
  sceneWaterfall,
  sceneMeadow,
  sceneCanyon,
  sceneSnowfield,
  sceneVolcanic,
  sceneAurora
];

export const makeSvg = (index) => {
  const rng = makeRng(index * 7907 + 19);
  const hueA = (index * 23 + randInt(rng, 0, 30)) % 360;
  const hueB = (hueA + randInt(rng, 20, 55)) % 360;
  const hueC = (hueA + randInt(rng, 70, 130)) % 360;
  const sceneIdx = (index - 1) % SCENES.length;

  const stars = Array.from({ length: randInt(rng, 18, 34) }, () => {
    const x = randInt(rng, 20, WIDTH - 20);
    const y = randInt(rng, 20, HEIGHT - 20);
    const r = rand(rng, 0.8, 2.8).toFixed(2);
    const a = rand(rng, 0.15, 0.4).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(245,250,255,${a})"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Fallback cover ${index}" data-scene="landscape-${sceneIdx + 1}">
  ${sky(hueA, hueB, hueC, index)}
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky-${index})"/>
  ${SCENES[sceneIdx](rng, hueA)}
  <g id="scene-sparkles">${stars}</g>
  <rect width="${WIDTH}" height="${HEIGHT}" filter="url(#grain-${index})"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette-${index})"/>
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
