/**
 * Edge-runtime entrypoint. Identical surface to `@forgemsg/next` but
 * imports nothing that touches Node-only APIs (no `node:` modules, no
 * `process.cwd`, etc.). Use this from Edge Middleware or Edge Runtime
 * route handlers.
 */

export { mailforge, createMailforge, ForgemsgClient, ForgemsgError } from './index.js';

export type {
  SendEmailParams,
  SendEmailResult,
  EmailDetail,
  EmailTag,
  EmailAttachment,
  EmailRecipient,
  BatchSendResult,
  SendOptions,
  ForgemsgClientOptions,
} from './index.js';
