import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: 'esm',
    outDir: 'lib',
    clean: false,
    dts: false,
    sourcemap: true,
  },
  {
    name: '@deepseek-ai/dsh-tool-muse/client',
    entry: { client: 'src/client/index.ts' },
    format: 'cjs',
    platform: 'browser',
    outDir: 'lib',
    clean: false,
    dts: false,
    sourcemap: true,
    external: ['react'],
    outputOptions: {
      banner: 'window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-tool-muse", factory: (require) => {',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
      entryFileNames: 'client.js',
    },
  },
])
