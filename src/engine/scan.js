import path from 'node:path';
import { ruleset } from './rules.js';
import { readScanFile, securityFindings } from './security.js';
import { walk, repoRoot, compare } from './files.js';
import { catalog, matchingSdks } from './catalog.js';
import { parseManifest, isManifest } from './manifests.js';
import { findPolicy, disclosure, isPolicyCandidate } from './policy.js';
import { findEndpoints, isSource } from './endpoints.js';
import { DISCLAIMER, evidenceAt } from './common.js';
export const severityRank = { high: 0, medium: 1, low: 2 };
const consentPackages = /^(?:@cookieconsent\/|vanilla-cookieconsent$|cookieconsent$|react-cookie-consent$|@onetrust\/|@cookiebot\/|@osano\/|@iabtcf\/)/i;
const consentCode = /\b(?:Cookiebot|OneTrust|OptanonWrapper|__tcfapi|hasConsent|consentGranted|trackingConsent|analyticsConsent|marketingConsent)\b|\bgtag\s*\(\s*['"]consent['"]/;
const trackingCategories = new Set(['analytics','advertising','session_replay']);
const severeTracking = new Set(['advertising','session_replay']);
export async function scanRepo(input = '.', { policyPath } = {}) {
  const root = await repoRoot(input);
  const files = await walk(root);
  const policy = await findPolicy(root, files, policyPath);
  const content = new Map();
  const read = file => {
    if (!content.has(file)) content.set(file, readScanFile(root, file));
    return content.get(file);
  };
  const detected = new Map();
  const signals = { web: false, ios: false, consent: [], att: [], attDescription: [] };
  const add = (sdk, evidence) => {
    if (!detected.has(sdk.id)) detected.set(sdk.id, { ...sdk, evidence: [] });
    const found = detected.get(sdk.id);
    if (!found.evidence.some(e => e.file === evidence.file && e.line === evidence.line && e.kind === evidence.kind)) found.evidence.push(evidence);
  };
  for (const file of files) {
    const manifest = isManifest(file);
    const source = isSource(file);
    if (!manifest && !source && !file.endsWith('.plist')) continue;
    if (file === policy?.file || isPolicyCandidate(file)) continue;
    const text = await read(file);
    if (text === null) continue;
    if (manifest) {
      let parsed;
      try { parsed = parseManifest(file, text); } catch { throw new Error(`Cannot parse manifest: ${file}`); }
      for (const dep of parsed) {
        for (const sdk of matchingSdks(dep.ecosystem, dep.name)) add(sdk, dep.evidence);
        if (dep.ecosystem === 'npm' && consentPackages.test(dep.name)) signals.consent.push(dep.evidence);
        if (dep.ecosystem === 'npm' && /^(?:react-dom|next|nuxt|vue|svelte|@sveltejs\/kit|astro|@angular\/core)$/.test(dep.name)) signals.web = true;
      }
      if (['Podfile','Package.swift','project.pbxproj'].includes(path.basename(file))) signals.ios = true;
    }
    if (source) {
      for (const hit of findEndpoints(file, text)) add(hit.sdk, hit.evidence);
      if (/\.(?:html|jsx|tsx|astro|vue|svelte)$/.test(file) || /\b(?:document|window)\./.test(text)) signals.web = true;
      if (/\.(?:swift|m|mm)$/.test(file)) signals.ios = true;
      const consent = text.match(consentCode);
      if (consent) signals.consent.push(evidenceAt(file, text, consent.index, 'consent'));
      const att = text.match(/\bATTrackingManager\s*(?:\.|requestTrackingAuthorization(?:WithCompletionHandler)?\b|trackingAuthorizationStatus\b)/);
      if (att) signals.att.push(evidenceAt(file, text, att.index, 'att'));
    }
    if (/\.(?:plist|pbxproj)$/.test(file)) {
      const att = text.match(/<key>\s*NSUserTrackingUsageDescription\s*<\/key>\s*<string>\s*[^<\s][^<]*<\/string>|\bINFOPLIST_KEY_NSUserTrackingUsageDescription\s*=\s*"[^"\s][^"]*"/);
      if (att) signals.attDescription.push(evidenceAt(file, text, att.index, 'att-description'));
    }
  }
  const sdks = [...detected.values()].sort((a,b) => compare(a.id,b.id)).map(sdk => ({ ...sdk, disclosure: disclosure(sdk, policy), evidence: sdk.evidence.sort((a,b) => compare(a.file,b.file) || a.line-b.line || compare(a.kind,b.kind)) }));
  const findings = [];
  function finding(id, severity, title, detail, evidence, fix, draft = null, sdkId = null) {
    evidence = [...new Map(evidence.map(item => [JSON.stringify(item), item])).values()].sort((a,b) => compare(a.file,b.file) || a.line-b.line || compare(a.kind,b.kind));
    findings.push({ id, sdk_id: sdkId, category: 'privacy', owasp: ruleset.privacy_rules[id] ?? [], cwe: [], asvs: [], guidance: [], confidence: 'medium', severity, title, detail, evidence, suggested_fix: fix, suggested_disclosure: draft });
  }
  for (const sdk of sdks) {
    const category = catalog.categories[sdk.category];
    const draft = `DRAFT FOR HUMAN/LEGAL REVIEW — If verified: We use ${sdk.name} to ${category.purpose}. Describe the data actually sent (potential types: ${sdk.collects.join(', ')}), retention, choices, and applicable safeguards. Confirm initialization and configuration before publishing.`;
    if (sdk.disclosure === 'undisclosed') finding('undisclosed-sdk', category.severity, `${sdk.name} is not named or described in the policy`, 'Dependency or endpoint evidence indicates a potential recipient. Static detection does not establish actual transmission.', sdk.evidence, 'Verify use; remove the SDK if unnecessary, or add an accurate disclosure and any required controls.', draft, sdk.id);
    if (sdk.disclosure === 'generic') finding('generic-disclosure-only', ['advertising','session_replay','ai'].includes(sdk.category) ? 'medium' : 'low', `${sdk.name} has only a generic disclosure`, 'The policy describes the category but does not name this SDK or provider.', sdk.evidence, 'Verify the recipient and add its name and the actual purpose and data collected.', draft, sdk.id);
  }
  if (sdks.length && !policy) finding('no-policy','high','No privacy policy found','No supported privacy file longer than 800 characters was found. Use --policy for an explicit shorter policy.',sdks.flatMap(s=>s.evidence),'Create a truthful policy after verifying the detected recipients. Have the wording reviewed by a human/legal reviewer.');
  const tracking = sdks.filter(s=>trackingCategories.has(s.category));
  if (signals.web && tracking.length && !signals.consent.length) finding('no-consent-mechanism',tracking.some(s=>severeTracking.has(s.category)) ? 'high' : 'medium','No consent mechanism detected','Tracking SDKs were detected in a web project, but no recognized consent dependency or handling code was found. This is an existence heuristic, not a legal determination.',tracking.flatMap(s=>s.evidence),'Verify applicable requirements and gate initialization and requests behind the appropriate consent choice.');
  const ads = sdks.filter(s=>s.category === 'advertising');
  if (signals.ios && ads.length && !(signals.att.length && signals.attDescription.length)) finding('missing-att','high','ATT implementation appears incomplete','Advertising SDKs were detected in an iOS project. Both ATTrackingManager usage and a nonempty NSUserTrackingUsageDescription are needed to satisfy this heuristic.',ads.flatMap(s=>s.evidence),'Verify whether tracking occurs; where required, add the usage description and request ATT permission before tracking initialization.');
  findings.push(...await securityFindings(root, files, read));
  findings.sort((a,b) => severityRank[a.severity]-severityRank[b.severity] || compare(a.id,b.id) || compare(a.sdk_id ?? '',b.sdk_id ?? ''));
  return { schema_version: 2, disclaimer: DISCLAIMER, policy: policy ? { file: policy.file, explicit: policy.explicit } : null, platforms: ['web','ios'].filter(key=>signals[key]), sdks, findings, signals: { consent: signals.consent, att: signals.att, att_description: signals.attDescription } };
}
