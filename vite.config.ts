import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
