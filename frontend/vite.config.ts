import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Two explicit vendor chunks. Without naming React separately, Rollup
        // groups it with `motion` and the entry ends up statically importing
        // that chunk — which would ship the animation library to the dashboard.
        // Kept apart: React is eager, motion is only reachable from lazy routes.
        manualChunks(id) {
          if (/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion'
          if (
            /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store)\//.test(
              id,
            )
          )
            return 'vendor'
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
    // amazon-cognito-identity-js references the Node `global`; map it to the
    // browser global so the SRP auth flow runs without a "global is not defined" error.
    global: 'globalThis',
  },
})