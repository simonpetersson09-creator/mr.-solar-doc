# Mr. Solar Doc

SOLENERGIKOLLEN – MASTER BUILD PROMPT

Bygg en konsumentapp för dimensionering och analys av solcellsanläggningar.

Användaren ska genom ett enkelt steg-för-steg-flöde kunna ange sin adress, elanvändning och huvudsäkring och därefter få en rekommendation på:

Installerad solcellseffekt, kWp

Växelriktarstorlek, kW

Förväntad årsproduktion, kWh

Förväntad månadsproduktion

Egenanvänd solel

Såld solel

Grundläggande ekonomiskt värde

Appen ska vara mycket enkel för en vanlig konsument att använda.

Beräkningsmotorn bakom resultatet ska däremot vara modulär, transparent och byggd för att senare kunna utökas med exempelvis batteri, timdata, elprisdata och mer avancerad ekonomisk analys.

Appen ska från början byggas för internationell användning. Landsspecifika värden får därför inte hårdkodas i beräkningsmotorn.

DEL 1 – ANVÄNDARFLÖDE

Steg 1 – Adress

Låt användaren söka efter sin adress med autocomplete.

Efter vald adress:

Visa fastigheten på en karta.

Placera en marker på adressen.

Tillåt användaren att korrigera positionen.

Hämta latitude och longitude.

Identifiera land och region.

Spara koordinaterna som grund för solberäkningen.

Fortsätt inte förrän en geografisk position har fastställts.

Steg 2 – Solproduktion via PVGIS

När koordinaterna är kända ska appen automatiskt hämta platsbaserad solproduktionsdata från PVGIS.

PVGIS ska användas för att fastställa:

Specifik årsproduktion i kWh/kWp/år.

Specifik produktion för varje av årets 12 månader.

Platsens verkliga månadsprofil för solproduktion.

Använd i första hand en referensanläggning på 1 kWp. Resultatet ska sedan kunna skalas mot den installerade solcellseffekt som dimensioneringsmotorn räknar fram.

Exempel:

Beräknad solproduktion på platsen
1 050 kWh/kWp/år

Använd INTE en generell svensk eller landsbaserad månadsprofil när PVGIS-data finns.

Takdata

Låt användaren valfritt ange:

Väderstreck

Vet inte

Syd

Sydost

Sydväst

Öst

Väst

Taklutning

Vet inte

alternativt ange grader

Om användaren väljer "Vet inte" ska PVGIS använda lämplig optimerad/default-konfiguration och appen ska tydligt ange att ett antagande används.

PVGIS ska ligga bakom en separat:

solarResourceService

UI ska aldrig kommunicera direkt med PVGIS.

Om PVGIS inte svarar får appen aldrig hitta på ett värde. Visa istället ett tydligt fel och möjlighet att försöka igen.

Spara:

address

latitude

longitude

country

region

annualKwhPerKwp

monthlyKwhPerKwp

orientation

tilt

dataSource

calculationVersion/date

Steg 3 – Elförbrukning

Låt användaren ange:

Årsförbrukning i kWh

Exempel:

18 000 kWh/år

Erbjud även:

Ange månadsförbrukning för bättre precision

När detta väljs visas 12 fält, januari–december.

Systemet ska:

Summera månaderna automatiskt.

Visa total årsförbrukning.

Prioritera månadsdata framför manuellt angiven årsdata i beräkningar där månadsprofil kan användas.

Exempel:

Total årsförbrukning
18 420 kWh/år

Månadsdata ska senare kunna användas för bättre uppskattning av egenanvändning.

Steg 4 – Huvudsäkring

Låt användaren ange huvudsäkring.

För europeisk trefas 400 V används:

maxAcPowerKw = mainFuseAmp × 0.69

Exempel:

25 A × 0,69 = 17,25 kW

0,69 ska ligga som konfigurationsvärde och INTE vara ett magic number inne i komponenter eller beräkningsfunktioner.

Förbered arkitekturen för andra nätspänningar och anslutningstyper på andra marknader.

Exempel på säkringsalternativ:

16 A

20 A

25 A

32 A

