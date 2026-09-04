import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Crown,
  FileText,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptic } from "@/services/native-service";
import {
  PurchaseError,
  describePurchaseError,
  isPurchaseAvailable,
  purchasePremium,
  refreshPurchases,
} from "@/services/iap-service";
import { useStorePrices } from "@/hooks/use-store-prices";

import { fetchPremiumStatus, verifyPremium } from "@/services/purchase-service";
import { usePurchaseStore } from "@/state/purchase-store";
import { drainPurchaseTransactions } from "@/services/purchase-recovery";
import { PREMIUM_QUERY_KEY, usePremium } from "@/hooks/use-premium";
import { CALCULATION_VERSION } from "@/config/constants";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/installningar")({
  head: () => ({
    meta: [
      { title: "Inställningar — Mr. Solar Doc" },
      { name: "description", content: "Hantera premium och ditt abonnemang i Mr. Solar Doc." },
      { property: "og:title", content: "Inställningar — Mr. Solar Doc" },
      { property: "og:description", content: "Hantera premium och ditt abonnemang i Mr. Solar Doc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const LEGAL_URL = "https://solar-doc-terms.lovable.app/integritetspolicy";
const PRIVACY_URL = "https://solar-doc-terms.lovable.app/integritetspolicy";
const MANAGE_SUBSCRIPTION_URL = "https://apps.apple.com/account/subscriptions";

function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const premium = usePremium();
  const [restoring, setRestoring] = useState(false);
  const [buying, setBuying] = useState(false);
  /** Visible, non-transient failure text — a toast alone can be missed. */
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  // StoreKit prices only — no hardcoded fallback amount or currency. The hook
  // boots StoreKit and updates when products/prices arrive after mount.
  const store = useStorePrices();
  const premiumPrice = store.premium;
  const unlockPrice = store.unlock;
  const priceStalled = store.status === "unavailable";
  // On the web there is no App Store, so a missing price is expected, not an error.
  const priceFallback = !store.diagnostics.supported
    ? "—"
    : priceStalled
      ? t("paywall.failed")
      : t("paywall.priceLoading");

  /** Buys the yearly subscription. Verification is always server-side. */
  async function handleBuyPremium() {
    if (buying || premium.active) return;
    void haptic("medium");
    setPurchaseError(null);
    if (!isPurchaseAvailable()) {
      setPurchaseError(t("premium.unavailable"));
      toast.info(t("premium.unavailable"));
      return;
    }
    setBuying(true);
    try {
      const { transactionId, finish } = await purchasePremium();
      // Apple's server API needs a moment before a brand new transaction is
      // visible (seconds, in Sandbox/App Review), so retry a pending answer.
      let verified = await verifyPremium({
        data: { deviceId: usePurchaseStore.getState().ensureDeviceId(), transactionId },
      });
      for (const delay of [1500, 2500, 4000, 6000]) {
        if (verified.status !== "pending") break;
        await new Promise((resolve) => setTimeout(resolve, delay));
        verified = await verifyPremium({
          data: { deviceId: usePurchaseStore.getState().ensureDeviceId(), transactionId },
        });
      }

      if (verified.status === "active") {
        await finish();
        await queryClient.invalidateQueries({ queryKey: PREMIUM_QUERY_KEY });
        void haptic("success");
        toast.success(t("premium.activated"));
      } else if (verified.status === "pending") {
        // Unfinished on purpose: StoreKit redelivers it and the recovery hook
        // verifies it again, so a paid user never loses access.
        toast.info(t("paywall.retry"));
      } else {
        await finish();
        setPurchaseError(t("paywall.failed"));
        toast.error(t("paywall.failed"));
      }
    } catch (error) {
      const reason = error instanceof PurchaseError ? error.reason : "failed";
      console.warn("[iap] settings premium purchase failed", describePurchaseError(error));
      if (reason === "cancelled") {
        toast.info(t("paywall.cancelled"));
      } else if (reason === "unavailable") {
        setPurchaseError(t("premium.unavailable"));
        toast.info(t("premium.unavailable"));
      } else {
        setPurchaseError(t("paywall.failed"));
        toast.error(t("paywall.failed"));
      }
    } finally {
      setBuying(false);
    }
  }

  /**
   * Restore syncs the App Store account with StoreKit so the current
   * subscription entitlement is redelivered and re-verified server-side.
   * The one-off unlock is a consumable and is never restorable.
   */
  async function handleRestore() {
    if (restoring) return;
    void haptic("light");
    setRestoring(true);
    try {
      await refreshPurchases();
      // StoreKit redelivers the entitlement as an approved transaction. It has
      // to be verified here and now: the background recovery only runs at app
      // start and on foreground, so a foreground restore would otherwise find
      // nothing. Retry briefly because redelivery is asynchronous.
      for (const delay of [800, 1500, 2500, 4000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (await drainPurchaseTransactions(queryClient)) break;
      }
      await queryClient.invalidateQueries({ queryKey: PREMIUM_QUERY_KEY });
      const status = await queryClient.fetchQuery({
        queryKey: PREMIUM_QUERY_KEY,
        queryFn: () =>
          fetchPremiumStatus({
            data: { deviceId: usePurchaseStore.getState().ensureDeviceId() },
          }),
      });
      await queryClient.invalidateQueries({ queryKey: ["purchase-status"] });
      if (status.active) toast.success(t("premium.restoredPremium"));
      else toast.info(t("premium.nothingToRestore"));
    } catch (error) {
      console.warn("[iap] restore failed", describePurchaseError(error));
      toast.error(t("premium.restoreFailed"));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="surface-sun flex h-dvh max-h-dvh flex-col overflow-hidden">
      <main
        className="scrollbar-hidden mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        style={{ paddingTop: "max(var(--safe-top-min), calc(0.25rem + env(safe-area-inset-top)))" }}
      >
        <header className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            aria-label={t("common.back")}
            onClick={() => {
              void haptic("light");
              void navigate({ to: "/" });
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-brand-black/22 bg-brand-black text-brand-yellow shadow-lg shadow-brand-black/25 transition-transform active:scale-90"
          >
            <ArrowLeft className="size-3" />
          </button>
          <h1 className="text-base font-bold tracking-tight text-brand-black">
            {t("settings.title")}
          </h1>
        </header>

        {/* Language — always changeable, independent of the analysed country */}
        <section className="glass-primary rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-brand-black">{t("settings.language")}</h2>
            <LanguageSwitcher />
          </div>
          <p className="mt-1 text-[10px] text-brand-black/70">{t("settings.languageHint")}</p>
        </section>

        {/* Premium section */}
        <section className="flex flex-col gap-3">
          {/* Premium subscription (primary) */}
          <div className="glass-primary relative overflow-hidden rounded-2xl p-3 ring-2 ring-brand-black/15">
            <div className="relative z-10 flex flex-col gap-2">
              {/* Title + price on one row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Crown className="size-4 shrink-0 text-brand-black" />
                  <h2 className="truncate text-base font-black leading-none text-brand-black">
                    {t("paywall.premium.title")}
                  </h2>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-brand-black/55">
                    {t("settings.popular")}
                  </span>
                  <span className="whitespace-nowrap text-sm font-black tabular-nums text-brand-black">
                    {premiumPrice
                      ? t("paywall.premium.price", { price: premiumPrice })
                      : priceFallback}
                  </span>
                </div>
              </div>
              {/* Benefits */}
              <ul className="flex flex-col gap-0.5">
                {["calculations", "pdf", "result"].map((key) => (
                  <li key={key} className="flex items-start gap-1.5 text-[11px] text-brand-black/85">
                    <Check className="mt-0.5 size-3 shrink-0 text-brand-black" />
                    <span>{t(`paywall.premium.includes.${key}`)}</span>
                  </li>
                ))}
              </ul>
              {/* CTA */}
              {premium.active ? (
                <div className="flex items-center gap-1.5 rounded-lg bg-brand-black/10 px-2 py-1">
                  <Crown className="size-3 text-brand-black" />
                  <span className="flex flex-col">
                    <span className="text-[11px] font-bold text-brand-black">
                      {t("premium.active")}
                    </span>
                    <span className="text-[10px] text-brand-black/70">{t("premium.activeHint")}</span>
                  </span>
                </div>
              ) : (
                <Button
                  disabled={buying}
                  onClick={() => void handleBuyPremium()}
                  className="h-8 w-full text-xs font-semibold"
                >
                  {buying ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      {t("paywall.purchasing")}
                    </>
                  ) : (
                    t("paywall.premium.cta")
                  )}
                </Button>
              )}
              {/* Never silent: a failed or unavailable purchase is visible and retryable */}
              {!premium.active && (purchaseError || priceStalled) ? (
                <div className="flex flex-col gap-1">
                  <p role="alert" className="text-[11px] font-semibold text-destructive">
                    {purchaseError ?? t("paywall.failed")}
                  </p>
                  <Button
                    variant="outline"
                    className="h-7 w-full text-[11px] font-semibold"
                    onClick={() => {
                      setPurchaseError(null);
                      store.retry();
                    }}
                  >
                    {t("common.retry")}
                  </Button>
                </div>
              ) : null}
              {/* Centered renewal note */}
              <p className="text-center text-[10px] leading-snug text-brand-black/60">
                {t("paywall.premium.renewal")}
              </p>
            </div>
            <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full border-[8px] border-brand-black/5" />
          </div>

          {/* One-off unlock */}
          <div className="glass-primary relative overflow-hidden rounded-2xl p-3">
            <div className="relative z-10 flex flex-col gap-2">
              {/* Title + price on one row */}
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 truncate text-base font-black leading-none text-brand-black">
                  {t("paywall.single.title")}
                </h2>
                <span className="shrink-0 whitespace-nowrap text-sm font-black tabular-nums text-brand-black">
                  {unlockPrice ?? priceFallback}
                </span>
              </div>
              <p className="text-[11px] font-medium text-brand-black/75">
                {t("paywall.single.body")}
              </p>
              <Button disabled className="h-8 w-full text-xs font-semibold">
                {t("settings.singleCta")}
              </Button>
              <p className="text-center text-[10px] leading-snug text-brand-black/60">
                {t("settings.singleNote")}
              </p>
            </div>
            <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full border-[8px] border-brand-black/5" />
          </div>
        </section>

        {/* Settings groups */}
        <section className="flex flex-col gap-2.5">
          {/* Restore / Manage */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={restoring}
              onClick={() => void handleRestore()}
              className="flex w-full items-center justify-between rounded-xl border border-brand-black/10 bg-brand-black/5 px-3.5 py-2.5 text-left transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  {restoring ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                </span>
                <span className="text-xs font-semibold text-brand-black">
                  {t("premium.restore")}
                </span>
              </span>
              <ChevronRight className="size-3 text-brand-black/40" />
            </button>
            <a
              href={MANAGE_SUBSCRIPTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void haptic("light")}
              className="flex w-full items-center justify-between rounded-xl border border-brand-black/10 bg-brand-black/5 px-3.5 py-2.5 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  <Settings2 className="size-3" />
                </span>
                <span className="text-xs font-semibold text-brand-black">{t("premium.manage")}</span>
              </span>
              <ChevronRight className="size-3 text-brand-black/40" />
            </a>
          </div>

          {/* History */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                void haptic("light");
                void navigate({ to: "/historik" });
              }}
              className="flex w-full items-center justify-between rounded-xl border border-brand-black/10 bg-brand-black/5 px-3.5 py-2.5 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  <History className="size-3" />
                </span>
                <span className="text-xs font-semibold text-brand-black">{t("settings.history")}</span>
              </span>
              <ChevronRight className="size-3 text-brand-black/40" />
            </button>
          </div>

          {/* Legal */}
          <div className="flex flex-col gap-2">
            <a
              href={LEGAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void haptic("light")}
              className="flex w-full items-center justify-between rounded-xl border border-brand-black/10 bg-brand-black/5 px-3.5 py-2.5 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  <FileText className="size-3" />
                </span>
                <span className="text-xs font-semibold text-brand-black">{t("settings.terms")}</span>
              </span>
              <ChevronRight className="size-3 text-brand-black/40" />
            </a>
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void haptic("light")}
              className="flex w-full items-center justify-between rounded-xl border border-brand-black/10 bg-brand-black/5 px-3.5 py-2.5 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  <ShieldCheck className="size-3" />
                </span>
                <span className="text-xs font-semibold text-brand-black">{t("settings.privacy")}</span>
              </span>
              <ChevronRight className="size-3 text-brand-black/40" />
            </a>
          </div>
        </section>

        <footer className="pt-0.5 text-center">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-brand-black/30">
            Mr. Solar Doc · v{CALCULATION_VERSION}
          </p>
        </footer>
      </main>
    </div>
  );
}
