/**
 * Warn when a query against a tenant-owned table carries no reference to orgId.
 *
 * ─── Why a lint rule and not row-level security ──────────────────────────────
 *
 * RLS was measured first and does not apply here. The role in DATABASE_URL is
 * `forgemsg`, which Postgres makes a superuser at initdb and which owns all 311
 * tables: `rolsuper = t`, `rolbypassrls = t`. A policy on `contacts` was
 * enabled in a transaction and that role still read both tenants' rows — with
 * FORCE ROW LEVEL SECURITY too, because FORCE subjects the owner and not a
 * superuser. On top of that ~99% of queries run in autocommit against one
 * shared postgres-js pool, so `SET LOCAL app.org_id` would not survive and a
 * plain `SET` would leak between tenants. And a missing setting makes SELECT
 * return nothing rather than fail, which is the quiet failure shape this
 * codebase keeps finding.
 *
 * A lint rule fails at build time instead, and can be adopted a package at a
 * time. It is deliberately noisy: four cross-tenant defects were found by hand
 * in five rounds (Stripe purchase, Stripe customer, Calendly + Mailchimp
 * contact, Mailchimp tag), each one a `where` missing `org_id`, and a rule that
 * stays quiet would have caught none of them.
 *
 * ─── WHAT THIS RULE CANNOT SEE ───────────────────────────────────────────────
 *
 * Read this list before trusting a green run.
 *
 *   sql`` templates — 663 of them in apps/api and apps/workers. Raw SQL is not
 *       inspected at all. `db.execute(sql`…`)` is invisible, and so is a
 *       handwritten predicate passed into `.where(sql`…`)`.
 *   Queries through a variable — `const t = contacts; db.select().from(t)`.
 *       The table position has to be an identifier this rule recognises, so
 *       anything indirect is simply not matched.
 *   Dynamically assembled conditions — `const conds = [...]; if (x)
 *       conds.push(...); .where(and(...conds))`. If `orgId` is pushed on a
 *       branch the rule cannot follow, it reports a query that is in fact
 *       scoped. That direction is the intended one: noise over silence.
 *   Join tables with no org_id of their own — contact_tags, contact_lists,
 *       contact_groups, holdout_group_members, mv_variant_assignments,
 *       blog_post_revisions, cta_variants, ticket_messages,
 *       ip_warmup_schedules. They belong to a tenant through a relation, so
 *       they are not in the tenant set and queries against them are never
 *       reported — yet they are exactly where #157 and #158 went wrong.
 *   co_marketing_campaigns has initiator_org_id AND partner_org_id, so a
 *       single-tenant check is the wrong question for it.
 *   Whether the orgId is the RIGHT one. The rule sees a reference, not a
 *       provenance. `eq(contacts.orgId, req.body.orgId)` passes and is a
 *       cross-tenant hole. #155 and #156 were both "the org came from the
 *       payload" problems that this rule would not have judged.
 *
 * ─── How the tenant set is derived ───────────────────────────────────────────
 *
 * Read out of apps/api/src/db/schema/*.ts at load: every
 * `export const X = pgTable('…', { … orgId: … })`. Derived rather than written
 * down so a new table is covered the day it is added, and so the list cannot
 * drift from the schema the way a copy would.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Methods whose first argument names the table being written to. */
const TABLE_IN_FIRST_ARG = new Set(['insert', 'update', 'delete', 'from']);

/** Where the scope is expected to appear, per query shape. */
const SCOPE_CARRIERS = new Set(['where', 'values']);

