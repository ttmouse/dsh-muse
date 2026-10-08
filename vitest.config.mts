import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 这里只跑 vitest 规格（各包的 tests/*.spec.ts）。examples/tests 与 scripts 下的是 node:test
    // 套件，分别由 `pnpm test:timers` / `pnpm test:evolution` 运行；不排除它们，vitest 会报
    // 「No test suite found in file」——`pnpm test` 因此长期假红，掩盖真失败（2026-10-08 修）。
    exclude: [...configDefaults.exclude, 'examples/tests/**', 'scripts/**/*.test.mjs'],
  },
})
