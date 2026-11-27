import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const androidOnly = process.env.SBX_ANDROID === '1';

const dropDesktopBackgrounds = () => ({
  name: 'sbx-drop-desktop-backgrounds',
  closeBundle() {
    if (!androidOnly) return;
    const dir = join(process.cwd(), 'dist', 'background');
    try {
      for (const name of readdirSync(dir)) {
        if (name.endsWith('.png')) rmSync(join(dir, name));
      }
    } catch {}
  },
});

export default defineConfig({
  plugins: [react(), dropDesktopBackgrounds()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
