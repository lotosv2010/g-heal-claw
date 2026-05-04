// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * ESLint 9 flat config（统一配置）
 *
 * 覆盖范围：
 *  - packages/sdk / packages/shared / packages/cli（Node.js + 纯 TS）
 *  - apps/server（NestJS + TS，无 React）
 *  - apps/web（Next.js + React + TS）
 *  - apps/ai-agent（Node.js + TS）
 *  - examples/nextjs-demo（Next.js + React + TS）
 */
export default tseslint.config(
  // 基础 JS 推荐规则
  js.configs.recommended,

  // TypeScript 推荐规则（全局启用）
  ...tseslint.configs.recommended,

  // 全局忽略
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/*.config.js",
      "**/*.config.ts",
      "**/drizzle/**",
    ],
  },

  // 通用 TypeScript 规则（所有 TS 文件）
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off", // 数据库查询后合理使用
    },
  },

  // React 专用规则（web + demo）
  {
    files: ["apps/web/**/*.{ts,tsx}", "examples/nextjs-demo/**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // Next.js 自动导入
      "react/prop-types": "off", // 使用 TypeScript
      "react/no-unescaped-entities": "off", // demo 教学代码允许
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },

  // SDK 浏览器环境
  {
    files: ["packages/sdk/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // Server / AI-Agent / CLI Node.js 环境
  {
    files: [
      "apps/server/**/*.ts",
      "apps/ai-agent/**/*.ts",
      "packages/cli/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // 测试文件宽松规则
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.tsx", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  }
);
