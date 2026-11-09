import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { HttpError } from './lib/http.js';
import { authPlugin } from './plugins/auth.js';
import { meRoutes } from './routes/me.js';
import { taskRoutes } from './routes/tasks.js';
import { habitRoutes } from './routes/habits.js';
import { moneyRoutes } from './routes/money.js';
import { savingsRoutes } from './routes/savings.js';
import { sportRoutes } from './routes/sport.js';
import { dataRoutes } from './routes/data.js';
import { authPublicRoutes, authRoutes } from './routes/auth.js';

export function buildApp(opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    // Перед сервером один прокси (Caddy): IP клиента — последний в X-Forwarded-For
    trustProxy: (_addr: string, hop: number) => hop === 0,
    logger: opts.logger === false ? false : { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal_error' });
  });

  // CORS только для Android-приложения (Capacitor: https://localhost). Вход там — по токену
  // в заголовке Authorization, без cookie, поэтому чужие сайты ничего не получат.
  const origins = new Set(env.APP_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean));
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !origins.has(origin) || !req.url.startsWith('/api/')) return;
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      reply
        .header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE')
        .header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        .header('Access-Control-Max-Age', '86400');
      return reply.code(204).send();
    }
  });

  app.get('/api/health', async () => ({ ok: true }));
  app.register(authPublicRoutes, { prefix: '/api' });

  // Всё, что ниже, требует входа: через Telegram или по токену приложения.
  app.register(
    async (scope) => {
      await authPlugin(scope);
      await scope.register(meRoutes);
      await scope.register(taskRoutes);
      await scope.register(habitRoutes);
      await scope.register(moneyRoutes);
      await scope.register(savingsRoutes);
      await scope.register(sportRoutes);
      await scope.register(dataRoutes);
      await scope.register(authRoutes);
    },
    { prefix: '/api' },
  );

  // Собранное приложение (app/dist) — тот же адрес, что и API. Только готовые файлы, без исходников.
  if (env.STATIC_DIR && existsSync(path.join(env.STATIC_DIR, 'index.html'))) {
    const root = path.resolve(env.STATIC_DIR);
    app.register(fastifyStatic, {
      root,
      wildcard: false,
      // Файлы с хешем в имени не меняются — кэшируем надолго; index.html — всегда свежий
      setHeaders: (res, filePath) => {
        res.header(
          'Cache-Control',
          filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.method !== 'GET') return reply.code(404).send({ error: 'not_found' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }

  return app;
}
