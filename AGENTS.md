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

- US/CA busbar limit is computed in `resolvePvPowerLimit` from the panel the PV connects to (main breaker + busbar, optional user input), not the total service; unknown values are assumed and returned in `busbarBasis` so the result page and PDF show the same assumption via `src/lib/panel-assumption.ts`. Why: service size and PV panel differ, and assumptions must be visible.

- Anonymous usage stats go to `app_events` via the REST route `/api/public/events` (`src/services/stats.ts`, fire-and-forget). Why: the native app needs a stable URL, and stats must never block or break the app.
- AdMob uses `admob-coordinator.ts` for serialized UMP, direct guarded native ATT after UMP, read-only automatic settings snapshots and explicit Premium-guarded UMP refresh/recovery, fail-closed authoritative Premium checks and cancellable launch eligibility; `app-open-ad.ts` adapts native lifecycle/navigation and Settings form eligibility, and native Debug always selects demo units. Native snapshots also read persisted TCF purpose consents; `ad-consent-choices.ts` maps purposes independently only with obtained consent and valid bits, never as vendor consent or ad eligibility. Why: Settings must display saved choices without inferring acceptance or changing advertising behavior.
- AdMob 8.2.1 native safety changes are version-pinned in `patches/admob-8.2.1.json` and atomically applied by `scripts/patch-admob.mjs` before native sync/add and after installation; native caches use monotonic age and generation invalidation. Why: regenerated native projects must retain reviewed safety behavior without untracked dependency edits.
- Ad diagnostics are a bounded local, identifier-free event buffer in `ad-diagnostics.ts`; native opened and paid events are distinct from show attempts. Why: troubleshooting must not add personal tracking or misreport impressions.
- The standalone Settings `AdPrivacyButton` separates read, update and form failures; explicit refresh always reads a fresh native snapshot and preserves an update-failure outcome. Why: UMP update responses omit purpose choices and presentation failures must not hide readable consent.
- iOS creation and sync commands run the privacy/localization patches; SKAdNetwork IDs are a checked-in Google list merged additively into Info.plist. Why: recreated native projects must restore configuration offline without removing custom IDs or touching Android.
