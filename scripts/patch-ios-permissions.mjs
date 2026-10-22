#!/usr/bin/env node
/**
 * Adds the privacy usage descriptions iOS requires before WKWebView may open
 * the camera or the photo library from a <input type="file" accept="image/*">
 * ("Take Photo" / "Photo Library" in the native menu).
 *
 * Only two keys: the app records no audio or video and never writes to the
 * photo library, so NSMicrophoneUsageDescription and
 * NSPhotoLibraryAddUsageDescription are deliberately NOT declared.
 *
 * Without NSCameraUsageDescription the system terminates the app the moment
 * the camera is opened — this is what App Store review hit on iPad.
 *
 * Idempotent: existing keys are left untouched. A no-op when the native
 * project has not been generated yet.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const PLIST = "ios/App/App/Info.plist";

const KEYS = {
  NSCameraUsageDescription:
    "Mr. Solar Doc uses the camera so you can photograph an electricity bill or consumption report instead of typing the figures.",
  NSPhotoLibraryUsageDescription:
    "Mr. Solar Doc needs access to your photos so you can pick an existing picture of your electricity bill.",
  // AdMob (iOS only). App ID must match the AdMob console.
  GADApplicationIdentifier: "ca-app-pub-7448540924654868~3473619726",
  NSUserTrackingUsageDescription:
    "Your data is used to show you more relevant ads. Saying no still lets you use the whole app.",
};

// Google and select third-party buyers, checked 2026-10-22 (50 unique IDs).
// Source: https://developers.google.com/admob/ios/3p-skadnetworks
// Keep this local so rebuilding an iOS project never depends on network access.
const SKADNETWORK_IDS = [
  "cstr6suwn9.skadnetwork", "4fzdc2evr5.skadnetwork", "2fnua5tdw4.skadnetwork",
  "ydx93a7ass.skadnetwork", "p78axxw29g.skadnetwork", "v72qych5uu.skadnetwork",
  "ludvb6z3bs.skadnetwork", "cp8zw746q7.skadnetwork", "3sh42y64q3.skadnetwork",
  "c6k4g5qg8m.skadnetwork", "s39g8k73mm.skadnetwork", "wg4vff78zm.skadnetwork",
  "3qy4746246.skadnetwork", "f38h382jlk.skadnetwork", "hs6bdukanm.skadnetwork",
  "mlmmfzh3r3.skadnetwork", "v4nxqhlyqp.skadnetwork", "wzmmz9fp6w.skadnetwork",
  "su67r6k2v3.skadnetwork", "yclnxrl5pm.skadnetwork", "t38b2kh725.skadnetwork",
  "7ug5zh24hu.skadnetwork", "gta9lk7p23.skadnetwork", "vutu7akeur.skadnetwork",
  "y5ghdn5j9k.skadnetwork", "v9wttpbfk9.skadnetwork", "n38lu8286q.skadnetwork",
  "47vhws6wlr.skadnetwork", "kbd757ywx3.skadnetwork", "9t245vhmpl.skadnetwork",
  "a2p9lx4jpn.skadnetwork", "22mmun2rn5.skadnetwork", "44jx6755aq.skadnetwork",
  "k674qkevps.skadnetwork", "4468km3ulz.skadnetwork", "2u9pt9hc89.skadnetwork",
  "8s468mfl3y.skadnetwork", "klf5c3l5u5.skadnetwork", "ppxm28t8ap.skadnetwork",
  "kbmxgpxpgc.skadnetwork", "uw77j35x4d.skadnetwork", "578prtvx9j.skadnetwork",
  "4dzt52r2t5.skadnetwork", "tl55sbb4fm.skadnetwork", "c3frkrj4fj.skadnetwork",
  "e5fvkxwrpn.skadnetwork", "8c4e2ghe7u.skadnetwork", "3rd42ekr43.skadnetwork",
  "97r2b46745.skadnetwork", "3qcr597p9d.skadnetwork",
];

if (!existsSync(PLIST)) {
  console.log(`[ios] ${PLIST} not found — run "npx cap add ios" first. Skipping.`);
  process.exit(0);
}

let plist = readFileSync(PLIST, "utf8");
const added = [];
let block = "";
for (const [key, value] of Object.entries(KEYS)) {
  if (plist.includes(`<key>${key}</key>`)) continue;
  block += `\t<key>${key}</key>\n\t<string>${value}</string>\n`;
  added.push(key);
}

// Locate the existing array without reserializing the plist: this preserves
// custom IDs, comments, nested values, and every other setting verbatim.
const keyMatch = /<key>\s*SKAdNetworkItems\s*<\/key>/.exec(plist);
let arrayStart;
let arrayEnd;
if (keyMatch) {
  const afterKey = keyMatch.index + keyMatch[0].length;
  const opening = /^(?:\s|<!--[\s\S]*?-->)*<array\s*(\/?)>/.exec(plist.slice(afterKey));
  if (!opening) throw new Error("SKAdNetworkItems must be an XML array; refusing to overwrite it.");
  arrayStart = afterKey + opening[0].lastIndexOf("<array");
  if (opening[1]) {
    // Expand an empty self-closing array only; retain surrounding content.
    const length = opening[0].length - opening[0].lastIndexOf("<array");
    plist = plist.slice(0, arrayStart) + "<array></array>" + plist.slice(arrayStart + length);
    arrayEnd = arrayStart + "<array>".length;
  } else {
    const tags = /<!--[\s\S]*?-->|<\/?array\s*\/?>/g;
    tags.lastIndex = arrayStart;
    let depth = 0;
    for (let tag = tags.exec(plist); tag; tag = tags.exec(plist)) {
      if (tag[0].startsWith("<!--")) continue;
      if (tag[0].startsWith("</")) depth--;
      else if (!/\/\s*>$/.test(tag[0])) depth++;
      if (depth === 0) { arrayEnd = tag.index; break; }
    }
    if (arrayEnd === undefined) throw new Error("Unclosed SKAdNetworkItems array; refusing to modify plist.");
  }
}

const existing = new Set(
  Array.from((arrayStart === undefined ? "" : plist.slice(arrayStart, arrayEnd))
    .replace(/<!--[\s\S]*?-->/g, "")
    .matchAll(/<key>\s*SKAdNetworkIdentifier\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/g),
    (match) => match[1].trim().toLowerCase()),
);
const missing = SKADNETWORK_IDS.filter((id) => !existing.has(id));
const entries = missing.map((id) =>
  `\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>${id}</string>\n\t\t</dict>\n`,
).join("");
if (arrayEnd !== undefined && entries) {
  plist = plist.slice(0, arrayEnd) + "\n" + entries + "\t" + plist.slice(arrayEnd);
} else if (!keyMatch) {
  block += `\t<key>SKAdNetworkItems</key>\n\t<array>\n${entries}\t</array>\n`;
}
if (missing.length) added.push(`${missing.length} SKAdNetwork IDs`);

if (!block && !missing.length) {
  console.log("[ios] Privacy/AdMob settings and all SKAdNetwork IDs already present.");
  process.exit(0);
}

if (block) {
  const closing = /<\/dict>\s*<\/plist>\s*$/.exec(plist);
  if (!closing) throw new Error("Missing root plist dictionary; refusing to modify plist.");
  plist = plist.slice(0, closing.index) + block + plist.slice(closing.index);
}
writeFileSync(PLIST, plist);
console.log(`[ios] Added settings: ${added.join(", ")}`);
