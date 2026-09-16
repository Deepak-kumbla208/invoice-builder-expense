import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  const apiOrigin = process.env.VITE_API_URL ?? '';

  return {
    base: '/',
    plugins: [
      react(),
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          return html.replace(/%API_ORIGIN%/g, apiOrigin);
        }
      }
    ],
    css: {
      preprocessorOptions: {
        scss: {
          quietDeps: true
        }
      }
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // The API sends no CORS headers, so the dev server proxies /api/* to it
      // and the browser only ever talks to this origin.
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
          changeOrigin: false
        }
      }
    },
    build: {
      outDir: path.resolve(__dirname, 'dist-fe'),
      chunkSizeWarningLimit: 1500
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './setupTests.ts',
      coverage: {
        include: ['src/**'],
        exclude: ['src/**/vite-env.d.ts', 'src/**/main.tsx', 'src/**/reportWebVitals.ts', 'src/**/mocks'],
        reporter: ['text', 'json', 'html']
      },
      exclude: [...configDefaults.exclude, 'node_modules'],
      include: ['src/**/__tests__/*.{test,spec}.{js,ts,jsx,tsx}']
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // Absolute aliases for monaco worker entry files: Rolldown's worker
        // bundler fails to resolve bare `monaco-editor/...` specifiers.
        '@monaco-editor-worker/editor': path.resolve(
          __dirname,
          'node_modules/monaco-editor/esm/vs/editor/editor.worker.js'
        ),
        '@monaco-editor-worker/json': path.resolve(
          __dirname,
          'node_modules/monaco-editor/esm/vs/language/json/json.worker.js'
        )
      }
    }
  };
});
