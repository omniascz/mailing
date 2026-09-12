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
      {
        name: 'update scoped only by primary key',
        code: `db.update(contacts).set({ status }).where(eq(contacts.id, id))`,
        errors: [{ messageId: 'missingOrgScope' }],
      },
    ],
  });
});
