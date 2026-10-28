# Roadmap

## Annonsintegritet F1–F4
- [ ] Rätta snapshot efter uppdatering, tydlig uppdateringsvarning, faktisk formulärtillgänglighet och separat formulärfel.
- [ ] Lägg till permanenta regressioner, kör hela testsviten och verifiera båda native-patcharna utan publicering.
- [ ] Verifiera Googles formulär och sparade val på telefon: kräver nya iOS-/Androidbyggen och fysiska telefoner.

## Samtyckesupplägg som Mr. B Yatzy
- [x] Inför utfällbar ruta, tre native-lästa sparade samtyckesval och gemensam formulärknapp.
- [x] Översätt nya texter i 29 språk och verifiera native-patch, 1 491 apptester, 15 skripttester och exempelvisning utan publicering.
- [ ] Bekräfta sparade val och formulär på iOS och Android: kräver nya telefonbyggen och fysiska telefoner.

## Avgränsade samtyckesrättningar
- [x] Låt Visa val och Ändra samtycke hantera första UMP-formuläret konsekvent.
- [x] Lägg till permanenta tester för native-läsning, registrering och upprepad patchning på iOS och Android.
- [x] Kör hela testsviten utan publicering: 1 477 apptester och 14 native-skripttester godkända.
- [ ] Bekräfta formulärvisning på iOS och Android: kräver nytt telefonbygge och fysisk telefon.

## Annonsintegritet i inställningar
- [x] Rätta explicit uppdatering och öppning av samtyckesval när kallstarten inte hann hämta UMP-status.
- [x] Bevara okänd personanpassning och skilj okända integritetskrav från att val inte krävs; 1 469 tester godkända och webbsidan utan körfel.
- [ ] Bekräfta Googles samtyckesruta på fysisk telefon i nytt appbygge: kräver telefon och signerad version.

## ATT och samtyckesstatus
- [x] Direkt, serialiserad native-ATT efter UMP, utan Premium-frågor eller dubbla dialoger.
- [x] Faktiska statusavläsningar och tre samtyckesknappar med översättningar.
- [x] Full testsvit och dokumenterad verifiering utan publicering.
- [ ] Fysiska nyinstallations-, samtyckes-, ATT- och återkomstprov samt signerade telefonbyggen: kräver Mac/Xcode, Android SDK och iPhone/Android.
- [ ] Stäng av AdMobs förklarande IDFA-meddelande och verifiera UMP-konfigurationen: kräver åtkomst till AdMob-kontot.

## AdMob release-rättningar
- [x] Samordna Premium, samtycke, startbehörighet och integritetsval med permanent diagnostik och tester.
- [x] Inför reproducerbara native-rättningar för samtyckesfel, annonsinvalidering och verklig cacheålder; uppdatera Androids native-pluginregistrering och bevara Billing.
- [x] Kontrollera separata annonsdomäner och förbered app-ads.txt utan publicering.
- [x] Kör regressionstester och dokumentera fysisk releaseverifiering samt butikskontroll som saknar åtkomst.
- [ ] Full native-sync, signerade byggen och fysiska annons-/Premium-prov: kräver nytt webbundle, Android SDK respektive Mac/Xcode och telefoner.
- [ ] Verifiera butikernas faktiska Marketing URL/utvecklarwebbplats och AdMob-kontots IDFA-/UMP-/app-ads-status: saknar autentiserad konsolåtkomst.

## iOS SKAdNetwork
- [x] Lägg in Googles aktuella lista utan att skriva över befintliga ID:n.
- [x] Verifiera upprepade körningar, återskapat projekt och iOS-sync; dokumentera Mac-kommandot (8 tester + XML-kontroll; Xcode-körning görs på Mac).

- [x] Isolera varför adressökning misslyckas i TestFlight.
- [x] Inför en stabil, versionsoberoende native geocoding-endpoint.
- [x] Åtgärda previewns typkontrollfel och verifiera endpointen.
- [x] Reproducera den fysiska iPhonens request i publicerade produktionsloggar.
- [x] Lägg till verifierbar route-version, strikt native-parsning och säker diagnostik.
- [ ] Verifiera produktions- och native-build samt publicerad endpoint.
- [x] Byt IAP till pluginets officiella Capacitor 8-brygga med StoreKit 2.
- [ ] Verifiera StoreKit-priser i en ny signerad TestFlight-build.

## Google Play Billing (Android)
- [x] Migration: store-, google_purchase_token- och google_order_id-kolumner med unikt index.
- [x] Serververifiering mot Google Play Developer API (src/lib/google-play.server.ts).
- [x] Köpflöden på Android: engångsköp + Premium årsvis via Google Play, delar iOS-kvittoflödet.
- [x] versionCode 2, tester och typkontroll gröna.
- [x] Köprutten och Google-kopplingen testade i drift: OAuth 200, API svarar.
- [ ] Väntar på att Play Console-behörigheten sprider (upp till 24 h): 401 permissionDenied just nu.
- [ ] Signerad AAB byggd på användarens dator och testad mot Googles interna testspår.

## Avgränsad profilrättning
- [x] Bevara ursprung, hantera äldre osäkra månader och skilj manuell upplysning från gräns.
- [x] Uppdatera 29 språk och verifiera beräkning, sparande och rapport. Ingen publicering.

## Rapport i alla språk
- [x] Unicode-typsnitt i PDF: grekiska, ukrainska och kyrilliska återges korrekt; hindi-rapport görs på engelska.
- [x] Ursprungskolumnen i rapporten krymper/radbryts så långa översättningar inte krockar med värdet.

## Google Play-material
- [x] Skapa och kontrollera appikon, feature graphic och fem matchande appskärmbilder för sv-SE och en-US.


## Separat timjämförelse
- [x] Separat timmodell, gemensam PVGIS-cache och fyrprofilsväljare.
- [x] Regressionstester, jämförelsetabell och dokumenterade UTC-månadsantaganden.
- [x] Begripliga schablonkurvor med diagram, timtabell och exakt dygnsnormalisering.

## Betalningsåterförsök och profilnamn
- [x] Skydda verifiering mot samtidiga återförsök och testa låset.
- [x] Använd even för båda profilvägarna utan ändrade beräkningar.
