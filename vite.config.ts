import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev-only: serve the sibling `fear-greed-index-api` repo's data/ directory at
 * /api-local, so the dashboard can be developed against real collected data
 * without waiting for a push to GitHub. Never active in a production build.
 */
function localDataApi(): Plugin {
  const root = resolve(__dirname, '../fear-greed-index-api');
  return {
    name: 'local-data-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api-local', (req, res, next) => {
        if (!existsSync(root)) return next();
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const file = resolve(root, rel);
        // Containment check: never serve outside the data API repo.
        if (!file.startsWith(root)) {
          res.statusCode = 403;
          return res.end('forbidden');
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          return res.end('not found');
        }
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'text/plain');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(file).pipe(res);
      });
      server.config.logger.info(`  local data API  ->  ${root}`);
    },
  };
}

export default defineConfig({
  // GitHub Pages serves project sites from /<repo>/, so the base path matters.
  base: '/fear-greed-index/',
  plugins: [react(), tailwindcss(), localDataApi()],
  build: {
    target: 'es2022',
    // ECharts is ~650 kB raw / ~220 kB gzipped after tree-shaking, which is
    // well under the full ~1 MB build. The default 500 kB warning is noise here.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: { echarts: ['echarts'] },
      },
    },
  },
});