35 A

40 A

50 A

63 A

Annan

DEL 2 – DIMENSIONERINGSMOTOR

Rekommenderad solcellseffekt

Systemet ska automatiskt beräkna en rimlig installerad solcellseffekt i kWp.

Grundläggande referens:

önskad årsproduktion / lokal specifik produktion = panelernas kWp

Exempel:

Årsförbrukning:

15 000 kWh

PVGIS:

1 000 kWh/kWp/år

Referens:

15 000 / 1 000 = 15 kWp

Detta är endast utgångspunkten.

Den slutliga rekommendationen ska väga samman:

Årsförbrukning

Månadsförbrukning om den finns

PVGIS-data

Huvudsäkring

Tillåten AC-effekt

Växelriktarstorlek

DC/AC-ratio

Egenanvändning

Såld solel

Årsförbrukningen ska i första hand styra behovet. Huvudsäkringen ska fungera som teknisk begränsning.

Rekommenderad växelriktare

Beräkna först maximal AC-effekt från huvudsäkringen.

Välj därefter en rimlig kommersiell växelriktarstorlek som passar den rekommenderade solcellseffekten.

Växelriktaren får aldrig automatiskt dimensioneras över den tillåtna AC-gränsen.

Exempel:

25 A → 17,25 kW max

Kan exempelvis ge:

Rekommenderad växelriktare: 15 kW

Standardstorlekar ska ligga i central marknadskonfiguration och inte hårdkodas i UI.

Exempel:

3, 4, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30 kW

DC/AC-ratio

Panelernas DC-effekt får överdimensioneras jämfört med växelriktarens AC-effekt.

Beräkna:

DC/AC ratio = panel kWp / inverter kW

Målnivå:

1.10–1.20

Det innebär normalt:

10–20 % överdimensionering

Automatisk rekommendation får aldrig överstiga:

1.30

alltså:

30 % överdimensionering

Exempel med 15 kW växelriktare:

16,5 kWp = 10 %

18,0 kWp = 20 %

19,5 kWp = 30 %

Dimensioneringsmotorn ska i första hand försöka hamna inom 10–20 %.

DEL 3 – EGENANVÄNDNING OCH FÖRSÄLJNING

Standardantagande:

Egenanvänd solel: 50 %
Såld solel: 50 %

Användaren ska kunna ändra detta.

Värdena ska alltid tillsammans vara 100 %.

Exempel:

Egenanvändning ändras till 65 %

→ såld solel ändras automatiskt till 35 %.

Visa både procent och kWh.

Om användaren har angett månadsförbrukning ska arkitekturen vara förberedd för att senare beräkna en mer intelligent egenanvändningsgrad utifrån månadsproduktion kontra månadsförbrukning.

DEL 4 – ELPRIS

Användaren ska kunna ange sin egen prognos för elpris.

För Sverige:

Standard: 0,60 SEK/kWh

Användaren ska alltid kunna ändra värdet.

Benämn det tydligt:

Antaget framtida elpris

så att användaren förstår att detta är ett kalkylantagande och inte en prognos från appen.

Elpris och valuta ska vara marknadskonfigurerade.

Exempel:

SE → SEK → 0.60 SEK/kWh

Hårdkoda inte SEK eller 0,60 globalt.

Appen ska kunna ha andra standardvärden och valutor för andra marknader.

DEL 5 – PRODUKTIONSBERÄKNING

Använd PVGIS månadsdata för att beräkna produktionen.

För varje månad:

monthlyProduction = monthlyKwhPerKwp × installedKwp

Årsproduktion:

annualProduction = summan av årets 12 månader

Håll alltid isär:

DC-effekt: panelernas installerade kWp
AC-effekt: växelriktarens kW

Behandla inte:

växelriktare kW × kWh/kWp

som ett tak för årsproduktionen.

Eventuella förluster på grund av inverter clipping ska senare kunna beräknas separat.

DEL 6 – RESULTAT

Resultatsidan ska prioritera enkelhet.

Visa först tre huvudresultat:

Rekommenderad solcellsanläggning

XX,X kWp

Rekommenderad växelriktare

