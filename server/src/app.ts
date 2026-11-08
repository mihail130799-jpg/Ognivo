import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './env.js';
import { HttpError } from './lib/http.js';
import { authPlugin } from './plugins/auth.js';
import { meRoutes } from './routes/me.js';
import { taskRoutes } from './routes/tasks.js';
import { habitRoutes } from './routes/habits.js';
import { moneyRoutes } from './routes/money.js';
import { savingsRoutes } from './routes/savings.js';
import { sportRoutes } from './routes/sport.js';

export function buildApp(opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/api/health', async () => ({ ok: true }));

  // Всё, что ниже, требует входа через Telegram.
  app.register(
    async (scope) => {
      await authPlugin(scope);
      await scope.register(meRoutes);
      await scope.register(taskRoutes);
      await scope.register(habitRoutes);
      await scope.register(moneyRoutes);
      await scope.register(savingsRoutes);
      await scope.register(sportRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
