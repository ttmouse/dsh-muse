import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/mailbox.ts'],
  format: 'esm',
  outDir: 'lib',
  clean: false,
  dts: false,
  sourcemap: true,
})
