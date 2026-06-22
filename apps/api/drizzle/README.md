# Database migrations — re-baselined 2026-06

## Why this was re-baselined

The migration journal had become corrupted: 63 entries in `meta/_journal.json`
but only the `0000_snapshot.json` survived in `meta/` (snapshots `0001`–`0062`
were lost). drizzle-kit needs the **latest** snapshot to diff the schema, so with
only the ancient `0000` snapshot present, `drizzle-kit generate` produced a
full-schema dump every time instead of a clean increment — and ~43 newer tables
(Layer 2/3/4 features) had **no migration at all**, so the app referenced tables
that didn't exist in the database.

## What was done

- The old SQL files were moved to `../drizzle-archive/` (still in git history).
- `meta/` was reset and a single clean baseline regenerated from an **empty**
  state, so `0000_baseline.sql` is the entire current schema as pure
  `CREATE TABLE` + foreign-key `ADD CONSTRAINT` (verified: 286 tables, **0**
  drift `ALTER COLUMN`, **0** `DROP`).
- `drizzle-kit generate` now reports "No schema changes" — the snapshot matches
  the schema, so future migrations are clean incrementals again.

## How to deploy

### Fresh database (new env, CI test DB)

```
pnpm --filter @forgemsg/api db:migrate
```

Runs `0000_baseline.sql` → full current schema. Safe and complete.

### Existing production database (already has most tables)

Do **NOT** run `db:migrate` against an existing DB — the baseline's plain
`CREATE TABLE` would fail on tables that already exist. Instead converge with a
schema diff, which creates only what's missing (the ~43 new tables):

```
pnpm --filter @forgemsg/api db:push      # review the plan first
```

Then mark the baseline as applied so future `db:migrate` is consistent:

```
-- record the baseline hash without re-running it
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('<0000_baseline hash>', <epoch_ms>);
```

(Take the hash from `meta/_journal.json`.) After that, both fresh and existing
environments share the same baseline and incremental migrations work normally.
