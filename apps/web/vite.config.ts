import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  // Auth capability paths must not appear in local request logs.
  logLevel: 'warn',
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      auxiliaryWorkers:
        command === 'build' || isPreview
          ? [{ configPath: '../api/wrangler.jsonc' }]
          : [],
      remoteBindings: false,
    }),
    tanstackStart(),
    react(),
  ],
  server: { strictPort: true },
}));
