import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';

async function cookiePlugin(app: FastifyInstance) {
  await app.register(cookie, {
    secret: process.env.SESSION_SECRET || 'dev-cookie-secret-change-in-production',
    parseOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  });
}

export default fp(cookiePlugin, { name: 'cookie' });
