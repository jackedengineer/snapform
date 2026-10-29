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
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                {
                  name: 'form-contracts',
                  test: /\/(?:packages\/contracts\/src\/(?:form|answers|rules|compile|evaluate|intake|draft|publication|public-form|responses|response-display|response-csv|notifications)[^/]*\.ts|features\/(?:forms|intake|auth|workspaces)\/(?:api|response-export)\.ts)$/,
                },
                {
                  name: 'ui-runtime',
                  test: /\/(?:@tanstack\/(?:react-router|router-core|react-start-client|start-client-core|react-query|query-core)|react|react-dom|scheduler)\//,
                },
              ],
            },
          },
        },
      },
    },
  },
}));
