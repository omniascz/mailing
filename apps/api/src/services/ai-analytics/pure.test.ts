import { describe, it, expect } from 'vitest';
import {
  isSafeReadOnlySql,
  extractReferencedTables,
  suggestChartType,
  lexicalVerdict,
  structuralVerdict,
  extractSqlIdentifiers,
  describeSchemaForPrompt,
  injectOrgFilter,
  hasCommaJoin,
  scopeTablesToOrg,
  type ResultColumn,
  type SandboxTableSchema,
} from './pure.js';

const allowlist = ['contacts', 'email_events', 'campaigns'];

describe('isSafeReadOnlySql', () => {
  it('accepts a clean SELECT', () => {
    const v = isSafeReadOnlySql('SELECT id, email FROM contacts WHERE org_id = $1', allowlist);
    expect(v.safe).toBe(true);
  });

  it('accepts CTE queries', () => {
    const v = isSafeReadOnlySql(
      `WITH recent AS (SELECT * FROM email_events WHERE created_at > now() - interval '7 day') SELECT COUNT(*) FROM recent`,
      [...allowlist, 'recent'],
    );
    expect(v.safe).toBe(true);
  });

  it('rejects INSERT / UPDATE / DELETE', () => {
    expect(isSafeReadOnlySql('INSERT INTO contacts VALUES (1)', allowlist).safe).toBe(false);
    expect(isSafeReadOnlySql('UPDATE contacts SET x=1', allowlist).safe).toBe(false);
    expect(isSafeReadOnlySql('DELETE FROM contacts', allowlist).safe).toBe(false);
  });

  it('rejects DDL', () => {
    expect(isSafeReadOnlySql('DROP TABLE contacts', allowlist).safe).toBe(false);
    expect(isSafeReadOnlySql('ALTER TABLE contacts ADD COLUMN x text', allowlist).safe).toBe(false);
    expect(isSafeReadOnlySql('CREATE TABLE x (id int)', allowlist).safe).toBe(false);
  });

  it('rejects multi-statement SQL', () => {
    expect(isSafeReadOnlySql('SELECT 1; DROP TABLE contacts', allowlist).safe).toBe(false);
  });

  it('rejects pg_sleep', () => {
    expect(isSafeReadOnlySql('SELECT pg_sleep(5) FROM contacts', allowlist).safe).toBe(false);
  });

  it('rejects queries against non-allowlisted tables', () => {
    const v = isSafeReadOnlySql('SELECT * FROM users', allowlist);
    expect(v.safe).toBe(false);
    expect(v.reason).toContain('allowlisted');
  });

  it('handles schema-qualified tables', () => {
    const v = isSafeReadOnlySql('SELECT * FROM public.contacts', allowlist);
    expect(v.safe).toBe(true);
  });
});

describe('extractReferencedTables', () => {
  it('picks up FROM and JOIN targets', () => {
    const tables = extractReferencedTables(
      'SELECT * FROM contacts c JOIN email_events e ON e.contact_id = c.id',
    );
    expect(tables.sort()).toEqual(['contacts', 'email_events']);
  });

  it('handles schema-qualified identifiers', () => {
    expect(extractReferencedTables('SELECT 1 FROM public.contacts')).toEqual(['contacts']);
  });
});

describe('suggestChartType', () => {
  const col = (name: string, kind: ResultColumn['kind']): ResultColumn => ({ name, kind });

  it('KPI for single-row single-number', () => {
    expect(suggestChartType([col('count', 'number')], 1)).toBe('kpi');
  });

  it('line for date + number', () => {
    expect(suggestChartType([col('day', 'date'), col('sent', 'number')], 30)).toBe('line');
  });

  it('pie for small categorical breakdown', () => {
    expect(suggestChartType([col('status', 'string'), col('count', 'number')], 4)).toBe('pie');
  });

  it('bar for larger categorical breakdown', () => {
    expect(suggestChartType([col('campaign', 'string'), col('opens', 'number')], 50)).toBe('bar');
  });

  it('table fallback', () => {
    expect(
      suggestChartType([col('id', 'string'), col('email', 'string'), col('created', 'date')], 100),
    ).toBe('table');
  });
});

// ─── Production-grade sandbox helpers ──────────────────────────────────────

const SCHEMAS: Record<string, SandboxTableSchema> = {
  contacts: {
    name: 'contacts',
    orgColumn: 'org_id',
    columns: { id: 'uuid', org_id: 'uuid', email: 'text', revenue: 'numeric' },
  },
  email_events: {
    name: 'email_events',
    orgColumn: 'org_id',
    columns: { id: 'uuid', org_id: 'uuid', contact_id: 'uuid', event_type: 'text' },
  },
};