XX kW

Beräknad årsproduktion

XX XXX kWh/år

Visa därefter exempelvis:

Solproduktion på platsen, kWh/kWp/år

Årsförbrukning

Huvudsäkring

Maximal beräknad AC-effekt

Installerad DC-effekt

Växelriktareffekt

DC/AC-ratio

Överdimensionering i %

Produktion januari–december

Egenanvänd solel i % och kWh

Såld solel i % och kWh

Antaget elpris

Valuta

Lägg mer avancerade detaljer bakom:

Visa beräkning

Användaren ska inte behöva förstå DC/AC-ratio, PVGIS eller tekniska dimensioneringsregler för att förstå huvudresultatet.

DEL 7 – BERÄKNINGSARKITEKTUR

All beräkningslogik ska ligga utanför React-komponenterna.

Skapa rena TypeScript-moduler, exempelvis:

solar-resource.ts

solar-sizing.ts

inverter-sizing.ts

energy-production.ts

self-consumption.ts

electricity-price.ts

Dessa ska kunna enhetstestas utan UI.

Använd central konfiguration för antaganden:

EU_THREE_PHASE_KW_PER_AMP = 0.69
TARGET_MIN_DC_AC_RATIO = 1.10
TARGET_MAX_DC_AC_RATIO = 1.20
ABSOLUTE_MAX_DC_AC_RATIO = 1.30


Undvik magic numbers i komponenter och beräkningsfunktioner.

Marknadsspecifika värden ska ligga i separat market configuration.

DEL 8 – TEKNISK STANDARDARKITEKTUR

Capacitor / Native

Bygg projektet för webb samt native-distribution via Capacitor för iOS och Android.

Förbered:

iOS och Android

Safe areas

Status bar

App lifecycle

Device/platform detection

Deep links

Native permissions

Web fallback

Native-funktionalitet ska ligga bakom ett gemensamt typat interface:

UI → Native Service → Capacitor/Native

UI och routes får inte kommunicera direkt med Swift, Capacitor eller andra native-API:er.

Haptics

Skapa en central haptic()-service.

Stöd:

Light

Medium

Success

Warning

Error

Använd Capacitor Haptics native och lämplig web fallback.

Notifications

Skapa en central notifications-service med stöd för:

Lokala notiser

Push notifications när de behövs

Permissions

Schemaläggning/avbokning

Klick på notis → korrekt route

Deep links

Platform detection

Begär inte notisbehörighet automatiskt vid första start.

Routing

Använd TanStack Router med file-based routing.

Separata routes för huvudvyer.

Tunna route-filer.

Gemensam BackButton.

Bottom navigation när det passar informationsarkitekturen.

Deep-link routing.

Native swipe-back på iOS.

Affärslogik får inte ligga direkt i route-filer.

Datalager

Använd:

UI → Hooks → Services/Repositories → Data/API

UI får inte direkt kommunicera med:

PVGIS

andra externa API:er

Supabase

localStorage

native storage

Använd TanStack Query för serverdata, caching, mutations, refetching och query invalidation.

Formulär och validering

Använd:

React Hook Form

Zod

Alla formulär ska ha:

Inline validation

Begripliga fel

Pending/loading state

Skydd mot dubbel-submit

Success feedback

Säker API-felhantering

Validera data även server-side när backend används.

Error Handling

Implementera:

Global Error Boundary

Central API error handler

Central logging

Human-readable errors

Retry

Fallback UI

Tekniska fel och användarmeddelanden ska hållas separerade.

Internationalisering

Använd:

i18next

react-i18next

Alla användartexter ska ligga i separata språkresurser.

Ingen hårdkodad UI-text i komponenterna.

Aktiv locale ska styra:

Datum

Tal

Decimaltecken

Valuta

Enhetsformat

Kod och tekniska identifierare ska vara på engelska.

Appen ska kunna lanseras på fler språk utan att kärnlogiken behöver ändras.

Betalning

Förbered en central betalnings-/entitlement-arkitektur.

När betalning aktiveras på iOS ska StoreKit 2 användas.

Stöd:

Subscription status

