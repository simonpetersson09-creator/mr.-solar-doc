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