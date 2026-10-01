<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- Purchases (unlock + Premium) are verified server-side only, never trusted from the client. Apple uses `src/lib/apple-iap.server.ts`, Google Play uses `src/lib/google-play.server.ts` (service-account secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, package `GOOGLE_PLAY_PACKAGE_NAME`). The store switch lives in `purchase-service.ts` (`route()` picks the Google action on Android); both stores share the same product ids in `src/config/purchase.ts` and the same receipt tables (`calculations.store`, `premium_subscriptions.google_purchase_token`).
- The native app talks to the paywall through the stable REST route `/api/public/purchase`, not server-function RPC ids, because RPC ids drift between bundled builds and the published backend.
- The Android `store`/token columns must keep their unique index on `premium_subscriptions.google_purchase_token` — the Premium upsert depends on it.

