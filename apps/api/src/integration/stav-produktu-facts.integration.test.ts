/**
 * docs/STAV-PRODUKTU.md keeps its numbers, or CI says which one moved.
 *
 * The document was measured once (#199) and went stale in three rounds: after
 * #200-#202 two of its counts were wrong by two, and nothing noticed for three
 * pull requests. Prose cannot be checked by a machine and is not checked here.
 * Nine numbers can be, and those are the ones that rot silently — a wrong count
 * reads exactly like a right one.
 *
 * Same shape as the precedent this repo already uses: a constant pinned in a
 * test that fails when reality moves (BEYOND_CORE_SURFACE in
 * beyond-core-groups.integration.test.ts, MAX_KNOWN_5XX in
 * route-smoke/known-failures.ts). The difference is only where the constant
 * lives — in the document, so the document is what gets corrected.
 *
 * ─── Recomputed, never re-read ───────────────────────────────────────────────
 *
 * Every number is derived from the running app or the source of truth it came
 * from: the route surface from buildApp() + printRoutes, the groups from
 * BEYOND_CORE_GROUPS, the 5xx list from KNOWN_5XX, the templates from the
 * registry, the emails through readCampaignContent. The document is read once,
 * for comparison. A test that parsed the block twice would pass against any
 * number at all, so one case asserts the measurement itself is real: the app
 * registered a non-trivial number of routes.
 *
 * ─── On the failure message ──────────────────────────────────────────────────
 *
 * The point of this file is the message, not the red. It names the key, the
 * number in the document, the number measured, and the difference, so the
 * person who moved it can fix the document without starting an investigation.
 *
 * WHAT THIS TEST CANNOT SEE
 * - Whether a sentence is true. Nothing here reads prose.
 * - Whether a file:line reference points at what the text claims (the document
 *   no longer carries line numbers for exactly that reason).
 * - Whether a number is MISSING from the document: a fact nobody wrote down
 *   cannot drift.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestApp } from './setup/harness.js';
import { BEYOND_CORE_GROUPS } from '@forgemsg/shared/beyond-core';
import { KNOWN_5XX } from './route-smoke/known-failures.js';
import { PUBLISHED_WORKFLOW_TEMPLATES } from '../services/workflow-templates/registry.js';
import { getTemplateById } from '../services/editor/templates/index.js';
import { readCampaignContent } from '@forgemsg/editor/schema';

const DOC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/STAV-PRODUKTU.md',
);

/**
 * The numbers the document states.
 *
 * Deliberately not a YAML parser: `key: 123` lines inside the fenced block, in
 * any order, with any spacing, and `#` comments ignored. Formatting the
 * document must not turn into a failing test.
 */
function factsFromDocument(markdown: string): Record<string, number> {
  const fence = /```yaml\n([\s\S]*?)```/g;
  const facts: Record<string, number> = {};
  for (const block of markdown.matchAll(fence)) {
    for (const line of block[1]!.split('\n')) {
      const withoutComment = line.split('#')[0] ?? '';
      const m = /^\s*([a-z0-9_]+)\s*:\s*(\d+)\s*$/.exec(withoutComment);
      if (m) facts[m[1]!] = Number(m[2]);
    }
  }
  return facts;
}

/** Full paths and operations, rebuilt from printRoutes' prefix tree. */
function surfaceOf(app: FastifyInstance): { paths: number; operations: number } {
  const paths = new Set<string>();
  const operations = new Set<string>();
  const stack: string[] = [];
  for (const raw of app.printRoutes({ commonPrefix: false }).split('\n')) {
    if (!raw.trim()) continue;
    const m = /^([│\s├└─]*)(\S.*)$/.exec(raw);
    if (!m) continue;
    const depth = Math.floor(m[1]!.length / 4);
    const parsed = /^(.*?)(?:\s+\((.+?)\))?$/.exec(m[2]!)!;
    stack.length = depth;
    stack[depth] = parsed[1]!.trim();
    const full = stack.slice(0, depth + 1).join('');
    if (!parsed[2]) continue;
    paths.add(full);
    for (const verb of parsed[2].split(',').map((v) => v.trim())) {
      // HEAD is generated for every GET; counting it would double the surface.
      if (verb !== 'HEAD') operations.add(`${verb} ${full}`);
    }
  }
  return { paths: paths.size, operations: operations.size };
}

let documented: Record<string, number>;
let measured: Record<string, number>;
let app: FastifyInstance;

