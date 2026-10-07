// Canvas renderer. All world drawing happens in "cell units" (1 unit = 1 grid cell).
import { WORLDS } from './config.js';

const TAU = Math.PI * 2;
const FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));
const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starPath(ctx, x, y, r, inner = 0.45, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + i * Math.PI / points;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.closePath();
}

function applePath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.62);
  ctx.bezierCurveTo(r * 0.5, -r * 1.02, r * 1.12, -r * 0.62, r * 0.98, r * 0.08);
  ctx.bezierCurveTo(r * 0.9, r * 0.7, r * 0.42, r * 1.02, 0, r * 0.88);
  ctx.bezierCurveTo(-r * 0.42, r * 1.02, -r * 0.9, r * 0.7, -r * 0.98, r * 0.08);
  ctx.bezierCurveTo(-r * 1.12, -r * 0.62, -r * 0.5, -r * 1.02, 0, -r * 0.62);
  ctx.closePath();
}

const BITE_SPOTS = [[0.98, -0.18], [-0.92, 0.42], [0.42, 0.92], [-0.62, -0.72], [0.78, 0.62], [-0.15, 1.0]];

// Draws an apple centred on (cx, cy) with radius r. Shared by the game and the menus.
export function drawApple(ctx, cx, cy, r, o = {}) {
  const skin = o.skin;
  const time = o.time || 0;
  ctx.save();
  ctx.translate(cx, cy);
  if (o.rotate) ctx.rotate(o.rotate);
  ctx.scale(o.sx || 1, o.sy || 1);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;

  if (skin.stick) {
    ctx.fillStyle = '#e9c891';
    ctx.strokeStyle = '#a07a45';
    ctx.lineWidth = r * 0.06;
    roundRect(ctx, -r * 0.08, -r * 1.55, r * 0.16, r * 1.1, r * 0.06);
    ctx.fill(); ctx.stroke();
  }

  // Stem and leaf sit behind the body.
  ctx.strokeStyle = '#6d4c2f';
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = 'round';
  if (!skin.stick) {
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.5);
    ctx.quadraticCurveTo(r * 0.02, -r * 0.85, r * 0.16, -r * 1.05);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(r * 0.12, -r * 0.82);
  ctx.rotate(-0.5 + Math.sin(time * 2.2) * 0.12);
  ctx.fillStyle = skin.leaf;
  ctx.beginPath();
  ctx.ellipse(r * 0.38, 0, r * 0.38, r * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath(); ctx.moveTo(r * 0.04, 0); ctx.lineTo(r * 0.7, 0); ctx.stroke();
  ctx.restore();

  // Body, minus any bites.
  const bites = Math.min(o.bites || 0, BITE_SPOTS.length);
  ctx.save();
  if (bites) {
    ctx.beginPath();
    ctx.rect(-r * 3, -r * 3, r * 6, r * 6);
    for (let i = 0; i < bites; i++) {
      const [bx, by] = BITE_SPOTS[i];
      ctx.moveTo(bx * r + r * 0.34, by * r);
      ctx.arc(bx * r, by * r, r * 0.34, 0, TAU);
    }
    ctx.clip('evenodd');
  }
  applePath(ctx, r);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, skin.light);
  g.addColorStop(0.45, skin.base);
  g.addColorStop(1, skin.dark);
  ctx.fillStyle = g;
  ctx.fill();
  if (o.rot) {
    ctx.fillStyle = `rgba(105, 80, 25, ${0.35 * o.rot})`;
    ctx.fill();
    ctx.fillStyle = `rgba(80, 55, 20, ${0.7 * o.rot})`;
    for (const [sx, sy, sr] of [[0.4, 0.25, 0.2], [-0.45, 0.45, 0.14], [0.05, 0.6, 0.11], [-0.25, -0.15, 0.09]]) {
      ctx.beginPath(); ctx.arc(sx * r, sy * r, sr * r, 0, TAU); ctx.fill();
    }
  }
  ctx.lineWidth = r * 0.09;
  ctx.strokeStyle = 'rgba(40,10,10,0.55)';
  ctx.stroke();
  ctx.restore();

  if (bites) {
    ctx.save();
    applePath(ctx, r);
    ctx.clip();
    ctx.strokeStyle = '#fff1cf';
    ctx.lineWidth = r * 0.16;
    for (let i = 0; i < bites; i++) {
      const [bx, by] = BITE_SPOTS[i];
      ctx.beginPath(); ctx.arc(bx * r, by * r, r * 0.34 + r * 0.05, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // Shine.
  ctx.fillStyle = skin.gloss ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.48, -r * 0.3, r * 0.14, r * 0.26, 0.5, 0, TAU);
  ctx.fill();
  if (skin.gloss) {
    ctx.beginPath();
    ctx.ellipse(r * 0.55, r * 0.45, r * 0.07, r * 0.12, -0.6, 0, TAU);
    ctx.fill();
  }
  if (skin.sparkle) {
    for (let i = 0; i < 3; i++) {
      const tw = (Math.sin(time * 3 + i * 2.1) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + tw * 0.7})`;
      starPath(ctx, [0.35, -0.25, 0.5][i] * r, [-0.2, 0.55, 0.4][i] * r, r * (0.08 + tw * 0.08), 0.35, 4);
      ctx.fill();
    }
  }

  if (o.face !== false) {
    const look = o.look || { x: 0, y: 0 };
    const ex = r * 0.3, ey = r * 0.08;
    if (o.dead) {
      ctx.strokeStyle = '#3b1010';
      ctx.lineWidth = r * 0.09;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * ex - r * 0.1, ey - r * 0.1); ctx.lineTo(s * ex + r * 0.1, ey + r * 0.1);
        ctx.moveTo(s * ex + r * 0.1, ey - r * 0.1); ctx.lineTo(s * ex - r * 0.1, ey + r * 0.1);
        ctx.stroke();
      }
    } else if (o.blink) {
      ctx.strokeStyle = '#2b0d0d';
      ctx.lineWidth = r * 0.07;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(s * ex, ey, r * 0.13, 0.2, Math.PI - 0.2); ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(s * ex, ey, r * 0.17, r * (o.scared ? 0.22 : 0.19), 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(40,10,10,0.5)';
        ctx.lineWidth = r * 0.04;
        ctx.stroke();
        ctx.fillStyle = '#2b0d0d';
        const pr = o.scared ? 0.07 : 0.1;
        ctx.beginPath(); ctx.arc(s * ex + look.x * r * 0.07, ey + look.y * r * 0.08, r * pr, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(s * ex + look.x * r * 0.07 - r * 0.035, ey + look.y * r * 0.08 - r * 0.04, r * 0.035, 0, TAU); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,120,150,0.45)';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * r * 0.55, r * 0.36, r * 0.13, r * 0.08, 0, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = '#3b1010';
    ctx.fillStyle = '#5c1a1a';
    ctx.lineWidth = r * 0.07;
    if (o.scared || o.dead) {
      ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 0.09, r * 0.12, 0, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, r * 0.3, r * 0.16, 0.25, Math.PI - 0.25); ctx.stroke();
    }
    if (o.scared && !o.dead) {
      ctx.fillStyle = 'rgba(140,200,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(r * 0.78, -r * 0.35);
      ctx.quadraticCurveTo(r * 0.92, -r * 0.1, r * 0.78, -r * 0.02);
      ctx.quadraticCurveTo(r * 0.64, -r * 0.1, r * 0.78, -r * 0.35);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCore(ctx, cx, cy, r, skin, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#fff1cf';
  ctx.strokeStyle = '#c9a66b';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.7);
  ctx.quadraticCurveTo(-r * 0.05, -r * 0.1, -r * 0.45, r * 0.75);
  ctx.lineTo(r * 0.45, r * 0.75);
  ctx.quadraticCurveTo(r * 0.05, -r * 0.1, r * 0.5, -r * 0.7);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = skin.base;
  ctx.fillRect(-r * 0.55, -r * 0.8, r * 1.1, r * 0.16);
  ctx.fillRect(-r * 0.5, r * 0.7, r * 1.0, r * 0.16);
  ctx.fillStyle = '#4e342e';
  for (const [x, y] of [[-0.08, 0.05], [0.1, 0.2], [-0.05, 0.35]]) {
    ctx.beginPath(); ctx.ellipse(x * r, y * r, r * 0.05, r * 0.09, 0.3, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#6d4c2f';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(r * 0.12, -r * 1.1); ctx.stroke();
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.static = document.createElement('canvas');
    this.staticKey = '';
    this.dpr = 1;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.staticKey = '';
  }

  layout(g) {
    const pad = 0.7;
    this.cs = Math.min(this.w / (g.cols + pad * 2), this.h / (g.rows + pad * 2));
    this.ox = (this.w - g.cols * this.cs) / 2;
    this.oy = (this.h - g.rows * this.cs) / 2;
  }

  toCells(ctx, sx = 0, sy = 0) {
    const d = this.dpr, cs = this.cs;
    ctx.setTransform(d * cs, 0, 0, d * cs, d * (this.ox + sx), d * (this.oy + sy));
  }

  // Converts a client (CSS pixel) point to grid coordinates.
  clientToCell(px, py) {
    return { x: (px - this.ox) / this.cs, y: (py - this.oy) / this.cs };
  }

  buildStatic(g) {
    const c = this.static;
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    const W = WORLDS[g.world];
    const rnd = mulberry32(Math.floor(g.levelSeed));
    const d = this.dpr;

    ctx.setTransform(d, 0, 0, d, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, this.h);
    bg.addColorStop(0, W.bg[0]);
    bg.addColorStop(1, W.bg[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    this.toCells(ctx);
    const { cols, rows } = g;
    // Frame
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    roundRect(ctx, -0.55, -0.4, cols + 1.1, rows + 1.1, 0.7);
    ctx.fill();
    ctx.fillStyle = W.border;
    roundRect(ctx, -0.55, -0.55, cols + 1.1, rows + 1.1, 0.7);
    ctx.fill();
    ctx.strokeStyle = W.borderLight;
    ctx.lineWidth = 0.12;
    roundRect(ctx, -0.45, -0.45, cols + 0.9, rows + 0.9, 0.6);
    ctx.stroke();
    ctx.fillStyle = W.borderLight;
    for (let x = 1; x < cols; x += 2) {
      for (const y of [-0.28, rows + 0.28]) { ctx.beginPath(); ctx.arc(x, y, 0.09, 0, TAU); ctx.fill(); }
    }
    for (let y = 1; y < rows; y += 2) {
      for (const x of [-0.28, cols + 0.28]) { ctx.beginPath(); ctx.arc(x, y, 0.09, 0, TAU); ctx.fill(); }
    }

    // Field
    ctx.save();
    roundRect(ctx, 0, 0, cols, rows, 0.35);
    ctx.clip();
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      ctx.fillStyle = W.grass[(x + y) & 1];
      ctx.fillRect(x, y, 1.02, 1.02);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const r = rnd();
      const px = x + 0.2 + rnd() * 0.6, py = y + 0.2 + rnd() * 0.6;
      if (r < 0.1) {
        ctx.strokeStyle = W.tuft;
        ctx.lineWidth = 0.05;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const a of [-0.5, 0, 0.5]) { ctx.moveTo(px, py + 0.1); ctx.lineTo(px + a * 0.2, py - 0.12); }
        ctx.stroke();
      } else if (r < 0.14) {
        const col = W.deco[Math.floor(rnd() * W.deco.length)];
        ctx.fillStyle = col;
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5;
          ctx.beginPath(); ctx.arc(px + Math.cos(a) * 0.08, py + Math.sin(a) * 0.08, 0.06, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath(); ctx.arc(px, py, 0.045, 0, TAU); ctx.fill();
      } else if (r < 0.16) {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath(); ctx.ellipse(px, py, 0.09, 0.06, 0, 0, TAU); ctx.fill();
      }
    }
    // Inner shade
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 0.35;
    roundRect(ctx, 0, 0, cols, rows, 0.35);
    ctx.stroke();
    ctx.restore();

    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (g.rocks[y * cols + x]) this.drawObstacle(ctx, x, y, W.obstacle, rnd);
    }
  }

  drawObstacle(ctx, x, y, type, rnd) {
    const cx = x + 0.5, cy = y + 0.5;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(cx + 0.05, cy + 0.32, 0.42, 0.14, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 0.06;
    ctx.lineJoin = 'round';
    if (type === 'rock') {
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = i * TAU / n;
        const rr = 0.38 + rnd() * 0.08;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + 0.04 + Math.sin(a) * rr * 0.85);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(cx, cy - 0.4, cx, cy + 0.4);
      g.addColorStop(0, '#b9c2c8'); g.addColorStop(1, '#7d878e');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#4f585e'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(cx - 0.13, cy - 0.15, 0.12, 0.06, -0.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(60,70,75,0.5)'; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(cx + 0.1, cy - 0.1); ctx.lineTo(cx + 0.18, cy + 0.05); ctx.lineTo(cx + 0.1, cy + 0.18); ctx.stroke();
    } else if (type === 'stump') {
      ctx.fillStyle = '#8d5a33'; ctx.strokeStyle = '#4e2f17';
      roundRect(ctx, cx - 0.36, cy - 0.15, 0.72, 0.5, 0.12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0b07a';
      ctx.beginPath(); ctx.ellipse(cx, cy - 0.15, 0.36, 0.17, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#b07c48'; ctx.lineWidth = 0.03;
      for (const s of [0.24, 0.13]) { ctx.beginPath(); ctx.ellipse(cx, cy - 0.15, s, s * 0.47, 0, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = '#7cb342';
      ctx.beginPath(); ctx.ellipse(cx + 0.28, cy + 0.05, 0.08, 0.05, -0.6, 0, TAU); ctx.fill();
    } else if (type === 'cactus') {
      ctx.fillStyle = '#5fae4d'; ctx.strokeStyle = '#2f6b25';
      roundRect(ctx, cx - 0.13, cy - 0.4, 0.26, 0.78, 0.13); ctx.fill(); ctx.stroke();
      roundRect(ctx, cx - 0.38, cy - 0.15, 0.17, 0.32, 0.08); ctx.fill(); ctx.stroke();
      roundRect(ctx, cx + 0.21, cy - 0.28, 0.17, 0.3, 0.08); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5fae4d';
      ctx.fillRect(cx - 0.25, cy + 0.04, 0.14, 0.1);
      ctx.fillRect(cx + 0.1, cy - 0.06, 0.14, 0.1);
      ctx.strokeStyle = '#e8f5c8'; ctx.lineWidth = 0.025;
      for (let i = 0; i < 6; i++) {
        const sx = cx + (rnd() - 0.5) * 0.18, sy = cy - 0.3 + rnd() * 0.55;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 0.05, sy - 0.04); ctx.stroke();
      }
      if (rnd() < 0.5) { ctx.fillStyle = '#ff6f91'; ctx.beginPath(); ctx.arc(cx, cy - 0.42, 0.08, 0, TAU); ctx.fill(); }
    } else if (type === 'ice') {
      const g = ctx.createLinearGradient(cx - 0.4, cy - 0.4, cx + 0.4, cy + 0.4);
      g.addColorStop(0, '#e6fbff'); g.addColorStop(1, '#8fd3f4');
      ctx.fillStyle = g; ctx.strokeStyle = '#4a9cc9';
      roundRect(ctx, cx - 0.4, cy - 0.38, 0.8, 0.76, 0.14); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 0.22, cy + 0.1); ctx.lineTo(cx - 0.05, cy - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 0.05, cy + 0.18); ctx.lineTo(cx + 0.03, cy + 0.05); ctx.stroke();
    } else if (type === 'mushroom') {
      const glow = ctx.createRadialGradient(cx, cy, 0.05, cx, cy, 0.7);
      glow.addColorStop(0, 'rgba(180,255,230,0.45)'); glow.addColorStop(1, 'rgba(180,255,230,0)');
      ctx.fillStyle = glow; ctx.fillRect(cx - 0.7, cy - 0.7, 1.4, 1.4);
      ctx.fillStyle = '#fff4dc'; ctx.strokeStyle = '#8a7a5a';
      roundRect(ctx, cx - 0.1, cy - 0.05, 0.2, 0.4, 0.08); ctx.fill(); ctx.stroke();
      const cap = rnd() < 0.5 ? '#4fd1c5' : '#b388ff';
      ctx.fillStyle = cap; ctx.strokeStyle = '#2b3a55';
      ctx.beginPath(); ctx.ellipse(cx, cy - 0.05, 0.4, 0.3, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [dx, dy, r] of [[-0.18, -0.15, 0.06], [0.1, -0.22, 0.05], [0.22, -0.1, 0.04]]) {
        ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, TAU); ctx.fill();
      }
    } else {
      const cols = ['#ff6b9d', '#7ad7f0', '#ffd166', '#b892ff', '#7ee081'];
      const col = cols[Math.floor(rnd() * cols.length)];
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(80,20,60,0.5)';
      ctx.beginPath();
      ctx.moveTo(cx - 0.4, cy + 0.32);
      ctx.bezierCurveTo(cx - 0.42, cy - 0.45, cx + 0.42, cy - 0.45, cx + 0.4, cy + 0.32);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(cx - 0.28 + rnd() * 0.5, cy - 0.2 + rnd() * 0.45, 0.05, 0.05);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(cx - 0.15, cy - 0.12, 0.07, 0.12, 0.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  draw(g, skin) {
    const ctx = this.ctx;
    this.layout(g);
    const key = `${g.world}|${g.levelSeed}|${g.rockVersion}|${this.canvas.width}x${this.canvas.height}|${g.cols}x${g.rows}`;
    if (key !== this.staticKey) { this.buildStatic(g); this.staticKey = key; }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.static, 0, 0);

    const sh = g.shake * this.cs * 0.18;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    this.shx = sx; this.shy = sy;
    this.toCells(ctx, sx, sy);
    const t = g.time;

    for (const b of g.brambles.values()) this.drawBramble(ctx, b, t, g.params.thornReact);
    for (const p of g.pickups) this.drawPickup(ctx, p, t);
    if (g.decoy) this.drawDecoy(ctx, g.decoy, skin, t);
    if (g.ghost) this.drawGhost(ctx, g, skin, t);

    const live = g.snakes.filter(s => !s.gone);
    for (const s of live) this.drawSnake(ctx, g, s, t, true);
    for (const s of live) this.drawSnake(ctx, g, s, t, false);

    this.drawNerve(ctx, g, t);
    this.drawAppleInGame(ctx, g, skin, t);

    if (WORLDS[g.world].dark) this.drawNight(ctx, g, t);
    if (g.event === 'fog' && !g.demo) this.drawFog(ctx, g, t);
    this.drawParticles(ctx, g);
    if (g.slow > 0) this.drawSlowMo(ctx, g);
    this.drawFloaters(ctx, g, sx, sy);
    this.drawOverlayText(ctx, g);
  }

  drawBramble(ctx, b, t, react = 0) {
    const grow = easeOutBack(clamp01(b.age / 0.3));
    const left = b.life - b.age;
    const wither = left < 2 ? left / 2 : 1;
    const cx = b.x + 0.5, cy = b.y + 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    const s = grow * (0.75 + 0.25 * wither);
    ctx.scale(s, s);
    if (left < 2 && Math.floor(t * 8) % 2) ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0.03, 0.3, 0.42, 0.14, 0, 0, TAU); ctx.fill();
    // thorns
    ctx.fillStyle = wither < 1 ? '#8d6e63' : '#6d4c2f';
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 + b.seed;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.18) * 0.3, Math.sin(a - 0.18) * 0.3);
      ctx.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      ctx.lineTo(Math.cos(a + 0.18) * 0.3, Math.sin(a + 0.18) * 0.3);
      ctx.fill();
    }
    const greens = wither < 1 ? ['#9e9d24', '#827717'] : ['#4c8c2b', '#3b6e20'];
    const blobs = [[-0.14, 0.05, 0.25], [0.15, 0.06, 0.24], [0, -0.12, 0.26], [0, 0.14, 0.2]];
    ctx.strokeStyle = '#24461a';
    ctx.lineWidth = 0.05;
    for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
    blobs.forEach(([x, y, r], i) => { ctx.fillStyle = greens[i % 2]; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(-0.08, -0.18, 0.08, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e53950';
    for (const [x, y] of [[0.12, -0.05], [-0.1, 0.12], [0.05, 0.2]]) { ctx.beginPath(); ctx.arc(x, y, 0.055, 0, TAU); ctx.fill(); }
    // Fresh thorns that snakes haven't noticed yet shimmer, fading as they're spotted.
    if (b.age < react) {
      const k = 1 - b.age / react;
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * k})`;
      ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, 0, 0.42 + (1 - k) * 0.15, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${k})`;
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + i * 2.1;
        starPath(ctx, Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.08, 0.35, 4);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawPickup(ctx, p, t) {
    const left = p.life - p.t;
    if (left < 2.5 && Math.floor(t * 10) % 2) return;
    const pop = easeOutBack(clamp01(p.t / 0.35));
    const bob = Math.sin(t * 4 + p.seed) * 0.07;
    const cx = p.x + 0.5, cy = p.y + 0.5 + bob;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(p.x + 0.5, p.y + 0.82, 0.22 * pop, 0.07 * pop, 0, 0, TAU); ctx.fill();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    if (p.type === 'star') {
      const glow = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 0.55);
      glow.addColorStop(0, 'rgba(255,240,150,0.6)'); glow.addColorStop(1, 'rgba(255,240,150,0)');
      ctx.fillStyle = glow; ctx.fillRect(-0.6, -0.6, 1.2, 1.2);
      ctx.rotate(Math.sin(t * 2 + p.seed) * 0.3);
      starPath(ctx, 0, 0, 0.32);
      ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.strokeStyle = '#c98a00'; ctx.lineWidth = 0.05; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(-0.07, -0.08, 0.06, 0, TAU); ctx.fill();
    } else if (p.type === 'seed') {
      ctx.fillStyle = '#8d5a33'; ctx.strokeStyle = '#4e2f17'; ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(0, -0.18);
      ctx.bezierCurveTo(0.22, -0.05, 0.2, 0.28, 0, 0.3);
      ctx.bezierCurveTo(-0.2, 0.28, -0.22, -0.05, 0, -0.18);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#5fae4d'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(0, -0.16); ctx.quadraticCurveTo(0.02, -0.32, 0.12, -0.38); ctx.stroke();
      ctx.fillStyle = '#7cc94a';
      ctx.beginPath(); ctx.ellipse(0.17, -0.38, 0.1, 0.05, -0.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-0.07, -0.33, 0.08, 0.04, 0.5, 0, TAU); ctx.fill();
    } else {
      const s = 1 + Math.sin(t * 6) * 0.08;
      ctx.scale(s, s);
      heartPath(ctx, 0, 0, 0.3);
      ctx.fillStyle = '#ff4d7a'; ctx.fill();
      ctx.strokeStyle = '#a3123b'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(-0.12, -0.12, 0.06, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawDecoy(ctx, d, skin, t) {
    const cx = d.x + 0.5, cy = d.y + 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    const glow = ctx.createRadialGradient(cx, cy, 0.1, cx, cy, 0.9);
    glow.addColorStop(0, `rgba(255,245,160,${0.5 + pulse * 0.3})`);
    glow.addColorStop(1, 'rgba(255,245,160,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    const left = d.life - d.t;
    drawApple(ctx, cx, cy, 0.36, { skin, face: false, time: t, alpha: left < 1.5 && Math.floor(t * 10) % 2 ? 0.4 : 0.9 });
    ctx.fillStyle = '#ffffff';
    starPath(ctx, cx + 0.3, cy - 0.3, 0.1 + pulse * 0.06, 0.35, 4);
    ctx.fill();
  }

  snakePoints(g, s) {
    const t = g.snakeRenderT(s);
    const body = s.body, old = s.old;
    const n = body.length;
    const pts = [];
    const h0 = old[0] || body[0];
    pts.push({ x: lerp(h0.x, body[0].x, t), y: lerp(h0.y, body[0].y, t) });
    for (let i = 1; i < n - 1; i++) pts.push(body[i]);
    const tf = old[old.length - 1], tt = body[n - 1];
    pts.push({ x: lerp(tf.x, tt.x, t), y: lerp(tf.y, tt.y, t) });
    return pts;
  }

  drawSnake(ctx, g, s, t, shadowPass) {
    const all = this.snakePoints(g, s);
    const pts = all.slice(s.popped).map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }));
    const N = pts.length;
    if (!N) return;
    const sp = s.species;
    const W = s.boss ? 0.8 : 0.72;
    const taperStart = Math.max(1, N - 6);
    const wAt = i => (i < taperStart ? W : W * (1 - 0.6 * (i - taperStart) / Math.max(1, N - 1 - taperStart)));

    let bodyCol = sp.body, darkCol = sp.dark, bellyCol = sp.belly, patCol = sp.patternColor;
    if (s.golden) { bodyCol = '#f6c21c'; darkCol = '#9a6b00'; bellyCol = '#fff5c2'; patCol = '#d99a00'; }
    if (s.sick && !s.dead) {
      // Sickly green with a purple bruise that pulses as it withers.
      const p = 0.5 + 0.5 * Math.sin(t * 6);
      bodyCol = p > 0.5 ? '#9fbf5a' : '#95b552'; darkCol = '#5b3f7a'; bellyCol = '#e6ee9c'; patCol = '#8e44ad';
    }
    if (s.dead && s.deadT < 0.7 && Math.floor(s.deadT * 14) % 2) { bodyCol = '#ffffff'; bellyCol = '#ffffff'; }
    else if (s.dead && s.cause === 'poison') { bodyCol = '#8fb35a'; darkCol = '#5b4a7a'; bellyCol = '#c5e1a5'; }
    else if (s.dead) { bodyCol = '#a0a0a0'; darkCol = '#606060'; bellyCol = '#d0d0d0'; }

    const stroke = (col, extra, dx = 0, dy = 0, widthMul = 1) => {
      ctx.strokeStyle = col;
      if (N === 1) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(pts[0].x + dx, pts[0].y + dy, (wAt(0) * widthMul + extra) / 2, 0, TAU); ctx.fill();
        return;
      }
      for (let i = N - 1; i >= 1; i--) {
        ctx.lineWidth = wAt(i) * widthMul + extra;
        ctx.beginPath();
        ctx.moveTo(pts[i].x + dx, pts[i].y + dy);
        ctx.lineTo(pts[i - 1].x + dx, pts[i - 1].y + dy);
        ctx.stroke();
      }
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (shadowPass) {
      stroke('rgba(0,0,0,0.18)', 0.04, 0.06, 0.14);
      ctx.restore();
      return;
    }
    if (s.golden && !s.dead) {
      // A warm, breathing halo marks the snake worth 3x.
      ctx.shadowColor = 'rgba(255, 200, 0, 0.9)';
      ctx.shadowBlur = (16 + Math.sin(t * 4) * 6) * this.dpr;
    }
    stroke(darkCol, 0.1);
    ctx.shadowBlur = 0;
    stroke(bodyCol, 0);
    ctx.globalAlpha = 0.55;
    stroke(bellyCol, 0, -0.04, -0.06, 0.32);
    ctx.globalAlpha = 1;

    // Pattern
    ctx.fillStyle = s.dead ? 'rgba(0,0,0,0.2)' : patCol;
    ctx.strokeStyle = s.dead ? 'rgba(0,0,0,0.2)' : patCol;
    for (let i = 2; i < N - 1; i += 2) {
      const p = pts[i], q = pts[i - 1];
      const ang = Math.atan2(p.y - q.y, p.x - q.x);
      const w = wAt(i);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      if (sp.pattern === 'spots') {
        ctx.beginPath(); ctx.arc(0, -w * 0.22, w * 0.11, 0, TAU); ctx.arc(0, w * 0.22, w * 0.11, 0, TAU); ctx.fill();
      } else if (sp.pattern === 'stripes') {
        ctx.lineWidth = w * 0.18;
        ctx.beginPath(); ctx.moveTo(0, -w * 0.42); ctx.lineTo(0, w * 0.42); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-w * 0.2, 0); ctx.lineTo(0, -w * 0.2); ctx.lineTo(w * 0.2, 0); ctx.lineTo(0, w * 0.2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    if (s.golden && !s.dead) {
      for (let i = 1; i < N; i += 3) {
        const tw = (Math.sin(t * 5 + i * 1.7) + 1) / 2;
        if (tw < 0.6) continue;
        ctx.fillStyle = `rgba(255,255,255,${(tw - 0.6) * 2.2})`;
        starPath(ctx, pts[i].x + 0.12, pts[i].y - 0.15, 0.06 + tw * 0.08, 0.35, 4);
        ctx.fill();
      }
    }

    if (s.popped > 0) { ctx.restore(); return; }

    // Head
    const hp = pts[0];
    let ang = Math.atan2(s.dir.y, s.dir.x);
    if (N > 1) {
      const dx = hp.x - pts[1].x, dy = hp.y - pts[1].y;
      if (Math.abs(dx) + Math.abs(dy) > 0.05) ang = Math.atan2(dy, dx);
    }
    const windup = s.lunge === 'windup';
    const fast = s.lunge === 'go';
    ctx.translate(hp.x, hp.y);
    if (windup) ctx.translate((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08);
    ctx.rotate(ang);
    if (windup) ctx.translate(-0.12, 0);
    const hs = s.boss ? 1.15 : 1;
    ctx.scale(hs, hs);

    if (sp.hood) {
      ctx.fillStyle = darkCol;
      ctx.beginPath(); ctx.ellipse(-0.2, 0, 0.3, 0.62, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = bodyCol;
      ctx.beginPath(); ctx.ellipse(-0.2, 0, 0.24, 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = bellyCol;
      ctx.beginPath(); ctx.ellipse(-0.18, -0.25, 0.07, 0.1, 0, 0, TAU); ctx.ellipse(-0.18, 0.25, 0.07, 0.1, 0, 0, TAU); ctx.fill();
    }

    const open = s.chomp > 0 ? Math.sin((s.chomp / 0.5) * Math.PI) : 0;
    ctx.fillStyle = darkCol;
    ctx.beginPath(); ctx.ellipse(0.04, 0, 0.5, 0.43, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.ellipse(0.04, 0, 0.45, 0.38, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(-0.02, -0.15, 0.25, 0.1, 0, 0, TAU); ctx.fill();
    if (open > 0) {
      ctx.fillStyle = '#5d1a2a';
      ctx.beginPath(); ctx.moveTo(0.05, 0); ctx.arc(0.05, 0, 0.44, -0.7 * open, 0.7 * open); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0.3, -0.18 * open); ctx.lineTo(0.38, -0.05 * open); ctx.lineTo(0.42, -0.2 * open); ctx.fill();
    }
    // nostrils
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.arc(0.38, -0.09, 0.025, 0, TAU); ctx.arc(0.38, 0.09, 0.025, 0, TAU); ctx.fill();

    // tongue
    if (s.tongueT > 0 && !s.dead && open <= 0) {
      const ext = Math.sin(Math.PI * (1 - s.tongueT / 0.35)) * 0.32;
      ctx.strokeStyle = '#e53950';
      ctx.lineWidth = 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0.44, 0); ctx.lineTo(0.48 + ext, 0);
      ctx.moveTo(0.48 + ext, 0); ctx.lineTo(0.56 + ext, -0.07);
      ctx.moveTo(0.48 + ext, 0); ctx.lineTo(0.56 + ext, 0.07);
      ctx.stroke();
    }

    // eyes
    const a = g.apple;
    const target = g.decoy || a;
    const wx = target.x + 0.5 - hp.x, wy = target.y + 0.5 - hp.y;
    const wl = Math.hypot(wx, wy) || 1;
    const lx = (wx * Math.cos(-ang) - wy * Math.sin(-ang)) / wl;
    const ly = (wx * Math.sin(-ang) + wy * Math.cos(-ang)) / wl;
    for (const side of [-1, 1]) {
      const ex = 0.12, ey = side * 0.2;
      if (s.dead) {
        ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(ex - 0.08, ey - 0.08); ctx.lineTo(ex + 0.08, ey + 0.08);
        ctx.moveTo(ex + 0.08, ey - 0.08); ctx.lineTo(ex - 0.08, ey + 0.08);
        ctx.stroke();
        continue;
      }
      if (s.blinkT > 0 && !windup) {
        ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 0.045;
        ctx.beginPath(); ctx.moveTo(ex - 0.1, ey); ctx.lineTo(ex + 0.1, ey); ctx.stroke();
        continue;
      }
      ctx.fillStyle = windup || fast ? '#ffd0d0' : '#ffffff';
      ctx.beginPath(); ctx.arc(ex, ey, 0.13, 0, TAU); ctx.fill();
      ctx.strokeStyle = darkCol; ctx.lineWidth = 0.03; ctx.stroke();
      if (s.confused > 0) {
        ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 0.025;
        ctx.beginPath();
        for (let k = 0; k < 12; k++) {
          const aa = k * 0.8 + t * 8, rr = 0.01 + k * 0.009;
          ctx.lineTo(ex + Math.cos(aa) * rr, ey + Math.sin(aa) * rr);
        }
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = windup || fast ? '#d50000' : '#1b1b1b';
      ctx.beginPath();
      ctx.ellipse(ex + lx * 0.05, ey + ly * 0.05, windup ? 0.08 : 0.035, windup ? 0.025 : 0.075, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(ex + lx * 0.05 - 0.03, ey + ly * 0.05 - 0.03, 0.022, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // Head-up markers drawn upright.
    const mx = hp.x, my = hp.y - 0.62 * hs;
    if (s.boss && !s.dead) {
      ctx.save();
      ctx.translate(mx, my + 0.05);
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#a66d00'; ctx.lineWidth = 0.04; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-0.22, 0.08); ctx.lineTo(-0.24, -0.14); ctx.lineTo(-0.11, -0.03); ctx.lineTo(0, -0.2);
      ctx.lineTo(0.11, -0.03); ctx.lineTo(0.24, -0.14); ctx.lineTo(0.22, 0.08); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e53950';
      ctx.beginPath(); ctx.arc(0, -0.01, 0.04, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (windup) this.bubbleText(ctx, mx, my - 0.25, '!', '#ff1744', 0.7);
    else if (s.confused > 0) this.bubbleText(ctx, mx, my - 0.25, '?', '#ffb300', 0.6);
  }

  // Text is drawn in pixel space: some browsers mis-render sub-pixel font sizes.
  bubbleText(ctx, x, y, text, color, size) {
    const d = this.dpr, cs = this.cs;
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    x = this.ox + this.shx + x * cs;
    y = this.oy + this.shy + y * cs;
    size *= cs;
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawAppleInGame(ctx, g, skin, t) {
    const a = g.apple;
    const rp = g.appleRenderPos();
    let cx = rp.x + 0.5, cy = rp.y + 0.5;
    const moving = a.animT < 1;
    const hop = moving ? Math.sin(a.animT * Math.PI) * 0.14 : Math.sin(t * 3) * 0.02;
    cx += a.bumpDir.x * a.bump * 0.12;
    cy += a.bumpDir.y * a.bump * 0.12;
    const drop = a.drop * a.drop * 2.2;

    // Rot timer ring (only the player can see it).
    if (a.rot > 0) {
      const frac = a.rot / g.stats.rotDur;
      ctx.save();
      ctx.strokeStyle = 'rgba(110,80,30,0.85)';
      ctx.lineWidth = 0.07;
      ctx.setLineDash([0.12, 0.08]);
      ctx.beginPath(); ctx.arc(cx, cy, 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    const shs = 1 - Math.min(0.6, hop + drop * 0.3);
    ctx.beginPath(); ctx.ellipse(cx, cy + 0.36, 0.3 * shs, 0.09 * shs, 0, 0, TAU); ctx.fill();

    const heads = g.snakes.filter(s => !s.dead).map(s => s.body[0]);
    let near = null, nd = Infinity;
    for (const h of heads) {
      const d = Math.abs(h.x - a.x) + Math.abs(h.y - a.y);
      if (d < nd) { nd = d; near = h; }
    }
    let look = { x: a.facing.x, y: a.facing.y };
    if (near && nd <= 6) {
      const lx = near.x - rp.x, ly = near.y - rp.y, ll = Math.hypot(lx, ly) || 1;
      look = { x: lx / ll, y: ly / ll };
    }

    const sq = a.squash;
    const horiz = Math.abs(a.facing.x) > 0;
    const sxs = 1 + (horiz ? 0.14 : -0.1) * sq;
    const sys = 1 + (horiz ? -0.1 : 0.14) * sq;
    let alpha = 1;
    if (a.invuln > 0.2 && Math.floor(t * 12) % 2) alpha = 0.4;

    if (a.dying) {
      const d = a.dying;
      const r = 0.4;
      if (d < 0.35) {
        drawApple(ctx, cx + (Math.random() - 0.5) * 0.1, cy, r, { skin, bites: g.stats.maxBites, time: t, dead: true });
      } else {
        const k = easeOutBack(clamp01((d - 0.35) / 0.3));
        drawCore(ctx, cx, cy - (d - 0.35) * 0.3, r * k, skin, 1 - clamp01((d - 1.3) / 0.5));
      }
      return;
    }

    if (a.dashFx > 0) {
      for (let i = 1; i <= 3; i++) {
        const k = i / 4;
        drawApple(ctx, lerp(a.fromX, rp.x, 1 - k) + 0.5, lerp(a.fromY, rp.y, 1 - k) + 0.5, 0.4, { skin, face: false, time: t, alpha: a.dashFx * 0.25 });
      }
    }

    const blink = Math.sin(t * 1.3) > 0.985;
    drawApple(ctx, cx, cy - hop - drop, 0.4, {
      skin, bites: g.stats.maxBites - g.bites, rot: a.rot > 0 ? Math.min(1, a.rot * 3) : 0,
      look, scared: nd <= 3, blink, time: t, sx: sxs, sy: sys, alpha,
    });

    if (a.rot > 0) {
      // Little flies buzzing around the rotten apple.
      ctx.fillStyle = '#2b2b2b';
      for (let i = 0; i < 3; i++) {
        const aa = t * (3 + i) + i * 2.1;
        const fx = cx + Math.cos(aa) * (0.5 + 0.08 * Math.sin(t * 9 + i));
        const fy = cy - 0.15 + Math.sin(aa * 1.3) * 0.38;
        ctx.beginPath(); ctx.arc(fx, fy, 0.04, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const flap = Math.abs(Math.sin(t * 40 + i)) * 0.05;
        ctx.beginPath(); ctx.ellipse(fx - 0.03, fy - 0.04, 0.03, flap + 0.01, 0, 0, TAU); ctx.ellipse(fx + 0.03, fy - 0.04, 0.03, flap + 0.01, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b2b2b';
      }
    }
  }

  // The mirror twin: a translucent reflection, plus the faint mirror line it lives across.
  drawGhost(ctx, g, skin, t) {
    const gh = g.ghost;
    ctx.save();
    ctx.strokeStyle = 'rgba(179,157,219,0.35)';
    ctx.lineWidth = 0.05;
    ctx.setLineDash([0.25, 0.2]);
    ctx.lineDashOffset = -t * 0.6;
    ctx.beginPath(); ctx.moveTo(g.cols / 2, 0); ctx.lineTo(g.cols / 2, g.rows); ctx.stroke();
    ctx.restore();
    const rp = g.appleRenderPos();
    const gx = g.cols - 1 - rp.x + 0.5, gy = rp.y + 0.5;
    if (gh.down > 0) {
      ctx.strokeStyle = 'rgba(179,157,219,0.5)';
      ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(gx, gy, 0.35, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - gh.down / 4)); ctx.stroke();
      return;
    }
    const wob = Math.sin(t * 4) * 0.03;
    const glow = ctx.createRadialGradient(gx, gy, 0.1, gx, gy, 0.8);
    glow.addColorStop(0, 'rgba(179,157,255,0.55)'); glow.addColorStop(1, 'rgba(200,180,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(gx - 0.8, gy - 0.8, 1.6, 1.6);
    const ghostSkin = { ...skin, base: '#b39dff', dark: '#5e45b8', light: '#f1ebff', leaf: '#9be7c4' };
    drawApple(ctx, gx, gy - wob, 0.38, { skin: ghostSkin, time: t, alpha: gh.hidden ? 0.18 : 0.8 + Math.sin(t * 6) * 0.1, sx: -1 });
  }

  // Nerve: a glowing ring around the apple that fills with the combo and drains as it cools.
  drawNerve(ctx, g, t) {
    if (!g.nerve || g.demo || g.state !== 'play') return;
    const rp = g.appleRenderPos();
    const cx = rp.x + 0.5, cy = rp.y + 0.5;
    const heat = Math.min(1, g.nerve / 12);
    const col = heat < 0.5 ? `rgba(128,222,234,` : `rgba(255,${Math.round(213 - heat * 120)},79,`;
    const pulse = 0.5 + 0.5 * Math.sin(t * (6 + g.nerve));
    const glow = ctx.createRadialGradient(cx, cy, 0.2, cx, cy, 0.95 + heat * 0.4);
    glow.addColorStop(0, col + (0.25 + pulse * 0.2 * heat) + ')');
    glow.addColorStop(1, col + '0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    ctx.strokeStyle = col + '0.9)';
    ctx.lineWidth = 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, 0.58, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(g.nerveT / 4));
    ctx.stroke();
  }

  // Thick fog: only a pocket around the apple is clear. Snake eyes glow through it.
  drawFog(ctx, g, t) {
    const rp = g.appleRenderPos();
    const cx = rp.x + 0.5, cy = rp.y + 0.5;
    const r0 = 2.6 + Math.sin(t * 1.3) * 0.15;
    const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r0 + 2.8);
    grad.addColorStop(0, 'rgba(226,232,240,0)');
    grad.addColorStop(1, 'rgba(226,232,240,0.97)');
    ctx.fillStyle = grad;
    ctx.fillRect(-0.6, -0.6, g.cols + 1.2, g.rows + 1.2);
    // drifting wisps
    for (let i = 0; i < 6; i++) {
      const wx = ((t * (0.25 + i * 0.05) + i * 5.3) % (g.cols + 6)) - 3;
      const wy = (i * 3.1) % g.rows;
      const w = ctx.createRadialGradient(wx, wy, 0, wx, wy, 3);
      w.addColorStop(0, 'rgba(255,255,255,0.25)'); w.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = w;
      ctx.fillRect(wx - 3, wy - 3, 6, 6);
    }
    for (const s of g.snakes) {
      if (s.dead) continue;
      const h = this.snakePoints(g, s)[0];
      const d = Math.hypot(h.x + 0.5 - cx, h.y + 0.5 - cy);
      if (d < r0 + 0.5) continue;
      const a = clamp01((d - r0) / 2) * (s.lunge === 'windup' ? 1 : 0.8);
      ctx.fillStyle = s.lunge === 'windup' ? `rgba(255,40,40,${a})` : `rgba(255,214,0,${a})`;
      const ang = Math.atan2(s.dir.y, s.dir.x) + Math.PI / 2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(h.x + 0.5 + Math.cos(ang) * 0.2 * side, h.y + 0.5 + Math.sin(ang) * 0.2 * side, 0.09, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawSlowMo(ctx, g) {
    const a = clamp01(g.slow / 0.25) * 0.35;
    const cx = g.cols / 2, cy = g.rows / 2;
    const grad = ctx.createRadialGradient(cx, cy, Math.min(g.cols, g.rows) * 0.35, cx, cy, Math.max(g.cols, g.rows) * 0.7);
    grad.addColorStop(0, 'rgba(128,222,234,0)');
    grad.addColorStop(1, `rgba(77,208,225,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-1, -1, g.cols + 2, g.rows + 2);
  }

  drawNight(ctx, g, t) {
    const rp = g.appleRenderPos();
    const cx = rp.x + 0.5, cy = rp.y + 0.5;
    const grad = ctx.createRadialGradient(cx, cy, 1.5, cx, cy, Math.max(g.cols, g.rows) * 0.7);
    grad.addColorStop(0, 'rgba(10,15,40,0)');
    grad.addColorStop(1, 'rgba(10,15,40,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, g.cols, g.rows);
    for (let i = 0; i < 9; i++) {
      const fx = (Math.sin(t * 0.3 + i * 7.1) * 0.5 + 0.5) * g.cols;
      const fy = (Math.cos(t * 0.23 + i * 3.7) * 0.5 + 0.5) * g.rows;
      const tw = (Math.sin(t * 3 + i) + 1) / 2;
      const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 0.4);
      glow.addColorStop(0, `rgba(230,255,140,${0.8 * tw})`);
      glow.addColorStop(1, 'rgba(230,255,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(fx - 0.4, fy - 0.4, 0.8, 0.8);
    }
  }

  drawParticles(ctx, g) {
    for (const p of g.particles) {
      ctx.globalAlpha = clamp01(p.life / p.max * 1.5);
      ctx.fillStyle = p.color;
      if (p.type === 'star') {
        starPath(ctx, p.x, p.y, p.size * 1.4, 0.45, 5, p.rot);
        ctx.fill();
      } else if (p.type === 'leaf') {
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.5, p.rot, 0, TAU); ctx.fill();
      } else if (p.type === 'heart') {
        heartPath(ctx, p.x, p.y, p.size);
        ctx.fill();
      } else if (p.type === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + clamp01(1 - p.life / p.max) * 7), 0, TAU); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx, g, sx, sy) {
    const d = this.dpr, cs = this.cs;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of g.floaters) {
      const k = f.t / f.life;
      const pop = f.t < 0.2 ? easeOutBack(f.t / 0.2) : 1;
      const size = Math.max(11, f.size * cs * pop);
      const x = this.ox + sx + f.x * cs;
      const y = Math.max(size * 0.7, this.oy + sy + f.y * cs);
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.lineWidth = Math.max(3, size * 0.18);
      ctx.strokeStyle = 'rgba(40,20,30,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  drawOverlayText(ctx, g) {
    const d = this.dpr, cs = this.cs;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const cx = this.ox + g.cols * cs / 2, cy = this.oy + g.rows * cs / 2;
    let text = null, k = 0;
    if (g.state === 'countdown') {
      const n = Math.ceil(g.countT);
      text = String(n);
      k = 1 - (g.countT - (n - 1));
    } else if (g.state === 'play' && g.levelTime < 0.7 && !g.demo) {
      text = 'GO!';
      k = g.levelTime / 0.7;
    }
    if (text) {
      const s = easeOutBack(clamp01(k * 3)) * cs * 3.2;
      ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      ctx.font = `700 ${s}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = s * 0.12;
      ctx.strokeStyle = '#3a1f2b';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, cx, cy);
      ctx.fillStyle = text === 'GO!' ? '#7ee081' : '#ffffff';
      ctx.fillText(text, cx, cy);
      ctx.globalAlpha = 1;
    }
    if (!g.demo && g.bites === 1 && (g.state === 'play' || g.state === 'countdown')) {
      const p = 0.5 + 0.5 * Math.sin(g.time * 5);
      const grad = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      grad.addColorStop(0, 'rgba(255,0,40,0)');
      grad.addColorStop(1, `rgba(255,0,40,${0.12 + p * 0.12})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }
}
