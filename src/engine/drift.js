import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readText, repoRoot, compare, MAX_BYTES } from './files.js';
import { scanRepo } from './scan.js';
import { DISCLAIMER } from './common.js';
const baselineFile = '.reinhardt/baseline.json';
export async function saveBaseline(input='.', options={}) {
  const root = await repoRoot(input);
  const report = await scanRepo(root, options);
  const baseline = { schema_version: 1, disclaimer: DISCLAIMER, recipients: report.sdks.map(({id,name})=>({id,name})) };
  const data = JSON.stringify(baseline,null,2)+'\n';
  if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('Baseline exceeds 1MB');
  const directory = path.join(root,'.reinhardt');
  await mkdir(directory,{recursive:true});
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Baseline directory cannot be a symlink');
  const temporary = path.join(directory,`.baseline-${randomUUID()}.tmp`);
  const handle = await open(temporary,'wx',0o600);
  try {
    await handle.writeFile(data);
    await handle.close();
    await rename(temporary,path.join(root,baselineFile));
  } finally { await handle.close(); await unlink(temporary).catch(error=>{if(error.code!=='ENOENT') throw error;}); }
  return { ...baseline, baseline_path: baselineFile, findings: report.findings, message: 'Baseline saved for the current recipients.' };
}
export async function driftCheck(input='.', options={}) {
  const root = await repoRoot(input);
  const current = await scanRepo(root,options);
  let baseline;
  try { baseline = JSON.parse(await readText(root,baselineFile,{baseline:true})); }
  catch (error) {
    if (error.code === 'ENOENT') return { schema_version:1, disclaimer:DISCLAIMER, baseline_exists:false, message:'No baseline found. Review the current recipients before explicitly saving a baseline.', added:[],removed:[],findings:current.findings,sdks:current.sdks };
    throw new Error('Cannot read baseline: invalid, excluded, or inaccessible file');
  }
  if (baseline.schema_version!==1 || !Array.isArray(baseline.recipients) || baseline.recipients.some(r=>!r || typeof r.id!=='string' || typeof r.name!=='string') || new Set(baseline.recipients.map(r=>r.id)).size !== baseline.recipients.length) throw new Error('Invalid baseline schema');
  const previousIds = new Set(baseline.recipients.map(r=>r.id));
  const currentIds = new Set(current.sdks.map(s=>s.id));
  return { schema_version:1, disclaimer:DISCLAIMER, baseline_exists:true, message:'Compared current recipients with the saved baseline.', added:current.sdks.filter(s=>!previousIds.has(s.id)).map(({id,name,disclosure,evidence})=>({id,name,disclosure,named_in_policy:disclosure==='named',evidence})), removed:baseline.recipients.filter(r=>!currentIds.has(r.id)).sort((a,b)=>compare(a.id,b.id)), findings:current.findings, sdks:current.sdks };
}
