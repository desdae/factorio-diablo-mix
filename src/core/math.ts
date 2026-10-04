export interface Vec { x: number; y: number }

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax);

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'G';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  if (Math.abs(n) < 10 && n % 1 !== 0) return n.toFixed(1);
  return Math.round(n).toString();
}

export function fmtPower(kw: number): string {
  if (kw >= 1000) return (kw / 1000).toFixed(2) + ' MW';
  return kw.toFixed(0) + ' kW';
}

/** Direction helpers: 0=E,1=S,2=W,3=N */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
