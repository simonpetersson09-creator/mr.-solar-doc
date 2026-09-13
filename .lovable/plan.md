# Begripliga schablonprofiler för timjämförelsen

## Avgränsning
Timmodellen förblir en separat jämförelse. Ingen ändring görs i standardmodellen, produktionsunderlaget, kapningen, ekonomin, PDF-rapporten eller manuellt vald egenanvändning. Ingen publicering.

## Genomförande
1. Justera endast de tre formade 24-timmarskurvorna där det behövs:
   - **Kväll:** nattlig baslast, mjuk morgontopp, låg dagförbrukning och en tydlig men måttlig kvällstopp.
   - **Blandad:** baslast hela dygnet med måttliga morgon- och kvällstoppar.
   - **Dag:** låg nattförbrukning och ett brett, mjukt dagblock.
   - **Jämn:** oförändrat samma vikt varje timme.
2. Behåll profilgeneratorns nuvarande normalisering mot varje lokal kalendermånad. Inga profil- eller korrektionsfaktorer läggs ovanpå timfördelningen.
3. Lägg till en tydlig profilöversikt i den befintliga, utfällbara timjämförelsen:
   - linjediagram med alla fyra normaliserade dygnskurvor,
   - tabell för timmarna 00–23 med procent av ett normalt dygn,
   - summa 100 % per profil,
   - kort förklaring och tydlig märkning som schablon.
4. Lägg till de nya presentationstexterna i appens befintliga 29 språk utan att ändra äldre profilval eller införa nya frågor.

## Tekniska kontroller
- Testa att varje dygnskurva har 24 icke-negativa värden, viss nattförbrukning och exakt 100 % efter normalisering.
- Testa profilernas avsedda form: kvällens kvällsandel och morgontopp, blandad förbrukning över hela dagen, dagens dagandel samt helt jämn profil.
- Behåll och kör testerna för lokal tidszon, sommartid, skottår samt bevarad månads- och årsenergi.
- Kör hela befintliga testsviten och kontrollera diagrammet och tabellen i mobil och desktop.
