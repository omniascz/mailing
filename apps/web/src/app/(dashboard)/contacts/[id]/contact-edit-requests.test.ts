import { describe, it, expect } from 'vitest';
import {
  CONTACT_STATUSES,
  LIFECYCLE_STAGES,
  buildContactEditRequests,
} from './contact-edit-requests';

const ID = '00000000-0000-4000-8000-000000000001';
const form = {
  email: ' jana@example.test ',
  phone: '',
  firstName: 'Jana',
  lastName: 'Nováková',
  status: 'active',
  lifecycleStage: 'customer',
};
const current = (status: string, lifecycleStage: string | null) => ({ status, lifecycleStage });

describe('buildContactEditRequests', () => {
  it('never puts the stage into the PUT body — that schema drops it', () => {
    const [put] = buildContactEditRequests(ID, current('active', 'subscriber'), form);
    expect(put).toEqual({
      method: 'PUT',
      path: `/api/v1/contacts/${ID}`,
      body: {
        email: 'jana@example.test',
        phone: undefined,
        firstName: 'Jana',
        lastName: 'Nováková',
      },
    });
  });

  it('a changed stage goes to the lifecycle route, after the PUT', () => {
    const requests = buildContactEditRequests(ID, current('active', 'subscriber'), form);
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `PUT /api/v1/contacts/${ID}`,
      `POST /api/v1/contacts/${ID}/lifecycle`,
    ]);
    expect(requests[1]!.body).toEqual({ toStage: 'customer', allowDowngrade: true });
  });

  it('an unchanged or empty stage sends no transition — the route refuses a no-op', () => {
    expect(buildContactEditRequests(ID, current('active', 'customer'), form)).toHaveLength(1);
    expect(
      buildContactEditRequests(ID, current('active', 'customer'), { ...form, lifecycleStage: '' }),
    ).toHaveLength(1);
  });

  it('offers exactly the API enum — no mql/sql shorthands', () => {
    expect([...LIFECYCLE_STAGES]).toEqual([
      'subscriber',
      'lead',
      'marketing_qualified_lead',
      'sales_qualified_lead',
      'opportunity',
      'customer',
      'evangelist',
      'other',
    ]);
  });
});

describe('status', () => {
  it('an unchanged status is not sent — whatever it is', () => {
    for (const s of CONTACT_STATUSES) {
      const [put] = buildContactEditRequests(ID, current(s, 'customer'), { ...form, status: s });
      expect(put!.body, s).not.toHaveProperty('status');
    }
  });

  it('a status the person changed is sent', () => {
    const [put] = buildContactEditRequests(ID, current('active', 'customer'), {
      ...form,
      status: 'unsubscribed',
    });
    expect(put!.body.status).toBe('unsubscribed');
  });

  it('the form can show every status the contact can have', () => {
    expect([...CONTACT_STATUSES]).toEqual([
      'active',
      'unsubscribed',
      'bounced',
      'complained',
      'pending',
      'non_subscribed',
      'archived',
    ]);
  });
});
