/**
 * Reject values in a drizzle sql`` fragment that reach the driver unencoded.
 *
 * ─── What goes wrong ────────────────────────────────────────────────────────
 *
 * `gte(col, value)` binds the column as the parameter's encoder, so drizzle
 * calls the column's mapToDriverValue — for a timestamp that is
 * `v => v.toISOString()` — before the value reaches postgres.js.
 *
 * A substitution inside sql`` gets no encoder at all: drizzle wraps it in
 * `new Param(value)`, whose default encoder is the identity function, so the
 * raw JS value goes to the driver. For a string or a number that is fine. For
 * a Date it throws
 *
 *     The "string" argument must be of type string or an instance of Buffer
 *     or ArrayBuffer. Received an instance of Date
 *
 * at request time — which is how three analytics routes, the marketing
 * calendar, revenue tracking, the CRM activity feed, smart sending,
 * send-time optimisation and ten more functions were answering 500 while the
 * test suite stayed green. Nothing connects a template substitution to the
 * column beside it, so only a type-aware check can see it.
 *
 * ─── What this allows ───────────────────────────────────────────────────────
 *
 *   string, number, boolean, bigint, null, undefined, literal and enum types
 *       postgres.js serialises these itself — measured, not assumed
 *   Column, SQL, Table, Param, Placeholder, Subquery
 *       not parameters at all; drizzle writes them into the query text
 *   any
 *       says nothing, so reporting it would flag dynamically built queries
 *       without evidence
 *
 * Everything else is reported. Three fixes, in order of preference:
 *
 *   1. gte(col, value) / lte(col, value)     no fragment needed
 *   2. sql.param(value, col)                 fragment needed, column to hand
 *   3. `${value.toISOString()}::timestamptz` neither available
 *
 * ─── Known limits ───────────────────────────────────────────────────────────
 *
 * Index definitions are skipped: `index().on(sql`lower(${t.email})`)` passes an
 * ExtraConfigColumn, which is a DDL identifier and never a bound parameter.
 */

/** Types drizzle writes into the query text rather than binding as a param. */
const NOT_A_PARAMETER =
  /^(PgColumn|ExtraConfigColumn|PgTable|PgTableWithColumns|SQL|SQLWrapper|Table|Aliased|Name|Placeholder|Param|StringChunk|Subquery|PgViewBase|View)/;

/**
 * ts.TypeFlags, inlined so the rule carries no runtime dependency on the
 * TypeScript package — ESLint has already loaded it for the parser services.
 */
const F = {
  any: 1 << 0,
  string: 1 << 2,
  number: 1 << 3,
  boolean: 1 << 4,
  enumLike: 1 << 5,
  bigint: 1 << 6,
  stringLiteral: 1 << 7,
  numberLiteral: 1 << 8,
  booleanLiteral: 1 << 9,
  bigintLiteral: 1 << 11,
  undefined: 1 << 15,
  null: 1 << 16,
  never: 1 << 17,
  union: 1 << 20,
};

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow values in a drizzle sql`` fragment that reach the driver without a column encoder',
    },
    schema: [],
    messages: {
      unencoded:
        'A {{type}} inside sql`` reaches the driver unencoded and throws at request time. ' +
        'Use gte(column, value) if an operator fits, otherwise sql.param(value, column), ' +
        'otherwise convert it yourself (e.g. value.toISOString() with an explicit ::timestamptz cast).',
    },
  },

  create(context) {
    const services = context.sourceCode.parserServices;
    if (!services?.program) return {};
    const checker = services.program.getTypeChecker();

    /** Inside an index()/uniqueIndex() definition? Those are DDL, not params. */
    function insideIndexDefinition(node) {
      for (let n = node.parent; n; n = n.parent) {
        if (n.type !== 'CallExpression') continue;
        const callee = n.callee;
        if (callee.type === 'Identifier' && /^(index|uniqueIndex)$/.test(callee.name)) return true;
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'on'
        ) {
          return true;
        }
      }
      return false;
    }

    /**
     * Only drizzle's `sql`, not postgres.js's.
     *
     * The driver's own tagged template runs every substitution through
     * inferType, which maps a Date to OID 1184 and an array to its element
     * type — it is the safe one. Drizzle's is the one with the identity
     * encoder. They share a name, so the import has to be resolved: without
     * this the rule reports the test helpers in apps/workers, which talk to
     * postgres.js directly and are fine.
     */
    function isDrizzleSql(tag) {
      const root = tag.type === 'MemberExpression' ? tag.object : tag;
      if (root.type !== 'Identifier') return true;
      const tsNode = services.esTreeNodeToTSNodeMap.get(root);
      if (!tsNode) return true;

      // Where the TYPE is declared, not where the identifier is. A test writes
      // `const sql = postgres(url)`, so the identifier is declared locally
      // while its type still comes from the driver package.
      const type = checker.getTypeAtLocation(tsNode);
      const decls = [
        ...(checker.getSymbolAtLocation(tsNode)?.getDeclarations() ?? []),
        ...((type.aliasSymbol ?? type.getSymbol())?.getDeclarations?.() ?? []),
      ];
      for (const d of decls) {
        const file = (d.getSourceFile?.().fileName ?? '').replace(/\\/g, '/');
        if (file.includes('drizzle-orm')) return true;
        if (/\/postgres\//.test(file)) return false;
      }
      // Unresolvable — report rather than stay quiet, so a new import shape
      // fails loudly instead of silently disabling the rule.
      return true;
    }

    /**
     * Classify with the TYPE API, not the printed string.
     *
     * The printed form lies both ways: it shows an alias (`SignalType`) rather
     * than the union of string literals behind it, and it embeds `|` inside
     * generics so any textual split shreds column types. Between them those
     * two produced 80 false positives on the first version of this rule.
     */
    function isSerialisable(type) {
      if (type.flags & F.union) return type.types.every(isSerialisable);
      if (type.flags & F.any) return true;
      if (
        type.flags &
        (F.string |
          F.number |
          F.boolean |
          F.bigint |
          F.null |
          F.undefined |
          F.stringLiteral |
          F.numberLiteral |
          F.booleanLiteral |
          F.bigintLiteral |
          F.enumLike |
          F.never)
      ) {
        return true;
      }
      const symbol = type.aliasSymbol ?? type.getSymbol();
      return NOT_A_PARAMETER.test(symbol?.getName() ?? '');
    }

    return {
      TaggedTemplateExpression(node) {
        const tag = node.tag;
        const isSql =
          (tag.type === 'Identifier' && tag.name === 'sql') ||
          (tag.type === 'MemberExpression' &&
            tag.property.type === 'Identifier' &&
            tag.property.name === 'sql');
        if (!isSql) return;
        if (!isDrizzleSql(tag)) return;
        if (insideIndexDefinition(node)) return;

        for (const expr of node.quasi.expressions) {
          const tsNode = services.esTreeNodeToTSNodeMap.get(expr);
          if (!tsNode) continue;

          const type = checker.getTypeAtLocation(tsNode);
          if (isSerialisable(type)) continue;

          const typeText = checker.typeToString(type);
          context.report({
            node: expr,
            messageId: 'unencoded',
            data: { type: typeText.length > 40 ? `${typeText.slice(0, 40)}…` : typeText },
          });
        }
      },
    };
  },
};
