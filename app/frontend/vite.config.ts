import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 1431: the harness dev server owns 1430; never collide with the sibling.
// fs.allow reaches two levels up so the engine (repo-root lib/*.mjs) imports
// into the webview bundle unchanged — the M2b design decision.
export default defineConfig({
  plugins: [react()],
  server: { port: 1435, strictPort: true, fs: { allow: ['..', '../..'] } },
  build: { target: 'es2022', outDir: 'dist' },
  clearScreen: false,
});
