/**
 * Folders for campaigns and saved templates, through the real HTTP layer.
 *
 * Two of these are not feature tests. A folder is org-scoped data, and the id
 * in the URL is supplied by the caller — so "another organisation's folder is
 * invisible and unusable" is a tenancy boundary, and it is asserted here in
 * both directions: the attempt is refused, and the other organisation's row is
 * unchanged afterwards.
 *
 * The third is the deletion rule. A folder is a label, not an owner: deleting
 * one must release what it holds and destroy nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { folders, campaigns, templates, organizations, users } from '../db/schema/index.js';

let app: FastifyInstance;
let session: Session;

const tag = randomUUID().slice(0, 8);
let orgId: string;
let otherOrg: string;
/** A folder belonging to the other organisation. Nothing here may touch it. */
let otherOrgFolder: string;
const createdFolders: string[] = [];
const createdCampaigns: string[] = [];
const createdTemplates: string[] = [];

interface FolderRow {
  id: string;
  kind: 'campaign' | 'template';
  name: string;
  itemCount: number;
}

async function post<T>(url: string, payload: Record<string, unknown>, expected = 201): Promise<T> {
  const res = await app.inject({
    method: 'POST',
    url,
    headers: { cookie: session.cookie },
    payload,
  });
  expect(res.statusCode, `${url} → ${res.body}`).toBe(expected);
  return res.json() as T;
}

async function makeFolder(kind: 'campaign' | 'template', name: string): Promise<FolderRow> {
  const body = await post<{ data: FolderRow }>('/api/v1/folders', { kind, name });
  createdFolders.push(body.data.id);
  return body.data;
}

async function makeCampaign(name: string, status: 'draft' | 'sent' = 'draft'): Promise<string> {
  const [row] = await db
    .insert(campaigns)
    .values({ orgId, name: `${name} ${tag}`, type: 'email', status })
    .returning({ id: campaigns.id });
  createdCampaigns.push(row!.id);
  return row!.id;
}

async function makeTemplate(name: string): Promise<string> {
  const [row] = await db
    .insert(templates)
    .values({ orgId, name: `${name} ${tag}` })
    .returning({ id: templates.id });
  createdTemplates.push(row!.id);
  return row!.id;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  orgId = session.orgId;

  const [other] = await db
    .insert(organizations)
    .values({ name: `folders-other-${tag}`, slug: `folders-other-${tag}` })
    .returning({ id: organizations.id });
  otherOrg = other!.id;

  const [theirs] = await db
    .insert(folders)
    .values({ orgId: otherOrg, kind: 'campaign', name: 'Their private folder' })
    .returning({ id: folders.id });
  otherOrgFolder = theirs!.id;
}, 60_000);

afterAll(async () => {
  if (createdCampaigns.length)
    await db.delete(campaigns).where(inArray(campaigns.id, createdCampaigns));
  if (createdTemplates.length)
    await db.delete(templates).where(inArray(templates.id, createdTemplates));
  if (createdFolders.length) await db.delete(folders).where(inArray(folders.id, createdFolders));
  await db.delete(folders).where(eq(folders.orgId, otherOrg));
  await db.delete(users).where(eq(users.orgId, otherOrg));
  await db.delete(organizations).where(eq(organizations.id, otherOrg));
  await app?.close();
}, 60_000);

