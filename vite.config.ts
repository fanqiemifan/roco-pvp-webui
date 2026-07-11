import path from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'antd-assets',
    rollupOptions: {
      input: {
        'admin-antd': path.resolve(__dirname, 'src/pages/admin-antd.html'),
        login: path.resolve(__dirname, 'src/pages/login.html'),
      },
    },
  },
});
