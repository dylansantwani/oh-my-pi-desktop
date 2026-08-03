import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  // electron-updater is CJS and the main process is ESM ("type": "module");
  // externalizing it (the default for dependencies) leaves a named import that
  // Node's CJS interop can't resolve at runtime. Bundle it instead.
  main: { plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