describe('folders — the basics', () => {
  it('creates, lists and renames', async () => {
    const created = await makeFolder('campaign', `Q4 ${tag}`);
    expect(created.kind).toBe('campaign');
    expect(created.itemCount).toBe(0);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/folders?kind=campaign',
      headers: { cookie: session.cookie },
    });
    expect(list.statusCode).toBe(200);
    const rows = (list.json() as { data: FolderRow[] }).data;
    expect(rows.map((r) => r.id)).toContain(created.id);

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/folders/${created.id}`,
      headers: { cookie: session.cookie },
      payload: { name: `Q4 renamed ${tag}` },
    });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { data: FolderRow }).data.name).toBe(`Q4 renamed ${tag}`);
  });

  it('the same name is free in the other kind, taken in the same one', async () => {
    const name = `Black Friday ${tag}`;
    await makeFolder('campaign', name);
    // Same name, other kind: fine. Campaign drawers and template drawers are
    // separate namespaces.
    await makeFolder('template', name);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/folders',
      headers: { cookie: session.cookie },
      payload: { kind: 'campaign', name },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('counts what each folder holds', async () => {
    const folder = await makeFolder('campaign', `Counted ${tag}`);
    const a = await makeCampaign('counted-a');
    const b = await makeCampaign('counted-b');
    for (const id of [a, b]) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/campaigns/${id}/folder`,
        headers: { cookie: session.cookie },
        payload: { folderId: folder.id },
      });
      expect(res.statusCode).toBe(200);
    }

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/folders?kind=campaign',
      headers: { cookie: session.cookie },
    });
    const row = (list.json() as { data: FolderRow[] }).data.find((r) => r.id === folder.id);
    expect(row?.itemCount).toBe(2);
  });

  it('files a campaign that has already been sent', async () => {
    // Editing a sent campaign is refused, and rightly. Filing it is not
    // editing — the archive is what most wants tidying.
    const folder = await makeFolder('campaign', `Archive ${tag}`);
    const sent = await makeCampaign('already-sent', 'sent');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/campaigns/${sent}/folder`,
      headers: { cookie: session.cookie },
      payload: { folderId: folder.id },
    });
    expect(res.statusCode, res.body).toBe(200);
  });
});

describe('folders — the tenancy boundary', () => {
  it("another organisation's folders are not in the list", async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/folders',
      headers: { cookie: session.cookie },
    });
    const ids = (list.json() as { data: FolderRow[] }).data.map((r) => r.id);
    expect(ids).not.toContain(otherOrgFolder);
  });

  it("a campaign cannot be filed into another organisation's folder", async () => {
    const campaignId = await makeCampaign('cross-org');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/campaigns/${campaignId}/folder`,
      headers: { cookie: session.cookie },
      payload: { folderId: otherOrgFolder },
    });
    // 404, not 403: the answer must not tell the caller whether the id exists.
    expect(res.statusCode).toBe(404);

    const [after] = await db
      .select({ folderId: campaigns.folderId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(after!.folderId, 'the campaign was filed anyway').toBeNull();
  });

  it("a saved template cannot be filed into another organisation's folder", async () => {
    const templateId = await makeTemplate('cross-org-tpl');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/saved-templates/${templateId}/folder`,
      headers: { cookie: session.cookie },
      payload: { folderId: otherOrgFolder },
    });
    expect(res.statusCode).toBe(404);

    const [after] = await db
      .select({ folderId: templates.folderId })
      .from(templates)
      .where(eq(templates.id, templateId));
    expect(after!.folderId).toBeNull();
  });

  it("another organisation's folder cannot be renamed or deleted", async () => {
    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/v1/folders/${otherOrgFolder}`,
      headers: { cookie: session.cookie },
      payload: { name: 'Taken over' },
    });
    expect(rename.statusCode).toBe(404);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${otherOrgFolder}`,
      headers: { cookie: session.cookie },
    });
    expect(del.statusCode).toBe(404);

    // The other side of the boundary: their row is exactly as it was.
    const [still] = await db.select().from(folders).where(eq(folders.id, otherOrgFolder));
    expect(still, 'the folder was deleted from another organisation').toBeTruthy();
    expect(still!.name).toBe('Their private folder');
    expect(still!.orgId).toBe(otherOrg);
  });

  it('a campaign folder is not a template folder', async () => {
    // One table holds both kinds, so this is the check that keeps them apart:
    // a campaign filed under a template folder would drop out of both lists.
    const templateFolder = await makeFolder('template', `Wrong kind ${tag}`);
    const campaignId = await makeCampaign('wrong-kind');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/campaigns/${campaignId}/folder`,
      headers: { cookie: session.cookie },
      payload: { folderId: templateFolder.id },
    });
    expect(res.statusCode).toBe(404);

    const [after] = await db
      .select({ folderId: campaigns.folderId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(after!.folderId).toBeNull();
  });
});