describe('lexicalVerdict', () => {
  it('accepts a clean SELECT', () => {
    expect(lexicalVerdict('SELECT id FROM contacts').safe).toBe(true);
  });

  it('accepts a clean WITH-CTE query', () => {
    expect(lexicalVerdict('WITH x AS (SELECT id FROM contacts) SELECT * FROM x').safe).toBe(true);
  });

  it('accepts a trailing semicolon', () => {
    expect(lexicalVerdict('SELECT 1;').safe).toBe(true);
  });

  it('rejects empty input', () => {
    expect(lexicalVerdict('').safe).toBe(false);
    expect(lexicalVerdict('   ').safe).toBe(false);
    expect(lexicalVerdict('-- only comment\n').safe).toBe(false);
  });

  it('rejects multi-statement', () => {
    const v = lexicalVerdict('SELECT 1; SELECT 2');
    expect(v.safe).toBe(false);
    expect(v.reason).toMatch(/multi-statement/i);
  });

  it('rejects DDL/DML keywords (every member of the blocklist)', () => {
    const violators = [
      'INSERT INTO contacts VALUES (1)',
      'UPDATE contacts SET x = 1',
      'DELETE FROM contacts',
      'DROP TABLE contacts',
      'ALTER TABLE contacts ADD x',
      'CREATE TABLE x (id int)',
      'TRUNCATE contacts',
      'GRANT SELECT ON contacts TO bob',
      'REVOKE ALL ON contacts FROM bob',
      'CALL my_proc()',
      'EXECUTE plan_x',
      'BEGIN; SELECT 1',
      'COMMIT',
      'ROLLBACK',
      'COPY contacts FROM stdin',
      'VACUUM contacts',
      'CLUSTER contacts',
      'REINDEX TABLE contacts',
      'LISTEN channel_x',
      'NOTIFY channel_x',
      'LO_IMPORT()',
      "PG_READ_FILE('/etc/passwd')",
    ];
    for (const sql of violators) {
      expect(lexicalVerdict(sql).safe, `should reject: ${sql}`).toBe(false);
    }
  });

  it('rejects SELECT INTO', () => {
    expect(lexicalVerdict('SELECT * INTO new_table FROM contacts').safe).toBe(false);
  });

  it('rejects locking clauses', () => {
    expect(lexicalVerdict('SELECT * FROM contacts FOR UPDATE').safe).toBe(false);
    expect(lexicalVerdict('SELECT * FROM contacts FOR SHARE').safe).toBe(false);
    expect(lexicalVerdict('SELECT * FROM contacts FOR NO KEY UPDATE').safe).toBe(false);
  });

  it('rejects queries that are not SELECT or WITH', () => {
    expect(lexicalVerdict('SHOW server_version').safe).toBe(false);
    expect(lexicalVerdict('EXPLAIN SELECT * FROM contacts').safe).toBe(false);
  });

  it('strips line comments before lex check', () => {
    expect(lexicalVerdict('-- benign\nSELECT 1').safe).toBe(true);
  });

  it('strips block comments before lex check', () => {
    expect(lexicalVerdict('/* benign */ SELECT 1').safe).toBe(true);
  });

  it('rejects DROP hidden inside a comment-stripped run', () => {
    // After comment strip, the DROP keyword is bare and must be caught.
    expect(lexicalVerdict('SELECT 1 /* x */ ; DROP TABLE contacts').safe).toBe(false);
  });
});

describe('extractSqlIdentifiers', () => {
  it('returns FROM/JOIN tables case-insensitively, deduped', () => {
    const out = extractSqlIdentifiers(
      'SELECT * FROM Contacts c JOIN email_events e ON e.contact_id = c.id',
    );
    expect(out.tables.sort()).toEqual(['contacts', 'email_events']);
  });

  it('captures qualified column references', () => {
    const out = extractSqlIdentifiers(
      'SELECT c.email, e.event_type FROM contacts c JOIN email_events e ON e.contact_id = c.id',
    );
    expect(out.columns).toEqual(
      expect.arrayContaining(['c.email', 'e.event_type', 'e.contact_id', 'c.id']),
    );
  });

  it('strips comments before extracting', () => {
    const out = extractSqlIdentifiers(
      `SELECT 1 -- FROM secret
       FROM contacts`,
    );
    expect(out.tables).toEqual(['contacts']);
  });
});

describe('structuralVerdict', () => {
  it('accepts a query against allowlisted tables only', () => {
    const v = structuralVerdict('SELECT id FROM contacts', SCHEMAS);
    expect(v.safe).toBe(true);
    expect(v.tables).toEqual(['contacts']);
  });

  it('rejects unlisted tables', () => {
    const v = structuralVerdict('SELECT * FROM users', SCHEMAS);
    expect(v.safe).toBe(false);
    expect(v.reason).toMatch(/not in whitelist/i);
  });

  it('rejects unlisted columns when the table is qualified', () => {
    const v = structuralVerdict('SELECT contacts.password FROM contacts', SCHEMAS);
    expect(v.safe).toBe(false);
    expect(v.reason).toMatch(/Column not allowed/i);
  });

  it('passes through unknown aliases (we cannot resolve aliases without a parser)', () => {
    const v = structuralVerdict('SELECT c.email FROM contacts c', SCHEMAS);
    expect(v.safe).toBe(true);
  });

  it('rejects empty FROM list', () => {
    const v = structuralVerdict('SELECT 1', SCHEMAS);
    expect(v.safe).toBe(false);
    expect(v.reason).toMatch(/at least one table/i);
  });
});

