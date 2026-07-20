import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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