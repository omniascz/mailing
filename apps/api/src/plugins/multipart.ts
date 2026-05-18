import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

async function multipartPlugin(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
      files: 1,
    },
  });
}

export default fp(multipartPlugin, { name: 'multipart' });
