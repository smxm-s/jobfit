// 说明：Windows 下 Vite 加载 .ts 配置时会写临时 .mjs 文件（本机 EPERM），
// 因此配置文件改为纯 ESM 的 vite.config.mjs，内容与原 vite.config.ts 一致。
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
