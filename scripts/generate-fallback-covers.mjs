import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TOTAL = 100;
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

const sceneNodes = (rng, hueBase) => {
  const points = Array.from({ length: randInt(rng, 5, 8) }, () => ({
    x: randInt(rng, 640, 1080),
    y: randInt(rng, 80, 330),
    r: randInt(rng, 8, 18)
  }));

  const lines = [];
  for (let i = 1; i < points.length; i += 1) {
    const parent = randInt(rng, 0, i - 1);
    lines.push(`<line x1="${points[parent].x}" y1="${points[parent].y}" x2="${points[i].x}" y2="${points[i].y}" stroke="rgba(145,245,255,0.64)" stroke-width="${randInt(rng, 2, 4)}"/>`);
  }

  const circles = points
    .map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${hsl(hueBase + i * 9, 88, 72)}" opacity="0.86"/>`)
    .join('');

  return `<g id="scene-nodes">${lines.join('')}${circles}</g>`;
};

const sceneCircuit = (rng, hueBase) => {
  const segments = Array.from({ length: randInt(rng, 16, 24) }, () => {
    const x = randInt(rng, 80, 1120);
    const y = randInt(rng, 70, 620);
    const horizontal = rng() > 0.45;
    const len = randInt(rng, 70, 220);
    const x2 = horizontal ? Math.min(1140, x + len) : x;
    const y2 = horizontal ? y : Math.min(640, y + len);
    return `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="rgba(135,220,255,0.28)" stroke-width="${randInt(rng, 2, 6)}" stroke-linecap="round"/>`;
  }).join('');

  const chips = Array.from({ length: randInt(rng, 4, 7) }, (_, i) => {
    const w = randInt(rng, 80, 200);
    const h = randInt(rng, 50, 120);
    const x = randInt(rng, 90, 1080 - w);
    const y = randInt(rng, 80, 600 - h);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="rgba(12,28,60,0.48)" stroke="${hsl(hueBase + i * 11, 90, 70)}" opacity="0.78"/>`;
  }).join('');

  return `<g id="scene-circuit">${segments}${chips}</g>`;
};

const sceneDatacenter = (rng) => {
  const racks = Array.from({ length: randInt(rng, 6, 9) }, (_, i) => {
    const w = randInt(rng, 88, 130);
    const h = randInt(rng, 300, 470);
    const x = 70 + i * randInt(rng, 120, 165);
    const y = HEIGHT - h - randInt(rng, 25, 50);
    const leds = Array.from({ length: randInt(rng, 5, 11) }, () => {
      const ly = randInt(rng, y + 30, y + h - 25);
      const lx = randInt(rng, x + 18, x + w - 18);
      const lw = randInt(rng, 16, 34);
      return `<rect x="${lx}" y="${ly}" width="${lw}" height="6" rx="3" fill="rgba(102,245,220,0.8)"/>`;
    }).join('');
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="rgba(10,20,42,0.58)" stroke="rgba(130,190,255,0.45)"/>${leds}</g>`;
  }).join('');

  return `<g id="scene-datacenter">${racks}</g>`;
};

