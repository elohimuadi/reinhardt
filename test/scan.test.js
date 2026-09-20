import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanRepo } from '../src/engine/scan.js';
import { saveBaseline, driftCheck } from '../src/engine/drift.js';
async function repo(t,files) {
  const root=await mkdtemp(path.join(tmpdir(),'reinhardt-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [name,text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root,name)),{recursive:true}); await writeFile(path.join(root,name),text); }
  return root;
}
const policy = text => text+' We describe our data practices and provide choices for people who use this application.'.repeat(12);
test('no-policy, web consent, deterministic results and ignored development SDK',async t=>{
  const root=await repo(t,{'package.json':JSON.stringify({dependencies:{'react-dom':'1','react-facebook-pixel':'1'},devDependencies:{openai:'1'}})});
  const report=await scanRepo(root);
  assert.deepEqual(report.sdks.map(s=>s.id),['meta']);
  assert.deepEqual(report.findings.map(f=>f.id),['no-consent-mechanism','no-policy']);
  assert.deepEqual(report,await scanRepo(root));
});
test('longest policy chosen; explicit short policy allowed; excluded override rejected',async t=>{
  const root=await repo(t,{'package.json':'{"dependencies":{"openai":"1"}}','privacy.md':policy('OpenAI'),'privacy-short.md':'Different policy','.env.privacy':'OpenAI'});
  assert.equal((await scanRepo(root)).sdks[0].disclosure,'named');
  assert.equal((await scanRepo(root,{policyPath:'privacy-short.md'})).sdks[0].disclosure,'undisclosed');
  await assert.rejects(scanRepo(root,{policyPath:'.env.privacy'}));
});
test('ATT needs usage and nonempty description; both silence missing-att',async t=>{
  const root=await repo(t,{'Podfile':"pod 'FBSDKCoreKit'",'privacy.md':policy('Meta'),'App.swift':'import AppTrackingTransparency'});
  assert.ok((await scanRepo(root)).findings.some(f=>f.id==='missing-att'));
  await writeFile(path.join(root,'App.swift'),'ATTrackingManager.requestTrackingAuthorization { status in }');
  assert.ok((await scanRepo(root)).findings.some(f=>f.id==='missing-att'));
  await writeFile(path.join(root,'Info.plist'),'<key>NSUserTrackingUsageDescription</key><string>Measure ads with your permission.</string>');
  assert.equal((await scanRepo(root)).findings.length,0);
});
test('drift handles no baseline, adds, removes and policy naming; stable baseline',async t=>{
  const root=await repo(t,{'package.json':'{"dependencies":{"stripe":"1"}}','privacy.md':policy('Stripe')});
  assert.equal((await driftCheck(root)).baseline_exists,false);
  await saveBaseline(root);
  assert.deepEqual((await driftCheck(root)).added,[]);
  await writeFile(path.join(root,'package.json'),'{"dependencies":{"openai":"1"}}');
  const report=await driftCheck(root);
  assert.deepEqual(report.removed.map(s=>s.id),['stripe']);
  assert.equal(report.added[0].id,'openai');
  assert.equal(report.added[0].named_in_policy,false);
});
test('consent existence suppresses finding, and policy endpoints are not code evidence',async t=>{
  const root=await repo(t,{'package.json':'{"dependencies":{"posthog-js":"1","react-dom":"1"}}','app.js':'if (hasConsent) { initialize(); }','privacy.md':policy('PostHog https://api.openai.com')});
  assert.deepEqual((await scanRepo(root)).findings,[]);
  assert.deepEqual((await scanRepo(root)).sdks.map(s=>s.id),['posthog']);
});
test('Objective-C ATT usage and Xcode generated description are recognized',async t=>{
  const root=await repo(t,{'Podfile':"pod 'FBSDKCoreKit'",'privacy.md':policy('Meta'),'App.m':'[ATTrackingManager requestTrackingAuthorizationWithCompletionHandler:^(ATTrackingManagerAuthorizationStatus status) {}];','Example.xcodeproj/project.pbxproj':'INFOPLIST_KEY_NSUserTrackingUsageDescription = "Measure advertising";'});
  assert.equal((await scanRepo(root)).findings.length,0);
});
test('baseline rejects malformed state and symlink directories without changing targets',async t=>{
  const root=await repo(t,{'package.json':'{}','.reinhardt/baseline.json':'{"schema_version":2,"recipients":[]}'});
  await assert.rejects(driftCheck(root),/Invalid baseline/);
  const { symlink, readFile } = await import('node:fs/promises');
  const external=await repo(t,{'baseline.json':'keep me'});
  await rm(path.join(root,'.reinhardt'),{recursive:true});
  await symlink(external,path.join(root,'.reinhardt'));
  await assert.rejects(saveBaseline(root),/symlink/);
  await assert.rejects(driftCheck(root),/Cannot read baseline/);
  assert.equal(await readFile(path.join(external,'baseline.json'),'utf8'),'keep me');
});
