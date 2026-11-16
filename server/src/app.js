import express from 'express';
import { fileURLToPath } from 'node:url';
import { errorHandler } from './errors.js';
import { requireAuth } from './middleware/auth.js';
import { rateLimits } from './middleware/rateLimits.js';
import { accountRoutes } from './routes/account.js';
import { authRoutes } from './routes/auth.js';
import { transferRoutes } from './routes/transfers.js';

export function createApp({ db, config }) {
  const app = express();
  const limits = rateLimits(config.limits);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  // Small JSON bodies only: every field has a length limit, so 10 KB is plenty.
  app.use(express.json({ limit: '10kb' }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  // Public: registration and login only. Everything else needs a valid token.
  app.use('/api/auth', authRoutes({ db, config, limits }));
  app.use('/api', requireAuth(config), accountRoutes({ db }), transferRoutes({ db, limits }));
  const clientBuild = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  app.use(express.static(clientBuild, { index: false }));
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res, next) => {
    res.sendFile(fileURLToPath(new URL('../../client/dist/index.html', import.meta.url)), (err) => {
      if (err) next(err);
    });
  });
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
