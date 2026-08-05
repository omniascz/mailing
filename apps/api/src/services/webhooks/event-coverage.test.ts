/**
 * Every event in WEBHOOK_EVENTS must have at least one emitter.
 *
 * This is the guard that would have caught the class of bug this change is
 * fixing. Six of the twenty events — contact.updated, contact.deleted,
 * campaign.sent, sms.delivered, sms.failed, workflow.completed — were
 * registrable through the API and listed by GET /webhooks/events, and nothing
 * ever emitted them. A customer could subscribe and wait forever. Nothing in
 * the type system noticed, because a list of strings and a set of call sites
 * are not connected by anything a compiler can see.
 *
 * So this connects them by parsing. It walks every .ts file under src/ with
 * the TypeScript compiler and collects the event names that reach an emitter
 * as string literals — either directly as the second argument to
 * dispatchEvent/emitWebhookEvent, or as a value in a mapping object like
 * KIND_TO_EVENT, which is how the twelve email.* events are emitted.
 *
 * It runs in the ordinary unit suite, so it is enforced by CI's Test job with
 * no new workflow step. A grep would have been shorter and wrong: `'email.sent'`
 * appears in the schema constant, in this file, and in half a dozen unrelated
 * enums, so string search cannot tell a definition from an emission.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEBHOOK_EVENTS } from '../../db/schema/webhooks.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo']);

/** Functions whose second argument is the event name. */
const EMITTERS = new Set(['dispatchEvent', 'emitWebhookEvent']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    // Tests emit events too, and an event that only a test emits is not
    // emitted. Excluding them is the whole point.
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

interface Emission {
  event: string;
  where: string;
}

function collectEmissions(): Emission[] {
  const found: Emission[] = [];

  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    // Cheap pre-filter: a file that mentions neither emitter cannot emit.
    if (![...EMITTERS].some((n) => text.includes(n))) continue;

    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const at = (n: ts.Node) => `${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const callee = ts.isIdentifier(n.expression)
          ? n.expression.text
          : ts.isPropertyAccessExpression(n.expression)
            ? n.expression.name.text
            : '';

        if (EMITTERS.has(callee)) {
          const arg = n.arguments[1];
          // A literal names the event outright.
          if (arg && ts.isStringLiteralLike(arg)) {
            found.push({ event: arg.text, where: at(n) });
          } else if (arg) {
            // Not a literal — the email.* path passes a variable looked up in
            // KIND_TO_EVENT. Those are picked up by the object-literal scan
            // below; recording the site keeps the failure message honest about
            // where indirection lives.
            found.push({ event: `<computed> ${arg.getText().slice(0, 40)}`, where: at(n) });
          }
        }
      }

      // Mapping objects whose values are event names, e.g.
      //   const KIND_TO_EVENT: Record<EmailEventKind, WebhookEvent> = { … }
      // Only counted in files that also call an emitter, which the pre-filter
      // above guarantees — so a lookup table sitting in a schema file is not
      // mistaken for an emission.
      if (ts.isObjectLiteralExpression(n)) {
        for (const prop of n.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isStringLiteralLike(prop.initializer) &&
            (WEBHOOK_EVENTS as readonly string[]).includes(prop.initializer.text)
          ) {
            found.push({ event: prop.initializer.text, where: at(prop) });
          }
        }
      }

      ts.forEachChild(n, visit);
    };

    visit(src);
  }

  return found;
}

describe('every webhook event has an emitter', () => {
  const emissions = collectEmissions();
  const emitted = new Set(emissions.filter((e) => !e.event.startsWith('<')).map((e) => e.event));

  it('finds emitters at all — a broken scanner must not pass silently', () => {
    // If the AST walk stopped working, `emitted` would be empty and every
    // assertion below would fail for the wrong reason. This says so first.
    expect(emissions.length).toBeGreaterThan(10);
    expect(emitted.has('contact.created')).toBe(true);
  });

  it.each([...WEBHOOK_EVENTS])('%s is emitted somewhere in src/', (event) => {
    expect(
      emitted.has(event),
      `No emitter found for "${event}". It is registrable through ` +
        `POST /api/v1/webhooks and listed by GET /api/v1/webhooks/events, so a ` +
        `customer can subscribe to it and will never receive anything. Either ` +
        `emit it with dispatchEvent/emitWebhookEvent, or remove it from ` +
        `WEBHOOK_EVENTS.`,
    ).toBe(true);
  });

  it('emits nothing that is not in WEBHOOK_EVENTS', () => {
    const known = new Set<string>(WEBHOOK_EVENTS);
    const strays = [...emitted].filter((e) => !known.has(e));
    expect(strays, `emitted but not declared: ${strays.join(', ')}`).toEqual([]);
  });
});
