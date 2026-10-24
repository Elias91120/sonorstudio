import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // The landing page at the root, the studio under /studio/.
      input: { landing: 'index.html', studio: 'studio/index.html' },
    },
  },
});
