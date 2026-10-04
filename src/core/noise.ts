import { hash2 } from './rng';

/** Seeded 2D gradient noise (value-gradient hybrid) with fractal sum. Deterministic per seed. */
function grad(ix: number, iy: number, seed: number, dx: number, dy: number): number {
  const h = hash2(ix, iy, seed);
  const a = (h / 4294967296) * Math.PI * 2;
  return Math.cos(a) * dx + Math.sin(a) * dy;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function noise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const n00 = grad(x0, y0, seed, fx, fy);
  const n10 = grad(x0 + 1, y0, seed, fx - 1, fy);
  const n01 = grad(x0, y0 + 1, seed, fx, fy - 1);
  const n11 = grad(x0 + 1, y0 + 1, seed, fx - 1, fy - 1);
  const u = fade(fx), v = fade(fy);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.414; // ~[-1,1]
}

export function fbm(x: number, y: number, seed: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
