import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Check, Crown, FileText, History, Loader2, Lock, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
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
import {
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_PRICE_CURRENCY,
  PREMIUM_PRODUCT_ID,
  UNLOCK_PRICE_AMOUNT,
  UNLOCK_PRICE_CURRENCY,
  UNLOCK_PRODUCT_ID,
} from "@/config/purchase";

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
  const premiumPrice =
    getStorePrice(PREMIUM_PRODUCT_ID) ?? `${PREMIUM_PRICE_AMOUNT} ${PREMIUM_PRICE_CURRENCY}`;
  const unlockPrice =
    getStorePrice(UNLOCK_PRODUCT_ID) ?? `${UNLOCK_PRICE_AMOUNT} ${UNLOCK_PRICE_CURRENCY}`;

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
   * The 49 kr unlock is a consumable and is never restorable.
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
        className="scrollbar-hidden mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        style={{ paddingTop: "max(var(--safe-top-min), calc(0.25rem + env(safe-area-inset-top)))" }}
      >
        <header className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label={t("common.back")}
            onClick={() => {
              void haptic("light");
              void navigate({ to: "/" });
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90"
          >
            <ArrowLeft className="size-4" />
          </button>
          <h1 className="text-lg leading-tight font-bold text-foreground">
            {t("settings.title")}
          </h1>
        </header>

{/* Option 1 — one calculation (purchased later, in the wizard) */}
        <section className="cta-primary flex flex-col gap-2 rounded-2xl p-3 text-primary-foreground">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-md shadow-accent/40">
              <Lock className="size-4" />
            </span>
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-bold">{t("paywall.single.title")}</p>
              <p className="text-lg font-bold tabular-nums">{unlockPrice}</p>
            </div>
          </div>
          <p className="text-xs text-primary-foreground/80">{t("paywall.single.body")}</p>
          <Button
            disabled
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {t("settings.singleCta")}
          </Button>
          <p className="text-[11px] text-primary-foreground/70">{t("settings.singleNote")}</p>
        </section>

{/* Option 2 — Premium */}
        <section className="cta-primary flex flex-col gap-2 rounded-2xl border-2 border-accent/70 p-3 text-primary-foreground">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-md shadow-accent/40">
              <Crown className="size-4" />
            </span>
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-bold">{t("paywall.premium.title")}</p>
              <p className="text-lg font-bold tabular-nums">
                {t("paywall.premium.price", { price: premiumPrice })}
              </p>
            </div>
          </div>
          <ul className="flex flex-col gap-1">
            {["calculations", "pdf", "result"].map((key) => (
              <li key={key} className="flex items-start gap-2 text-xs text-primary-foreground/90">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span>{t(`paywall.premium.includes.${key}`)}</span>
              </li>
            ))}
          </ul>
          {premium.active ? (
            <div className="flex items-center gap-2 rounded-lg bg-primary-foreground/15 px-3 py-1.5">
              <Crown className="size-4 text-accent" />
              <span className="flex flex-col">
                <span className="text-sm font-bold">{t("premium.active")}</span>
                <span className="text-xs text-primary-foreground/80">{t("premium.activeHint")}</span>
              </span>
            </div>
          ) : (
            <Button
              disabled={buying}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => void handleBuyPremium()}
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
          <p className="text-[11px] text-primary-foreground/70">{t("paywall.premium.renewal")}</p>
        </section>

<div className="glass-primary flex flex-col gap-1.5 rounded-2xl p-2">
          <button
            type="button"
            disabled={restoring}
            onClick={() => void handleRestore()}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-left shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              {restoring ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </span>
            <span className="text-sm font-bold text-foreground">{t("premium.restore")}</span>
          </button>
          <a
            href={MANAGE_SUBSCRIPTION_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void haptic("light")}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <Settings2 className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("premium.manage")}</span>
          </a>
        </div>

        <div className="glass-primary flex flex-col gap-1.5 rounded-2xl p-2">
          <button
            type="button"
            onClick={() => {
              void haptic("light");
              void navigate({ to: "/historik" });
            }}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <History className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("settings.history")}</span>
          </button>
        </div>

        <div className="glass-primary flex flex-col gap-1.5 rounded-2xl p-2">
          <a
            href={LEGAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void haptic("light")}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <FileText className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("settings.terms")}</span>
          </a>
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void haptic("light")}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <ShieldCheck className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("settings.privacy")}</span>
          </a>
        </div>
      </main>
    </div>
  );
}