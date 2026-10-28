import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { applyAdMobPatch } from "./patch-admob.mjs";
const patch = JSON.parse(readFileSync(new URL("../patches/admob-8.2.1.json", import.meta.url), "utf8"));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "admob-patch-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "8.2.1" }));
  for (const file of patch.files) { const path = join(root, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, file.before); }
  return root;
}
test("pristine 8.2.1 gets all safety methods and repeated application is unchanged", () => {
  const root = fixture();
  try { assert.equal(applyAdMobPatch(root), 8); assert.equal(applyAdMobPatch(root), 0); for (const file of patch.files) assert.equal(readFileSync(join(root, file.path), "utf8"), file.after); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test("wrong plugin version fails before modification", () => {
  const root = fixture();
  try { writeFileSync(join(root, "package.json"), '{"version":"9.0.0"}'); assert.throws(() => applyAdMobPatch(root), /Unsupported/); assert.equal(readFileSync(join(root, patch.files[0].path), "utf8"), patch.files[0].before); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test("unexpected source fails atomically", () => {
  const root = fixture();
  try { writeFileSync(join(root, patch.files.at(-1).path), "unexpected"); assert.throws(() => applyAdMobPatch(root), /Unexpected/); assert.equal(readFileSync(join(root, patch.files[0].path), "utf8"), patch.files[0].before); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test("maintained iOS bridge registers explicit ATT and guards system presentation", () => {
  const source = patch.files.find((file) => file.path.endsWith("AdMobPlugin.swift"))?.after;
  assert.ok(source);
  assert.match(source, /CAPPluginMethod\(name: "requestTrackingAuthorizationExplicit"/);
  assert.match(source, /trackingAuthorizationStatus == \.notDetermined/);
  assert.match(source, /UIApplication\.shared\.applicationState == \.active/);
  assert.match(source, /presentedViewController == nil/);
  assert.match(source, /guard !self\.trackingRequestPending/);
  assert.match(source, /generation == trackingGeneration/);
});

function methodBody(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing native method: ${signature}`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1);
  let depth = 1;
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  assert.fail(`Unclosed native method: ${signature}`);
}

function verifyConsentSnapshot(root, platform) {
  const read = (path) => readFileSync(join(root, path), "utf8");
  if (platform === "ios") {
    const bridge = read("ios/Sources/AdMobPlugin/AdMobPlugin.swift");
    assert.match(bridge, /public class AdMobPlugin: CAPPlugin, CAPBridgedPlugin/);
    assert.match(bridge, /public let jsName = "AdMob"/);
    const methods = bridge.match(/pluginMethods:\s*\[CAPPluginMethod\]\s*=\s*\[([\s\S]*?)\n\s*\]/)?.[1];
    assert.ok(methods, "Missing CAP method table");
    assert.match(methods, /CAPPluginMethod\(name: "getConsentSnapshot", returnType: CAPPluginReturnPromise\)/);
    const delegation = methodBody(bridge, "@objc func getConsentSnapshot(_ call: CAPPluginCall)");
    assert.match(delegation, /DispatchQueue\.main\.async/);
    assert.match(delegation, /self\.consentExecutor\.getConsentSnapshot\(call\)/);
    const body = methodBody(read("ios/Sources/AdMobPlugin/Consent/ConsentExecutor.swift"), "func getConsentSnapshot(_ call: CAPPluginCall)");
    assert.match(body, /call\.resolve\(/);
    assert.match(body, /"status": getConsentStatusString\(ConsentInformation\.shared\.consentStatus\)/);
    assert.match(body, /"isConsentFormAvailable": ConsentInformation\.shared\.formStatus == FormStatus\.available/);
    assert.match(body, /"canRequestAds": ConsentInformation\.shared\.canRequestAds/);
    assert.match(body, /"privacyOptionsRequirementStatus": getPrivacyOptionsRequirementStatus\(ConsentInformation\.shared\.privacyOptionsRequirementStatus\)/);
    assert.match(body, /"purposeConsents": UserDefaults\.standard\.string\(forKey: "IABTCF_PurposeConsents"\) \?\? ""/);
    assert.doesNotMatch(body, /requestConsentInfoUpdate|loadAndPresentIfRequired|presentPrivacyOptionsForm/);
  } else {
    const bridge = read("android/src/main/java/com/getcapacitor/community/admob/AdMob.java");
    assert.match(bridge, /@CapacitorPlugin\([\s\S]*?\)\s*public class AdMob extends Plugin/);
    assert.match(bridge, /@PluginMethod\s+public void getConsentSnapshot\(final PluginCall call\)/);
    const delegation = methodBody(bridge, "public void getConsentSnapshot(final PluginCall call)");
    assert.match(delegation, /runOnUiThread\(\(\) -> adConsentExecutor\.getConsentSnapshot\(call\)\)/);
    const executor = read("android/src/main/java/com/getcapacitor/community/admob/consent/AdConsentExecutor.java");
    const body = methodBody(executor, "public void getConsentSnapshot(final PluginCall call)");
    assert.match(body, /ensureConsentInfo\(\)/);
    assert.match(body, /info\.put\("status", getConsentStatusString\(consentInformation\.getConsentStatus\(\)\)\)/);
    assert.match(body, /info\.put\("isConsentFormAvailable", consentInformation\.isConsentFormAvailable\(\)\)/);
    assert.match(body, /info\.put\("canRequestAds", consentInformation\.canRequestAds\(\)\)/);
    assert.match(body, /info\.put\("privacyOptionsRequirementStatus", consentInformation\.getPrivacyOptionsRequirementStatus\(\)\.name\(\)\)/);
    assert.match(body, /call\.resolve\(info\)/);
    assert.match(body, /getSharedPreferences\(contextSupplier\.get\(\)\.getPackageName\(\) \+ "_preferences", Context\.MODE_PRIVATE\)/);
    assert.match(body, /prefs\.getAll\(\)\.get\("IABTCF_PurposeConsents"\)/);
    assert.match(body, /info\.put\("purposeConsents", bits instanceof String \? \(String\) bits : ""\)/);
    assert.match(methodBody(executor, "void ensureConsentInfo()"), /UserMessagingPlatform\.getConsentInformation\(/);
    assert.doesNotMatch(body, /requestConsentInfoUpdate|loadAndShowConsentFormIfRequired|showPrivacyOptionsForm/);
  }
}

for (const platform of ["ios", "android"]) {
  test(`${platform} getConsentSnapshot is implemented and registered after initial and repeated patching`, () => {
    const root = fixture();
    try {
      applyAdMobPatch(root);
      verifyConsentSnapshot(root, platform);
      assert.equal(applyAdMobPatch(root), 0);
      verifyConsentSnapshot(root, platform);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
test("exact reviewed previous safety patches upgrade without losing registrations", () => {
  const root = fixture();
  try {
    applyAdMobPatch(root);
    for (const file of patch.files) if (file.previous?.[0]) writeFileSync(join(root, file.path), file.previous[0]);
    assert.equal(applyAdMobPatch(root), 2);
    for (const platform of ["ios", "android"]) verifyConsentSnapshot(root, platform);
    assert.equal(applyAdMobPatch(root), 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});