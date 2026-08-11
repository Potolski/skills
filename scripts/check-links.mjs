#!/usr/bin/env node
/**
 * Verify every external URL the registry advertises still resolves.
 * Exits non-zero on hard 404s (a deleted repo/skill must fail the refresh
 * run loudly instead of shipping dead links). 429/5xx are reported but
 * tolerated. Set GITHUB_TOKEN to avoid rate limiting.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(join(ROOT, "src/data/registry.json"), "utf8"));

const urls = new Set();
for (const s of registry.official) {
  urls.add(s.rawUrl);
  urls.add(s.githubUrl);
}
for (const r of registry.ecosystem) {
  urls.add(r.url);
  for (const s of r.skills) urls.add(s.url);
}
for (const e of registry.communityIndex ?? []) urls.add(`https://github.com/${e.repo}`);
for (const f of registry.foundationResources ?? []) urls.add(f.url);

const headers = process.env.GITHUB_TOKEN
  ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : {};

async function check(url) {
  try {
    // github.com HTML pages don't rate-limit like the API; HEAD is enough.
    const res = await fetch(url, { method: "HEAD", redirect: "follow", headers });
    return { url, status: res.status };
  } catch (e) {
    return { url, status: 0, error: e.message };
  }
}

const list = [...urls];
const results = [];
const CONCURRENCY = 8;
for (let i = 0; i < list.length; i += CONCURRENCY) {
  results.push(...(await Promise.all(list.slice(i, i + CONCURRENCY).map(check))));
  process.stdout.write(`\rchecked ${Math.min(i + CONCURRENCY, list.length)}/${list.length}`);
}
console.log();

const dead = results.filter((r) => r.status === 404 || r.status === 410);
const flaky = results.filter((r) => !dead.includes(r) && (r.status === 0 || r.status >= 400));

if (flaky.length) {
  console.warn(`⚠ ${flaky.length} URLs returned transient errors (tolerated):`);
  for (const f of flaky) console.warn(`  ${f.status} ${f.url}`);
}
if (dead.length) {
  console.error(`✗ ${dead.length} DEAD links — fix the registry:`);
  for (const d of dead) console.error(`  ${d.status} ${d.url}`);
  process.exit(1);
}
console.log(`✓ ${results.length} external URLs alive (${flaky.length} transient warnings)`);
