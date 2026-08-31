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

## In-App Purchase (TestFlight-checklista)

1. `cordova-plugin-purchase` finns i `package.json`. Kör:
   ```bash
   npx cap add ios          # om ios/ saknas
   CAP_SERVER_URL=https://<publicerad-url> npx cap sync ios
   ```
2. I Xcode-targetet (`se.shiningdays.mrsolardoc`):
   - Signing & Capabilities → **+ Capability → In-App Purchase**.
   - Kontrollera att Bundle Identifier är `se.shiningdays.mrsolardoc`.
3. App Store Connect: produkten `com.mrsolardoc.calculation.unlock`
   (Consumable, 49 SEK) måste vara i minst "Ready to Submit".
4. Verifiera på riktig enhet att `window.CdvPurchase` finns när appen laddas
   från remote `server.url` — annars är köpknappen disabled.
5. Oavslutade transaktioner återupptas automatiskt vid appstart
   (`src/hooks/use-purchase-recovery.ts`). Testa genom att döda appen mitt i
   ett sandbox-köp och starta om.

### Produkter i App Store Connect

| Produkt | Typ | Pris |
| --- | --- | --- |
| `com.mrsolardoc.calculation.unlock` | Consumable | 49 SEK |
| `com.mrsolardoc.premium.yearly` | Auto-Renewable Subscription, 1 år | 199 SEK/år |

Abonnemanget behöver en subscription group och lokaliserad beskrivning innan
det kan testas i sandbox/TestFlight.
