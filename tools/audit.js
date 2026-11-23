#!/usr/bin/env node
// npm audit for the runtime dependencies (what users install), with a reviewed allowlist.
//
//   node tools/audit.js            fail on any moderate-or-worse advisory not allowlisted
//
// An advisory with no fix we can take (for example one deep in @a2ui/web_core) may be
// allowlisted in .github/audit-allowlist.json with the reason it is acceptable, what
// mitigates it, and an expiry date. Expired entries fail, so every exception is reviewed
// again. Entries that no longer match anything are reported so they can be removed.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
export const ALLOWLIST = '.github/audit-allowlist.json';

/** The advisories in an `npm audit --json` report (version 2), one per GHSA id. */
export function advisories(report) {
  const out = new Map();
  for (const vuln of Object.values(report?.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== 'object') continue;   // a string names another vulnerable package
      const id = /GHSA-[\w-]+/.exec(via.url ?? '')?.[0] ?? `npm-${via.source}`;
      if (!out.has(id)) out.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url, range: via.range });
    }
  }
  return [...out.values()];
}

/**
 * Sort the advisories into blocking, allowed and expired, and find stale allowlist
 * entries. `today` is YYYY-MM-DD; an entry is valid through its `expires` date.
 */
export function evaluate(found, allowlist, today, threshold = 'moderate') {
  const min = LEVELS.indexOf(threshold);
  const entries = new Map((allowlist?.advisories ?? []).map(e => [e.id, e]));
  const result = { blocking: [], allowed: [], expired: [], stale: [] };
  for (const a of found) {
    if (LEVELS.indexOf(a.severity) < min) continue;
    const entry = entries.get(a.id);
    if (!entry || entry.package !== a.package) result.blocking.push(a);
    else if (!(entry.expires >= today)) result.expired.push({ ...a, entry });
    else result.allowed.push({ ...a, entry });
  }
  const ids = new Set(found.map(a => a.id));
  for (const e of entries.values()) if (!ids.has(e.id)) result.stale.push(e);
  return result;
}

function main() {
  let raw;
  try {
    raw = execFileSync(npm, ['audit', '--omit=dev', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    raw = e.stdout;   // npm audit exits non-zero when it finds anything
    if (!raw) { console.error(`npm audit failed:\n${e.stderr || e.message}`); process.exit(1); }
  }
  const report = JSON.parse(raw);
  if (report.error) { console.error(`npm audit failed: ${JSON.stringify(report.error)}`); process.exit(1); }
  const allowlist = JSON.parse(readFileSync(path.join(root, ALLOWLIST), 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const r = evaluate(advisories(report), allowlist, today);

  const line = a => `${a.severity} ${a.id} ${a.package} ${a.range}: ${a.title}\n    ${a.url}`;
  for (const a of r.allowed) console.log(`allowed until ${a.entry.expires}: ${line(a)}\n    reason: ${a.entry.reason}`);
  for (const e of r.stale) console.log(`::warning::${ALLOWLIST}: ${e.id} (${e.package}) no longer matches any advisory; remove it`);
  for (const a of r.expired) console.log(`::error::allowlist entry expired on ${a.entry.expires}, review it again: ${line(a)}`);
  for (const a of r.blocking) console.log(`::error::${line(a)}`);
  const bad = r.blocking.length + r.expired.length;
  console.log(bad ? `\n${bad} runtime advisory(ies) need attention.` : `\nNo unreviewed runtime advisories (${r.allowed.length} allowlisted).`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
