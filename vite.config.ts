import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 开发与生产使用不同 CSP（Electron 第 7 点）：生产收紧 script/connect，开发放行 Vite HMR / React DevTools */
function electronContentSecurityPolicyPlugin(): Plugin {
  const escapeMetaContent = (csp: string) =>
    csp.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

  const devCsp = [
    "default-src 'self'",
    "script-src 'self' http://localhost:5173 http://127.0.0.1:5173 http://localhost:8097 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' http://localhost:5173 http://127.0.0.1:5173 http://localhost:8097 http://127.0.0.1:8097 ws://localhost:5173 ws://127.0.0.1:5173 ws://localhost:8097 ws://127.0.0.1:8097",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "base-uri 'self'",
  ].join('; ')

  const prodCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'none'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')

  return {
    name: 'electron-csp-and-devtools',
    transformIndexHtml(html, ctx) {
      const csp = ctx.server ? devCsp : prodCsp
      const cspMeta = `\n    <meta http-equiv="Content-Security-Policy" content="${escapeMetaContent(csp)}" />`
      let out = html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />${cspMeta}`)
      if (ctx.server) {
        out = out.replace('</title>', '</title>\n    <script src="http://localhost:8097"></script>')
      }
      return out
    },
  }
}

export default defineConfig({
  plugins: [react(), electronContentSecurityPolicyPlugin()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // .ts 优先于 .js，避免 shared/ 残留 CJS 产物遮蔽同名 .ts（Vite 默认 .js 在前）
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    cssMinify: true,
    reportCompressedSize: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
