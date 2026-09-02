#!/usr/bin/env node
/**
 * Declares every supported UI language in the iOS app bundle
 * (CFBundleLocalizations) so iOS and the App Store list the app's language
 * support correctly. Runs after `npx cap add ios`; a no-op when the native
 * project has not been generated yet.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const PLIST = "ios/App/App/Info.plist";
const LANGUAGES = [
  "sv", "en", "es", "de", "fr", "pt", "it", "nl", "pl", "no", "da", "fi",
  "cs", "ro", "el", "hu", "sk", "sl", "hr", "sr", "bg", "uk", "tr", "hi",
  "id", "he", "lt", "et", "lv",
];

if (!existsSync(PLIST)) {
  console.log(`[ios] ${PLIST} not found — run "npx cap add ios" first. Skipping.`);
  process.exit(0);
}

let plist = readFileSync(PLIST, "utf8");
const block =
  `\t<key>CFBundleLocalizations</key>\n\t<array>\n` +
  LANGUAGES.map((l) => `\t\t<string>${l}</string>`).join("\n") +
  `\n\t</array>\n\t<key>CFBundleDevelopmentRegion</key>\n\t<string>en</string>\n`;

plist = plist.replace(
  /\t<key>CFBundleLocalizations<\/key>\n\t<array>[\s\S]*?<\/array>\n(\t<key>CFBundleDevelopmentRegion<\/key>\n\t<string>[^<]*<\/string>\n)?/,
  "",
);
plist = plist.replace(/\t<key>CFBundleDevelopmentRegion<\/key>\n\t<string>[^<]*<\/string>\n/, "");
plist = plist.replace("</dict>\n</plist>", `${block}</dict>\n</plist>`);
writeFileSync(PLIST, plist);
console.log(`[ios] CFBundleLocalizations updated with ${LANGUAGES.length} languages.`);
