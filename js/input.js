// Keyboard + touch input. The engine reads `held`, `taps` and `actions`.
const KEY_DIRS = {
  ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
};
const KEY_ACTIONS = {
  Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyJ: 'dash',
  KeyE: 'thorn', KeyK: 'thorn',
  KeyQ: 'rot', KeyL: 'rot',
  KeyR: 'decoy', Semicolon: 'decoy',
};

export class Input {
  constructor() {
    this.stack = [];          // held direction keys, most recent last
    this.taps = [];
    this.actions = [];
    this.joy = null;          // direction from touch joystick
    this.enabled = false;
    this.onMeta = null;       // pause etc.

    window.addEventListener('keydown', e => this.keydown(e));
    window.addEventListener('keyup', e => this.keyup(e));
    window.addEventListener('blur', () => { this.stack = []; this.joy = null; });
  }

  get held() {
    if (this.joy) return this.joy;
    const k = this.stack[this.stack.length - 1];
    return k ? KEY_DIRS[k] : null;
  }

  keydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.onMeta) this.onMeta('pause', e);
      return;
    }
    if (!this.enabled) return;
    const dir = KEY_DIRS[e.code];
    if (dir) {
      e.preventDefault();
      if (e.repeat) return;
      this.stack = this.stack.filter(k => k !== e.code);
      this.stack.push(e.code);
      if (this.taps.length < 2) this.taps.push(dir);
      return;
    }
    const act = KEY_ACTIONS[e.code];
    if (act) {
      e.preventDefault();
      if (!e.repeat) this.actions.push(act);
    }
  }

  keyup(e) {
    this.stack = this.stack.filter(k => k !== e.code);
  }

  // Floating joystick: touch anywhere on the field and drag.
  attachJoystick(el, knob) {
    let id = null, ox = 0, oy = 0;
    const DEAD = 16;
    const show = (x, y, dx, dy) => {
      const r = el.getBoundingClientRect();
      knob.style.display = 'block';
      knob.style.left = (ox - r.left) + 'px';
      knob.style.top = (oy - r.top) + 'px';
      const len = Math.hypot(dx, dy), max = 34;
      const k = len > max ? max / len : 1;
      knob.firstElementChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !this.enabled || id !== null) return;
      id = e.pointerId; ox = e.clientX; oy = e.clientY;
      el.setPointerCapture(id);
      show(ox, oy, 0, 0);
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - ox, dy = e.clientY - oy;
      show(ox, oy, dx, dy);
      if (Math.hypot(dx, dy) < DEAD) { this.joy = null; return; }
      const dir = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
      if (!this.joy || this.joy.x !== dir.x || this.joy.y !== dir.y) {
        this.joy = dir;
        if (this.taps.length < 2) this.taps.push(dir);
      }
      // Let the stick follow a finger that drags far away so turning stays snappy.
      const len = Math.hypot(dx, dy);
      if (len > 60) { ox += dx * (1 - 60 / len); oy += dy * (1 - 60 / len); }
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; this.joy = null;
      knob.style.display = 'none';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  clear() {
    this.stack = []; this.taps = []; this.actions = []; this.joy = null;
  }
}
