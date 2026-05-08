import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 存在 ctx.server（仅 vite / npm run dev 的开发服务器）时注入 React DevTools standalone，也就是不使用 Electron 的 React DevTools（需在 React 之前加载，故不用 main.jsx） */
function reactDevtoolsStandalone() {
  return {
    name: 'react-devtools-standalone',
    transformIndexHtml(html, ctx) {
      if (!ctx.server) return html
      return html.replace(
        '<head>',
        '<head>\n    <script src="http://localhost:8097"></script>'
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), reactDevtoolsStandalone()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