function deriveTenantTables() {
  const here = dirname(fileURLToPath(import.meta.url));
  const schemaDir = join(here, '..', 'apps', 'api', 'src', 'db', 'schema');
  const tenant = new Set();
  /** export name -> Set of primary-key property names, read from the schema. */
  const primaryKeys = new Map();
  let files;
  try {
    files = readdirSync(schemaDir);
  } catch {
    // No schema to read (rule used outside this repo): match nothing rather
    // than guess, so the rule is silent instead of wrong.
    return { tenant, primaryKeys };
  }
  for (const file of files) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts') || file === 'index.ts') continue;
    const source = readFileSync(join(schemaDir, file), 'utf8');
    // One chunk per export, so `orgId:` is attributed to the table it is in
    // rather than to whichever table happens to be declared above it.
    for (const chunk of source.split(/export const /g).slice(1)) {
      const name = /^([A-Za-z0-9_]+)\s*=\s*pgTable\(/.exec(chunk)?.[1];
      if (!name) continue;
      if (/\n\s*orgId:\s*(uuid|varchar|text)\(/.test(chunk)) tenant.add(name);

      // Primary key read from the schema, not guessed from a column being
      // called `id`. Both shapes this repo uses are covered: 305 inline
      // `id: uuid('id').primaryKey()` and 5 composite
      // `primaryKey({ columns: [t.contactId, t.listId] })`.
      // Sliced per property rather than matched on one line: the common
      // declaration here wraps, as `id: uuid('id')\n  .primaryKey()`, and a
      // single-line regex sees none of them.
      const pk = new Set();
      const props = [...chunk.matchAll(/\n\s{2,}([A-Za-z0-9_]+):/g)];
      for (let i = 0; i < props.length; i++) {
        const start = props[i].index;
        const end = i + 1 < props.length ? props[i + 1].index : chunk.length;
        if (chunk.slice(start, end).includes('.primaryKey()')) pk.add(props[i][1]);
      }
      const composite = /primaryKey\(\{\s*columns:\s*\[([^\]]+)\]/.exec(chunk);
      if (composite) {
        for (const part of composite[1].split(',')) {
          const col = /\.([A-Za-z0-9_]+)\s*$/.exec(part.trim())?.[1];
          if (col) pk.add(col);
        }
      }
      if (pk.size > 0) primaryKeys.set(name, pk);
    }
  }
  return { tenant, primaryKeys };
}

const { tenant: TENANT_TABLES, primaryKeys: PRIMARY_KEYS } = deriveTenantTables();

/** Does this subtree mention orgId at all? Identifier, property or string. */
function mentionsOrgScope(node, sourceCode) {
  let found = false;
  const visit = (n) => {
    if (found || !n || typeof n.type !== 'string') return;
    if (n.type === 'Identifier' && (n.name === 'orgId' || n.name === 'org_id')) {
      found = true;
      return;
    }
    if (n.type === 'Literal' && typeof n.value === 'string' && n.value === 'org_id') {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      const child = n[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object' && typeof child.type === 'string') visit(child);
    }
  };
  visit(node);
  if (found) return true;
  // A `sql`…`` predicate is not inspected (see the header), but if its text
  // names the column, take it: reporting it would be noise with a known cause.
  return /\borg_?id\b/i.test(sourceCode.getText(node));
}

/** Walk a chained call expression from the root down to its base. */
function collectChain(root) {
  const calls = [];
  let node = root;
  while (node && node.type === 'CallExpression') {
    if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
      calls.push({ method: node.callee.property.name, node });
      node = node.callee.object;
    } else {
      break;
    }
  }
  return calls.reverse();
}

/**
 * EXEMPTION 1 — a predicate that is equality on this table's primary key.
 *
 * `update(contacts).set({…}).where(eq(contacts.id, existing.id))` is already as
 * narrow as a query can be: one row, found by the key. In every instance read
 * from the 603 warnings the id came from a lookup the same function had already
 * scoped — ads/lead-sync.ts:109 is the clearest, fetching `existing` with
 * `eq(contacts.orgId, orgId)` two statements earlier. Reporting it asks for a
 * condition that cannot change which row is touched.
 *
 * The key comes from the schema, so a table whose key is not called `id` is
 * handled and a plain column called `id` on a keyless table is not.
 */
function isPrimaryKeyPredicate(arg, table) {
  const pk = PRIMARY_KEYS.get(table);
  if (!pk || !arg || arg.type !== 'CallExpression') return false;
  if (arg.callee.type !== 'Identifier' || arg.callee.name !== 'eq') return false;
  const [column] = arg.arguments;
  if (!column || column.type !== 'MemberExpression') return false;
  if (column.property.type !== 'Identifier') return false;
  // The column must belong to the table being queried, not to a joined one.
  if (column.object.type !== 'Identifier' || column.object.name !== table) return false;
  return pk.has(column.property.name);
}

/**
 * A stricter mention, for the same-scope exemptions only: the org has to appear
 * as a COLUMN (`accounts.orgId`) or as a property being written (`{ orgId }`),
 * not merely as an identifier handed to something.
 *
 * The loose check would accept `const conditions = buildConditions(orgId)` —
 * which proves nothing, because whether that helper filters on the org is
 * exactly what cannot be seen from here. The test
 * "conditions built by a helper in another scope" is that case, and it caught
 * this being too wide.
 */
function mentionsOrgColumnOrProperty(node) {
  let found = false;
  const visit = (n) => {
    if (found || !n || typeof n.type !== 'string') return;
    if (
      n.type === 'MemberExpression' &&
      n.property.type === 'Identifier' &&
      (n.property.name === 'orgId' || n.property.name === 'org_id')
    ) {
      found = true;
      return;
    }
    if (
      n.type === 'Property' &&
      ((n.key.type === 'Identifier' && (n.key.name === 'orgId' || n.key.name === 'org_id')) ||
        (n.key.type === 'Literal' && n.key.value === 'org_id'))
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      const child = n[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object' && typeof child.type === 'string') visit(child);
    }
  };
  visit(node);
  return found;
}

/** The enclosing function body, for the two "filled in the same scope" exemptions. */
function enclosingFunction(node) {
  let n = node;
  while (n) {
    if (
      n.type === 'FunctionDeclaration' ||
      n.type === 'FunctionExpression' ||
      n.type === 'ArrowFunctionExpression' ||
      n.type === 'Program'
    ) {
      return n;
    }
    n = n.parent;
  }
  return null;
}

/**
 * EXEMPTIONS 2 and 3 — a name whose value is assembled in this same function,
 * where one of the pieces mentions orgId.
 *
 * `const conds = [eq(accounts.orgId, orgId)]; if (x) conds.push(…);
 * .where(and(...conds))` is scoped, and crm/accounts.ts:60 is exactly that
 * shape. So is `toInsert.push({ orgId, … }); .values(toInsert)` at
 * inbox/messenger.ts:106. The rule cannot evaluate the array, but it can read
 * the declarations and pushes that build it.
 *
 * Same function only — no cross-file and no cross-scope analysis, so a value
 * assembled by a helper is still reported.
 */
function scopeBuiltInSameFunction(name, fromNode) {
  const fn = enclosingFunction(fromNode);
  if (!fn) return false;
  let found = false;
  const visit = (n) => {
    if (found || !n || typeof n.type !== 'string') return;
    // `const name = [ … orgId … ]` / `let name = …`
    if (
      n.type === 'VariableDeclarator' &&
      n.id.type === 'Identifier' &&
      n.id.name === name &&
      n.init &&
      mentionsOrgColumnOrProperty(n.init)
    ) {
      found = true;
      return;
    }
    // `name.push(… orgId …)` — and `name.unshift`, same thing
    if (
      n.type === 'CallExpression' &&
      n.callee.type === 'MemberExpression' &&
      n.callee.object.type === 'Identifier' &&
      n.callee.object.name === name &&
      n.callee.property.type === 'Identifier' &&
      (n.callee.property.name === 'push' || n.callee.property.name === 'unshift') &&
      n.arguments.some((a) => mentionsOrgColumnOrProperty(a))
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      const child = n[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object' && typeof child.type === 'string') visit(child);
    }
  };
  visit(fn);
  return found;
}

/** Names referenced by a carrier argument, directly or through and(...xs) / spread. */
function referencedNames(arg) {
  const names = [];
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Identifier') {
      names.push(n.name);
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      const child = n[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object' && typeof child.type === 'string') visit(child);
    }
  };
  visit(arg);
  return names;
}

/** The table name in a `from(x)` / `insert(x)` style argument, if recognisable. */
function tableNameOf(arg) {
  if (!arg) return null;
  if (arg.type === 'Identifier') return arg.name;
  // `schema.contacts` / `tables.contacts`
  if (arg.type === 'MemberExpression' && arg.property.type === 'Identifier') {
    return arg.property.name;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'warn when a query against a tenant-owned table carries no reference to orgId',
    },
    schema: [],
    messages: {
      missingOrgScope:
        'Query against `{{table}}` has no orgId in its {{carrier}}. Every other read of a ' +
        'tenant table carries org_id; one that does not returns or writes whichever tenant ' +
        'happened to match first. If this is deliberate (a platform-wide sweep, a cron, a ' +
        'lookup by primary key that is already scoped), say so with an eslint-disable-next-line ' +
        'and a reason.',
      noScopeCarrier:
        'Query against `{{table}}` has no {{expected}} at all, so nothing restricts it to one ' +
        'tenant. Add the org_id condition, or disable this line with a reason.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        // Only look at the outermost call of a chain, so `db.select().from(x)
        // .where(y)` is judged once, with every link in view.
        const parent = node.parent;
        if (
          parent &&
          parent.type === 'MemberExpression' &&
          parent.object === node &&
          parent.parent &&
          parent.parent.type === 'CallExpression'
        ) {
          return;
        }

        const chain = collectChain(node);
        if (chain.length === 0) return;

        // Find the link that names a table, and remember which kind it was.
        let table = null;
        let kind = null;
        for (const link of chain) {
          if (!TABLE_IN_FIRST_ARG.has(link.method)) continue;
          const name = tableNameOf(link.node.arguments[0]);
          if (name && TENANT_TABLES.has(name)) {
            table = name;
            kind = link.method;
            break;
          }
        }
        if (!table) return;

        // `insert` is scoped by the row it writes; everything else by `where`.
        const expected = kind === 'insert' ? 'values(…)' : 'where(…)';
        const carriers = chain.filter((l) => SCOPE_CARRIERS.has(l.method));

        if (carriers.length === 0) {
          // A bare `db.delete(contacts)` or `db.select().from(contacts)` with no
          // predicate touches the whole table. Worth saying out loud even when
          // it is intended.
          context.report({
            node,
            messageId: 'noScopeCarrier',
            data: { table, expected },
          });
          return;
        }

        const scoped = carriers.some((l) =>
          l.node.arguments.some((arg) => {
            if (mentionsOrgScope(arg, sourceCode)) return true;

            // 1 — equality on this table's primary key. Only for update and
            // delete: a SELECT by key still hands a row to a caller that may
            // not check whose it is, which is how the Stripe defects worked.
            if ((kind === 'update' || kind === 'delete') && isPrimaryKeyPredicate(arg, table)) {
              return true;
            }

            // 2 and 3 — the predicate or the row is assembled in this same
            // function out of a piece that names the org.
            return referencedNames(arg).some((name) => scopeBuiltInSameFunction(name, l.node));
          }),
        );
        if (!scoped) {
          context.report({
            node,
            messageId: 'missingOrgScope',
            data: { table, carrier: expected },
          });
        }
      },
    };
  },
};
