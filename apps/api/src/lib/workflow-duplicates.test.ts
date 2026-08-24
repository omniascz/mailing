import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DUPLICATES IN .github/workflows — the mistake that removes its own alarm.
 *
 * ci.yml carried the MinIO setup twice: five env keys declared twice in one
 * `env:` mapping with two different bucket names, and two `Start MinIO` steps
 * both binding host port 9000. Neither was a typo — both were appended by
 * someone (me) who did not notice the same setup was already there.
 *
 * The two behave differently and both are silent:
 *
 *   - Duplicate MAPPING KEYS. Most YAML parsers keep the last one without a
 *     word; pyyaml loads that file happily. GitHub rejects the whole document,
 *     and a rejected workflow is not a workflow — its runs fail at startup
 *     with no jobs and no logs, the `pull_request` trigger stops firing, and
 *     PRs simply report "no checks". Nothing anywhere says why.
 *   - Duplicate STEPS. A steps list is a list, so duplication is legal and
 *     both run. The second `docker run -p 9000:9000` dies with "port is
 *     already allocated" and takes the job down.
 *
 * The second was hidden behind the first for as long as the workflow would not
 * parse, which is the reason for testing this at all: CI cannot be the thing
 * that catches CI being broken.
 *
 * ─── WHAT THIS DOES NOT SEE ──────────────────────────────────────────────────
 *
 * This is a line scanner, not a YAML parser, and the repo has no YAML
 * dependency to borrow. Stated plainly so a green run is not read as more than
 * it is:
 *
 *   - Only `KEY: value` lines in SCREAMING_SNAKE_CASE are checked for
 *     duplication, and only against others at the same indentation in the same
 *     unbroken run of lines. A duplicate split by a blank line, or written in
 *     any other case, is invisible.
 *   - Ports are matched on a literal `-p N:` in a `docker run`. A port from a
 *     variable, or a service container's `ports:`, is invisible.
 *   - Duplicate step names are compared verbatim. Two steps doing the same
 *     thing under different names are invisible — as they were here, where one
 *     container was `minio` and the other `ci-minio`.
 *
 * A green run means these three shapes are not present. It does not mean the
 * workflows are correct, and it is not a substitute for GitHub parsing them.
 */

const WORKFLOWS = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../.github/workflows',
);

function workflowFiles(): { name: string; lines: string[] }[] {
  return readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((name) => ({
      name,
      lines: readFileSync(join(WORKFLOWS, name), 'utf8').split(/\r?\n/),
    }));
}

/** `      FOO_BAR: value` -> indent + key. Comments and blanks return null. */
function envKey(line: string): { indent: number; key: string } | null {
  const m = /^(\s*)([A-Z][A-Z0-9_]*):\s/.exec(line);
  return m ? { indent: m[1]!.length, key: m[2]! } : null;
}

describe('.github/workflows', () => {
  it('has workflow files to check', () => {
    // If this ever goes to zero the other two cases pass vacuously.
    expect(workflowFiles().map((f) => f.name)).toContain('ci.yml');
  });

  it('never declares the same key twice in one mapping', () => {
    const offences: string[] = [];

    for (const { name, lines } of workflowFiles()) {
      // A "run" is consecutive KEY: lines at one indent. Comments do not break
      // it — the real duplicate had three comment lines in between — but a
      // blank line or a line at another indent does.
      let seen = new Map<string, number>();
      let indent = -1;

      lines.forEach((line, i) => {
        if (line.trim() === '' || line.trim().startsWith('#')) {
          if (line.trim() === '') {
            seen = new Map();
            indent = -1;
          }
          return;
        }
        const kv = envKey(line);
        if (!kv || kv.indent !== indent) {
          seen = new Map();
          indent = kv ? kv.indent : -1;
        }
        if (!kv) return;
        const first = seen.get(kv.key);
        if (first !== undefined) {
          offences.push(`${name}:${i + 1} ${kv.key} — already set on line ${first + 1}`);
        } else {
          seen.set(kv.key, i);
        }
      });
    }

    expect(offences, 'GitHub refuses a workflow with duplicate keys, without saying so').toEqual(
      [],
    );
  });

  it('never starts two containers on the same host port in one job', () => {
    const offences: string[] = [];

    for (const { name, lines } of workflowFiles()) {
      let job = '<top level>';
      let ports = new Map<string, number>();

      lines.forEach((line, i) => {
        const jobStart = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
        if (jobStart) {
          job = jobStart[1]!;
          ports = new Map();
          return;
        }
        if (!line.includes('docker run')) return;
        for (const m of line.matchAll(/-p\s+(\d+):/g)) {
          const port = m[1]!;
          const first = ports.get(port);
          if (first !== undefined) {
            offences.push(
              `${name}:${i + 1} job "${job}" binds host port ${port} again — line ${first + 1} already does`,
            );
          } else {
            ports.set(port, i);
          }
        }
      });
    }

    expect(offences, 'the second bind fails with "port is already allocated"').toEqual([]);
  });

  it('never repeats a step name inside one job', () => {
    const offences: string[] = [];

    for (const { name, lines } of workflowFiles()) {
      let job = '<top level>';
      let names = new Map<string, number>();

      lines.forEach((line, i) => {
        const jobStart = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
        if (jobStart) {
          job = jobStart[1]!;
          names = new Map();
          return;
        }
        const step = /^\s*-\s+name:\s*(.+?)\s*$/.exec(line);
        if (!step) return;
        const label = step[1]!;
        const first = names.get(label);
        if (first !== undefined) {
          offences.push(
            `${name}:${i + 1} job "${job}" repeats step "${label}" from line ${first + 1}`,
          );
        } else {
          names.set(label, i);
        }
      });
    }

    expect(offences, 'a duplicated step is legal YAML and runs twice').toEqual([]);
  });
});