const sceneCity = (rng, hueBase) => {
  const buildings = Array.from({ length: randInt(rng, 11, 16) }, (_, i) => {
    const w = randInt(rng, 40, 120);
    const h = randInt(rng, 120, 360);
    const x = randInt(rng, 20, WIDTH - 20 - w);
    const y = HEIGHT - h;
    const windows = Array.from({ length: randInt(rng, 4, 10) }, (_, idx) => {
      const wy = y + 20 + idx * randInt(rng, 18, 28);
      return `<rect x="${x + randInt(rng, 8, 16)}" y="${wy}" width="${w - randInt(rng, 16, 28)}" height="5" rx="2" fill="rgba(120,240,255,0.22)"/>`;
    }).join('');
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="rgba(8,18,38,0.58)" stroke="${hsl(hueBase + i * 5, 70, 52)}" opacity="0.72"/>${windows}</g>`;
  }).join('');

  return `<g id="scene-city">${buildings}</g>`;
};

const sceneWave = (rng) => {
  const waves = Array.from({ length: randInt(rng, 4, 7) }, (_, i) => {
    const y = randInt(rng, 150, 520);
    const a = randInt(rng, 20, 70);
    const p = randInt(rng, 200, 520);
    const d = `M 0 ${y} C ${p * 0.25} ${y - a}, ${p * 0.75} ${y + a}, ${p} ${y} S ${p * 1.75} ${y - a}, ${p * 2} ${y}`;
    return `<path d="${d}" transform="translate(${randInt(rng, -20, 220)},0) scale(${rand(rng, 1.2, 2.5)},1)" fill="none" stroke="rgba(132,236,255,${rand(rng, 0.18, 0.42).toFixed(2)})" stroke-width="${randInt(rng, 3, 7)}"/>`;
  }).join('');

  return `<g id="scene-wave">${waves}</g>`;
};

const sceneCloudPipeline = (rng) => {
  const clouds = Array.from({ length: randInt(rng, 3, 5) }, () => {
    const x = randInt(rng, 160, 980);
    const y = randInt(rng, 80, 260);
    return `<g><circle cx="${x}" cy="${y}" r="${randInt(rng, 26, 38)}" fill="rgba(180,220,255,0.42)"/><circle cx="${x + randInt(rng, 25, 50)}" cy="${y + randInt(rng, -8, 8)}" r="${randInt(rng, 20, 34)}" fill="rgba(180,220,255,0.36)"/><rect x="${x - 22}" y="${y + 8}" width="${randInt(rng, 70, 110)}" height="22" rx="11" fill="rgba(170,220,255,0.3)"/></g>`;
  }).join('');

  const pipes = Array.from({ length: randInt(rng, 7, 12) }, () => {
    const x = randInt(rng, 120, 1080);
    const y = randInt(rng, 120, 560);
    return `<path d="M ${x} ${y} h ${randInt(rng, 30, 140)} v ${randInt(rng, 20, 100)} h ${randInt(rng, -140, 140)}" fill="none" stroke="rgba(120,255,210,0.34)" stroke-width="${randInt(rng, 4, 8)}" stroke-linecap="round"/>`;
  }).join('');

  return `<g id="scene-cloud-pipeline">${clouds}${pipes}</g>`;
};

const sceneOrbits = (rng, hueBase) => {
  const cx = randInt(rng, 520, 700);
  const cy = randInt(rng, 250, 350);
  const rings = Array.from({ length: 4 }, (_, i) => {
    const rx = randInt(rng, 120 + i * 42, 160 + i * 52);
    const ry = randInt(rng, 54 + i * 25, 90 + i * 30);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(140,230,255,0.28)" stroke-width="2" transform="rotate(${randInt(rng, -30, 30)} ${cx} ${cy})"/>`;
  }).join('');

  const satellites = Array.from({ length: randInt(rng, 7, 11) }, (_, i) => {
    const angle = rand(rng, 0, Math.PI * 2);
    const radius = rand(rng, 140, 290);
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius * 0.55);
    return `<circle cx="${x}" cy="${y}" r="${randInt(rng, 6, 12)}" fill="${hsl(hueBase + i * 12, 88, 72)}" opacity="0.85"/>`;
  }).join('');

  return `<g id="scene-orbits">${rings}${satellites}</g>`;
};

