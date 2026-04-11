import crypto from 'node:crypto';
import Fastify from 'fastify';
import errorHandler from './plugins/error-handler.js';
import swaggerPlugin from './plugins/swagger.js';
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import cookiePlugin from './plugins/cookie.js';
import authPlugin from './plugins/auth.js';
import healthRoutes from './routes/v1/health.js';
import contactRoutes from './routes/v1/contacts.js';
import authRoutes from './routes/v1/auth.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      ...(process.env.NODE_ENV !== 'production' && {
        transport: { target: 'pino-pretty' },
      }),
    },
    genReqId: () => crypto.randomUUID(),
  });

  // Plugins (order matters: cookie → auth → routes)
  await app.register(errorHandler);
  await app.register(swaggerPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(cookiePlugin);
  await app.register(authPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(contactRoutes);
  await app.register(authRoutes);

  return app;
}

const PORT = Number(process.env.PORT) || 3001;

if (import.meta.url === `file://${process.argv[1]}`) {
  buildApp()
    .then((app) => app.listen({ port: PORT, host: '0.0.0.0' }))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
