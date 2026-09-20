import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, matchName, matchingSdks } from '../src/engine/catalog.js';
import { parseManifest } from '../src/engine/manifests.js';
import { disclosure, containsTerm, stripMarkup } from '../src/engine/policy.js';
import { findEndpoints } from '../src/engine/endpoints.js';
test('exact, prefix, case-insensitive and PyPI normalized names', () => {
  assert.ok(matchName('@SENTRY/nextjs', '@sentry/*'));
  assert.ok(matchName('Sentry_SDK','sentry-sdk','pypi'));
  assert.equal(matchName('not-posthog-js','posthog-js'),false);
  assert.equal(matchingSdks('npm','openai')[0].id,'openai');
});
test('catalog integrity and category coverage', () => {
  assert.equal(new Set(catalog.sdks.map(s=>s.id)).size,catalog.sdks.length);
  assert.ok(catalog.sdks.length >= 28);
  for (const sdk of catalog.sdks) {
    assert.ok(catalog.categories[sdk.category]);
    assert.ok(sdk.aliases.length && sdk.collects.length && sdk.domains.length);
    for (const patterns of Object.values(sdk.match)) for (const pattern of patterns) assert.match(pattern,/^[^*]+\*?$/);
  }
});
test('aliases have word boundaries and disclosure prefers names', () => {
  const meta = catalog.sdks.find(s=>s.id==='meta');
  assert.equal(containsTerm('metadata and metamorphosis','meta'),false);
  assert.equal(disclosure(meta,{text:'We store metadata.'}),'undisclosed');
  assert.equal(disclosure(meta,{text:'Our advertising partners receive events.'}),'generic');
  assert.equal(disclosure(meta,{text:'Our advertising partner is Meta.'}),'named');
  assert.equal(disclosure(meta,null),'no-policy');
  assert.equal(stripMarkup('<p>Meta&nbsp;Pixel</p><script>hidden()</script>'),'Meta Pixel');
});
test('production sections included; devDependencies ignored; npm aliases supported', () => {
  const deps=parseManifest('package.json',JSON.stringify({devDependencies:{'posthog-js':'1'},dependencies:{stripe:'1',custom:'npm:openai@4'},optionalDependencies:{'@sentry/node':'1'},peerDependencies:{firebase:'1'}}));
  assert.deepEqual(deps.map(d=>d.name),['stripe','custom','openai','@sentry/node','firebase']);
});
test('Python, CocoaPods, SwiftPM and Xcode manifests retain line evidence', () => {
  assert.equal(parseManifest('requirements.txt','# comment\nsentry_sdk>=2\n-r other.txt')[0].evidence.line,2);
  assert.equal(parseManifest('Podfile',"# pod 'Ignored'\npod 'Firebase/Analytics'")[0].name,'Firebase/Analytics');
  assert.equal(parseManifest('Package.swift','.package(url: "https://github.com/getsentry/sentry-cocoa.git", from: "8.0.0")')[0].name,'sentry-cocoa');
  assert.equal(parseManifest('project.pbxproj','repositoryURL = "https://github.com/supabase/supabase-swift.git";')[0].name,'supabase-swift');
});
test('endpoint host boundaries prevent lookalikes and preserve evidence', () => {
  assert.equal(findEndpoints('app.js','fetch("https://api.openai.com.evil.test/x")').length,0);
  const hits=findEndpoints('app.js','// init\nfetch("https://api.openai.com/v1/responses")');
  assert.equal(hits[0].sdk.id,'openai');
  assert.equal(hits[0].evidence.line,2);
});
