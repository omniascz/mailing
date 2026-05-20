import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

/**
 * Security headers via @fastify/helmet. Defaults are sensible; we tune
 * the bits that matter for an API serving cross-origin browser apps.
 *
 * Notably we do NOT set CSP here — the API serves JSON, not HTML.
 * Swagger UI route (/docs) gets its own permissive CSP via the swagger
 * plugin's own config.
 */
async function helmetPlugin(app: FastifyInstance) {
  await app.register(helmet, {
    // Allow Swagger UI assets to load — it pulls in inline scripts.
    contentSecurityPolicy: false,
    // HSTS is best set at the CDN/proxy layer (Cloudflare). We still
    // emit our own as defense in depth in case the proxy is misconfigured.
    strictTransportSecurity: {
      maxAge: 31_536_000, // 1 year
      includeSubDomains: true,
      preload: false, // don't ask Chrome to hardcode us without opt-in
    },
    // X-Frame-Options is legacy but cheap; the modern CSP equivalent
    // (frame-ancestors) lives in helmet's CSP defaults which we've turned off.
    frameguard: { action: 'deny' },
    // Browser hides MIME-sniff vulns.
    noSniff: true,
    // Modern privacy default; "no-referrer" would break OAuth callbacks.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Cross-Origin-Resource-Policy: "cross-origin" lets the web frontend
    // read our JSON responses; "same-site" would break the SPA on a
    // different subdomain.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // We allow embedding (e.g. preview iframes); strict opener policy
    // would break the editor iframe shell.
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
}

export default fp(helmetPlugin, { name: 'helmet' });
