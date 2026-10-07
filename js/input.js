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

  // Touch controls on the field. Two schemes:
  //  - 'swipe' (default): swipe to roll that way and keep rolling; swipe again to
  //    turn (also mid-drag); tap to stop. Stops by itself when you bump into something.
  //  - 'joystick': a floating stick under your thumb; you roll while you hold it.
  attachTouch(el, knob) {
    this.touchMode = 'swipe';
    let id = null, ox = 0, oy = 0, sx = 0, sy = 0, t0 = 0, travel = 0;
    const DEAD = 16;
    const setDir = dir => {
      if (!this.joy || this.joy.x !== dir.x || this.joy.y !== dir.y) {
        this.joy = dir;
        if (this.taps.length < 2) this.taps.push(dir);
        if (this.onSwipe) this.onSwipe(dir);
      }
    };
    const dirOf = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    const show = (dx, dy) => {
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
      id = e.pointerId; ox = sx = e.clientX; oy = sy = e.clientY; t0 = performance.now(); travel = 0;
      el.setPointerCapture(id);
      if (this.touchMode === 'joystick') show(0, 0);
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - ox, dy = e.clientY - oy;
      travel = Math.max(travel, Math.hypot(e.clientX - sx, e.clientY - sy));
      if (this.touchMode === 'joystick') {
        show(dx, dy);
        if (Math.hypot(dx, dy) < DEAD) { this.joy = null; return; }
        setDir(dirOf(dx, dy));
        // Let the stick follow a finger that drags far away so turning stays snappy.
        const len = Math.hypot(dx, dy);
        if (len > 60) { ox += dx * (1 - 60 / len); oy += dy * (1 - 60 / len); }
        return;
      }
      // Swipe: each 22px of travel in a new direction is a new swipe. Re-anchor so
      // you can carve turns without lifting your finger.
      if (Math.hypot(dx, dy) >= 22) {
        setDir(dirOf(dx, dy));
        ox = e.clientX; oy = e.clientY;
      }
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.display = 'none';
      if (this.touchMode === 'joystick') { this.joy = null; return; }
      // A short, still touch is a tap: stop rolling.
      if (travel < 12 && performance.now() - t0 < 300) {
        this.joy = null;
        this.taps.length = 0;
        if (this.onTapStop) this.onTapStop();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  clear() {
    this.stack = []; this.taps = []; this.actions = []; this.joy = null;
  }
}
