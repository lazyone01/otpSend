import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // strictPort: fail loudly if 5174 is taken, instead of silently moving to another port
  // (a different port = a different origin, which CORS on the backend would reject).
  server: { port: 5174, strictPort: true },
});
