# Google Play-material på svenska och engelska

## Resultat
- Skapa `google-play-assets/sv-SE` och `google-play-assets/en-US`.
- Leverera en 512 × 512-appikon i båda mapparna.
- Leverera en 1024 × 500-feature graphic med samma textfria design i båda mapparna.
- Leverera fem matchande telefonskärmbilder per språk, i samma ordning och med samma appvyer.

## Genomförande
1. Skala den befintliga originalikonen till Google Plays ikonformat utan att ändra motivet.
2. Bygg en textfri feature graphic med appens befintliga ikon och etablerade gula, cremefärgade och mörkgröna uttryck, så samma bild fungerar för båda språken.
3. Starta appen i ett rent testläge och välj svenska respektive engelska genom appens befintliga språkhantering.
4. Visa samma fem riktiga appvyer med motsvarande testdata på båda språken och ta skärmbilder i telefonformat.
5. Kontrollera filformat, pixelmått, språk, ordning och att ingen översatt text har lagts ovanpå bilderna.

## Avgränsning
- Ingen appfunktion, beräkning eller befintlig översättning ändras.
- Ingen publicering görs.

## Teknisk detalj
- Skärmbilderna tas från den körande appen med dess befintliga i18n-resurser, inte från återskapade eller manipulerade gränssnitt.
- Bilderna sparas som PNG-filer med konsekventa filnamn i båda språkmapparna.