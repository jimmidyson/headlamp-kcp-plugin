import { defineConfig, mergeConfig } from 'vite';
import headlampConfig from '@kinvolk/headlamp-plugin/config/vite.config.mjs';

/**
 * The plugin build resolves `@kinvolk/headlamp-plugin/lib/*` to the copies the
 * running Headlamp already has, which is why those names have no file behind
 * them. Under test there is no Headlamp, so the ones the tests reach for are
 * pointed at the package's own compiled modules - the same code, imported
 * rather than borrowed.
 */
export default mergeConfig(
  headlampConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^@kinvolk\/headlamp-plugin\/lib\/k8s$/,
          replacement: new URL(
            './node_modules/@kinvolk/headlamp-plugin/lib/lib/k8s/index.js',
            import.meta.url
          ).pathname,
        },
      ],
    },
    test: {
      environment: 'jsdom',
    },
  })
);
