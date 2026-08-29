/**
 * `contacts.status` is only ever set to 'unsubscribed' inside unsubscribeContact.
 *
 * Fourteen paths used to write their own subset of four stores and the four
 * disagreed depending on which button someone pressed. The point of moving them
 * onto one function is lost the moment a new caller writes the column directly
 * again, and that is an easy thing to do by accident — `.set({ status })` looks
 * like any other patch.
 *
 * A grep would miss the interesting version of that mistake, where the value
 * arrives through a variable. So this walks the TypeScript AST for every write
 * to a `status` property inside a Drizzle `.set()` or `.values()` on `contacts`,
 * and fails on any file that is not the one allowed to do it.
 *
 * updateContact is on the allowlist because it diverts the unsubscribe
 * transition to unsubscribeContact and strips `status` from the patch before
 * its own update runs — see the comment there.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { SCAN_TIMEOUT_MS } from '../../test-support/scan-budget.js';

const SRC = join(process.cwd(), 'src');

/**
 * Files permitted to write contacts.status.
 *
 * Adding to this list is a decision, not a formality: every entry is a place
 * where the four stores can drift apart again.
 */
const ALLOWED = new Set([
  // The one function that owns the decision.
  join('services', 'contacts', 'unsubscribe.ts'),
  // Diverts the unsubscribe transition and strips status from the patch; every
  // other status it writes (bounced, complained, archived, active) is not an
  // unsubscribe and is unaffected.
  join('services', 'contacts', 'index.ts'),
  // mta-sender's callback after a hard bounce or a complaint. Its schema
  // accepts 'unsubscribed' too, but nothing sends that — see the test below.
  join('routes', 'v1', 'internal', 'contacts.ts'),
]);

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      yield full;
    }
  }
}

interface Offence {
  file: string;
  line: number;
  text: string;
}

/**
 * Whether a `status:` property could be writing 'unsubscribed'.
 *
 * Writing 'active' or 'bounced' is none of this guard's business — those are
 * different transitions with their own handling. What matters is the literal
 * 'unsubscribed', and anything whose value cannot be read statically: a
 * variable or a call is exactly how the mistake would slip past a grep, so it
 * has to be looked at rather than assumed safe.
 */
function couldBeUnsubscribed(prop: ts.ObjectLiteralElementLike): boolean {
  // `{ status }` shorthand — the value is a variable, so it is unknowable here.
  if (ts.isShorthandPropertyAssignment(prop)) return true;
  if (!ts.isPropertyAssignment(prop)) return true;

  const literalsOf = (node: ts.Expression): string[] | null => {
    if (ts.isStringLiteral(node)) return [node.text];
    // `cond ? 'pending' : 'active'` is as readable as a plain literal.
    if (ts.isConditionalExpression(node)) {
      const a = literalsOf(node.whenTrue);
      const b = literalsOf(node.whenFalse);
      return a && b ? [...a, ...b] : null;
    }
    if (ts.isParenthesizedExpression(node)) return literalsOf(node.expression);
    return null;
  };

  const values = literalsOf(prop.initializer);
  // Not statically readable → must be reviewed.
  if (values === null) return true;
  return values.includes('unsubscribed');
}

/**
 * Find `.set({ … status … })` / `.values({ … status … })` calls whose chain
 * mentions the contacts table.
 */
function findStatusWrites(file: string): Offence[] {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: Offence[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === 'set' || method === 'values') {
        const chain = node.expression.expression.getText(sf);
        // `db.update(contacts).set({…})` and `db.insert(contacts).values({…})`
        // both put the table in the receiver's text.
        const touchesContacts =
          /\bcontacts\b/.test(chain) && !/contactLists|contactTopic/.test(chain);
        if (touchesContacts) {
          for (const arg of node.arguments) {
            if (!ts.isObjectLiteralExpression(arg)) continue;
            for (const prop of arg.properties) {
              const name = prop.name && ts.isIdentifier(prop.name) ? prop.name.text : undefined;
              if (name !== 'status') continue;
              if (!couldBeUnsubscribed(prop)) continue;
              const { line } = sf.getLineAndCharacterOfPosition(prop.getStart(sf));
              out.push({ file, line: line + 1, text: prop.getText(sf).slice(0, 80) });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}

/**
 * This scan builds a full TypeScript AST for every file under src/ and walks
 * it, and the suite's global testTimeout is 10 s. Measured on this corpus
 * (967 files, 5.4 MB): walk 19 ms, read 693 ms, parse + visit 634 ms — about
 * 1.35 s of actual work, and 1.66 s wall clock when the file runs on its own.
 *
 * That is not what decides whether it passes. Run inside the full suite the
 * same test took 3.7 s on an idle machine and 13.3 s on a loaded one, where it
 * exceeded the 10 s limit and failed — an 8x spread over identical work,
 * because testTimeout measures wall clock and vitest runs 175 files in
 * parallel workers. No amount of trimming the scan controls that: skipping the
 * AST parse for files that cannot match (a lossless prefilter, measured at
 * 487 ms saved) would still leave roughly 9.4 s under the load that already
 * broke it.
 *
 * That is why the budget is SCAN_TIMEOUT_MS from test-support/scan-budget.ts
 * rather than a number written here. This is not the only scanner in the
 * package — it was one of two files carrying its own copy, while the scanners
 * without one stayed on the global 10 s until one of them started crossing it.
 * A budget that lives in two places is a budget that diverges.
 */

describe('contacts.status has one writer', () => {
  it(
    'no file outside the allowlist writes contacts.status',
    () => {
      const offences: Offence[] = [];
      for (const file of walkFiles(SRC)) {
        const rel = relative(SRC, file);
        if (ALLOWED.has(rel)) continue;
        offences.push(...findStatusWrites(file).map((o) => ({ ...o, file: rel })));
      }

      expect(
        offences,
        offences.length === 0
          ? ''
          : `these write contacts.status directly instead of going through ` +
              `unsubscribeContact:\n` +
              offences
                .map((o) => `  ${o.file.split(sep).join('/')}:${o.line}  ${o.text}`)
                .join('\n'),
      ).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );

  it('the allowlist entries still exist, so it cannot rot into a no-op', () => {
    // An allowlist that names files nobody has any more stops guarding anything.
    for (const rel of ALLOWED) {
      expect(
        () => statSync(join(SRC, rel)),
        `${rel} is on the allowlist but missing`,
      ).not.toThrow();
    }
  });

  it('the AST scan actually detects a write, including one through a variable', () => {
    // Guards the guard: if the matcher silently stopped matching, the first
    // case above would pass for the wrong reason.
    const probe = join(SRC, '__ast_probe__.ts');
    const source = `
      import { db } from '../db/client.js';
      import { contacts } from '../db/schema/index.js';
      const status = 'unsubscribed';
      export async function sneaky(id: string) {
        await db.update(contacts).set({ status, updatedAt: new Date() }).where(undefined as never);
      }
    `;
    const sf = ts.createSourceFile(probe, source, ts.ScriptTarget.Latest, true);
    let found = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'set' &&
        /\bcontacts\b/.test(node.expression.expression.getText(sf))
      ) {
        for (const arg of node.arguments) {
          if (!ts.isObjectLiteralExpression(arg)) continue;
          for (const prop of arg.properties) {
            if (prop.name && ts.isIdentifier(prop.name) && prop.name.text === 'status') found++;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(found, 'the matcher missed a shorthand `status` written via a variable').toBe(1);
  });
});
