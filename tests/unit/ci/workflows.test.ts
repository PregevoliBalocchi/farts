// The GitHub workflows are valid YAML and their jobs hang together: a workflow GitHub cannot read
// runs nothing and reports only "a workflow file issue" (PR 64's deploy.yml: a ": " in a plain
// `run:` line made it a mapping, and no browser test ran). `yaml` comes with firebase-tools.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DIR = '.github/workflows';
const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));

interface Job {
  'runs-on'?: unknown;
  needs?: string | string[];
  steps?: unknown[];
}

describe('GitHub workflows', () => {
  it.each(files)('%s is valid YAML with runnable jobs', (f) => {
    const wf = parse(readFileSync(join(DIR, f), 'utf8'), { strict: true, uniqueKeys: true }) as { on?: unknown; jobs?: Record<string, Job> };
    expect(wf.on).toBeDefined();
    const jobs = wf.jobs ?? {};
    expect(Object.keys(jobs).length).toBeGreaterThan(0);
    for (const [name, job] of Object.entries(jobs)) {
      expect(job['runs-on'], `${name} runs-on`).toBeDefined();
      expect(Array.isArray(job.steps) && job.steps.length > 0, `${name} has steps`).toBe(true);
      for (const n of [job.needs ?? []].flat()) expect(Object.keys(jobs), `${name} needs ${n}`).toContain(n);
    }
  });
});
