# Åtgärdsplan: adressökning i TestFlight

## Reproducerad rotorsak

**Exakt request från native-klienten**

```text
GET https://ray-design-app.lovable.app/api/public/geocode?mode=search&query=Skottv%C3%A4gen+7&language=sv
Origin: capacitor://localhost
Accept: application/json
Ingen body, ingen redirect
```

Produktionsloggen visar denna request från den fysiska iPhonen flera gånger den 2 september 2026 kl. 13:57 UTC.

**Faktiskt resultat**

```text
HTTP 500
{"error":"Only HTML requests are supported here"}
```

Preflight med `Origin: capacitor://localhost` når produktionen och svarar 204 med korrekta CORS-rubriker. GET når däremot inte `src/routes/api/public/geocode.ts`. När samma GET skickas med `Accept: */*` blir svaret SSR-sidans 404. Felet genereras i TanStack Starts generiska SSR-handler innan geocoding-providern körs.

**Root cause**

Den installerade native-klienten använder den nya stabila URL:en korrekt. Den publicerade produktionens aktiva serverbundle saknar däremot den nya route-handlern för `GET /api/public/geocode`. Publicerad frontend och aktiv serverdeployment motsvarar alltså inte aktuell route tree. Detta är inte ett fel i `capacitor://`-omskrivningen, Nominatim-parsningen eller UI-adaptern.

Nuvarande `capacitor-www` i arbetsytan är dessutom äldre än källändringen och innehåller fortfarande den gamla serverFn-vägen för adressökning. Native-bundlen måste därför byggas om och dess chunk måste kontrolleras efter ändringen; filens existens räcker inte.

## Kodväg som ska säkras

```text
AddressStep
  → useAddressSearch
  → searchAddresses
  → isNativePlatform
  → fetchNativeGeocoding
  → GET /api/public/geocode
  → searchGeocodingProvider
  → Nominatim
  → GeocodeSuggestion[]
  → React Query
  → förslagslistan i AddressStep
```

Webbflödets `searchAddress`-serverfunktion behålls endast för webben. Native-flödet ska inte kunna falla tillbaka till den för adressökning.

## Ändringar

1. **Gör produktionens route verifierbar**
   - Behåll den stabila serverrouten på exakt `/api/public/geocode`.
   - Lägg till ett litet versions-/diagnostikfält via en ofarlig `mode=health`, så att aktiv publicerad serverimplementation kan verifieras utan att anropa leverantören.
   - Säkerställ CORS-rubriker på OPTIONS, valideringsfel, providerfel och health-svar för både `capacitor://localhost` och WKWebViews `Origin: null`.

2. **Gör native-requesten entydig och testbar**
   - Samla konstruktion och parsning av native geocoding-requesten i testbara funktioner.
   - Verifiera exakt host, HTTPS, path, query-parametrar, GET-metod, `Accept: application/json`, ingen body och inget serverFn-anrop.
   - Lägg tester för både sökning och reverse geocoding samt för oväntat response-format.

3. **Temporär diagnostik på fysisk iPhone**
   - Vid native-fel visas en kompakt diagnostikkod med endpoint, HTTP-status och säkert trunkerad backend-error (inga personuppgifter eller full adress).
   - Logga samma säkra diagnostik i konsolen.
   - Vanliga användare behåller den lokaliserade feltexten; diagnostiken begränsas till native/TestFlight-utvecklingsläget och kan tas bort efter verifiering.

4. **Bygg- och bundlebevis**
   - Kör typkontroll och relevanta tester.
   - Kör produktionsbygget och native-bygget.
   - Inspektera nya `capacitor-www`: den ska innehålla `https://ray-design-app.lovable.app/api/public/geocode` och får inte använda `searchAddress`/`/_serverFn/` för adressökning. Andra funktioner kan fortfarande legitimt använda `/_serverFn/`.

5. **Produktionsverifiering efter publicering**
   - Publicera den nya serverbundlen.
   - Verifiera `mode=health` mot publicerad host.
   - Kör exakt iOS-request för `Storgatan 1, Växjö` med både `Origin: capacitor://localhost` och `Origin: null`.
   - Krav: HTTP 200, rätt CORS, JSON-array i `GeocodeSuggestion`-format och minst en adress.
   - Kontrollera publicerade serverloggar för att bevisa att `searchGeocodingProvider` kördes och att generiska SSR-handlern inte längre tog requesten.

## När krävs ny TestFlight-build?

Ja. Arbetsytans nuvarande `capacitor-www` innehåller bevisligen den gamla adressökningen. När native-bygget har verifierats måste den nya bundlen synkas till iOS, buildnumret höjas och en ny TestFlight-version laddas upp. Backend-publiceringen måste ske före sluttestet på telefonen.
