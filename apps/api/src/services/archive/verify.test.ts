/**
 * A 200 from the store is a claim about a request, not about what it holds.
 *
 * These cases are the ones a silent failure actually produces: an object that
 * is there but empty, an object that is short, an object whose bytes differ.
 * Each of them satisfies "the PUT succeeded", and the statement after the PUT
 * deletes the only other copy — so each of them has to stop the delete.
 *
 * The store is stubbed here on purpose. What is under test is the decision
 * made about a response, and the round trip against real MinIO lives in
 * src/integration/archive-roundtrip.integration.test.ts.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';

/**
 * verifyArchive reads through lib/object-store's getObjectBytes now, so that is
 * what is stubbed. `undefined` stands for the store answering with no body at
 * all, which the helper turns into a throw.
 */
const readBack = vi.fn<(bucket: string, key: string) => Promise<Buffer>>();
vi.mock('../../lib/object-store.js', () => ({
  getObjectStore: async () => ({ send: vi.fn() }),
  resetObjectStore: () => {},
  putObject: vi.fn(),
  listObjectKeys: vi.fn(),
  presignUrl: vi.fn(),
  getObjectBytes: (bucket: string, key: string) => readBack(bucket, key),
  objectStoreConfig: () => ({
    endpoint: 'http://stub:9000',
    region: 'us-east-1',
    accessKeyId: 'k',
    secretAccessKey: 's',
  }),
}));

const stored = (body: string | undefined) =>
  body === undefined
    ? Promise.reject(new Error('no body'))
    : Promise.resolve(Buffer.from(body, 'utf8'));

afterEach(() => {
  readBack.mockReset();
});

/**
 * Pay for the AWS SDK's module graph in a hook, not in whichever test ran
 * first. verifyArchive imports @aws-sdk/client-s3 lazily; that import alone
 * takes ~6s cold on an idle machine, and charged to a 10s per-test budget
 * under full-suite contention it is a coin flip. Same treatment as the three
 * files in #54.
 */
beforeAll(async () => {
  await import('@aws-sdk/client-s3');
  await import('./email-events.js');
}, 60_000);

const NL = String.fromCharCode(10);
const THREE = ['{"a":1}', '{"a":2}', '{"a":3}'].join(NL);

describe('verifyArchive', () => {
  it('accepts an object that matches byte for byte', async () => {
    const { verifyArchive } = await import('./email-events.js');
    readBack.mockImplementation(() => stored(THREE));
    await expect(verifyArchive('k.ndjson', THREE)).resolves.toBeUndefined();
  });

  it('refuses an empty object', async () => {
    // The shape a swallowed body or a truncated write leaves behind, and the
    // one most likely to pass unnoticed: the key exists, the listing shows it.
    const { verifyArchive } = await import('./email-events.js');
    readBack.mockImplementation(() => stored(''));
    await expect(verifyArchive('k.ndjson', THREE)).rejects.toThrow(/stored object is empty/);
  });

  it('refuses a missing body', async () => {
    const { verifyArchive } = await import('./email-events.js');
    readBack.mockImplementation(() => stored(undefined));
    await expect(verifyArchive('k.ndjson', THREE)).rejects.toThrow(/stored object is empty/);
  });

  it('refuses a short object', async () => {
    const { verifyArchive } = await import('./email-events.js');
    readBack.mockImplementation(() => stored(['{"a":1}', '{"a":2}'].join(NL)));
    await expect(verifyArchive('k.ndjson', THREE)).rejects.toThrow(/stored 2 lines, sent 3/);
  });

  it('refuses an object with the right line count but different bytes', async () => {
    const { verifyArchive } = await import('./email-events.js');
    readBack.mockImplementation(() => stored(['{"a":1}', '{"a":2}', '{"a":9}'].join(NL)));
    await expect(verifyArchive('k.ndjson', THREE)).rejects.toThrow(/differ from what was sent/);
  });

  it('says the rows were kept, because that is what the operator needs to know', async () => {
    const { verifyArchive } = await import('./email-events.js');
    readBack.mockImplementation(() => stored(''));
    await expect(verifyArchive('k.ndjson', THREE)).rejects.toThrow(
      /left in place rather than deleted/,
    );
  });
});
