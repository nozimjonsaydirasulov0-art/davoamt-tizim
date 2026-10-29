import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev rejimda /api va /socket.io backendga (4000) proksi qilinadi — cookie bitta domenda qoladi
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'], socket: ['socket.io-client'] } } },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
