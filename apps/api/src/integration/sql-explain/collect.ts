/**
 * Layer 1, step one: find every raw sql`` template in the source tree and turn
 * the ones that are whole statements into something Postgres can plan.
 *
 * Why the AST and not a grep: a sql`` template is a TaggedTemplateExpression
 * whose tag may be `sql`, `sql.raw`, or an aliased import. Its text is split
 * across template spans with `${}` holes between them, and those holes are the
 * whole difficulty — the literal text alone is not valid SQL. Only the parser
 * gives us the spans and the expression inside each hole as separate things.
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

/** A hole is one `${...}` inside the template. */
export interface Hole {
  /** Source text of the expression, e.g. `orgId` or `emailEvents.createdAt`. */
  text: string;
}

export interface Template {
  file: string;
  /** 1-indexed line of the sql`` tag itself. */
  line: number;
  /** Tag as written: `sql`, `sql.raw`, … */
  tag: string;
  /** Literal chunks, one more than there are holes. */
  chunks: string[];
  holes: Hole[];
  /** Opted out via a `sql-explain-ignore:` marker; carries the stated reason. */
  ignoreReason: string | null;
}

/**
 * Deliberately-invalid SQL does exist — the layer 2 guard is tested with
 * queries that name a column on purpose. Those need a way to say so at the
 * site, with a reason, rather than the collector growing a hardcoded list of
 * blessed files.
 *
 *     // sql-explain-ignore: fixture for the guard, must name a missing column
 *     await db.execute(sql`SELECT no_such_column FROM email_events`);
 *
 * The marker is searched for in the two lines above the tag only, so it cannot
 * silence a whole file by accident.
 */
const IGNORE_MARKER = /sql-explain-ignore:\s*(.+)/;

/** Identifiers a raw-SQL template can be tagged with, including local aliases. */
const SQL_TAG_ROOTS = new Set(['sql', 'drizzleSql']);

/**
 * Cheap pre-filter so we do not hand ~1200 files to the parser when most hold
 * no sql`` at all. Derived from SQL_TAG_ROOTS so the two cannot drift, and it
 * has to allow for two forms that are easy to miss:
 *
 *   sql<number>`…`      drizzle's typed form — a plain includes('sql`') drops
 *                       77 templates across 5 files
 *   drizzleSql`…`       an aliased import — `\bsql` never matches inside it
 *
 * Both mistakes were made here before the count was pinned. Over-matching is
 * harmless: this only decides whether a file is parsed, and the AST decides
 * what actually counts.
 */
const PREFILTER = new RegExp(`(?:${[...SQL_TAG_ROOTS].join('|')})\\s*(?:<[^\`]*>)?\\s*\``);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Collect every sql`` template under the given roots.
 *
 * `.test.ts` files are collected too: a raw query in a test is as capable of
 * naming a column that does not exist as one in a service, and two of the
 * templates in this repo live in worker integration tests.
 */
export function collectTemplates(roots: string[], repoRoot: string): Template[] {
  const files = roots.flatMap((r) => walk(path.resolve(repoRoot, r)));
  const templates: Template[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (!PREFILTER.test(source)) continue;

    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const lines = source.split(/\r?\n/);
    const visit = (node: ts.Node): void => {
      if (ts.isTaggedTemplateExpression(node)) {
        const chain: string[] = [];
        let t: ts.Expression = node.tag;
        while (ts.isPropertyAccessExpression(t)) {
          chain.unshift(t.name.text);
          t = t.expression;
        }
        const root = ts.isIdentifier(t) ? t.text : null;
        if (root && SQL_TAG_ROOTS.has(root)) {
          const tpl = node.template;
          const chunks: string[] = [];
          const holes: Hole[] = [];
          if (ts.isNoSubstitutionTemplateLiteral(tpl)) {
            chunks.push(tpl.text);
          } else {
            chunks.push(tpl.head.text);
            for (const span of tpl.templateSpans) {
              holes.push({ text: span.expression.getText(sf) });
              chunks.push(span.literal.text);
            }
          }
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          const above = lines.slice(Math.max(0, line - 3), line).join('\n');
          const marker = IGNORE_MARKER.exec(above);
          templates.push({
            file: path.relative(repoRoot, file).split(path.sep).join('/'),
            line,
            tag: [root, ...chain].join('.'),
            chunks,
            holes,
            ignoreReason: marker ? marker[1]!.trim() : null,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return templates;
}
