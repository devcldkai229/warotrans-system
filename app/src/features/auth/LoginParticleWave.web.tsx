import React, { memo, useEffect, useRef } from 'react';
import {
  createParticleBuckets,
  PARTICLE_OPACITIES,
  PARTICLE_WAVE_STILL_TIME,
  particleWaveColor,
  particleWaveTime,
  updateParticleBuckets,
  type ParticleWaveProps,
} from './particleWave';

export const LoginParticleWave = memo(function LoginParticleWave({
  isDark,
  reducedMotion,
}: ParticleWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buckets = createParticleBuckets();
    const color = particleWaveColor(isDark);

    let cssWidth = 0;
    let cssHeight = 0;
    let dpr = 1;
    let rafId: number | null = null;
    let startMs: number | null = null;
    let disposed = false;

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextW = Math.max(1, Math.round(rect.width));
      const nextH = Math.max(1, Math.round(rect.height));
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (nextW !== cssWidth || nextH !== cssHeight || nextDpr !== dpr) {
        cssWidth = nextW;
        cssHeight = nextH;
        dpr = nextDpr;
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = color;
      }
    };

    const drawFrame = (tSec: number) => {
      if (cssWidth <= 1 || cssHeight <= 1) return;
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      updateParticleBuckets(buckets, cssWidth, cssHeight, tSec, isDark);

      for (let b = 0; b < buckets.length; b++) {
        const coords = buckets[b];
        if (coords.length === 0) continue;
        ctx.globalAlpha = PARTICLE_OPACITIES[b];
        ctx.beginPath();
        for (let i = 0; i < coords.length; i += 3) {
          const cx = coords[i];
          const cy = coords[i + 1];
          const cr = coords[i + 2];
          ctx.moveTo(cx + cr, cy);
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    const tick = (nowMs: number) => {
      if (disposed || reducedMotion || document.hidden) {
        rafId = null;
        return;
      }
      if (startMs === null) startMs = nowMs;
      drawFrame(particleWaveTime(nowMs - startMs));
      rafId = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      syncSize();
      if (reducedMotion) {
        drawFrame(PARTICLE_WAVE_STILL_TIME);
        return;
      }
      if (rafId === null && !document.hidden) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startMs = null;
        startLoop();
      }
    };

    const onResize = () => {
      syncSize();
      if (reducedMotion) drawFrame(PARTICLE_WAVE_STILL_TIME);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize);
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', onResize);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    startLoop();

    return () => {
      disposed = true;
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (ro) {
        ro.disconnect();
      } else {
        window.removeEventListener('resize', onResize);
      }
    };
  }, [isDark, reducedMotion]);

  return React.createElement('canvas', {
    ref: canvasRef,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    },
  });
});
