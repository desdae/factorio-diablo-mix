import type { Settings } from '../game/settings';

/** Unified input: keyboard (remappable by action), mouse, and standard-mapping gamepads. */
export class Input {
  held = new Set<string>();
  pressed = new Set<string>();
  mouseX = 0; mouseY = 0;
  mouseDown = [false, false, false];
  mousePressed = [false, false, false];
  mouseReleased = [false, false, false];
  wheel = 0;
  overUi = false;
  capture: ((code: string) => void) | null = null; // key remapping capture
  textFocus = false;
  pad: { lx: number; ly: number; rx: number; ry: number; buttons: boolean[]; prev: boolean[]; connected: boolean } = { lx: 0, ly: 0, rx: 0, ry: 0, buttons: [], prev: [], connected: false };
  lastDevice: 'kbm' | 'pad' = 'kbm';

  constructor(private settings: () => Settings, el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const c = this.capture; this.capture = null; c(e.code); return; }
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) { this.textFocus = true; if (e.code !== 'Escape' && e.code !== 'Backquote') return; }
      else this.textFocus = false;
      if (e.code === 'Tab' || e.code === 'Space' || (e.code.startsWith('Arrow'))) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
      this.lastDevice = 'kbm';
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => { this.held.clear(); this.mouseDown = [false, false, false]; });
    el.addEventListener('mousemove', (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; this.lastDevice = 'kbm'; });
    window.addEventListener('mousemove', (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; });
    el.addEventListener('mousedown', (e) => { this.mouseDown[e.button] = true; this.mousePressed[e.button] = true; });
    window.addEventListener('mouseup', (e) => { if (this.mouseDown[e.button]) this.mouseReleased[e.button] = true; this.mouseDown[e.button] = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  key(action: string): boolean {
    const code = this.settings().keys[action];
    return !!code && this.held.has(code) && !this.textFocus;
  }
  keyPressed(action: string): boolean {
    const code = this.settings().keys[action];
    return !!code && this.pressed.has(code) && !this.textFocus;
  }
  codePressed(code: string) { return this.pressed.has(code); }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    this.pad.prev = this.pad.buttons;
    if (!gp) { this.pad.connected = false; this.pad.buttons = []; return; }
    this.pad.connected = true;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    this.pad.lx = dz(gp.axes[0] ?? 0); this.pad.ly = dz(gp.axes[1] ?? 0);
    this.pad.rx = dz(gp.axes[2] ?? 0); this.pad.ry = dz(gp.axes[3] ?? 0);
    this.pad.buttons = gp.buttons.map((b) => b.pressed);
    if (this.pad.lx || this.pad.ly || this.pad.buttons.some(Boolean)) this.lastDevice = 'pad';
  }
  padHeld(i: number) { return !!this.pad.buttons[i]; }
  padPressed(i: number) { return !!this.pad.buttons[i] && !this.pad.prev[i]; }

  vibrate(strength: number, ms: number) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected) as (Gamepad & { vibrationActuator?: { playEffect: (t: string, o: object) => void } }) | undefined;
    gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 });
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
    this.wheel = 0;
  }
}

export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { Space: 'Space', Escape: 'Esc', ShiftLeft: 'Shift', ControlLeft: 'Ctrl', Backquote: '`', Tab: 'Tab', Enter: 'Enter' };
  return map[code] ?? code.replace('Arrow', '');
}
