export interface ParticleWaveProps {
  isDark: boolean;
  reducedMotion: boolean;
}

const ROW_COUNT = 18;
const COLUMN_COUNT = 42;
const BUCKET_COUNT = 10;
const MAX_OPACITY = 0.46;

const PARTICLE_WAVE_TOP = 0.42;
export const PARTICLE_WAVE_STILL_TIME = 0.8;
export const PARTICLE_OPACITIES = Array.from({ length: BUCKET_COUNT }, (_, index) =>
  Number((((index + 0.5) / BUCKET_COUNT) * MAX_OPACITY).toFixed(3)),
);

const rows = Array.from({ length: ROW_COUNT }, (_, row) => {
  const v = row / (ROW_COUNT - 1);
  return { v, topFade: Math.min(1, v / 0.22) };
});

const columns = Array.from({ length: COLUMN_COUNT }, (_, column) => {
  const u = (column / (COLUMN_COUNT - 1)) * 2 - 1;
  return { u, sideFade: Math.max(0, 1 - Math.pow(Math.abs(u), 2.3)) };
}).filter(({ sideFade }) => sideFade > 0.01);

export function particleWaveColor(isDark: boolean) {
  return isDark ? '#7dd3fc' : '#2b5cc4';
}

export function particleWaveTime(elapsedMs: number) {
  return (elapsedMs / 1000) * 0.58;
}

export function createParticleBuckets(): number[][] {
  return Array.from({ length: BUCKET_COUNT }, () => []);
}

export function updateParticleBuckets(
  buckets: number[][],
  width: number,
  height: number,
  time: number,
  isDark: boolean,
) {
  for (const bucket of buckets) bucket.length = 0;

  const baseGain = isDark ? 0.36 : 0.40;
  const hillCenter = 0.06 + Math.sin(time * 0.38) * 0.22;
  const ampWave = Math.min(height * 0.056, 44);
  const ampHill = Math.min(height * 0.068, 54);

  for (const { v, topFade } of rows) {
    const spanX = width * 0.54 * (0.84 + v * 0.34);

    for (const { u, sideFade } of columns) {
      const w1 = Math.sin(u * 2.8 - time * 1.35 + v * 2.3);
      const w2 = Math.cos(u * 1.7 + time * 0.85 - v * 3.0) * 0.62;
      const w3 = Math.sin((u * 1.4 - v * 2.1) * 2.6 - time * 1.05) * 0.25;
      const wave = (w1 + w2 + w3) / 1.87;

      const hill = Math.exp(-Math.pow((u - hillCenter) / 0.62, 2)) * (1 - v * 0.38);
      const swayX = Math.cos(u * 2.1 - time * 1.1 + v * 2.5) * 7;
      const x = width * 0.5 + u * spanX + swayX;
      const y = height * 0.59 + v * height * 0.44 - wave * ampWave - hill * ampHill;
      if (x < -8 || x > width + 8 || y < height * PARTICLE_WAVE_TOP || y > height + 8) continue;

      const crest = 0.34 + 0.58 * hill + 0.32 * Math.max(0, wave);
      const opacity = Math.min(MAX_OPACITY, topFade * sideFade * crest * baseGain);
      if (opacity < 0.04) continue;

      const radius = 0.72 + 0.52 * v + 0.42 * Math.max(0, wave);
      const bucketIndex = Math.min(BUCKET_COUNT - 1, Math.floor((opacity / MAX_OPACITY) * BUCKET_COUNT));
      buckets[bucketIndex].push(x, y, radius);
    }
  }
}
