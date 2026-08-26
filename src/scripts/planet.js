/* ─────────────────────────────────────────────────────────────
   흑요석 행성 — 이미지 한 장 대신 매 프레임 직접 그리는 장면

   · 표면   절차적 노이즈로 만든 정사각도법 텍스처를 구면으로 다시 감아 자전시킨다.
            구 위의 점은 y = R·sin(위도) 라서 세로 변형은 컬럼과 무관하다.
            그래서 텍스처를 세로로 한 번만 미리 휘어 두면, 매 프레임 할 일은
            가로로 얇게 썰어 옮겨 붙이는 것뿐이다.
   · 고리   케플러 속도(ω ∝ r^-1.5)로 도는 수천 개의 알갱이. 안쪽이 더 빠르다.
   · 그림자 고리 알갱이에서 빛 반대쪽으로 광선을 쏴 구와 만나는 지점을 풀어
            행성 표면에 실제 고리 그림자를 얹는다. 카시니 간극도 같이 비친다.
   · 위성   같은 궤도면 위에서 기울기를 조금씩 달리해 돌고, 꼬리를 남긴다.
   · 암석   고리 바깥 벨트에서 제멋대로 구르며 돈다.
   · 손     마우스가 시점의 고도·회전을 밀고, 커서 근처 알갱이는 옆으로 비킨다.
   ───────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* 씨앗이 같으면 늘 같은 행성이 나온다 */
function makeRand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 가로로 이어지는 값 노이즈 — 구에 감아도 이음매가 보이지 않는다 */
function noiseField(rand, gw, gh) {
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const fx = x * gw;
    const fy = clamp(y, 0, 0.9999) * (gh - 1);
    let ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    ix = ((ix % gw) + gw) % gw;
    const ix1 = (ix + 1) % gw;
    const iy1 = Math.min(iy + 1, gh - 1);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix];
    const b = g[iy * gw + ix1];
    const c = g[iy1 * gw + ix];
    const d = g[iy1 * gw + ix1];
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
}

/* 고도 → 색. 검푸른 흑요석 바다에서 사금빛 고지대까지.
   너무 어두우면 밤하늘에 묻히니 바닥을 남색 쪽으로 들어 올린다. */
const CRUST = [
  [0.0, 21, 28, 42],
  [0.28, 33, 44, 64],
  [0.44, 56, 70, 94],
  [0.56, 96, 100, 110],
  [0.67, 144, 128, 100],
  [0.79, 192, 164, 119],
  [0.9, 222, 199, 157],
  [1.0, 243, 232, 208],
];

function crust(h, out) {
  let i = 1;
  while (i < CRUST.length - 1 && h > CRUST[i][0]) i++;
  const a = CRUST[i - 1];
  const b = CRUST[i];
  const t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
  out[0] = lerp(a[1], b[1], t);
  out[1] = lerp(a[2], b[2], t);
  out[2] = lerp(a[3], b[3], t);
}

/**
 * 표면·구름 텍스처를 조금씩 나눠 굽는다.
 * 한 번에 다 구우면 첫 화면이 끊기니까 유휴 시간에 몇 줄씩만 채운다.
 */
