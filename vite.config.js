import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-oxc'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 开发与生产使用不同 CSP（Electron 第 7 点）：生产收紧 script/connect，开发放行 Vite HMR / React DevTools */
function electronContentSecurityPolicyPlugin() {

  /** 转义 CSP 字符串 */
  const escapeMetaContent = (csp) =>
    csp.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

  /** 开发环境 CSP */
  const devCsp = [
    "default-src 'self'",
    // Vite HMR 需要 unsafe-eval；React DevTools standalone 来自 localhost:8097
    "script-src 'self' http://localhost:5173 http://127.0.0.1:5173 http://localhost:8097 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' http://localhost:5173 http://127.0.0.1:5173 http://localhost:8097 http://127.0.0.1:8097 ws://localhost:5173 ws://127.0.0.1:5173 ws://localhost:8097 ws://127.0.0.1:8097",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "base-uri 'self'",
  ].join('; ')

  /** 生产环境 CSP */
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
      if (ctx.server) {  // 开发环境，注入 React DevTools
        out = out.replace(
          '</title>',
          '</title>\n    <script src="http://localhost:8097"></script>'
        )
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
