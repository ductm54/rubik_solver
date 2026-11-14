import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * cubejs is CoffeeScript output wrapped in `(function(){ ... }).call(this)`. Inside an ES module
 * (our solver Web Worker) top-level `this` is undefined, so point it at globalThis instead.
 */
function cubejsThisFix(): Plugin {
  return {
    name: 'cubejs-this-fix',
    transform(code, id) {
      if (!/node_modules[\\/]cubejs[\\/]lib[\\/]/.test(id)) return;
      return { code: code.replace(/\}\)\.call\(this\);?\s*$/, '}).call(globalThis);'), map: null };
    },
  };
}

export default defineConfig({
  root: 'demo',
  // Relative base so the build works under https://<user>.github.io/<repo>/
  base: './',
  plugins: [cubejsThisFix()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'demo/index.html'),
        scan: resolve(import.meta.dirname, 'demo/scan.html'),
        timer: resolve(import.meta.dirname, 'demo/timer.html'),
        learn: resolve(import.meta.dirname, 'demo/learn.html'),
      },
    },
  },
  worker: {
    format: 'es',
    plugins: () => [cubejsThisFix()],
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
});
