import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '*.config.ts',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/index.ts',
      ],
    },
    server: {
      deps: {
        inline: ['@babylonlabs-io/wallet-connector', '@babylonlabs-io/config'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/models': path.resolve(__dirname, './src/models'),
      '@/config': path.resolve(__dirname, './src/config'),
      '@/storage': path.resolve(__dirname, './src/storage'),
      '@/context': path.resolve(__dirname, './src/context'),
      '@babylonlabs-io/wallet-connector': path.resolve(
        __dirname,
        '../../packages/babylon-wallet-connector/src/index.tsx',
      ),
      '@babylonlabs-io/config': path.resolve(
        __dirname,
        '../../packages/babylon-config/src/index.ts',
      ),
    },
  },
});
