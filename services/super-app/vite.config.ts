import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import EnvironmentPlugin from 'vite-plugin-environment';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tsconfigPaths from 'vite-tsconfig-paths';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@babylonlabs-io/wallet-connector'))
              return 'wallet';
            if (id.includes('@babylonlabs-io/core-ui')) return 'coreui';
            if (id.includes('@babylonlabs-io/babylon-proto-ts')) return 'proto';
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('react-router') ||
              id.includes('react-router-dom')
            )
              return 'react';
            return 'vendor';
          }
        },
      },
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    fs: {
      allow: [
        resolve(__dirname, '..', '..'),
        resolve(__dirname, '../simple-staking'),
        resolve(__dirname, '../vault'),
      ],
    },
  },
  plugins: [
    react(),
    nodePolyfills({ include: ['buffer', 'crypto'] }),
    EnvironmentPlugin('all', { prefix: 'NEXT_PUBLIC_' }),
    tsconfigPaths({
      projects: [
        resolve(__dirname, './tsconfig.lib.json'),
        resolve(__dirname, '../simple-staking/tsconfig.lib.json'),
        resolve(__dirname, '../vault/tsconfig.lib.json'),
      ],
    }),
  ],
});
