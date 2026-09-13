# Separat timjämförelse för egenanvändning

## Avgränsning
Bygg en valbar jämförelse på resultatsidan, inte en ny standardmodell. Dagens dimensionering, manuella egenanvändning, sparade profilval, priser, långtidsberäkning och PDF förblir oförändrade. Ingen publicering.

## Konstaterade hinder
- Timserien finns i kapningsfunktionens servercache men returneras inte. Hämtningen i `use-clipping-loss` är dessutom avstängd vid DC/AC ≤ 1. Timjämförelsen behöver därför en separat begäran som återanvänder samma seriecache, oberoende av kapningsbehov.
- Platsdata saknar tidszon. Härled IANA-tidszon från koordinater med ett lämpligt bibliotek, aldrig från land eller telefonens tidszon. Visa använd tidsbas i jämförelsen.
- Standardmodellen stöder bara tre profiler. **Jämn över dygnet** stannar därför i jämförelsens profilväljare och kopplas inte till en annan gammal profil.

## Vad som byggs
1. En gemensam, validerad PVGIS-serieleverans för webb och den befintliga native-anslutningen. Behåll befintlig kapningsutdata och återanvänd hämtning/cache.
2. En separat profilgenerator med dokumenterade, uttryckligen ovaliderade 24-timmarskurvor för kväll, blandad och dag samt konstant timlast för jämn profil. Ingen extra kundfråga och inga gamla profilfaktorer i timmodellen.
3. En ren energiberäkning som matchar tidsstämplar och summerar direkt egenanvändning, import och export per månad och år. Nollnämnare hanteras uttryckligt. Inget batteri.
4. En jämförelse med fyra profilval enligt befintlig design och översättningsstruktur i alla 29 språk. Jämn profil får beskrivningen: ”För dig med ungefär lika stor förbrukning under dygnets alla timmar.” Visa separat att resultaten är timberäknade uppskattningar med syntetisk förbrukning och inte påverkar kundens manuella val.
5. Tydlig felstatus vid saknade eller ogiltiga timdata; äldre resultat märks aldrig som timberäknade.

## Tekniska regler
- Dokumentera PVGIS UTC-tidsstämplarnas minutläge och hur varje observation representerar en timmes energi; omvandla W för referensanläggningen till kWh för aktuell paneleffekt och tillämpa växelriktarens AC-tak exakt en gång. Ingen extra 14-procentsförlust.
- Använd en verifierad helårskalender. Kontrollera skottår, luckor, dubbletter och olika serieår. Matchning sker med tidsnycklar, inte radnummer.
- Fördela månadens energi över dess faktiska timmar. Lokal klocktid styr dygnskurvan inklusive sommartid. Dokumentera hantering av UTC-årsgränsens lokala randtimmar; saknade randtimmar får inte tyst ignoreras.
- Bevara kompletta kundmånader. Vid enbart årsenergi återanvänd befintlig månadsfördelning, även för jämn dygnslast, med bibehållen årssumma. Ofullständiga månader ger tydligt otillgängligt resultat i denna första version, inte automatisk nollfyllnad.
- Jämför gamla och nya modellen med exakt samma månadsproduktion och förbrukning. Redovisa att timåret inte är identiskt med PVGIS långsiktiga månadsmedelvärden.
- Kontrollera månadsöverlappets tak utan att klippa bort fel. Manuella inställningar och standardmodellens lagrade data är endast läsbara från jämförelsen.

## Verifiering och leverans
- Regressionstester för alla fyra profilers månads-/årsenergi, konstant jämn timlast, säsongsvariation, timbalans, kalender/tidsmappning, kapning exakt en gång och månadsöverlapp.
- Tester för oförändrade manuella val och befintliga profilval samt utebliven tillämpning av gamla faktorer.
- Jämförelsetabell: fyra profiler, låg/jämförbar/hög produktion, säsongslast, nollfall och kapning. Visa kWh, procent, skillnad i procentenheter, import och export. För jämn profil: oberoende kontrollfall, ingen påhittad äldre motsvarighet.
- Kör befintliga tester och kontrollera jämförelsen i webbläsaren. Leverera ändrade filer, testresultat, tabell, kvarvarande antaganden och kriterier för ett framtida standardbyte.
- Ingen träffsäkerhetsgaranti: uppmätta förbrukningsserier och oberoende validering krävs innan standardbyte övervägs.