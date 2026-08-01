// 该文件是 ESLint 的配置文件，用于配置 ESLint 的规则、忽略的文件、全局变量等
import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['dist/**', 'dist-electron/**', 'node_modules/**', '**/*.d.ts'] },  // 忽略的文件
  eslint.configs.recommended,  // 使用 ESLint 推荐的规则
  ...tseslint.configs.recommended,  // 使用 TypeScript ESLint 推荐的规则
  {
    languageOptions: {
      ecmaVersion: 2022,  // 使用 ECMAScript 2022 语法
      sourceType: 'module',  // 使用 ES 模块语法
      globals: {  // 定义全局变量
        ...globals.browser,  // 浏览器环境的全局变量
        ...globals.node,  // Node.js 环境的全局变量
      },
    },
    rules: {
      'no-unused-vars': 'off',  // 关闭 ESLint 的 no-unused-vars 规则，因为我们使用 TypeScript ESLint 的规则来检查未使用的变量
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],  // 使用 TypeScript ESLint 的 no-unused-vars 规则，并忽略以 _ 开头的参数
      'no-empty': ['error', { allowEmptyCatch: true }],  // 允许空的 catch 块
      '@typescript-eslint/no-explicit-any': 'warn',  // 对使用 any 类型的代码发出警告
      '@typescript-eslint/no-require-imports': 'off',  // 关闭 TypeScript ESLint 的 no-require-imports 规则，因为我们允许使用 require 导入模块
      'no-control-regex': 'off',  // 关闭 ESLint 的 no-control-regex 规则，因为我们允许使用控制字符的正则表达式
      'prefer-const': 'off',  // 关闭 ESLint 的 prefer-const 规则，因为我们允许使用 let 声明变量
    },
  },
)
