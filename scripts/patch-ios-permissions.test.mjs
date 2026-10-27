import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const script = resolve("scripts/patch-ios-permissions.mjs");
const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const wrap = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${body}</dict></plist>\n`;

function fixture(body, check) {
  const cwd = mkdtempSync(join(tmpdir(), "solar-plist-"));
  const dir = join(cwd, "ios/App/App");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "Info.plist");
  const run = () => execFileSync(process.execPath, [script], { cwd, encoding: "utf8" });
  try {
    writeFileSync(file, wrap(body));
    check({ run, read: () => readFileSync(file, "utf8"), file });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

const ids = (xml) => Array.from(xml.matchAll(/<key>\s*SKAdNetworkIdentifier\s*<\/key>\s*<string>\s*([^<]+)\s*<\/string>/g), m => m[1].trim());

test("missing SKAdNetworkItems gets all 50 Google IDs", () => {
  fixture("<key>CustomSetting</key><string>keep me</string>", ({ run, read }) => {
    run();
    assert.equal(ids(read()).length, 50);
    assert.equal(new Set(ids(read())).size, 50);
    assert.ok(ids(read()).includes("cstr6suwn9.skadnetwork"));
    assert.ok(ids(read()).includes("3qcr597p9d.skadnetwork"));
    assert.ok(read().includes("<key>CustomSetting</key><string>keep me</string>"));
  });
});

test("existing custom IDs, Google ID and settings are preserved without duplicates", () => {
  const preserved = `<key>GADApplicationIdentifier</key><string>existing-app-id</string>
<key>NSCameraUsageDescription</key><string>existing description</string>`;
  const entry = `<dict><key>SKAdNetworkIdentifier</key><string>custom1234x.skadnetwork</string><key>Extra</key><array><string>keep nested array</string></array></dict>`;
  fixture(`${preserved}<key>SKAdNetworkItems</key><array>${entry}<dict><key>SKAdNetworkIdentifier</key><string>cstr6suwn9.skadnetwork</string></dict></array>`, ({ run, read }) => {
    run();
    assert.equal(ids(read()).length, 51);
    assert.equal(new Set(ids(read())).size, 51);
    assert.ok(read().includes(preserved));
    assert.ok(read().includes(entry));
  });
});

test("repeated runs are byte-for-byte unchanged", () => {
  fixture("", ({ run, read }) => {
    run(); const first = read(); run(); run(); assert.equal(read(), first);
  });
});

test("empty self-closing array gets all IDs with CRLF input", () => {
  fixture("<key>SKAdNetworkItems</key>\r\n<array />\r\n", ({ run, read }) => {
    run(); assert.equal(ids(read()).length, 50);
    const first = read(); run(); assert.equal(read(), first);
  });
});

test("recreated iOS project receives the same configuration", () => {
  fixture("", ({ run, read, file }) => {
    run(); const first = read(); writeFileSync(file, wrap("")); run();
    assert.equal(read(), first);
  });
});

test("missing iOS project is a safe no-op", () => {
  const cwd = mkdtempSync(join(tmpdir(), "solar-no-ios-"));
  try {
    assert.match(execFileSync(process.execPath, [script], { cwd, encoding: "utf8" }), /Skipping/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("invalid array fails without modifying the plist", () => {
  fixture("<key>SKAdNetworkItems</key><string>invalid</string>", ({ run, read }) => {
    const before = read(); assert.throws(run); assert.equal(read(), before);
  });
});

test("both sync flows and iOS creation restore plist after Capacitor", () => {
  for (const key of ["cap:sync", "ios:sync", "cap:add:ios"]) {
    const cmd = packageScripts[key];
    assert.ok(cmd.indexOf("cap ") >= 0);
    assert.ok(cmd.indexOf("scripts/patch-ios-permissions.mjs") > cmd.indexOf("cap "));
    assert.ok(cmd.includes("scripts/patch-ios-localizations.mjs"));
  }
  assert.equal(packageScripts["android:sync"], "node scripts/patch-admob.mjs && node scripts/build-native.mjs && cap sync android");
});