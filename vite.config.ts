// 该文件是 Vite 的配置文件，用于配置开发服务器、构建等
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

/** Vite 配置 */
export default defineConfig({
  plugins: [react(), electronContentSecurityPolicyPlugin()],  // 使用 react 插件和 electronContentSecurityPolicyPlugin 插件
  base: './',  // 基础路径
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),  // 定义 @/ 指 src/
    },
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],  // .ts 优先于 .js，避免 shared/ 残留 CJS 产物遮蔽同名 .ts（Vite 默认 .js 在前）
  },
  build: {
    outDir: 'dist',  // 构建输出目录
    emptyOutDir: true,  // 构建前清空输出目录
    minify: 'esbuild',  // 使用 esbuild 压缩
    cssMinify: true,  // 压缩 CSS
    reportCompressedSize: false,  // 不报告压缩后的文件大小
  },
  server: {
    port: 5173,  // 开发服务器端口
    strictPort: true,  // 严格端口（如果端口被占用，则报错）
  },
})
