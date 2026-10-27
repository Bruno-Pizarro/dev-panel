import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo el navegador habla con Vite (5173) y Vite reenvía /api al servidor (4777).
// `changeOrigin` reescribe el Host al del destino para pasar la validación de Host del servidor.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4777', changeOrigin: true } },
  },
});
