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
  getStorePrice,
  isPurchaseAvailable,
  purchasePremium,
  refreshPurchases,
} from "@/services/iap-service";
import { verifyApplePremium } from "@/lib/purchase.functions";
import { usePurchaseStore } from "@/state/purchase-store";
import { PREMIUM_QUERY_KEY, usePremium } from "@/hooks/use-premium";
import { PREMIUM_PRODUCT_ID, UNLOCK_PRODUCT_ID } from "@/config/purchase";
import { CALCULATION_VERSION } from "@/config/constants";

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

const LEGAL_URL = "https://solar-doc-terms.lovable.app";
const PRIVACY_URL = "https://solar-doc-terms.lovable.app/integritetspolicy";
const MANAGE_SUBSCRIPTION_URL = "https://apps.apple.com/account/subscriptions";

function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const premium = usePremium();
  const [restoring, setRestoring] = useState(false);
  const [buying, setBuying] = useState(false);
  // StoreKit prices only — no hardcoded fallback amount or currency.
  const premiumPrice = getStorePrice(PREMIUM_PRODUCT_ID);
  const unlockPrice = getStorePrice(UNLOCK_PRODUCT_ID);

  /** Buys the yearly subscription. Verification is always server-side. */
  async function handleBuyPremium() {
    if (buying || premium.active) return;
    void haptic("medium");
    if (!isPurchaseAvailable()) {
      toast.info(t("premium.unavailable"));
      return;
    }
    setBuying(true);
    try {
      const { transactionId, finish } = await purchasePremium();
      const verified = await verifyApplePremium({
        data: { deviceId: usePurchaseStore.getState().ensureDeviceId(), transactionId },
      });
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
        toast.error(t("paywall.failed"));
      }
    } catch (error) {
      const reason = error instanceof PurchaseError ? error.reason : "failed";
      if (reason === "cancelled") toast.info(t("paywall.cancelled"));
      else if (reason === "unavailable") toast.info(t("premium.unavailable"));
      else toast.error(t("paywall.failed"));
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
      // Give StoreKit a moment to redeliver, then re-read entitlement.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await queryClient.invalidateQueries({ queryKey: PREMIUM_QUERY_KEY });
      const status = await queryClient.fetchQuery({
        queryKey: PREMIUM_QUERY_KEY,
        queryFn: () =>
          import("@/lib/purchase.functions").then((m) =>
            m.getPremiumStatus({
              data: { deviceId: usePurchaseStore.getState().ensureDeviceId() },
            }),
          ),
      });
      await queryClient.invalidateQueries({ queryKey: ["purchase-status"] });
      if (status.active) toast.success(t("premium.restoredPremium"));
      else toast.info(t("premium.nothingToRestore"));
    } catch {
      toast.error(t("premium.restoreFailed"));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="surface-sun flex h-dvh max-h-dvh flex-col overflow-hidden">
      <main
        className="scrollbar-hidden mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        style={{ paddingTop: "max(var(--safe-top-min), calc(0.5rem + env(safe-area-inset-top)))" }}
      >
        <header className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            aria-label={t("common.back")}
            onClick={() => {
              void haptic("light");
              void navigate({ to: "/" });
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brand-black/22 bg-brand-black text-brand-yellow shadow-lg shadow-brand-black/25 transition-transform active:scale-90"
          >
            <ArrowLeft className="size-4" />
          </button>
          <h1 className="text-xl font-bold tracking-tight text-brand-black">
            {t("settings.title")}
          </h1>
        </header>

        {/* Premium section */}
        <section className="flex flex-col gap-3">
          {/* One-off unlock */}
          <div className="glass-primary relative overflow-hidden rounded-3xl p-5">
            <div className="relative z-10 flex flex-col gap-2.5">
              <span className="inline-flex w-fit items-center rounded-full bg-brand-black px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-yellow">
                {t("paywall.eyebrow")}
              </span>
              <div className="flex flex-col">
                <h2 className="text-xl font-black leading-tight text-brand-black">
                  {t("paywall.single.title")}
                </h2>
                <p className="text-sm font-medium text-brand-black/75">
                  {t("paywall.single.body")}
                </p>
              </div>
              <p className="text-2xl font-black tabular-nums text-brand-black">
                {unlockPrice ?? t("paywall.priceLoading")}
              </p>
              <Button disabled className="w-full font-bold">
                {t("settings.singleCta")}
              </Button>
              <p className="text-[11px] leading-snug text-brand-black/60">
                {t("settings.singleNote")}
              </p>
            </div>
            <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full border-[12px] border-brand-black/5" />
          </div>

          {/* Premium subscription */}
          <div className="glass-primary relative overflow-hidden rounded-3xl p-5 ring-2 ring-brand-black/15">
            <div className="relative z-10 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex w-fit items-center rounded-full bg-brand-black/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-black">
                  {t("settings.subscription")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-black/75">
                  {t("settings.popular")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Crown className="size-5 text-brand-black" />
                <h2 className="text-xl font-black leading-tight text-brand-black">
                  {t("paywall.premium.title")}
                </h2>
              </div>
              <p className="text-2xl font-black tabular-nums text-brand-black">
                {premiumPrice
                  ? t("paywall.premium.price", { price: premiumPrice })
                  : t("paywall.priceLoading")}
              </p>
              <ul className="flex flex-col gap-1.5">
                {["calculations", "pdf", "result"].map((key) => (
                  <li key={key} className="flex items-start gap-2 text-xs text-brand-black/85">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand-black" />
                    <span>{t(`paywall.premium.includes.${key}`)}</span>
                  </li>
                ))}
              </ul>
              {premium.active ? (
                <div className="flex items-center gap-2 rounded-2xl bg-brand-black/10 px-3 py-2">
                  <Crown className="size-4 text-brand-black" />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold text-brand-black">
                      {t("premium.active")}
                    </span>
                    <span className="text-xs text-brand-black/70">{t("premium.activeHint")}</span>
                  </span>
                </div>
              ) : (
                <Button
                  disabled={buying}
                  onClick={() => void handleBuyPremium()}
                  className="w-full font-bold"
                >
                  {buying ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("paywall.purchasing")}
                    </>
                  ) : (
                    t("paywall.premium.cta")
                  )}
                </Button>
              )}
              <p className="text-[11px] leading-snug text-brand-black/60">
                {t("paywall.premium.renewal")}
              </p>
            </div>
            <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full border-[12px] border-brand-black/5" />
          </div>
        </section>

        {/* Settings groups */}
        <section className="flex flex-col gap-3">
          {/* Restore / Manage */}
          <div className="glass-primary rounded-3xl p-2">
            <button
              type="button"
              disabled={restoring}
              onClick={() => void handleRestore()}
              className="flex w-full items-center justify-between rounded-2xl bg-card px-5 py-4 text-left shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  {restoring ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </span>
                <span className="text-sm font-bold text-brand-black">
                  {t("premium.restore")}
                </span>
              </span>
              <ChevronRight className="size-4 text-brand-black/40" />
            </button>
            <a
              href={MANAGE_SUBSCRIPTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void haptic("light")}
              className="flex w-full items-center justify-between rounded-2xl bg-card px-5 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  <Settings2 className="size-4" />
                </span>
                <span className="text-sm font-bold text-brand-black">{t("premium.manage")}</span>
              </span>
              <ChevronRight className="size-4 text-brand-black/40" />
            </a>
          </div>

          {/* History */}
          <div className="glass-primary rounded-3xl p-2">
            <button
              type="button"
              onClick={() => {
                void haptic("light");
                void navigate({ to: "/historik" });
              }}
              className="flex w-full items-center justify-between rounded-2xl bg-card px-5 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  <History className="size-4" />
                </span>
                <span className="text-sm font-bold text-brand-black">{t("settings.history")}</span>
              </span>
              <ChevronRight className="size-4 text-brand-black/40" />
            </button>
          </div>

          {/* Legal */}
          <div className="glass-primary rounded-3xl p-2">
            <a
              href={LEGAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void haptic("light")}
              className="flex w-full items-center justify-between rounded-2xl bg-card px-5 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  <FileText className="size-4" />
                </span>
                <span className="text-sm font-bold text-brand-black">{t("settings.terms")}</span>
              </span>
              <ChevronRight className="size-4 text-brand-black/40" />
            </a>
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void haptic("light")}
              className="flex w-full items-center justify-between rounded-2xl bg-card px-5 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-black/8 text-brand-black">
                  <ShieldCheck className="size-4" />
                </span>
                <span className="text-sm font-bold text-brand-black">{t("settings.privacy")}</span>
              </span>
              <ChevronRight className="size-4 text-brand-black/40" />
            </a>
          </div>
        </section>

        <footer className="pt-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-black/30">
            Mr. Solar Doc · v{CALCULATION_VERSION}
          </p>
        </footer>
      </main>
    </div>
  );
}
