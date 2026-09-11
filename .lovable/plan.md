# Fixa native prishämtning med rätt Capacitor-brygga

## Rotorsak
Projektet använder `cordova-plugin-purchase@13.18.0` genom Capacitors Cordova-kompatibilitetslager. För Capacitor 6–8 rekommenderar samma pluginprojekt i stället `capacitor-plugin-cdv-purchase`, som registrerar en riktig Capacitor-plugin och använder StoreKit 2. Den nuvarande installationen kan ge JavaScript-objektet `CdvPurchase` utan att den native bryggan laddar produktmetadata, vilket stämmer med att TestFlight stannar på ”Hämtar pris…”.

## Ändring
- Byt endast IAP-paketet från Cordova-varianten till `capacitor-plugin-cdv-purchase@13.18.0`.
- Importera den dedikerade Store-instansen och typerna direkt i IAP-servicen i stället för att vara beroende av ett sent `window.CdvPurchase`/`deviceready`.
- Behåll en Store-instans, en produktregistrering och en uppsättning köp-/transaktionslyssnare.
- Behåll nuvarande Product IDs, produkttyper, serververifiering och transaktionsfinish.
- Anpassa prisstatus och återhämtning till den riktiga Capacitor/StoreKit 2-bryggans ready- och update-signaler.
- Lägg till tydlig diagnostik för native-pluginens registrering, StoreKit-initiering och produktresultat utan att visa tekniska fel som betalningsfel.

## Verifiering
- Testa direkt och fördröjd produktmetadata, tom första laddning följd av lyckad omladdning och 45-sekunders timeout.
- Testa sen/native initialisering, samtidiga retries, saknat offer, avbrott, köp, verifiering och finish.
- Kontrollera att inga dubbla Store-instanser eller callbacks skapas.
- Kör riktade IAP-tester, hela testsviten och byggkontroller.
- Kontrollera native byggskriptet och dokumentera exakt vad som måste köras på Mac innan en ny TestFlight-build.

## Avgränsning
Produkt-ID:n, priser, affärsmodell, serververifiering och transaktionsfinish ändras inte. Verklig StoreKit-kontakt kan slutligen verifieras först i en ny signerad TestFlight-build efter `npm run cap:sync` på Mac.