Trial

Paywall

Entitlement

Restore Purchases

Lokaliserade App Store-priser

Premiumstatus ska ha en central source of truth och inte hanteras separat i olika komponenter.

Appen får aldrig ge premium enbart baserat på lokalt lagrad information.

App Settings

Skapa en central settings-struktur för:

Språk

Tema

Notifications

Premiumstatus

Användarpreferenser

Feature flags

Globala inställningar får inte lagras ad hoc av enskilda komponenter.

SLUTLIG ARKITEKTURPRINCIP

Följ genom hela projektet:

UI → Hooks → Services → Data/API

UI → Native Service → Capacitor/Native

UI → Calculation Engine → Result

Separera alltid:

UI

affärslogik

beräkningslogik

datalagring

externa API:er

native-funktionalitet

Undvik stora komponenter som gör flera av dessa saker samtidigt.

Implementera inte onödig komplexitet bara för framtida behov, men bygg tydliga interfaces så att funktioner kan utökas senare.

När nya funktioner läggs till ska samma arkitektur följas.

DEL 7 – PDF-RAPPORT OCH EXPORT

När användaren har slutfört beräkningen ska resultatet kunna exporteras som en professionell PDF-rapport.

Visa en tydlig knapp på resultatsidan:

Ladda ner rapport som PDF

PDF-rapporten ska genereras från samma beräkningsdata som visas i appen. Beräkningar får inte göras separat i PDF-komponenten.

Rapporten ska innehålla

Sammanfattning

Visa de viktigaste resultaten tydligt högst upp:

Vald adress

Rekommenderad solcellseffekt, kWp

Rekommenderad växelriktare, kW

Beräknad årsproduktion, kWh/år

Beräknad solproduktion för platsen, kWh/kWp/år

Anläggningsdimensionering

Visa:

Installerad paneleffekt, kWp

Växelriktareffekt, kW

DC/AC-ratio

Överdimensionering i %

Huvudsäkring

Beräknad maximal AC-effekt

Produktion

Visa:

Beräknad årsproduktion

Produktion januari–december

Gärna ett enkelt diagram över månadsproduktionen

PVGIS som datakälla för solproduktionsberäkningen

Elanvändning

Visa:

Årsförbrukning

Månadsförbrukning om användaren har angett den

Egenanvänd solel i % och kWh

Såld solel i % och kWh

Ekonomiska antaganden

Visa:

Antaget elpris

Valuta

Övriga ekonomiska antaganden som senare läggs till i kalkylen

Antaganden

Rapporten ska tydligt ange vilka värden som:

Användaren själv har angett

Appen har beräknat

Appen har antagit som standardvärden

Kommer från externa datakällor som PVGIS

Det ska exempelvis framgå om taklutning eller orientering har antagits istället för att anges av användaren.

PDF-arkitektur

Skapa en separat rapportmodul, exempelvis:

solarReportService

Princip:

Calculation Engine → Calculation Result → Report Service → PDF

PDF-generatorn ska endast presentera färdigberäknade resultat och får inte innehålla egen dimensionerings- eller affärslogik.

Rapporten ska:

Ha professionell och ren design.

Följa appens designsystem.

Vara anpassad för A4.

Hantera sidbrytningar korrekt.

Stödja appens olika språk och valutor.

Inkludera datum för beräkningen.

Kunna sparas lokalt.

Kunna delas via native share sheet på iOS/Android.

Ha web fallback för nedladdning i webbläsaren.

Filnamn ska genereras automatiskt, exempelvis:

solenergikollen-2026-08-27.pdf

Bygg rapportfunktionen modulärt så att fler sektioner senare kan läggas till, exempelvis:

Investeringskostnad

Årlig besparing

Återbetalningstid

25- eller 30-årskalkyl

Batterisimulering

CO₂-besparing

Elprisanalys

PDF-rapporten ska betraktas som en ögonblicksbild av den aktuella beräkningen och innehålla tillräckligt med information för att användaren senare ska kunna förstå vilka antaganden resultatet baserades på.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/68a192c2-c6ae-462b-8fcb-cc89c8e860cc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
