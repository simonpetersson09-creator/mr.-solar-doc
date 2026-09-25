# Windows-säker native-build

## Mål
Göra `npm run build:native`, `npm run android:sync` och `npm run android:open` körbara direkt i Windows PowerShell utan Bash, WSL eller Git Bash.

## Ändringar
- Ersätt anropet till `npx.cmd` i `scripts/build-native.mjs` med direkt körning av projektets lokalt installerade Vite-CLI via Node.
- Behåll samma byggmiljö (`CAP_BUILD=1`), utdata, kopiering och efterbearbetning som idag.
- Ändra endast byggverktyg; ingen appkod, iOS-/Android-funktion, köp-, beräknings-, rapport-, ikon- eller översättningslogik berörs.

## Verifiering
- Kör `npm run build:native`.
- Kör `npm run android:sync`.
- Verifiera `android:open`-kommandots upplösning utan att kräva Android Studio i denna miljö.
- Kör befintliga tester, typkontroll och webbbygge.
- Redovisa exakt vilka filer som ändrats och eventuell miljöbegränsning.