describe('folders — deleting one that has contents', () => {
  it('releases the campaigns instead of deleting them', async () => {
    const folder = await makeFolder('campaign', `Doomed ${tag}`);
    const kept = await makeCampaign('survives-its-folder');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/campaigns/${kept}/folder`,
      headers: { cookie: session.cookie },
      payload: { folderId: folder.id },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${folder.id}`,
      headers: { cookie: session.cookie },
    });
    expect(del.statusCode).toBe(200);
    expect((del.json() as { data: { released: number } }).data.released).toBe(1);

    // The campaign is still there, and it is unfiled — not orphaned into a
    // folder id that no longer resolves.
    const [after] = await db
      .select({ id: campaigns.id, folderId: campaigns.folderId })
      .from(campaigns)
      .where(eq(campaigns.id, kept));
    expect(after, 'deleting the folder deleted the campaign').toBeTruthy();
    expect(after!.folderId).toBeNull();

    const [gone] = await db.select().from(folders).where(eq(folders.id, folder.id));
    expect(gone).toBeUndefined();
  });

  it('releases saved templates the same way', async () => {
    const folder = await makeFolder('template', `Doomed tpl ${tag}`);
    const kept = await makeTemplate('survives-its-folder');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/saved-templates/${kept}/folder`,
      headers: { cookie: session.cookie },
      payload: { folderId: folder.id },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${folder.id}`,
      headers: { cookie: session.cookie },
    });
    expect(del.statusCode).toBe(200);
    expect((del.json() as { data: { released: number } }).data.released).toBe(1);

    const [after] = await db
      .select({ id: templates.id, folderId: templates.folderId })
      .from(templates)
      .where(eq(templates.id, kept));
    expect(after).toBeTruthy();
    expect(after!.folderId).toBeNull();
  });
});

describe('folders — filtering the lists', () => {
  it('campaigns: by folder, and by no folder at all', async () => {
    const folder = await makeFolder('campaign', `Filtered ${tag}`);
    const inside = await makeCampaign('inside');
    const outside = await makeCampaign('outside');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/campaigns/${inside}/folder`,
      headers: { cookie: session.cookie },
      payload: { folderId: folder.id },
    });

    const filtered = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns?folderId=${folder.id}&limit=100`,
      headers: { cookie: session.cookie },
    });
    const ids = (filtered.json() as { data: { id: string }[] }).data.map((c) => c.id);
    expect(ids).toContain(inside);
    expect(ids).not.toContain(outside);

    const unfiled = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns?folderId=none&limit=100',
      headers: { cookie: session.cookie },
    });
    const unfiledIds = (unfiled.json() as { data: { id: string }[] }).data.map((c) => c.id);
    expect(unfiledIds).toContain(outside);
    expect(unfiledIds).not.toContain(inside);
  });

  it('saved templates: the same two filters', async () => {
    const folder = await makeFolder('template', `Filtered tpl ${tag}`);
    const inside = await makeTemplate('tpl-inside');
    const outside = await makeTemplate('tpl-outside');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/saved-templates/${inside}/folder`,
      headers: { cookie: session.cookie },
      payload: { folderId: folder.id },
    });

    const filtered = await app.inject({
      method: 'GET',
      url: `/api/v1/saved-templates?folderId=${folder.id}`,
      headers: { cookie: session.cookie },
    });
    const ids = (filtered.json() as { data: { id: string }[] }).data.map((t) => t.id);
    expect(ids).toEqual([inside]);

    const unfiled = await app.inject({
      method: 'GET',
      url: '/api/v1/saved-templates?folderId=none',
      headers: { cookie: session.cookie },
    });
    const unfiledIds = (unfiled.json() as { data: { id: string }[] }).data.map((t) => t.id);
    expect(unfiledIds).toContain(outside);
    expect(unfiledIds).not.toContain(inside);
  });

  it('a folder id from another organisation filters to nothing, not to everything', async () => {
    // The filter is applied inside the org scope, so a foreign id can only
    // ever match zero rows — it must not be silently ignored.
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns?folderId=${otherOrgFolder}&limit=100`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: unknown[] }).data).toHaveLength(0);
  });
});