function bakeTextures(w, h, seed) {
  const rand = makeRand(seed);
  const oct = [];
  for (let i = 0; i < 6; i++) oct.push(noiseField(rand, 6 << i, 4 << i));
  const warp = noiseField(rand, 5, 4);
  /* 폭 1짜리 격자는 x 와 무관한 값이 나온다 — 위도마다 가로로 밀어 띠를 만든다 */
  const shear = noiseField(rand, 1, 26);
  const vein = [noiseField(rand, 26, 14), noiseField(rand, 52, 28), noiseField(rand, 104, 56)];
  const puff = [noiseField(rand, 7, 4), noiseField(rand, 14, 8), noiseField(rand, 28, 16), noiseField(rand, 56, 32)];

  const body = new ImageData(w, h);
  const cloud = new ImageData(w, h);
  const bd = body.data;
  const cd = cloud.data;
  const rgb = [0, 0, 0];
  let row = 0;

  const fbm = (bank, x, y) => {
    let sum = 0;
    let amp = 1;
    let tot = 0;
    for (let i = 0; i < bank.length; i++) {
      sum += bank[i](x, y) * amp;
      tot += amp;
      amp *= 0.52;
    }
    return sum / tot;
  };

  return {
    body,
    cloud,
    get done() {
      return row >= h;
    },
    /** rows 줄만큼 굽고 끝났는지 알려준다 */
    step(rows) {
      const end = Math.min(h, row + rows);
      for (; row < end; row++) {
        const v = (row + 0.5) / h;
        const pole = smooth(0.72, 0.99, Math.abs(2 * v - 1));
        /* 위도마다 가로로 밀어 놓으면 지형이 띠처럼 늘어진다 */
        const slide = (shear(0, v) - 0.5) * 0.42;
        for (let x = 0; x < w; x++) {
          const u = (x + 0.5) / w;
          const uu = u + slide + (warp(u, v) - 0.5) * 0.05;

          let hh = fbm(oct, uu, v);
          hh = smooth(0.28, 0.8, hh);
          crust(hh, rgb);

          /* 깊은 분지 바닥에서 은근하게 배어 나오는 열.
             선으로 그으면 회로 기판처럼 보여서, 넓게 번지는 기운으로만 남긴다 */
          const seam = smooth(0.58, 0.8, warp(uu, v));
          if (seam > 0.01) {
            const ember = seam * (1 - smooth(0.02, 0.13, hh)) * (0.4 + 0.6 * fbm(vein, uu, v));
            rgb[0] += 54 * ember;
            rgb[1] += 20 * ember;
            rgb[2] += 6 * ember;
          }

          /* 극관 */
          rgb[0] = lerp(rgb[0], 188 + hh * 44, pole * 0.8);
          rgb[1] = lerp(rgb[1], 206 + hh * 38, pole * 0.8);
          rgb[2] = lerp(rgb[2], 230 + hh * 22, pole * 0.8);

          const p = (row * w + x) * 4;
          bd[p] = rgb[0];
          bd[p + 1] = rgb[1];
          bd[p + 2] = rgb[2] * 1.04;
          bd[p + 3] = 255;

          /* 구름은 위도 방향으로 얇게 늘어진 띠 */
          const cu = u + slide * 0.6 + (warp(u, v) - 0.5) * 0.05 + Math.sin(v * Math.PI * 7) * 0.02;
          const c = fbm(puff, cu, v);
          const alpha = smooth(0.56, 0.87, c) * 0.46 * (1 - pole * 0.4);
          cd[p] = 222;
          cd[p + 1] = 232;
          cd[p + 2] = 246;
          cd[p + 3] = alpha * 255;
        }
      }
      return row >= h;
    },
  };
}

/** 정사각도법 텍스처를 구면 세로 배치(y = sin 위도)로 미리 휘어 둔다. 가로로 두 번 이어 붙여 감김을 없앤다. */
function warpToSphere(src, height) {
  const w = src.width;
  const out = document.createElement('canvas');
  out.width = w * 2;
  out.height = height;
  const c = out.getContext('2d');
  const half = height / 2;
  for (let j = 0; j < height; j++) {
    const y = clamp((j + 0.5 - half) / half, -1, 1);
    const v = 0.5 + Math.asin(y) / Math.PI;
    const sy = clamp(v * src.height, 0, src.height - 1);
    c.drawImage(src, 0, sy, w, 1, 0, j, w, 1);
    c.drawImage(src, 0, sy, w, 1, w, j, w, 1);
  }
  return out;
}

/* 고리 구조 — [안쪽, 바깥쪽, 밀도] (행성 반지름 배수) */
const BANDS = [
  [1.15, 1.31, 0.3],
  [1.31, 1.35, 0.06],
  [1.35, 1.69, 1.0],
  [1.69, 1.78, 0.07], // 카시니 간극
  [1.78, 2.0, 0.66],
  [2.0, 2.05, 0.04],
  [2.05, 2.09, 0.46], // 가느다란 바깥 고리
];
const RING_IN = BANDS[0][0];
const RING_OUT = BANDS[BANDS.length - 1][1];

function density(r) {
  for (let i = 0; i < BANDS.length; i++) {
    if (r >= BANDS[i][0] && r < BANDS[i][1]) return BANDS[i][2];
  }
  return 0;
}

/* 알갱이 색 여섯 가지 — 안쪽은 얼음, 바깥쪽은 모래빛 */
const DUST = [
  [232, 240, 250],
  [217, 188, 144],
  [201, 168, 119],
  [143, 179, 221],
  [246, 233, 208],
  [122, 130, 142],
];

/* 빛의 방향은 카메라가 아니라 행성을 기준으로 정한다.
   그래야 시점이 움직여도 그림자가 제자리를 지킨다.

   고도(고리면에서 잰 각)가 중요하다. 반지름 r 인 고리가 행성에 그림자를
   드리우려면 sin(고도) < R/r 이어야 한다. 25°면 2.3R 까지 닿으니
   고리 전체가 행성 위에 그림자를 남긴다. 카메라와 같은 쪽에 두어야
   그 그림자가 우리 눈에 보인다. */
const LIGHT_ELEV = -25 * (Math.PI / 180);
const LIGHT_AZIM = 200 * (Math.PI / 180);
const L0X = Math.cos(LIGHT_ELEV) * Math.cos(LIGHT_AZIM);
const L0Y = Math.sin(LIGHT_ELEV);
const L0Z = Math.cos(LIGHT_ELEV) * Math.sin(LIGHT_AZIM);

