# Mr. Solar Doc – native app (Capacitor)

Appen är en TanStack Start-app med serverfunktioner (PVGIS + geokodning). Den kan
alltså inte paketeras som en helt statisk bundle – den native skalappen laddar den
publicerade webbappen över https och lägger native-lager (status bar, splash,
App Store-distribution) ovanpå.

## Engångsuppsättning (på din Mac)

```bash
git clone <ditt repo> && cd <repo>
npm install                # eller bun install
npx cap add ios            # kräver Xcode + CocoaPods
npx cap add android        # kräver Android Studio
```

## Peka appen mot rätt URL

Standard är preview-URL:en. Inför TestFlight/App Store, använd den publicerade domänen:

```bash
CAP_SERVER_URL=https://din-domän.se npx cap sync
```

## Kör

```bash
npx cap open ios       # Xcode → välj enhet → Run
npx cap open android   # Android Studio → Run
```

## Inför App Store

- Byt `appId` i `capacitor.config.ts` till ditt eget bundle-id (t.ex. `se.mrsolardoc.app`).
- Lägg in app-ikon och splash i Xcode (`Assets.xcassets`).
- Fyll i App Store Connect: namn, beskrivning, kategori, integritetspolicy-URL, skärmdumpar.
- Signera med ditt Apple Developer-konto (99 USD/år) och ladda upp via Xcode/Transporter.
- Apple kan avvisa appar som endast är en webbvy. Motivera med native-värde (offline-splash,
  hemskärmsikon, PDF-delning) eller bygg vidare med native-plugins.
