/** Deterministic PRNG (mulberry32) so every demo reset produces the same data. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  const chance = (p: number) => next() < p;
  const weighted = <T extends string>(weights: Partial<Record<T, number>>): T => {
    const entries = Object.entries(weights) as [T, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = next() * total;
    for (const [k, w] of entries) {
      roll -= w;
      if (roll <= 0) return k;
    }
    return entries[entries.length - 1][0];
  };
  const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");
  return { next, int, pick, chance, weighted, digits };
}

export type Rng = ReturnType<typeof createRng>;

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export function iso(ms: number) {
  return new Date(ms).toISOString();
}
