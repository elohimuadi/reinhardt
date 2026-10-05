import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scanRepo } from '../src/engine/scan.js';
import { securityFindings } from '../src/engine/security.js';
async function repo(t, files) {
  const root = await mkdtemp(path.join(tmpdir(),'reinhardt-security-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  for (const [file,text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root,file)),{recursive:true}); await writeFile(path.join(root,file),text); }
  return root;
}
test('security finding shape', async t => {
  const report = await scanRepo(await repo(t,{'src/a.js':'new OpenAI({ dangerouslyAllowBrowser: true })'}));
  const finding = report.findings.find(f => f.id === 'llm-sdk-in-browser');
  assert.ok(finding);
  assert.equal(finding.category,'security');
  assert.ok(finding.owasp.includes('llm-top10-2026:LLM02:2026'));
  assert.deepEqual(finding.evidence,[{file:'src/a.js',line:1,kind:'dangerously-allow-browser'}]);
  assert.equal(finding.sdk_id,null);
  assert.equal(finding.suggested_disclosure,null);
  for (const field of ['cwe','asvs','guidance']) assert.ok(Array.isArray(finding[field]));
  assert.equal(finding.confidence,'high');
});
test('privacy findings carry OWASP refs',async t => {
  const report = await scanRepo(await repo(t,{'package.json':'{"dependencies":{"openai":"1"}}'}));
  const finding = report.findings.find(f => f.id === 'no-policy');
  assert.equal(finding.category,'privacy');
  assert.ok(finding.owasp.includes('privacy-top10-2021:P5'));
  assert.equal(finding.confidence,'medium');
  for (const field of ['cwe','asvs','guidance']) assert.deepEqual(finding[field],[]);
});
test('no secret text in report and deterministic schema version 2',async () => {
  const report = await scanRepo('evals/fixtures/leaky-security-web');
  assert.equal(JSON.stringify(report).includes('AKIA'+'IOSFODNN7EXAMPLE'),false);
  assert.deepEqual(report,await scanRepo('evals/fixtures/leaky-security-web'));
  assert.equal(report.schema_version,2);
});
test('test paths skipped for secrets, source paths scanned',async t => {
  const text = "const key = 'AKIA"+"IOSFODNN7EXAMPLE';";
  const root = await repo(t,{'test/k.js':text});
  assert.equal((await scanRepo(root)).findings.some(f => f.id === 'hardcoded-secret'),false);
  await mkdir(path.join(root,'src'));
  await writeFile(path.join(root,'src/k.js'),text);
  const finding = (await scanRepo(root)).findings.find(f => f.id === 'hardcoded-secret');
  assert.deepEqual(finding.evidence,[{file:'src/k.js',line:1,kind:'aws-access-key-id'}]);
});
test('binary and oversized security candidates skipped, manifests stay strict',async t => {
  const root = await repo(t,{'App/Binary.plist':Buffer.from([0,1,2,3]),'src/b.js':'\0','src/large.js':'x'.repeat(1_000_001)});
  assert.deepEqual((await scanRepo(root)).findings,[]);
  assert.deepEqual(await securityFindings(root,['App/Binary.plist','src/large.js']),[]);
  await writeFile(path.join(root,'package.json'),'\0');
  await assert.rejects(scanRepo(root));
});
test('security evidence is capped after sorting, and walked privacy manifest suppresses rule',async t => {
  const root = await repo(t,{'src/a.js':'dangerouslyAllowBrowser: true\n'.repeat(60),'App/A.swift':'UserDefaults.standard','App/PrivacyInfo.xcprivacy':'<plist></plist>'});
  const report = await scanRepo(root);
  const finding = report.findings.find(f => f.id === 'llm-sdk-in-browser');
  assert.equal(finding.evidence.length,50);
  assert.equal(finding.evidence[49].line,50);
  assert.equal(report.findings.some(f => f.id === 'ios-privacy-manifest-missing'),false);
  for (const item of finding.evidence) assert.deepEqual(Object.keys(item).sort(),['file','kind','line']);
});
