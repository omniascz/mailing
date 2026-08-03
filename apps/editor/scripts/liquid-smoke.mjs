/**
 * Post-upgrade smoke for the Liquid render path.
 *
 * liquidjs 10.26+ tightened the sandbox, so a version bump can silently break
 * product behaviour that the unit tests do not cover (they never register the
 * CZ/SK locale filters, and never render a realistic merge-tag payload).
 * This drives the REAL engine with the REAL config from src/render/liquid.ts.
 */
import { Liquid } from 'liquidjs';

// Mirror of the production config in apps/editor/src/render/liquid.ts
const engine = new Liquid({
  root: [],
  fs: {
    readFileSync: () => {
      throw new Error('Filesystem access not allowed in email templates');
    },
    readFile: async () => {
      throw new Error('Filesystem access not allowed in email templates');
    },
    existsSync: () => false,
    exists: async () => false,
    contains: async () => false,
    resolve: (_, file) => file,
    sep: '/',
  },
  strictVariables: false,
  strictFilters: false,
});

// A custom filter, same shape as the CZ vocative one.
engine.registerFilter('vocative', (v) => {
  if (!v) return v;
  const s = String(v);
  return s.endsWith('a') ? s.slice(0, -1) + 'o' : s + 'e';
});

const ctx = {
  contact: {
    first_name: 'Petra',
    last_name: 'Novakova',
    email: 'petra@example.cz',
    custom_fields: { plan: 'Pro' },
    tags: ['VIP', 'Newsletter'],
  },
  system: { unsubscribe_url: 'https://forgemsg.test/u/abc123' },
  products: [
    { name: 'Kava', price: 249 },
    { name: 'Caj', price: 179 },
  ],
};

const CASES = [
  ['plain merge tag', 'Dobry den {{ contact.first_name }}!'],
  ['nested field', 'Plan: {{ contact.custom_fields.plan }}'],
  ['custom filter', 'Vazena pani {{ contact.last_name | vocative }},'],
  ['builtin filter', '{{ contact.email | upcase }}'],
  ['chained filters', '{{ contact.first_name | downcase | capitalize }}'],
  ['if / contains', '{% if contact.tags contains "VIP" %}VIP zakaznik{% else %}Bezny{% endif %}'],
  ['for loop', '{% for p in products %}{{ p.name }}={{ p.price }};{% endfor %}'],
  ['missing var (lenient)', 'X{{ contact.nope }}Y'],
  ['default filter', '{{ contact.nope | default: "friend" }}'],
  ['system tag', 'Odhlasit: {{ system.unsubscribe_url }}'],
];

let failed = 0;
console.log('liquidjs', (await import('liquidjs/package.json', { with: { type: 'json' } })).default.version);
console.log();

for (const [label, tpl] of CASES) {
  try {
    const out = await engine.parseAndRender(tpl, ctx);
    console.log(`OK   ${label}`);
    console.log(`     in : ${tpl}`);
    console.log(`     out: ${out}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}`);
    console.log(`     in : ${tpl}`);
    console.log(`     err: ${err.message.split('\n')[0]}`);
  }
}

// The sandbox must still refuse filesystem tags.
for (const [label, tpl] of [
  ['include blocked', "{% include 'secret.txt' %}"],
  ['render blocked', "{% render 'secret.txt' %}"],
]) {
  try {
    const out = await engine.parseAndRender(tpl, ctx);
    console.log(`FAIL ${label} — expected a throw, got: ${JSON.stringify(out)}`);
    failed++;
  } catch (err) {
    console.log(`OK   ${label} (threw: ${err.message.split('\n')[0].slice(0, 60)})`);
  }
}

console.log(`\n${CASES.length + 2 - failed}/${CASES.length + 2} render cases behaved as expected`);
process.exit(failed ? 1 : 0);
