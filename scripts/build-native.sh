#!/usr/bin/env bash
# Builds the frontend bundle that ships inside the native (iOS/Android) app.
#
# CAP_BUILD=1 switches the Vite build to SPA mode and skips the deploy target:
# the output is a static bundle with no server of its own. Backend work
# (PVGIS, geocoding, purchases) is still done by the deployed https backend
# through server-function calls — see src/config/native-backend.ts.
set -euo pipefail

cd "$(dirname "$0")/.."

CAP_BUILD=1 npx vite build

rm -rf capacitor-www
cp -R dist/client capacitor-www
# Capacitor loads index.html; TanStack Start emits the SPA shell as _shell.html.
cp capacitor-www/_shell.html capacitor-www/index.html

echo "Native bundle ready in capacitor-www/"
