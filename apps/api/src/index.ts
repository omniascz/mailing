import crypto from 'node:crypto';
import Fastify from 'fastify';

const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
    },
  },
  genReqId: () => crypto.randomUUID(),
});

const PORT = Number(process.env.PORT) || 3001;

app.get('/health', async () => ({ status: 'ok', service: 'forgemsg-api' }));

async function start() {
  await app.listen({ port: PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
