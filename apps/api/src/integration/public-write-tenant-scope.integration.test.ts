/**
 * A public route may be unauthenticated. It may not be told which tenant to
 * write to.
 *
 * `POST /public/surveys/:id/submit` is anonymous on purpose — a hosted survey
 * is answered by a customer's customer, who has no session. It took `orgId`
 * from the request body and passed it through unchecked, so the caller chose
 * the tenant. That is the helpdesk CSAT hole from #121 in a shape that probe
 * could not see: it searched for unguarded routes that READ org data, and this
 * one is deliberately open and WRITES.
 *
 * Three things are asserted, and the third is the one that makes the first two
 * a fix rather than an outage (#86):
 *
 *   1. a body naming another tenant cannot put a row in that tenant's data
 *   2. the same, from the other side — org B cannot reach org A and org A
 *      cannot reach org B (#123's rule: one direction passes against a handler
 *      that writes nothing for anyone)
 *   3. a legitimate anonymous submission to a real survey still lands, and
 *      lands against the survey's OWN org
 *
 * The row is read back from the database in every case. A 200 with no row and
 * a 200 with a row in the wrong place look identical from the response.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations } from '../db/schema/index.js';
import { surveys, surveyResponses } from '../db/schema/surveys.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

interface Tenant {
  label: string;
  orgId: string;
  surveyId: string;
}
let A: Tenant;
let B: Tenant;

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 250) + 1)}`;

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `pub ${label} ${tag}`, slug: `pub-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  const [s] = await db
    .insert(surveys)
    .values({
      orgId: org!.id,
      name: `survey ${label} ${tag}`,
      questions: [{ id: 'nps', type: 'nps', label: 'How likely?', required: true }],
      active: true,
    })
    .returning({ id: surveys.id });
  return { label, orgId: org!.id, surveyId: s!.id };
}

/** Every response row currently attached to an org. */
async function responsesFor(orgId: string) {
  return db.select().from(surveyResponses).where(eq(surveyResponses.orgId, orgId));
}

function submit(surveyId: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/public/surveys/${surveyId}/submit`,
    payload,
    remoteAddress: nextAddress(),
  });
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  A = await makeTenant('a');
  B = await makeTenant('b');
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('a body cannot choose the tenant', () => {
  it("naming org B on org A's survey does not write anything into org B", async () => {
    const before = (await responsesFor(B.orgId)).length;

    const res = await submit(A.surveyId, {
      orgId: B.orgId, // the forged claim
      answers: { nps: 9 },
    });

    // The response is accepted — the survey is real and the answer is valid.
    // What must not happen is the row landing in B.
    expect(res.statusCode, res.body).toBe(202);
    expect(
      (await responsesFor(B.orgId)).length,
      "a forged orgId must not put a row in org B's data",
    ).toBe(before);
  });

  it("and the row it did write belongs to org A, the survey's owner", async () => {
    const rows = await db
      .select()
      .from(surveyResponses)
      .where(and(eq(surveyResponses.surveyId, A.surveyId), eq(surveyResponses.orgId, A.orgId)));
    expect(rows.length, 'the response belongs to the survey’s org').toBeGreaterThan(0);
  });

  it('the same in the other direction — B’s survey, A named in the body', async () => {
    const before = (await responsesFor(A.orgId)).length;

    const res = await submit(B.surveyId, { orgId: A.orgId, answers: { nps: 3 } });
    expect(res.statusCode, res.body).toBe(202);

    expect((await responsesFor(A.orgId)).length, 'org A must gain nothing').toBe(before);
    const bRows = await db
      .select()
      .from(surveyResponses)
      .where(and(eq(surveyResponses.surveyId, B.surveyId), eq(surveyResponses.orgId, B.orgId)));
    expect(bRows.length).toBeGreaterThan(0);
  });

  it('an orgId in the body is ignored, not rejected — old senders keep working', async () => {
    // The field is dropped from the schema rather than forbidden. A hosted page
    // cached in a browser may still send it, and refusing would break a survey
    // that is answering correctly.
    const res = await submit(A.surveyId, { orgId: randomUUID(), answers: { nps: 7 } });
    expect(res.statusCode, res.body).toBe(202);
  });
});

describe('the legitimate path still works', () => {
  it('an anonymous answer to a real survey lands, with its NPS score', async () => {
    const before = (await responsesFor(A.orgId)).length;

    const res = await submit(A.surveyId, { answers: { nps: 10 } });
    expect(res.statusCode, res.body).toBe(202);

    const after = await responsesFor(A.orgId);
    expect(after.length, 'the answer must be recorded').toBe(before + 1);

    const latest = after.sort((x, y) => y.submittedAt.getTime() - x.submittedAt.getTime())[0]!;
    expect(latest.surveyId).toBe(A.surveyId);
    expect(latest.orgId).toBe(A.orgId);
    // Proves the handler still ran its work rather than merely not crashing.
    expect(latest.npsScore).toBe(10);
  });

  it('the survey’s submit counter still advances', async () => {
    const [before] = await db
      .select({ n: surveys.submitCount })
      .from(surveys)
      .where(eq(surveys.id, B.surveyId));

    await submit(B.surveyId, { answers: { nps: 8 } });

    const [after] = await db
      .select({ n: surveys.submitCount })
      .from(surveys)
      .where(eq(surveys.id, B.surveyId));
    expect(after!.n).toBe(before!.n + 1);
  });
});

describe('a survey that does not exist', () => {
  it('is refused rather than silently accepted', async () => {
    // Before the fix this wrote a row for a non-existent survey, tagged with
    // whatever org the body claimed — the caller was told 200 and nothing had
    // been recorded anywhere a person could find it.
    const res = await submit(randomUUID(), { answers: { nps: 5 } });
    expect(res.statusCode, res.body).toBe(404);
  });
});