describe('describeSchemaForPrompt', () => {
  it('renders TABLE blocks with column types', () => {
    const out = describeSchemaForPrompt(SCHEMAS);
    expect(out).toContain('TABLE contacts');
    expect(out).toContain('email text');
    expect(out).toContain('TABLE email_events');
  });

  it('appends the description when one is provided', () => {
    const out = describeSchemaForPrompt({ contacts: SCHEMAS.contacts! }, { contacts: 'People' });
    expect(out).toMatch(/TABLE contacts -- People/);
  });
});

describe('injectOrgFilter', () => {
  it('wraps the query in a CTE and adds the org_id filter', () => {
    const out = injectOrgFilter('SELECT * FROM contacts', 'contacts', 'org-1', SCHEMAS);
    expect(out).toContain('WITH __user_q AS (SELECT * FROM contacts)');
    expect(out).toContain("WHERE org_id = 'org-1'");
  });

  it('escapes single quotes in orgId', () => {
    const out = injectOrgFilter('SELECT * FROM contacts', 'contacts', "x'; DROP TABLE--", SCHEMAS);
    expect(out).toContain("WHERE org_id = 'x''; DROP TABLE--'");
    // The escaped form keeps the single quote inside the string literal so
    // the trailing payload is harmless.
  });

  it('strips trailing semicolons before wrapping', () => {
    const out = injectOrgFilter('SELECT 1 FROM contacts;', 'contacts', 'o', SCHEMAS);
    expect(out).toContain('AS (SELECT 1 FROM contacts)');
  });

  it('throws on unknown primary table', () => {
    expect(() => injectOrgFilter('SELECT 1 FROM x', 'unknown_table', 'o', SCHEMAS)).toThrow(
      /Unknown primary table/,
    );
  });
});

describe('hasCommaJoin', () => {
  it('flags a comma join', () => {
    expect(hasCommaJoin('SELECT * FROM contacts, email_events')).toBe(true);
  });
  it('does not flag explicit JOINs', () => {
    expect(
      hasCommaJoin(
        'SELECT * FROM contacts JOIN email_events ON contacts.id = email_events.contact_id',
      ),
    ).toBe(false);
  });
  it('does not flag commas in the SELECT list or function args', () => {
    expect(hasCommaJoin('SELECT id, email FROM contacts')).toBe(false);
    expect(hasCommaJoin('SELECT count(*) FROM contacts WHERE event_type IN (1,2,3)')).toBe(false);
  });
  it('does not flag commas inside a FROM subquery', () => {
    expect(hasCommaJoin('SELECT * FROM (SELECT 1, 2) x')).toBe(false);
  });
});

const UUID = '11111111-1111-1111-1111-111111111111';

describe('scopeTablesToOrg (SQL-level org isolation)', () => {
  it('scopes a bare-column query that does not project org_id (the leak case)', () => {
    const out = scopeTablesToOrg('SELECT email FROM contacts', UUID, SCHEMAS);
    expect(out).toBe(
      `SELECT email FROM (SELECT * FROM contacts WHERE org_id = '${UUID}') AS contacts`,
    );
  });

  it('scopes an aggregate (count(*)) — previously leaked all orgs', () => {
    const out = scopeTablesToOrg('SELECT count(*) FROM contacts', UUID, SCHEMAS);
    expect(out).toContain(`(SELECT * FROM contacts WHERE org_id = '${UUID}') AS contacts`);
  });

  it('scopes every table in a JOIN and preserves aliases', () => {
    const out = scopeTablesToOrg(
      'SELECT * FROM contacts c JOIN email_events e ON c.id = e.contact_id',
      UUID,
      SCHEMAS,
    );
    expect(out).toContain(`(SELECT * FROM contacts WHERE org_id = '${UUID}') AS c`);
    expect(out).toContain(`(SELECT * FROM email_events WHERE org_id = '${UUID}') AS e`);
  });

  it('leaves non-whitelisted identifiers (CTE refs) alone', () => {
    const out = scopeTablesToOrg(
      'WITH q AS (SELECT * FROM contacts) SELECT * FROM q',
      UUID,
      SCHEMAS,
    );
    // the base table inside the CTE is scoped …
    expect(out).toContain(`(SELECT * FROM contacts WHERE org_id = '${UUID}') AS contacts`);
    // … but the CTE reference `FROM q` is not rewritten.
    expect(out).toContain('SELECT * FROM q');
  });

  it('rejects a non-UUID orgId (no injection via org context)', () => {
    expect(() => scopeTablesToOrg('SELECT * FROM contacts', "x' OR '1'='1", SCHEMAS)).toThrow(
      /Invalid orgId/,
    );
  });
});
