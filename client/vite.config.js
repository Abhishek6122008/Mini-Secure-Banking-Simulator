import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API runs on :3000; Vite forwards /api to it, so the browser talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
