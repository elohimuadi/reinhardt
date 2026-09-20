import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scanRepo } from '../src/engine/scan.js';
import { DISCLAIMER } from '../src/engine/common.js';
const root=fileURLToPath(new URL('./fixtures/',import.meta.url));
const key=f=>`${f.id}:${f.sdk_id ?? ''}`;
let truePositive=0,falsePositive=0,falseNegative=0;
console.log(DISCLAIMER);
for(const fixture of (await readdir(root)).sort()) {
  const directory=path.join(root,fixture);
  const expected=JSON.parse(await readFile(path.join(directory,'expected.json'),'utf8'));
  const actual=await scanRepo(directory);
  const wanted=new Set(expected.findings.map(key)), found=new Set(actual.findings.map(key));
  const extra=[...found].filter(id=>!wanted.has(id)), missing=[...wanted].filter(id=>!found.has(id));
  truePositive += [...found].filter(id=>wanted.has(id)).length;
  falsePositive += extra.length; falseNegative += missing.length;
  console.log(`${fixture}: ${extra.length || missing.length ? 'FAIL':'PASS'} (${found.size} findings)`);
  if(extra.length) console.log(`  Unexpected: ${extra.join(', ')}`);
  if(missing.length) console.log(`  Missing: ${missing.join(', ')}`);
}
const precision=truePositive/(truePositive+falsePositive || 1);
const recall=truePositive/(truePositive+falseNegative || 1);
console.log(`Precision: ${precision.toFixed(3)}; Recall: ${recall.toFixed(3)}; TP=${truePositive} FP=${falsePositive} FN=${falseNegative}`);
if(falsePositive || falseNegative) process.exitCode=1;
