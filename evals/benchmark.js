import { readFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanRepo } from '../src/engine/scan.js';
import { DISCLAIMER } from '../src/engine/common.js';
import { compare as lexical } from '../src/engine/files.js';

const identity = ({ rule, file, line }) => ({ rule, file, line });
const key = item => JSON.stringify(identity(item));
const sorted = items => [...items].sort((a, b) => lexical(a.rule, b.rule) || lexical(a.file, b.file) || a.line - b.line);
export function compare(labels, findings) {
  const result = { tp: [], fp: [], unresolved: [], missingTp: [], fixedFp: [], unlabelled: [] };
  const found = new Map(findings.map(item => [key(item), identity(item)]));
  const labelled = new Map(labels.findings.map(item => [key(item), item]));
  for (const [id, item] of labelled) {
    const bucket = found.has(id) ? item.verdict : item.verdict === 'tp' ? 'missingTp' : item.verdict === 'fp' ? 'fixedFp' : null;
    if (bucket) result[bucket].push(identity(item));
  }
  for (const [id, item] of found) if (!labelled.has(id)) result.unlabelled.push(item);
  return Object.fromEntries(Object.entries(result).map(([bucket, items]) => [bucket, sorted(items)]));
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error('git operation failed');
  return result.stdout.trim();
}
async function checkout(repo) {
  const root = path.join(tmpdir(), 'reinhardt-benchmark');
  await mkdir(root, { recursive: true });
  const directory = path.join(root, `${repo.name}-${repo.commit}`);
  let exists = true;
  try { await access(directory); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
  if (!exists) git(['clone', '--filter=blob:none', '--no-checkout', repo.url, directory]);
  if (!exists || git(['-C', directory, 'rev-parse', 'HEAD']) !== repo.commit) git(['-C', directory, 'checkout', repo.commit]);
  return directory;
}
async function main() {
  console.log(DISCLAIMER);
  const benchmark = JSON.parse(await readFile(new URL('./benchmarks/real-world.json', import.meta.url), 'utf8'));
  const totals = { tp: 0, fp: 0, unresolved: 0, unlabelled: 0, missingTp: 0, fixedFp: 0 };
  for (const repo of [...benchmark.repos].sort((a, b) => lexical(a.name, b.name))) {
    let result;
    try {
      const report = await scanRepo(await checkout(repo));
      const findings = report.findings.filter(item => item.category === 'security').flatMap(item => item.evidence.map(evidence => ({ rule: item.id, file: evidence.file, line: evidence.line })));
      result = compare(repo, findings);
    } catch {
      console.error(`${repo.name}: clone/checkout/scan failed`);
      process.exitCode = 2;
      return;
    }
    console.log(`${repo.name}: TP=${result.tp.length} FP=${result.fp.length} unresolved=${result.unresolved.length} unlabelled=${result.unlabelled.length} missingTP=${result.missingTp.length} fixedFP=${result.fixedFp.length} known_misses=${repo.known_misses.length}`);
    for (const [bucket, items] of Object.entries(result)) {
      totals[bucket] += items.length;
      for (const item of items) console.log(`  ${bucket}: ${item.rule} ${item.file}:${item.line}`);
    }
  }
  const precision = totals.tp / (totals.tp + totals.fp || 1);
  console.log(`Precision: ${precision.toFixed(3)}; TP=${totals.tp} FP=${totals.fp} unresolved=${totals.unresolved} unlabelled=${totals.unlabelled} missingTP=${totals.missingTp}`);
  if (totals.unlabelled || totals.missingTp) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Benchmark setup failed'); process.exitCode = 2; });
}
