import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/boltPaint/',
    server: {
      port: 3001,
      host: '0.0.0.0',
      proxy: {
        '/boltPaint/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/boltPaint\/api/, ''),
        },
        '/boltPaint/static': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/boltPaint/, ''),
        },
        '/boltPaint/generated': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/boltPaint/, ''),
        },
        '/boltPaint/custom': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/boltPaint/, ''),
        },
      }
    },
    plugins: [
      react(),
      // 开启 gzip 压缩
      viteCompression({
        verbose: true,
        disable: false,
        threshold: 10240, // 仅压缩大于 10kb 的文件
        algorithm: 'gzip',
        ext: '.gz',
      })
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // React 核心库单独抽包，命中缓存
            'vendor-react': ['react', 'react-dom'],
            // 路由和国际化单独抽包
            'vendor-router': ['react-router-dom'],
            'vendor-i18n': ['i18next', 'react-i18next'],
          }
        }
      }
    },
    esbuild: {
      // 生产环境自动移除 console 和 debugger，减小包体积并提升安全性
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    }
  };
});
