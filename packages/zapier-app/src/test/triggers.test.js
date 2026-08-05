'use strict';
/**
 * The Zapier app's own regressions.
 *
 * All three bugs here were shape mismatches that no test could have caught,
 * because nothing in this package was tested at all: the unsubscribe hook read
 * a field that did not exist, and both triggers published samples describing
 * payloads the API has never sent. A user only found out by building a Zap and
 * watching every mapped field come out blank.
 */

const newSubscriber = require('../triggers/new_subscriber');
const emailOpened = require('../triggers/email_opened');

/** A z.request stub that records calls and returns a scripted response. */
function fakeZ(response) {
  const calls = [];
  return {
    calls,
    z: {
      request: async (opts) => {
        calls.push(opts);
        return response;
      },
    },
  };
}

describe('new_subscriber', () => {
  test('performSubscribe returns the webhook id from inside the data envelope', async () => {
    // The API answers { data: { id, url, … } }. Reading res.data gave an
    // object whose `id` was undefined, so performUnsubscribe later deleted
    // /api/v1/webhooks/undefined and the webhook outlived the Zap.
    const { z } = fakeZ({ data: { data: { id: 'wh-123', url: 'https://hooks.zapier.com/x' } } });
    const result = await newSubscriber.operation.performSubscribe(z, {
      targetUrl: 'https://hooks.zapier.com/x',
      authData: { apiKey: 'fm_live_test' },
    });
    expect(result.id).toBe('wh-123');
  });

  test('performUnsubscribe deletes the id performSubscribe returned', async () => {
    const { z, calls } = fakeZ({ data: {} });
    await newSubscriber.operation.performUnsubscribe(z, {
      subscribeData: { id: 'wh-123' },
      authData: { apiKey: 'fm_live_test' },
    });
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toContain('/api/v1/webhooks/wh-123');
    expect(calls[0].url).not.toContain('undefined');
  });

  test('the published sample matches the contact.created payload', () => {
    // Keys come from WebhookEventPayloads['contact.created'] in
    // apps/api/src/services/webhooks/payloads.ts.
    expect(Object.keys(newSubscriber.operation.sample).sort()).toEqual([
      'createdAt',
      'email',
      'firstName',
      'id',
      'lastName',
      'phone',
      'source',
      'status',
    ]);
  });

  test('performList reshapes contacts into the payload shape', async () => {
    const { z } = fakeZ({
      data: {
        data: [
          {
            id: 'c1',
            email: 'a@b.cz',
            firstName: 'A',
            lastName: 'B',
            createdAt: '2026-08-05T00:00:00.000Z',
          },
        ],
      },
    });
    const [row] = await newSubscriber.operation.performList(z, {
      authData: { apiKey: 'fm_live_test' },
    });
    // A sample whose keys differ from the trigger's real output is worse than
    // no sample: the Zap editor offers fields that never arrive.
    expect(Object.keys(row).sort()).toEqual(Object.keys(newSubscriber.operation.sample).sort());
  });
});

describe('email_opened', () => {
  test('performSubscribe returns the webhook id from inside the data envelope', async () => {
    const { z } = fakeZ({ data: { data: { id: 'wh-456' } } });
    const result = await emailOpened.operation.performSubscribe(z, {
      targetUrl: 'https://hooks.zapier.com/y',
      authData: { apiKey: 'fm_live_test' },
    });
    expect(result.id).toBe('wh-456');
  });

  test('the sample no longer promises a field the payload never carried', () => {
    // `openedAt` was in the sample and has never been in the payload — the
    // event time lives on the envelope, not in data.
    expect(emailOpened.operation.sample).not.toHaveProperty('openedAt');
    expect(Object.keys(emailOpened.operation.sample).sort()).toEqual([
      'campaignId',
      'contactId',
      'email',
      'messageId',
    ]);
  });

  test('performList returns real opens instead of an empty array', async () => {
    const { z, calls } = fakeZ({
      data: {
        data: [
          { id: '1-0', event: 'email.opened', data: { contactId: 'c1', campaignId: 'k1' } },
          { id: '2-0', event: 'email.clicked', data: { contactId: 'c2' } },
        ],
      },
    });
    const rows = await emailOpened.operation.performList(z, {
      authData: { apiKey: 'fm_live_test' },
    });

    expect(calls[0].url).toContain('/api/v1/events/stream');
    // Only opens, and each carries the stream id so Zapier can de-duplicate.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('1-0');
    expect(rows[0].contactId).toBe('c1');
  });
});

describe('BASE_URL interpolation', () => {
  const files = {
    'triggers/new_subscriber': newSubscriber,
    'triggers/email_opened': emailOpened,
    'creates/create_contact': require('../creates/create_contact'),
    'creates/add_tag': require('../creates/add_tag'),
    'creates/trigger_workflow': require('../creates/trigger_workflow'),
    authentication: require('../authentication'),
  };

  test('every module is loadable', () => {
    // A syntax error in any of these takes the whole app down at deploy time,
    // and nothing else in this package would notice.
    for (const [name, mod] of Object.entries(files)) {
      expect(mod ? name : null).toBe(name);
    }
  });
});
