import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '')
  const apiTarget = env.VITE_API_URL || 'http://localhost:5090'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    server: {
      proxy: {
        // WaroTrans.AI (separate Python service, only with VITE_AI_ENABLED=true): /api/ai/v1/... → ai-api /v1/...
        '/api/ai': {
          target: env.VITE_AI_API_URL || 'http://localhost:8090',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api\/ai/, ''),
        },
        // Evidence Recorder (separate process, docs/adr/0012): must come before /api.
        '/api/evidence': {
          target: env.VITE_EVIDENCE_API_URL || 'http://localhost:5095',
          changeOrigin: true,
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/map-assets': {
          target: apiTarget,
          changeOrigin: true,
        },
        // SignalR: negotiation over HTTP, then a WebSocket, both to the backend.
        '/hubs': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
