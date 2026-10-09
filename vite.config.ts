import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// The OAuth redirect registered with Scopely is https://localhost:5173/callback,
// so the dev server must run over https on that exact port.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { port: 5173, strictPort: true, host: 'localhost' },
  // Set BASE_PATH=/msf-planner/ when building for GitHub Pages.
  base: process.env.BASE_PATH ?? '/',
});
