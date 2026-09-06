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
};

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

if (!block) {
  console.log("[ios] Camera/photo usage descriptions already present.");
  process.exit(0);
}

plist = plist.replace("</dict>\n</plist>", `${block}</dict>\n</plist>`);
writeFileSync(PLIST, plist);
console.log(`[ios] Added usage descriptions: ${added.join(", ")}`);
