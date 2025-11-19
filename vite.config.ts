import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'configure-response-headers',
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          next()
        })
      },
    },
  ],
  server: {
    open: true,
  },
  optimizeDeps: {
    exclude: ['webr', 'pyodide'],
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          headless: true,
        },
      }),
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
})