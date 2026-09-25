#!/usr/bin/env node
/**
 * Cross-platform replacement for the previous `mkdir -p ... && cp ...` shell
 * one-liner. Copies the prepared iOS app icons into the Xcode asset catalog.
 * Works in Windows PowerShell, macOS and Linux.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";

const SRC = "resources/AppIcon.appiconset";
const DEST = "ios/App/App/Assets.xcassets/AppIcon.appiconset";

if (!existsSync(SRC)) {
  console.error(`[ios] ${SRC} not found.`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, { recursive: true });
console.log(`[ios] App icons copied to ${DEST}.`);