beforeAll(async () => {
  documented = factsFromDocument(fs.readFileSync(DOC, 'utf8'));

  // The harness enables every group (FEATURE_BEYOND_CORE, non-production), so
  // this instance is the "all groups" surface; core is that minus the groups.
  app = await createTestApp();
  await app.ready();
  const all = surfaceOf(app);

  const emailIds = new Set<string>();
  for (const template of PUBLISHED_WORKFLOW_TEMPLATES) {
    for (const node of template.nodes ?? []) {
      const builtIn = (node.config as { builtInTemplateId?: string } | undefined)
        ?.builtInTemplateId;
      if (builtIn) emailIds.add(builtIn);
    }
  }
  let rendering = 0;
  for (const id of emailIds) {
    const schema = getTemplateById(id)?.schema as
      | { subject?: string; preheader?: string; globalStyles?: unknown; blocks?: unknown[] }
      | undefined;
    if (!schema) continue;
    const parsed = readCampaignContent({
      subject: schema.subject,
      preheader: schema.preheader ?? '',
      globalStyles: (schema.globalStyles ?? {}) as Record<string, unknown>,
      blocks: schema.blocks ?? [],
    });
    if (parsed.schema) rendering++;
  }

  measured = {
    // The document states the core surface and the delta; `all` is what this
    // app serves, so core is the subtraction the document itself describes.
    core_paths: all.paths - (documented['beyond_core_paths'] ?? 0),
    core_operations: all.operations - (documented['beyond_core_operations'] ?? 0),
    beyond_core_groups: BEYOND_CORE_GROUPS.length,
    known_5xx_routes: Object.keys(KNOWN_5XX).length,
    published_workflow_templates: PUBLISHED_WORKFLOW_TEMPLATES.length,
    published_template_emails: emailIds.size,
    published_template_emails_rendering: rendering,
  };
}, 180_000);

afterAll(async () => {
  await app?.close();
}, 120_000);

describe('the measurement is real', () => {
  it('the app registered a surface worth counting', () => {
    const all = surfaceOf(app);
    expect(
      all.paths,
      'printRoutes returned nothing — the count below is meaningless',
    ).toBeGreaterThan(500);
    expect(all.operations).toBeGreaterThan(all.paths);
    // And the document was read: an empty block would make every comparison
    // below vacuous.
    expect(Object.keys(documented).length, 'no yaml facts block in the document').toBeGreaterThan(
      0,
    );
  });

  it('every fact the document states is one this test recomputes', () => {
    // Guards the other direction: a number added to the block without a
    // measurement here would be pinned by nobody.
    const computed = new Set([
      ...Object.keys(measured),
      'beyond_core_paths',
      'beyond_core_operations',
    ]);
    const orphans = Object.keys(documented).filter((key) => !computed.has(key));
    expect(orphans, `facts in the document that nothing recomputes: ${orphans.join(', ')}`).toEqual(
      [],
    );
  });
});

describe('docs/STAV-PRODUKTU.md matches the code', () => {
  for (const key of [
    'core_paths',
    'core_operations',
    'beyond_core_groups',
    'known_5xx_routes',
    'published_workflow_templates',
    'published_template_emails',
    'published_template_emails_rendering',
  ]) {
    it(`${key} is still what the document says`, () => {
      const stated = documented[key];
      const actual = measured[key];
      expect(stated, `docs/STAV-PRODUKTU.md has no \`${key}\` in its yaml facts block`).toBeTypeOf(
        'number',
      );
      expect(
        actual,
        `${key}: the document says ${stated}, the code says ${actual} ` +
          `(rozdíl ${(actual ?? 0) - (stated ?? 0)}). Oprav číslo v ` +
          `docs/STAV-PRODUKTU.md ve stejném PR, které ho pohnulo.`,
      ).toBe(stated);
    });
  }
});

describe('the beyond-core delta the document states', () => {
  /**
   * These two are not measured here: beyond-core-groups.integration.test.ts
   * already pins them as BEYOND_CORE_SURFACE and fails when they move. This
   * case only keeps the document and that test from disagreeing.
   */
  it('agrees with BEYOND_CORE_SURFACE in beyond-core-groups', () => {
    const pinned = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        'beyond-core-groups.integration.test.ts',
      ),
      'utf8',
    );
    const m = /BEYOND_CORE_SURFACE = \{ paths: (\d+), operations: (\d+) \}/.exec(pinned);
    expect(m, 'BEYOND_CORE_SURFACE is no longer declared in the shape this reads').toBeTruthy();
    expect(documented['beyond_core_paths']).toBe(Number(m![1]));
    expect(documented['beyond_core_operations']).toBe(Number(m![2]));
  });
});