const sceneCodePanels = (rng) => {
  const panels = Array.from({ length: randInt(rng, 5, 8) }, (_, i) => {
    const w = randInt(rng, 180, 340);
    const h = randInt(rng, 100, 190);
    const x = randInt(rng, 30, WIDTH - w - 30);
    const y = randInt(rng, 40, HEIGHT - h - 30);
    const lines = Array.from({ length: randInt(rng, 3, 6) }, (_, j) => {
      const lw = randInt(rng, Math.floor(w * 0.35), Math.floor(w * 0.85));
      return `<rect x="${x + 20}" y="${y + 18 + j * 22}" width="${lw}" height="8" rx="4" fill="rgba(120,220,255,${(0.25 + j * 0.09).toFixed(2)})"/>`;
    }).join('');
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="rgba(11,24,48,0.55)" stroke="rgba(120,190,255,0.45)"/>${lines}<circle cx="${x + w - 18}" cy="${y + 18}" r="4" fill="rgba(160,240,255,0.7)"/></g>`;
  }).join('');

  return `<g id="scene-code-panels">${panels}</g>`;
};

const sceneDroneSwarm = (rng) => {
  const drones = Array.from({ length: randInt(rng, 8, 14) }, () => {
    const x = randInt(rng, 120, 1080);
    const y = randInt(rng, 90, 360);
    const s = rand(rng, 0.8, 1.4);
    return `<g transform="translate(${x},${y}) scale(${s.toFixed(2)})"><rect x="-10" y="-5" width="20" height="10" rx="3" fill="rgba(180,240,255,0.58)"/><line x1="-20" y1="0" x2="20" y2="0" stroke="rgba(150,230,255,0.6)" stroke-width="2"/><line x1="0" y1="-16" x2="0" y2="16" stroke="rgba(150,230,255,0.6)" stroke-width="2"/></g>`;
  }).join('');

  return `<g id="scene-drone-swarm">${drones}</g>`;
};

const sceneRobotArms = (rng) => {
  const arms = Array.from({ length: randInt(rng, 3, 5) }, (_, i) => {
    const baseX = randInt(rng, 120, 1000);
    const baseY = randInt(rng, 380, 600);
    const x2 = baseX + randInt(rng, -180, 180);
    const y2 = baseY - randInt(rng, 110, 230);
    const x3 = x2 + randInt(rng, -120, 120);
    const y3 = y2 - randInt(rng, 60, 160);
    return `<g><circle cx="${baseX}" cy="${baseY}" r="16" fill="rgba(120,215,255,0.75)"/><line x1="${baseX}" y1="${baseY}" x2="${x2}" y2="${y2}" stroke="rgba(145,235,255,0.62)" stroke-width="${randInt(rng, 8, 14)}" stroke-linecap="round"/><line x1="${x2}" y1="${y2}" x2="${x3}" y2="${y3}" stroke="rgba(120,255,220,0.6)" stroke-width="${randInt(rng, 6, 10)}" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="10" fill="rgba(150,245,255,0.8)"/><circle cx="${x3}" cy="${y3}" r="8" fill="rgba(120,255,220,0.86)"/></g>`;
  }).join('');

  return `<g id="scene-robot-arms">${arms}</g>`;
};

const SCENE_BUILDERS = [
  sceneNodes,
  sceneCircuit,
  sceneDatacenter,
  sceneCity,
  sceneWave,
  sceneCloudPipeline,
  sceneOrbits,
  sceneCodePanels,
  sceneDroneSwarm,
  sceneRobotArms
];

export const makeSvg = (index) => {
  const rng = makeRng(index * 7919 + 17);
  const hueA = (index * 41 + randInt(rng, 0, 40)) % 360;
  const hueB = (hueA + randInt(rng, 35, 80)) % 360;
  const hueC = (hueA + randInt(rng, 110, 190)) % 360;
  const sceneIdx = (index - 1) % SCENE_BUILDERS.length;
  const scene = SCENE_BUILDERS[sceneIdx](rng, hueA);

  const sparkles = Array.from({ length: randInt(rng, 16, 28) }, () => {
    const x = randInt(rng, 20, WIDTH - 20);
    const y = randInt(rng, 20, HEIGHT - 20);
    const r = rand(rng, 1.1, 3.4).toFixed(2);
    const a = rand(rng, 0.15, 0.45).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(180,240,255,${a})"/>`;
  }).join('');

  const glows = Array.from({ length: 3 }, (_, i) => {
    const x = randInt(rng, 90, 1110);
    const y = randInt(rng, 70, 610);
    const r = randInt(rng, 90, 220);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${hsl(hueA + i * 26, 92, 62)}" opacity="${rand(rng, 0.08, 0.18).toFixed(2)}" filter="url(#blur-${index})"/>`;
  }).join('');

  const bokeh = Array.from({ length: randInt(rng, 6, 10) }, () => {
    const x = randInt(rng, 40, WIDTH - 40);
    const y = randInt(rng, 30, Math.floor(HEIGHT * 0.68));
    const r = randInt(rng, 20, 70);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(210,240,255,${rand(rng, 0.06, 0.16).toFixed(2)})" filter="url(#soft-${index})"/>`;
  }).join('');

  const horizon = randInt(rng, 360, 460);
  const groundSkew = randInt(rng, -220, 220);
  const perspectiveGround = `<polygon points="0,${HEIGHT} ${WIDTH},${HEIGHT} ${WIDTH + groundSkew},${horizon} ${-groundSkew},${horizon}" fill="rgba(8,16,28,0.35)"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="AIGC fallback cover ${index}" data-scene="scene-${sceneIdx + 1}">
  <defs>
    <linearGradient id="bg-${index}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${hsl(hueA, 82, 16)}"/>
      <stop offset="52%" stop-color="${hsl(hueB, 84, 23)}"/>
      <stop offset="100%" stop-color="${hsl(hueC, 78, 12)}"/>
    </linearGradient>
    <filter id="blur-${index}" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
    <filter id="soft-${index}" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
    <filter id="grain-${index}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${index * 13}" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.05"/>
      </feComponentTransfer>
    </filter>
    <radialGradient id="vignette-${index}" cx="50%" cy="45%" r="70%">
      <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.45)"/>
    </radialGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg-${index})"/>
  ${glows}
  ${bokeh}
  ${perspectiveGround}
  ${scene}
  <g id="scene-sparkles">${sparkles}</g>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(190,220,255,0.06)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" filter="url(#grain-${index})"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette-${index})"/>
  <rect x="20" y="20" width="1160" height="635" rx="32" fill="none" stroke="rgba(155,220,255,0.24)"/>
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
