# App icon (Mr. Solar Doc)

`icon.png` is the 1024×1024 master icon (no alpha channel, as Apple requires).
`AppIcon.appiconset/` contains the fully generated iOS icon set, ready for Xcode.

## Efter `npx cap add ios` (görs på Mac)

```bash
npx cap add ios            # bara första gången
npm run ios:icons          # kopierar ikonsetet till Xcode-projektet
npx cap sync ios
```

`npm run ios:icons` skriver över
`ios/App/App/Assets.xcassets/AppIcon.appiconset/` med innehållet här.
`npx cap sync ios` rör aldrig Assets.xcassets, så ikonen ligger kvar.
