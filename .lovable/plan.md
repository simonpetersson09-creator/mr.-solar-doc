# Fixa fastnad prisinhämtning i TestFlight

## Orsak
Den installerade köppluginen tillåter bara `store.initialize()` en gång per session. Dess `store.update()` har samtidigt en standardspärr på tio minuter. Appens nuvarande omförsök efter 7, 18 och 30 sekunder blir därför bortfiltrerade, vilket lämnar priset i “Hämtar pris” när den första StoreKit-laddningen misslyckas eller blir tom.

## Ändring
- Anpassa StoreKit-starten till pluginens engångsmodell och skilj adapterstart från lyckad produktladdning.
- Göra prisomladdningen verklig genom att använda pluginens stödda `store.update()` med en säker, kortare spärr under aktiv produktåterhämtning.
- Behålla en enda Store-instans, en registrering och en uppsättning listeners.
- Låta prisvyn lämna loading efter 45 sekunder och visa neutral text med “Försök igen”.
- Säkerställa att köpknappar endast aktiveras när rätt produkt har ett giltigt erbjudande.

## Tester
- Första produktladdningen är tom, senare omladdning ger pris.
- Omförsök efter långsam Sandbox-respons anropar verkligen StoreKit.
- Inga dubbla registreringar eller callbacks skapas.
- Saknad produkt lämnar loading och visar neutral retry-status.
- Befintliga avbrotts-, köp-, verifierings- och finishflöden fortsätter fungera.

## Avgränsning
Product IDs, priser, affärsmodell, serververifiering och transaktionsfinish ändras inte.
