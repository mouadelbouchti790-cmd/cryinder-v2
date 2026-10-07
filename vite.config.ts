import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createPbBackend } from './src/services/pocketbase/serverBackend';

/**
 * Dev-only middleware that serves /api/pb/* through the same backend that
 * Vercel runs in production (api/pb.ts), so local development matches the
 * deployed behavior. Admin credentials are read from the environment /
 * .env file on the server side and never reach the browser.
 */
function pbDevMiddleware(): Plugin {
  return {
    name: 'cryinder-pb-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/pb')) {
          next();
          return;
        }

        const backend = createPbBackend({
          PB_URL: process.env.PB_URL,
          PB_ADMIN_EMAIL: process.env.PB_ADMIN_EMAIL,
          PB_ADMIN_PASSWORD: process.env.PB_ADMIN_PASSWORD,
        });

        try {
          let body: string | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk as Buffer);
            }
            body = Buffer.concat(chunks).toString('utf8');
          }

          const headers: Record<string, string> = {};
          if (body) headers['Content-Type'] = 'application/json';

          const response = await backend.handle(
            new Request(`http://localhost${url}`, {
              method: req.method ?? 'GET',
              headers,
              body,
            }),
          );

          res.statusCode = response.status;
          res.setHeader('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
          res.end(await response.text());
        } catch (err) {
          console.error('[pb middleware] error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose server-side PocketBase settings to the dev middleware process.
  // VITE_* vars are client-facing by design; PB_* vars are server-only.
  const env = loadEnv(mode, process.cwd(), '');
  process.env.PB_URL = process.env.PB_URL || env.PB_URL || 'http://127.0.0.1:8090';
  process.env.PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || env.PB_ADMIN_EMAIL || '';
  process.env.PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || env.PB_ADMIN_PASSWORD || '';

  const isProd = mode === 'production';

  return {
    server: {
      host: 'localhost',
      port: 5173,
      allowedHosts: true
    },
    plugins: [react(), pbDevMiddleware()],
    build: {
      // Don't ship unminified source maps to the bundle in production
      // — they leak original source. Uploads to error monitoring
      // (Sentry, etc.) should be wired separately if needed.
      sourcemap: !isProd,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            solana: [
              '@solana/web3.js',
              '@solana/wallet-adapter-base',
              '@solana/wallet-adapter-react',
              '@solana/wallet-adapter-wallets',
            ],
            motion: ['framer-motion'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  };
});
