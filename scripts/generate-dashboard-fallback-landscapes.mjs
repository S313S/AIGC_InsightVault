import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const WIDTH = 1200;
const HEIGHT = 675;
const TOTAL = 10;
const OUT_DIR = path.resolve(process.cwd(), 'public', 'dashboard-fallbacks');

const pad = (n) => String(n).padStart(2, '0');

const gradientDefs = (id, top, mid, bottom) => `
  <defs>
    <linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${top}"/>
      <stop offset="55%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="${bottom}"/>
    </linearGradient>
    <filter id="grain-${id}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${id * 37}" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.045"/>
      </feComponentTransfer>
    </filter>
  </defs>`;

const scenes = [
  {
    name: 'alpine-lake',
    sky: ['#87b2ff', '#5f88d7', '#315a8f'],
    body: () => `
      <path d="M0 320 L160 220 L300 300 L430 205 L580 295 L760 210 L920 280 L1080 225 L1200 290 L1200 675 L0 675 Z" fill="#2d486a"/>
      <path d="M0 390 L220 330 L380 390 L560 315 L740 380 L940 320 L1200 380 L1200 675 L0 675 Z" fill="#3f5f81"/>
      <rect x="0" y="390" width="1200" height="285" fill="#3d7ea6" opacity="0.72"/>
      <ellipse cx="620" cy="510" rx="340" ry="92" fill="#8bc6df" opacity="0.28"/>
    `,
  },
  {
    name: 'forest-river',
    sky: ['#a9d4c9', '#6ea08d', '#3a5f55'],
    body: () => `
      <rect x="0" y="340" width="1200" height="335" fill="#345343"/>
      <path d="M-40 500 C210 430, 430 600, 720 520 C960 460, 1120 580, 1240 540 L1240 675 L-40 675 Z" fill="#6ca9cc" opacity="0.82"/>
      <g fill="#224132" opacity="0.95">
        <polygon points="70,360 110,250 150,360"/><polygon points="150,360 190,245 230,360"/><polygon points="260,360 300,255 340,360"/>
        <polygon points="360,360 400,238 440,360"/><polygon points="470,360 510,250 550,360"/><polygon points="570,360 610,242 650,360"/>
        <polygon points="690,360 730,248 770,360"/><polygon points="790,360 830,232 870,360"/><polygon points="900,360 940,250 980,360"/>
        <polygon points="1000,360 1040,240 1080,360"/><polygon points="1085,360 1125,252 1165,360"/>
      </g>
    `,
  },
  {
    name: 'desert-dunes',
    sky: ['#ffd6a6', '#f2aa6a', '#c4713f'],
    body: () => `
      <circle cx="980" cy="120" r="52" fill="#ffe7b8" opacity="0.72"/>
      <path d="M-20 410 C150 355, 320 450, 490 400 C650 350, 860 450, 1220 390 L1220 675 L-20 675 Z" fill="#d8985d"/>
      <path d="M-20 470 C180 400, 340 520, 560 460 C750 410, 930 520, 1220 445 L1220 675 L-20 675 Z" fill="#c98347"/>
      <path d="M-20 540 C230 470, 400 590, 630 530 C860 480, 1010 600, 1220 535 L1220 675 L-20 675 Z" fill="#b46e37"/>
    `,
  },
  {
    name: 'sea-cliffs',
    sky: ['#a9d8ff', '#6fb1e8', '#2f6ea3'],
    body: () => `
      <rect x="0" y="360" width="1200" height="315" fill="#4d95bf"/>
      <path d="M0 430 L120 250 L270 290 L360 220 L520 270 L620 200 L780 260 L890 210 L1080 280 L1200 240 L1200 675 L0 675 Z" fill="#4e5f67"/>
      <path d="M0 500 C210 470, 340 530, 560 500 C760 470, 980 540, 1200 510" stroke="#bfe8ff" stroke-width="8" fill="none" opacity="0.52"/>
      <path d="M0 545 C190 515, 420 580, 690 540 C900 510, 1070 575, 1200 548" stroke="#d8f3ff" stroke-width="6" fill="none" opacity="0.42"/>
    `,
  },
  {
    name: 'waterfall-valley',
    sky: ['#c2e7ff', '#83b8df', '#4a7499'],
    body: () => `
      <rect x="0" y="300" width="420" height="375" fill="#3f5c49"/>
      <rect x="780" y="280" width="420" height="395" fill="#3b5845"/>
      <rect x="520" y="160" width="160" height="395" fill="#8fd8f2" opacity="0.86"/>
      <ellipse cx="600" cy="575" rx="250" ry="70" fill="#6eb7d9" opacity="0.66"/>
      <path d="M0 520 C220 470, 400 540, 600 500 C820 460, 1020 540, 1200 490 L1200 675 L0 675 Z" fill="#2b4c3b"/>
    `,
  },
  {
    name: 'green-meadow',
    sky: ['#d6f3ff', '#9fd8ef', '#6fb3cd'],
    body: () => `
      <path d="M-20 410 C220 340, 420 470, 700 400 C900 350, 1080 440, 1220 390 L1220 675 L-20 675 Z" fill="#76b96b"/>
      <path d="M-20 470 C260 410, 480 520, 760 455 C930 415, 1090 500, 1220 460 L1220 675 L-20 675 Z" fill="#5ca457"/>
      <path d="M-20 535 C220 485, 500 580, 790 520 C980 480, 1120 555, 1220 528 L1220 675 L-20 675 Z" fill="#488d45"/>
      <circle cx="160" cy="120" r="40" fill="#fff3b7" opacity="0.72"/>
    `,
  },
  {
    name: 'canyon-ridge',
    sky: ['#ffc8a2', '#e98d63', '#a7523e'],
    body: () => `
      <path d="M0 200 C150 230, 210 470, 260 675 L0 675 Z" fill="#8f4f3b"/>
      <path d="M1200 180 C1040 240, 980 500, 930 675 L1200 675 Z" fill="#7e4333"/>
      <path d="M240 675 C430 470, 760 500, 930 675 Z" fill="#5f8aa1" opacity="0.5"/>
      <path d="M300 430 C460 390, 710 440, 860 410" stroke="#deb17b" stroke-width="8" fill="none" opacity="0.5"/>
    `,
  },
  {
    name: 'snow-mountains',
    sky: ['#e8f4ff', '#b0d0ef', '#7aa2c8'],
    body: () => `
      <path d="M0 360 L180 210 L320 360 L500 190 L670 360 L840 220 L1020 360 L1200 230 L1200 675 L0 675 Z" fill="#4c6b88"/>
      <path d="M145 265 L180 210 L215 265" fill="#f3fbff"/><path d="M465 250 L500 190 L535 250" fill="#f3fbff"/>
      <path d="M805 275 L840 220 L875 275" fill="#f3fbff"/><path d="M1165 285 L1200 230 L1235 285" fill="#f3fbff"/>
      <path d="M0 470 C220 420, 520 540, 820 470 C980 430, 1110 500, 1200 480 L1200 675 L0 675 Z" fill="#d9edf8" opacity="0.88"/>
    `,
  },
  {
    name: 'volcanic-island',
    sky: ['#3d4765', '#2f324c', '#1f2233'],
    body: () => `
      <rect x="0" y="390" width="1200" height="285" fill="#355f78"/>
      <path d="M420 620 L760 620 L620 260 Z" fill="#2b2b2f"/>
      <ellipse cx="620" cy="245" rx="56" ry="28" fill="#e56b3f" opacity="0.72"/>
      <path d="M600 250 C570 200, 580 150, 610 110 C640 70, 665 40, 650 5" stroke="#9ea0a9" stroke-width="10" fill="none" opacity="0.4"/>
      <path d="M0 500 C210 470, 430 530, 680 500 C920 470, 1090 525, 1200 498" stroke="#8bc0d9" stroke-width="7" fill="none" opacity="0.36"/>
    `,
  },
  {
    name: 'aurora-tundra',
    sky: ['#17253f', '#1f375f', '#204d6f'],
    body: () => `
      <path d="M-30 130 C230 40, 520 210, 860 130 C1040 90, 1150 150, 1230 120" stroke="#68ffd4" stroke-width="22" fill="none" opacity="0.25"/>
      <path d="M-30 190 C240 110, 470 260, 860 185 C1030 155, 1150 205, 1230 180" stroke="#95ff89" stroke-width="18" fill="none" opacity="0.2"/>
      <rect x="0" y="430" width="1200" height="245" fill="#1e2f36"/>
      <path d="M0 500 L220 420 L380 500 L540 410 L730 500 L920 435 L1080 500 L1200 460 L1200 675 L0 675 Z" fill="#2f434a"/>
      <circle cx="190" cy="115" r="3" fill="#ffffff"/><circle cx="260" cy="80" r="2" fill="#ffffff"/><circle cx="330" cy="150" r="2" fill="#ffffff"/>
      <circle cx="910" cy="95" r="2" fill="#ffffff"/><circle cx="980" cy="140" r="3" fill="#ffffff"/>
    `,
  },
];

const wrapSvg = (index, scene) => {
  const [top, mid, bottom] = scene.sky;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Nature fallback ${index}" data-scene="${scene.name}">
${gradientDefs(index, top, mid, bottom)}
<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#sky-${index})"/>
${scene.body()}
<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" filter="url(#grain-${index})"/>
</svg>`;
};

const hash = (text) => crypto.createHash('sha1').update(text).digest('hex');

const generate = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const svgs = scenes.slice(0, TOTAL).map((scene, i) => ({
    index: i + 1,
    scene,
    svg: wrapSvg(i + 1, scene),
  }));

  const uniqueHashes = new Set(svgs.map((x) => hash(x.svg)));
  if (uniqueHashes.size !== TOTAL) {
    throw new Error(`Expected ${TOTAL} unique images, got ${uniqueHashes.size}`);
  }

  await Promise.all(
    svgs.map(({ index, svg }) =>
      fs.writeFile(path.join(OUT_DIR, `nature-${pad(index)}.svg`), svg, 'utf8')
    )
  );

  console.log(`Generated ${TOTAL} unique fallback landscapes in ${OUT_DIR}`);
};

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
