import crypto from 'node:crypto';
import Fastify from 'fastify';
import errorHandler from './plugins/error-handler.js';
import swaggerPlugin from './plugins/swagger.js';
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import healthRoutes from './routes/v1/health.js';
import contactRoutes from './routes/v1/contacts.js';

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

  // Plugins
  await app.register(errorHandler);
  await app.register(swaggerPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(contactRoutes);

  return app;
}

const PORT = Number(process.env.PORT) || 3001;

buildApp()
  .then((app) => app.listen({ port: PORT, host: '0.0.0.0' }))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