export function mountPlanetScene(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 화면 상태 ────────────────────────────── */
  let vw = 0;
  let vh = 0;
  let dpr = 1;
  let R = 200;
  let cx = 0;
  let cy = 0;
  let focal = 1800;
  let cols = 128;
  let small = false;

  /* ── 시점 ─────────────────────────────────── */
  const BASE_TILT = 0.34;
  const BASE_ROLL = -0.235;
  let tilt = BASE_TILT;
  let roll = BASE_ROLL;
  let tiltTo = BASE_TILT;
  let rollTo = BASE_ROLL;
  let aimTilt = 0; // 커서가 더하는 몫
  let aimRoll = 0;
  let shiftX = 0;
  let shiftY = 0;
  let shiftXTo = 0;
  let shiftYTo = 0;
  let boost = 0; // 커서가 가까울 때 살짝 빨라진다
  let boostTo = 0;
  let pulse = 0; // 클릭 파문
  let px = -9999;
  let py = -9999;
  let pointerOn = false;

  /* ── 텍스처 ───────────────────────────────── */
  const TEX_W = 896;
  const TEX_H = 448;
  let oven = null;
  let bodySrc = null;
  let cloudSrc = null;
  let bodyWarp = null;
  let cloudWarp = null;
  let fade = 0; // 텍스처가 준비되면 서서히 드러난다

  /* ── 고리 알갱이 ──────────────────────────── */
  let N = 0;
  let pr, pa, pw, pth, ps, pc, pb;
  /* 행성 앞으로 지나가는 알갱이는 행성을 그린 뒤에 얹어야 한다 */
  let fx, fy, fs, fk;
  let fn = 0;

  const moons = [];
  const rocks = [];
  let builtSmall = null;
  let moonGrad = null;
  let rockGrad = null;

  /* 알갱이 색 × 밝기 8단계 — 매 프레임 문자열을 만들지 않는다 */
  const SWATCH = [];
  for (let i = 0; i < DUST.length; i++) {
    for (let l = 0; l < 8; l++) {
      SWATCH.push(`rgba(${DUST[i][0]},${DUST[i][1]},${DUST[i][2]},${(0.09 + l * 0.104).toFixed(3)})`);
    }
  }

  /* ── 씨앗 ─────────────────────────────────── */
  function seedRing(count) {
    N = count;
    pr = new Float32Array(N);
    pa = new Float32Array(N);
    pw = new Float32Array(N);
    pth = new Float32Array(N);
    ps = new Float32Array(N);
    pc = new Uint8Array(N);
    pb = new Float32Array(N);
    fx = new Float32Array(N);
    fy = new Float32Array(N);
    fs = new Float32Array(N);
    fk = new Uint8Array(N);

    const rand = makeRand(20260826);
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let g = 0; g < 24; g++) {
        r = RING_IN + rand() * (RING_OUT - RING_IN);
        if (rand() < density(r)) break;
      }
      pr[i] = r;
      pa[i] = rand() * TAU;
      /* 케플러 — 안쪽이 빠르다 */
      pw[i] = 0.128 * Math.pow(r, -1.5);
      pth[i] = (rand() - 0.5) * 0.014 * r;
      ps[i] = 0.7 + rand() * rand() * 2.1;
      /* 안쪽은 얼음, 바깥쪽은 모래빛 */
      const icy = 1 - smooth(RING_IN, RING_OUT, r);
      const pick = rand();
      pc[i] =
        pick < icy * 0.5 ? 0 : pick < icy * 0.62 ? 3 : pick < 0.72 ? 1 : pick < 0.86 ? 2 : pick < 0.94 ? 4 : 5;
      pb[i] = 0.35 + rand() * 0.65;
    }
  }

  function seedBodies(moonCount, rockCount) {
    moons.length = 0;
    rocks.length = 0;
    const rand = makeRand(7724);

    for (let i = 0; i < moonCount; i++) {
      /* 너무 멀리 나가면 본문 위를 혼자 떠돌아서 궤도를 고리 근처로 묶어 둔다 */
      const r = 2.26 + i * 0.23 + rand() * 0.13;
      moons.push({
        r,
        a: rand() * TAU,
        w: 0.38 * Math.pow(r, -1.5),
        inc: (rand() - 0.5) * 0.2,
        node: rand() * TAU,
        size: 2.8 + rand() * rand() * 5.4,
        hue: [
          [226, 214, 196],
          [198, 176, 148],
          [166, 178, 196],
          [214, 188, 144],
          [154, 148, 152],
        ][i % 5],
      });
    }

    for (let i = 0; i < rockCount; i++) {
      const belt = rand();
      const r = belt < 0.68 ? 2.14 + rand() * 0.3 : 1.2 + rand() * 0.9;
      const verts = [];
      const n = 7 + ((rand() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * TAU;
        const rr = 0.58 + rand() * 0.42;
        verts.push([Math.cos(ang) * rr, Math.sin(ang) * rr * (0.72 + rand() * 0.3)]);
      }
      const path = new Path2D();
      path.moveTo(verts[0][0], verts[0][1]);
      for (let k = 1; k < verts.length; k++) path.lineTo(verts[k][0], verts[k][1]);
      path.closePath();
      rocks.push({
        r,
        a: rand() * TAU,
        w: 0.128 * Math.pow(r, -1.5),
        inc: (rand() - 0.5) * 0.1,
        node: rand() * TAU,
        size: 1.6 + rand() * rand() * 6.4,
        spin: rand() * TAU,
        spinW: (rand() - 0.5) * 0.9,
        path,
        dark: `rgb(${(22 + rand() * 14) | 0},${(24 + rand() * 12) | 0},${(30 + rand() * 12) | 0})`,
      });
    }
  }

  /* ── 투영 ─────────────────────────────────── */
  let sinT = 0;
  let cosT = 1;
  let sinR = 0;
  let cosR = 1;

  /* 빛을 카메라 좌표로 옮겨 둔 것 */
  let LX = -0.9;
  let LY = -0.09;
  let LZ = -0.43;
  let LXY = 0.9;

  function aimLight() {
    const y1 = L0Y * cosT - L0Z * sinT;
    LZ = L0Y * sinT + L0Z * cosT;
    LX = L0X * cosR - y1 * sinR;
    LY = L0X * sinR + y1 * cosR;
    LXY = Math.sqrt(LX * LX + LY * LY);

    /* 위성과 암석은 단위 좌표계에 만든 명암을 변환만 갈아 끼워 쓴다 */
    moonGrad = ctx.createRadialGradient(LX * 0.62, LY * 0.62, 0.04, 0, 0, 1.55);
    moonGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    moonGrad.addColorStop(0.34, 'rgba(255,255,255,0.5)');
    moonGrad.addColorStop(0.62, 'rgba(255,255,255,0.14)');
    moonGrad.addColorStop(1, 'rgba(255,255,255,0)');

    rockGrad = ctx.createLinearGradient(LX * 1.15, LY * 1.15, -LX * 1.15, -LY * 1.15);
    rockGrad.addColorStop(0, 'rgba(238,220,186,0.92)');
    rockGrad.addColorStop(0.38, 'rgba(150,130,104,0.42)');
    rockGrad.addColorStop(0.72, 'rgba(60,58,58,0.1)');
    rockGrad.addColorStop(1, 'rgba(0,0,0,0)');
  }

  /* 궤도 위 한 점 → 카메라 좌표 (qx, qy, qz) */
  const q = { x: 0, y: 0, z: 0 };
  function orbitPoint(r, a, thick, inc, node) {
    let x = Math.cos(a) * r;
    let z = Math.sin(a) * r;
    let y = thick;
    if (inc) {
      /* 승교점을 기준으로 궤도면을 조금 기울인다 */
      const cn = Math.cos(node);
      const sn = Math.sin(node);
      const along = x * cn + z * sn;
      y += along * inc;
    }
    const y1 = y * cosT - z * sinT;
    const z1 = y * sinT + z * cosT;
    q.x = x * cosR - y1 * sinR;
    q.y = x * sinR + y1 * cosR;
    q.z = z1;
    return q;
  }

  /* ── 레이아웃 ─────────────────────────────── */
  function layout() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.8);
    small = vw < 900;

    canvas.width = Math.max(1, Math.round(vw * dpr));
    canvas.height = Math.max(1, Math.round(vh * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* 고리까지 화면 안에 들어오도록 본체는 작게, 조금 띄워서 앉힌다 */
    R = small
      ? Math.max(96, Math.min(vw, vh) * 0.3)
      : Math.max(150, Math.min(880, vw * 0.7) * 0.31);
    cx = vw - R * 0.46;
    cy = vh - R * 0.72;
    /* 장치 픽셀에 맞춰 두면 버퍼를 옮길 때 흐려지지 않는다 */
    cx = Math.round(cx * dpr) / dpr;
    cy = Math.round(cy * dpr) / dpr;
    focal = R * 16;
    cols = clamp(Math.round(R / 2.1), 64, 190);

    const want = small ? 700 : clamp(Math.round(R * 6.4), 1100, 2400);
    if (want !== N) seedRing(want);
    if (builtSmall !== small) {
      builtSmall = small;
      seedBodies(small ? 3 : 5, small ? 12 : 30);
    }

    if (bodySrc) rewarp();
  }

  function rewarp() {
    const h = Math.min(Math.round(2 * R * dpr), 820);
    bodyWarp = warpToSphere(bodySrc, h);
    cloudWarp = warpToSphere(cloudSrc, h);
  }

  /* ── 구면에 텍스처 감기 ─────────────────────────────────
     본 화면에 바로 썰어 붙이면 반투명한 구름층에서 컬럼이 겹쳐
     세로 줄무늬가 생긴다. 그래서 장치 픽셀에 딱 맞는 별도 캔버스에
     정수 경계로 그린 뒤 통째로 한 번 옮긴다. */
  let buf = null;
  let bufCtx = null;

  function ensureBuf() {
    const size = Math.max(4, Math.ceil(2 * R * dpr));
    if (!buf || buf.width !== size) {
      buf = document.createElement('canvas');
      buf.width = size;
      buf.height = size;
      bufCtx = buf.getContext('2d');
    }
    return size;
  }

  function wrapLayer(img, rot, alpha, size) {
    const rad = size / 2;
    const h = img.height;
    bufCtx.globalAlpha = alpha;
    let x0 = 0;
    for (let i = 1; i <= cols; i++) {
      const x1 = Math.round((i / cols) * size);
      if (x1 <= x0) continue;
      const l0 = Math.asin(clamp((x0 - rad) / rad, -1, 1));
      const l1 = Math.asin(clamp((x1 - rad) / rad, -1, 1));
      let u0 = (rot + l0) / TAU;
      u0 -= Math.floor(u0);
      const sw = Math.min(((l1 - l0) / TAU) * TEX_W, TEX_W * 0.5);
      bufCtx.drawImage(img, u0 * TEX_W, 0, sw, h, x0, 0, x1 - x0, size);
      x0 = x1;
    }
    bufCtx.globalAlpha = 1;
  }

  /** 행성 본체를 버퍼에 그리고 화면으로 옮긴다 */
  function paintSphere(rot) {
    const size = ensureBuf();
    const rad = size / 2;
    bufCtx.setTransform(1, 0, 0, 1, 0, 0);
    bufCtx.clearRect(0, 0, size, size);
    bufCtx.save();
    bufCtx.beginPath();
    bufCtx.arc(rad, rad, rad, 0, TAU);
    bufCtx.clip();

    if (!bodyWarp || fade < 1) {
      /* 텍스처가 아직 안 구워졌을 때 쓰는 민무늬 구 */
      const g = bufCtx.createRadialGradient(
        rad + LX * rad * 0.5,
        rad + LY * rad * 0.5,
        rad * 0.05,
        rad,
        rad,
        rad * 1.15
      );
      g.addColorStop(0, '#33363c');
      g.addColorStop(0.45, '#1c1f26');
      g.addColorStop(1, '#0a0c11');
      bufCtx.fillStyle = g;
      bufCtx.fillRect(0, 0, size, size);
    }
    if (bodyWarp && fade > 0) {
      wrapLayer(bodyWarp, rot, fade, size);
      wrapLayer(cloudWarp, rot * 1.14 - 0.4, fade * 0.9, size);
    }
    bufCtx.restore();

    ctx.drawImage(buf, cx - R, cy - R, R * 2, R * 2);
  }

  /* ── 고리 그림자 ──────────────────────────── */
  /** 고리 위의 점에서 빛 반대쪽으로 광선을 쏴 구와 만나는 화면 좌표를 구한다 */
  function shadowHit(qx, qy, qz, out) {
    const b = qx * LX + qy * LY + qz * LZ;
    if (b <= 0) return false;
    const disc = b * b - (qx * qx + qy * qy + qz * qz) + R * R;
    if (disc <= 0) return false;
    const s = b - Math.sqrt(disc);
    if (s <= 0) return false;
    const hz = qz - s * LZ;
    if (hz > 0) return false; // 뒤통수에 진 그림자는 보이지 않는다
    const hx = qx - s * LX;
    const hy = qy - s * LY;
    const k = focal / (focal + hz);
    out[0] = cx + hx * k;
    out[1] = cy + hy * k;
    return true;
  }

  const hitA = [0, 0];
  const hitB = [0, 0];
  const hitC = [0, 0];
  const hitD = [0, 0];

  function ringShadow() {
    const STEPS = 68;
    ctx.globalCompositeOperation = 'source-atop';
    for (let bi = 0; bi < BANDS.length; bi++) {
      const [r0, r1, d] = BANDS[bi];
      if (d < 0.1) continue;
      ctx.fillStyle = `rgba(3,4,7,${(0.2 + d * 0.5).toFixed(3)})`;
      ctx.beginPath();
      let open = false;
      for (let i = 0; i < STEPS; i++) {
        /* 고리는 회전 대칭이라 그림자는 제자리에 머문다 */
        const a0 = (i / STEPS) * TAU;
        const a1 = ((i + 1) / STEPS) * TAU;
        const p0 = orbitPoint(r0 * R, a0, 0, 0, 0);
        const ok0 = shadowHit(p0.x, p0.y, p0.z, hitA);
        const p1 = orbitPoint(r1 * R, a0, 0, 0, 0);
        const ok1 = shadowHit(p1.x, p1.y, p1.z, hitB);
        const p2 = orbitPoint(r1 * R, a1, 0, 0, 0);
        const ok2 = shadowHit(p2.x, p2.y, p2.z, hitC);
        const p3 = orbitPoint(r0 * R, a1, 0, 0, 0);
        const ok3 = shadowHit(p3.x, p3.y, p3.z, hitD);
        if (!(ok0 && ok1 && ok2 && ok3)) continue;
        ctx.moveTo(hitA[0], hitA[1]);
        ctx.lineTo(hitB[0], hitB[1]);
        ctx.lineTo(hitC[0], hitC[1]);
        ctx.lineTo(hitD[0], hitD[1]);
        ctx.closePath();
        open = true;
      }
      if (open) ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ── 고리 안개 — 알갱이 사이를 메우는 옅은 띠 ─────────────
     알갱이와 같은 원근으로 찍어야 가장자리가 어긋나지 않는다.
     sin(a) > 0 쪽이 행성 뒤, 그 반대가 앞이다. */
  const HAZE_STEPS = 30;
  function ringHaze(front) {
    const a0 = front ? Math.PI : 0;
    for (let bi = 0; bi < BANDS.length; bi++) {
      const [r0, r1, d] = BANDS[bi];
      if (d < 0.1) continue;
      ctx.beginPath();
      for (let i = 0; i <= HAZE_STEPS; i++) {
        const a = a0 + (i / HAZE_STEPS) * Math.PI;
        const p = orbitPoint(r1 * R, a, 0, 0, 0);
        const k = focal / (focal + p.z);
        const X = cx + p.x * k;
        const Y = cy + p.y * k;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      for (let i = HAZE_STEPS; i >= 0; i--) {
        const a = a0 + (i / HAZE_STEPS) * Math.PI;
        const p = orbitPoint(r0 * R, a, 0, 0, 0);
        const k = focal / (focal + p.z);
        ctx.lineTo(cx + p.x * k, cy + p.y * k);
      }
      ctx.closePath();
      /* 안쪽 띠는 얼음빛, 바깥쪽은 모래빛으로 조금씩 다르게 */
      const icy = 1 - smooth(RING_IN, RING_OUT, (r0 + r1) / 2);
      ctx.fillStyle = `rgba(${(196 + icy * 26) | 0},${(186 + icy * 24) | 0},${(166 + icy * 32) | 0},${(
        d * 0.115
      ).toFixed(3)})`;
      ctx.fill();
    }
  }

  /* ── 한 프레임 ────────────────────────────── */
  let t = 0;

  function frame(dt) {
    /* 시점은 목표값을 향해 느긋하게 따라간다 */
    const k = 1 - Math.exp(-dt * 3.4);
    tilt += (tiltTo - tilt) * k;
    roll += (rollTo - roll) * k;
    shiftX += (shiftXTo - shiftX) * k;
    shiftY += (shiftYTo - shiftY) * k;
    boost += (boostTo - boost) * (1 - Math.exp(-dt * 2.2));
    pulse *= Math.exp(-dt * 1.6);

    sinT = Math.sin(tilt);
    cosT = Math.cos(tilt);
    sinR = Math.sin(roll);
    cosR = Math.cos(roll);
    aimLight();

    const ox = cx;
    const oy = cy;
    cx += shiftX;
    cy += shiftY;

    /* 장면이 차지하는 사각형만 지운다 */
    const pad = RING_OUT * R * 1.28;
    const l = Math.max(0, cx - pad);
    const tp = Math.max(0, cy - pad);
    ctx.clearRect(l, tp, Math.min(vw, cx + pad) - l, Math.min(vh, cy + pad) - tp);

    const rot = -t * 0.057;
    const glow = 1 + boost * 0.45;

    /* 1. 뒤쪽 안개 */
    ringHaze(false);

    /* 2. 알갱이 — 뒤쪽은 지금, 앞쪽은 행성 뒤에 */
    fn = 0;
    const push = 78 + boost * 34;
    const push2 = push * push;
    for (let i = 0; i < N; i++) {
      const r = pr[i] * R * (1 + pulse * 0.05 * Math.sin(pr[i] * 7 - t * 2));
      const p = orbitPoint(r, pa[i] + t * pw[i], pth[i] * R, 0, 0);
      const qx = p.x;
      const qy = p.y;
      const qz = p.z;
      const sc = focal / (focal + qz);
      let X = cx + qx * sc;
      let Y = cy + qy * sc;

      /* 행성 뒤로 숨는 구간 */
      const behind = qz > 0;
      if (behind) {
        const dx = X - cx;
        const dy = Y - cy;
        if (dx * dx + dy * dy < R * R) continue;
      }

      /* 커서가 다가오면 옆으로 비킨다 */
      if (pointerOn) {
        const mx = X - px;
        const my = Y - py;
        const m2 = mx * mx + my * my;
        if (m2 < push2 && m2 > 0.01) {
          const m = Math.sqrt(m2);
          const f = (1 - m / push) * (1 - m / push) * 16;
          X += (mx / m) * f;
          Y += (my / m) * f;
        }
      }

      /* 행성 그림자에 들어가면 어두워진다 */
      const b = qx * LX + qy * LY + qz * LZ;
      let shade = 1;
      if (b < 0) {
        const perp2 =
          qx * qx + qy * qy + qz * qz - b * b;
        if (perp2 < R * R) shade = 0.16 + 0.84 * smooth(0.55, 1.0, Math.sqrt(perp2) / R);
      }
      /* 앞쪽 알갱이는 정면 산란이 약해 조금 어둡다 */
      const lit = shade * (behind ? 1 : 0.82) * pb[i] * glow;
      const lvl = clamp((lit * 5.8) | 0, 0, 7);
      const size = ps[i] * sc;

      if (behind) {
        ctx.fillStyle = SWATCH[pc[i] * 8 + lvl];
        ctx.fillRect(X - size * 0.5, Y - size * 0.5, size, size);
      } else {
        fx[fn] = X;
        fy[fn] = Y;
        fs[fn] = size;
        fk[fn] = pc[i] * 8 + lvl;
        fn++;
      }
    }

    /* 3. 뒤쪽 위성·암석 */
    drawBodies(true);

    /* 4. 행성 */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();

    paintSphere(rot);
    ringShadow();

    /* 낮과 밤.
       구 위의 밝기는 n·L 인데, 태양 바로 아래 점에서 잰 거리로 바꾸면
       거의 동심원이 된다. 그래서 그 점을 중심으로 한 방사 그라디언트면 충분하다. */
    const sunX = cx + LX * R;
    const sunY = cy + LY * R;
    const term = ctx.createRadialGradient(sunX, sunY, R * 0.05, sunX, sunY, R * (1 + LXY));
    term.addColorStop(0, 'rgba(0,0,0,0)');
    term.addColorStop(0.36, 'rgba(4,6,11,0.1)');
    term.addColorStop(0.56, 'rgba(4,5,10,0.42)');
    term.addColorStop(0.72, 'rgba(3,4,8,0.7)');
    term.addColorStop(0.86, 'rgba(1,2,5,0.9)');
    term.addColorStop(1, 'rgba(0,0,0,0.93)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = term;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    /* 가장자리 감쇠 */
    const limb = ctx.createRadialGradient(cx, cy, R * 0.74, cx, cy, R);
    limb.addColorStop(0, 'rgba(0,0,0,0)');
    limb.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = limb;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    /* 해 바로 아래는 따뜻하게 달아오른다 */
    const sheen = ctx.createRadialGradient(sunX, sunY, R * 0.04, sunX, sunY, R * 1.15);
    sheen.addColorStop(0, `rgba(255,226,178,${(0.22 * glow).toFixed(3)})`);
    sheen.addColorStop(0.45, 'rgba(214,186,146,0.08)');
    sheen.addColorStop(1, 'rgba(150,178,214,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = sheen;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    /* 5. 대기 — 빛 받는 쪽 테두리가 밝게 탄다 */
    ctx.globalCompositeOperation = 'lighter';
    const air = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.3);
    air.addColorStop(0, 'rgba(126,174,228,0)');
    air.addColorStop(0.22, `rgba(122,172,226,${(0.2 * glow).toFixed(3)})`);
    air.addColorStop(0.55, `rgba(104,150,204,${(0.07 * glow).toFixed(3)})`);
    air.addColorStop(1, 'rgba(88,132,186,0)');
    ctx.fillStyle = air;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.3, 0, TAU);
    ctx.fill();

    const ang = Math.atan2(LY, LX);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.994, ang - 1.24, ang + 1.24);
    ctx.strokeStyle = `rgba(236,226,206,${(0.2 * glow).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, R * 0.008);
    ctx.shadowBlur = R * 0.12;
    ctx.shadowColor = 'rgba(226,204,166,0.6)';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';

    /* 6. 앞쪽 안개 → 앞쪽 알갱이 → 앞쪽 위성 */
    ringHaze(true);
    for (let i = 0; i < fn; i++) {
      ctx.fillStyle = SWATCH[fk[i]];
      ctx.fillRect(fx[i] - fs[i] * 0.5, fy[i] - fs[i] * 0.5, fs[i], fs[i]);
    }
    drawBodies(false);

    cx = ox;
    cy = oy;
  }

  /* ── 위성과 암석 ──────────────────────────── */
  function drawBodies(behind) {
    for (let i = 0; i < moons.length; i++) {
      const m = moons[i];
      const p = orbitPoint(m.r * R, m.a + t * m.w, 0, m.inc, m.node);
      if (p.z > 0 !== behind) continue;
      const sc = focal / (focal + p.z);
      const X = cx + p.x * sc;
      const Y = cy + p.y * sc;
      const dx = X - cx;
      const dy = Y - cy;
      const hidden = p.z > 0 && dx * dx + dy * dy < R * R;
      if (hidden) continue;

      const s = m.size * sc;
      const inShadow = shadowFactor(p.x, p.y, p.z);
      ctx.save();
      ctx.translate(X, Y);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fillStyle = `rgb(${(m.hue[0] * 0.22) | 0},${(m.hue[1] * 0.22) | 0},${(m.hue[2] * 0.24) | 0})`;
      ctx.fill();
      ctx.globalAlpha = inShadow;
      ctx.fillStyle = moonGrad;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    for (let i = 0; i < rocks.length; i++) {
      const k = rocks[i];
      const p = orbitPoint(k.r * R, k.a + t * k.w, 0, k.inc, k.node);
      if (p.z > 0 !== behind) continue;
      const sc = focal / (focal + p.z);
      const X = cx + p.x * sc;
      const Y = cy + p.y * sc;
      if (p.z > 0) {
        const dx = X - cx;
        const dy = Y - cy;
        if (dx * dx + dy * dy < R * R) continue;
      }
      const s = k.size * sc;
      const lit = shadowFactor(p.x, p.y, p.z);
      ctx.save();
      ctx.translate(X, Y);
      ctx.scale(s, s);
      ctx.rotate(k.spin + t * k.spinW);
      ctx.fillStyle = k.dark;
      ctx.fill(k.path);
      ctx.clip(k.path);
      ctx.rotate(-(k.spin + t * k.spinW));
      ctx.globalAlpha = lit;
      ctx.fillStyle = rockGrad;
      ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
      ctx.restore();
    }
  }

  /** 행성 그림자 원기둥 안이면 어두워진다 */
  function shadowFactor(qx, qy, qz) {
    const b = qx * LX + qy * LY + qz * LZ;
    if (b >= 0) return 1;
    const perp2 = qx * qx + qy * qy + qz * qz - b * b;
    if (perp2 >= R * R) return 1;
    return 0.12 + 0.88 * smooth(0.6, 1.0, Math.sqrt(perp2) / R);
  }

  /* ── 입력 ─────────────────────────────────── */
  function onMove(e) {
    px = e.clientX;
    py = e.clientY;
    pointerOn = true;
    const nx = (px / vw) * 2 - 1;
    const ny = (py / vh) * 2 - 1;
    aimTilt = -ny * 0.17;
    aimRoll = nx * 0.06;
    shiftXTo = -nx * R * 0.035;
    shiftYTo = -ny * R * 0.028;
    const dx = px - cx;
    const dy = py - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    boostTo = 1 - smooth(R * 0.9, R * 2.6, d);
  }

  function onLeave() {
    pointerOn = false;
    boostTo = 0;
    aimTilt = 0;
    aimRoll = 0;
    shiftXTo = 0;
    shiftYTo = 0;
  }

  function onDown() {
    if (boostTo > 0.05) pulse = 1;
  }

  let scrollBase = window.scrollY;
  function onScroll() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? clamp(window.scrollY / h, 0, 1) : 0;
    scrollBase = p;
  }

  /* ── 루프 ─────────────────────────────────── */
  let raf = 0;
  let last = 0;
  let running = false;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    /* 스크롤을 내릴수록 고리 면이 아주 조금 눕고, 그 위에 커서가 얹힌다 */
    tiltTo = clamp(BASE_TILT + scrollBase * 0.1 + aimTilt, 0.12, 0.54);
    rollTo = BASE_ROLL + aimRoll;

    t += dt * (1 + boost * 0.9);
    if (oven && !oven.done) {
      oven.step(28);
      if (oven.done) finishTextures();
    }
    if (bodyWarp && fade < 1) fade = Math.min(1, fade + dt * 1.4);
    frame(dt);
  }

  function finishTextures() {
    bodySrc = document.createElement('canvas');
    bodySrc.width = TEX_W;
    bodySrc.height = TEX_H;
    bodySrc.getContext('2d').putImageData(oven.body, 0, 0);
    cloudSrc = document.createElement('canvas');
    cloudSrc.width = TEX_W;
    cloudSrc.height = TEX_H;
    cloudSrc.getContext('2d').putImageData(oven.cloud, 0, 0);
    rewarp();
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  /* ── 시작 ─────────────────────────────────── */
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      layout();
      if (still) drawOnce();
    }, 160);
  }

  function drawOnce() {
    sinT = Math.sin(tilt);
    cosT = Math.cos(tilt);
    sinR = Math.sin(roll);
    cosR = Math.cos(roll);
    aimLight();
    t = 26;
    fade = bodyWarp ? 1 : 0;
    frame(0.016);
  }

  layout();
  oven = bakeTextures(TEX_W, TEX_H, 20260826);

  if (still) {
    /* 움직임을 줄여달라고 한 사람에게는 한 장만 그려 준다.
       텍스처도 유휴 시간에 나눠 구워서 첫 화면을 붙잡지 않는다. */
    const idle =
      window.requestIdleCallback || ((fn) => window.setTimeout(() => fn({ timeRemaining: () => 8 }), 24));
    const bake = () => {
      oven.step(48);
      if (oven.done) {
        finishTextures();
        drawOnce();
      } else idle(bake);
    };
    drawOnce();
    idle(bake);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }

  const onVis = () => (document.hidden ? stop() : start());
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerleave', onLeave, { passive: true });
  window.addEventListener('blur', onLeave);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  onScroll();
  start();

  return () => {
    stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVis);
  };
}
