import path from 'node:path'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

function serveMockCloud() {
  const file = path.resolve(__dirname, 'public', '__mock-cloud.js')
  return {
    name: 'serve-mock-cloud',
    configureServer(server: any) {
      server.middlewares.use('/__mock-cloud.js', (_req: any, res: any) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(fs.readFileSync(file, 'utf8'))
      })
    },
  }
}

export default defineConfig({
  plugins: [uni(), serveMockCloud()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
