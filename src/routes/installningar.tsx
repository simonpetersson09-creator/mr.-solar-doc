import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Crown, FileText, History, Loader2, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
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
        className="scrollbar-hidden mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        style={{ paddingTop: "max(var(--safe-top-min), calc(0.25rem + env(safe-area-inset-top)))" }}
      >
        <header className="flex items-center gap-3">
          <button
            type="button"
            aria-label={t("common.back")}
            onClick={() => {
              void haptic("light");
              void navigate({ to: "/" });
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90"
          >
            <ArrowLeft className="size-4" />
          </button>
<h1 className="text-xl leading-tight font-bold text-foreground">
              {t("settings.title")}
            </h1>
        </header>

<div className="glass-primary flex flex-col gap-2 rounded-3xl p-3">
          {premium.active ? (
            <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-md shadow-accent/40">
                <Crown className="size-4" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-bold text-foreground">{t("premium.active")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("premium.activeHint")}
                </span>
              </span>
            </div>
          ) : (
            <button
              type="button"
              disabled={buying}
              onClick={() => void handleBuyPremium()}
              className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-md shadow-accent/40">
                {buying ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-bold text-foreground">{t("premium.become")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("premium.becomeHint", { price: premiumPrice })}
                </span>
              </span>
            </button>
          )}
          <button
            type="button"
            disabled={restoring}
            onClick={() => void handleRestore()}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
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
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <Settings2 className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("premium.manage")}</span>
          </a>
        </div>

        <div className="glass-primary flex flex-col gap-2 rounded-3xl p-3">
          <button
            type="button"
            onClick={() => {
              void haptic("light");
              void navigate({ to: "/historik" });
            }}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <History className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("settings.history")}</span>
          </button>
        </div>

<div className="glass-primary flex flex-col gap-2 rounded-3xl p-3">
          <a
            href={LEGAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void haptic("light")}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <FileText className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("settings.terms")}</span>
          </a>
<a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void haptic("light")}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <ShieldCheck className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("settings.privacy")}</span>
          </a>
        </div>
      </main>
    </div>
  );
}