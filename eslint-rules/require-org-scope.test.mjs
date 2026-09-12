/**
 * Tests for the matcher, not for the codebase.
 *
 * The rule this repo already had — no-unencoded-sql-param — ships with no tests
 * of its own, so there is no house pattern to copy. ESLint's own RuleTester is
 * the pattern, run by node's test runner so nothing in vitest.config or the
 * lint job has to change to pick it up:
 *
 *     node --test eslint-rules/
 *
 * The four cases below are the ones worth pinning, because each is a way the
 * rule could be wrong in a way nobody would notice: reporting nothing, missing
 * an insert, flagging a correctly scoped query, or flagging a table that has no
 * tenant at all. A rule that reports nothing still makes a lint job green.
 */
import { RuleTester } from 'eslint';
import test from 'node:test';
import rule from './require-org-scope.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

test('require-org-scope', () => {
  ruleTester.run('require-org-scope', rule, {
    valid: [
      {
        name: 'where carries orgId alongside the other condition',
        code: `db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.email, x)))`,
      },
      {
        name: 'a table with no org_id of its own is not a tenant table',
        // `sessions` genuinely has no orgId column. `users` DOES have one
        // (db/schema/users.ts:20), so it is a tenant table and not usable here.
        code: `db.select().from(sessions).where(eq(sessions.userId, userId))`,
      },
      {
        name: 'insert whose row names the org',
        code: `db.insert(contacts).values({ orgId, email })`,
      },
      {
        name: 'orgId reached through a variable still counts as a mention',
        code: `db.update(contacts).set({ status }).where(and(eq(contacts.orgId, org), eq(contacts.id, id)))`,
      },

      // ── exemption 1: equality on this table's primary key ─────────────────
      {
        name: 'update keyed on the primary key',
        code: `db.update(contacts).set({ status }).where(eq(contacts.id, existing.id))`,
      },
      {
        name: 'delete keyed on the primary key',
        code: `db.delete(contacts).where(eq(contacts.id, id))`,
      },

      // ── exemption 2: conditions assembled in the same function ────────────
      {
        name: 'conditions seeded with orgId, then pushed to',
        code: `function listAccounts(orgId, opts) {
          const conditions = [eq(accounts.orgId, orgId)];
          if (opts.industry) conditions.push(eq(accounts.industry, opts.industry));
          return db.select().from(accounts).where(and(...conditions));
        }`,
      },
      {
        name: 'orgId pushed onto conditions rather than seeded',
        code: `function listAccounts(orgId) {
          const conditions = [isNull(accounts.deletedAt)];
          conditions.push(eq(accounts.orgId, orgId));
          return db.select().from(accounts).where(and(...conditions));
        }`,
      },

      // ── exemption 3: rows assembled in the same function ──────────────────
      {
        name: 'values() given an array built with orgId in each row',
        code: `function ingest(orgId, rows) {
          const toInsert = [];
          for (const r of rows) toInsert.push({ orgId, body: r.body });
          return db.insert(inboxMessages).values(toInsert);
        }`,
      },
    ],
    invalid: [
      {
        name: 'select whose only condition is the email',
        code: `db.select().from(contacts).where(eq(contacts.email, x))`,
        errors: [{ messageId: 'missingOrgScope' }],
      },
      {
        name: 'insert whose row does not name the org',
        code: `db.insert(contacts).values({ email })`,
        errors: [{ messageId: 'missingOrgScope' }],
      },
      {
        name: 'select with no predicate at all',
        code: `db.select().from(contacts)`,
        errors: [{ messageId: 'noScopeCarrier' }],
      },
      // ── the near misses each exemption must NOT swallow ───────────────────
      {
        // 1: equality, but on a column that is not the key. This is the exact
        // shape of the four defects found by hand (#155–#158).
        name: 'update keyed on a non-key column',
        code: `db.update(contacts).set({ status }).where(eq(contacts.email, email))`,
        errors: [{ messageId: 'missingOrgScope' }],
      },
      {
        // 1: a SELECT by key is still reported. It hands a row to a caller who
        // may not check whose it is — which is how the Stripe lookups leaked.
        name: 'select keyed on the primary key is still reported',
        code: `db.select().from(contacts).where(eq(contacts.id, id))`,
        errors: [{ messageId: 'missingOrgScope' }],
      },
      {
        // 2: conditions assembled, none of them the org.
        name: 'conditions built without orgId',
        code: `function listAccounts(opts) {
          const conditions = [isNull(accounts.deletedAt)];
          if (opts.industry) conditions.push(eq(accounts.industry, opts.industry));
          return db.select().from(accounts).where(and(...conditions));
        }`,
        errors: [{ messageId: 'missingOrgScope' }],
      },
      {
        // 3: rows assembled, none of them naming the org.
        name: 'values() given an array built without orgId',
        code: `function ingest(rows) {
          const toInsert = [];
          for (const r of rows) toInsert.push({ body: r.body });
          return db.insert(inboxMessages).values(toInsert);
        }`,
        errors: [{ messageId: 'missingOrgScope' }],
      },
      {
        // 2 and 3 are same-function only: a value built by a helper elsewhere
        // is not followed, so it is still reported.
        name: 'conditions built by a helper in another scope',
        code: `function listAccounts(orgId) {
          const conditions = buildConditions(orgId);
          return db.select().from(accounts).where(and(...conditions));
        }`,
        errors: [{ messageId: 'missingOrgScope' }],
      },
    ],
  });
});
