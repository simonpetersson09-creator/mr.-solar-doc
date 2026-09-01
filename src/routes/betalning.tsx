import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Crown, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptic } from "@/services/native-service";
import { usePurchaseStore } from "@/state/purchase-store";
import {
  PurchaseError,
  getStorePrice,
  isPurchaseAvailable,
  purchasePremium,
  purchaseUnlock,
} from "@/services/iap-service";
import {
  markPurchaseOutcome,
  verifyApplePremium,
  verifyApplePurchase,
} from "@/lib/purchase.functions";
import { PREMIUM_QUERY_KEY, usePremium } from "@/hooks/use-premium";
import { PREMIUM_PRODUCT_ID, UNLOCK_PRODUCT_ID } from "@/config/purchase";

export const Route = createFileRoute("/betalning")({
  head: () => ({
    meta: [
      { title: "Lås upp din beräkning — Mr. Solar Doc" },
      {
        name: "description",
        content:
          "Lås upp din solcellsberäkning med ett engångsköp eller bli Premium med obegränsade beräkningar.",
      },
      { property: "og:title", content: "Lås upp din beräkning — Mr. Solar Doc" },
      {
        property: "og:description",
        content:
          "Lås upp din solcellsberäkning med ett engångsköp eller bli Premium med obegränsade beräkningar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaywallPage,
});

type Phase = "idle" | "purchasing" | "verifying" | "failed" | "cancelled" | "retry";
type Choice = "unlock" | "premium";

function PaywallPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pending = usePurchaseStore((s) => s.pending);
  const rememberToken = usePurchaseStore((s) => s.rememberToken);
  const premium = usePremium();
  const [phase, setPhase] = useState<Phase>("idle");
  const [choice, setChoice] = useState<Choice | null>(null);
  const available = useMemo(() => isPurchaseAvailable(), []);
  const [prices, setPrices] = useState<{ unlock: string | null; premium: string | null }>({
    unlock: null,
    premium: null,
  });

  useEffect(() => {
    setPrices({
      unlock: getStorePrice(UNLOCK_PRODUCT_ID),
      premium: getStorePrice(PREMIUM_PRODUCT_ID),
    });
  }, []);

  // No calculation to unlock — send the user back to the wizard.
  useEffect(() => {
    if (!pending) void navigate({ to: "/" });
  }, [pending, navigate]);

  // Premium already active: the calculation is unlocked, no paywall needed.
  useEffect(() => {
    if (premium.active && pending) {
      rememberToken(pending);
      void navigate({ to: "/resultat" });
    }
  }, [premium.active, pending, rememberToken, navigate]);

  // Only the StoreKit price is ever shown: it is already localised for the
  // user's storefront. Without it we show a neutral text — never a fabricated
  // amount or currency.
  const unlockPrice = prices.unlock;
  const premiumPrice = prices.premium;
  const busy = phase === "purchasing" || phase === "verifying";

  async function handleUnlock() {
    if (!pending || busy) return;
    void haptic("medium");
    setChoice("unlock");
    setPhase("purchasing");
    try {
      const { transactionId, finish } = await purchaseUnlock();
      setPhase("verifying");
      const verified = await verifyApplePurchase({
        data: { id: pending.id, accessToken: pending.accessToken, transactionId },
      });
      if (verified.status === "paid") {
        await finish();
        rememberToken(pending);
        void haptic("success");
        void navigate({ to: "/resultat" });
        return;
      }
      // Pending: leave the transaction unfinished so StoreKit redelivers it and
      // the recovery hook can verify it again.
      setPhase(verified.status === "pending" ? "retry" : "failed");
    } catch (error) {
      const reason = error instanceof PurchaseError ? error.reason : "failed";
      if (reason !== "unavailable") {
        await markPurchaseOutcome({
          data: {
            id: pending.id,
            accessToken: pending.accessToken,
            status: reason === "cancelled" ? "cancelled" : "failed",
          },
        }).catch(() => undefined);
      }
      setPhase(reason === "cancelled" ? "cancelled" : "failed");
    }
  }

  async function handlePremium() {
    if (!pending || busy) return;
    void haptic("medium");
    setChoice("premium");
    setPhase("purchasing");
    try {
      const { transactionId, finish } = await purchasePremium();
      setPhase("verifying");
      const verified = await verifyApplePremium({
        data: {
          deviceId: usePurchaseStore.getState().ensureDeviceId(),
          transactionId,
        },
      });
      if (verified.status === "active") {
        await finish();
        await queryClient.invalidateQueries({ queryKey: PREMIUM_QUERY_KEY });
        rememberToken(pending);
        void haptic("success");
        void navigate({ to: "/resultat" });
        return;
      }
      if (verified.status === "inactive" || verified.status === "failed") {
        await finish();
        setPhase("failed");
        return;
      }
      setPhase("retry");
    } catch (error) {
      const reason = error instanceof PurchaseError ? error.reason : "failed";
      setPhase(reason === "cancelled" ? "cancelled" : "failed");
    }
  }

  function busyLabel() {
    return phase === "verifying" ? t("paywall.verifying") : t("paywall.purchasing");
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
          <h1 className="text-base leading-tight font-semibold text-foreground">
            {t("paywall.title")}
          </h1>
        </header>

        {/* Option 1 — one calculation */}
        <section className="cta-primary flex flex-col gap-3 rounded-3xl p-4 text-primary-foreground">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-md shadow-accent/40">
              <Lock className="size-5" />
            </span>
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-bold">{t("paywall.single.title")}</p>
              <p className="text-xl font-bold tabular-nums">
                {unlockPrice ?? t("paywall.priceLoading")}
              </p>
              <p className="text-sm text-primary-foreground/80">{t("paywall.single.body")}</p>
            </div>
          </div>
          <Button
            size="lg"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={!available || busy}
            onClick={() => void handleUnlock()}
          >
            {busy && choice === "unlock" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {busyLabel()}
              </>
            ) : (
              unlockPrice
                ? t("paywall.single.cta", { price: unlockPrice })
                : t("paywall.single.ctaNoPrice")
            )}
          </Button>
        </section>

        {/* Option 2 — Premium */}
        <section className="cta-primary flex flex-col gap-3 rounded-3xl border-2 border-accent/70 p-4 text-primary-foreground">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-md shadow-accent/40">
              <Crown className="size-5" />
            </span>
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-bold">{t("paywall.premium.title")}</p>
              <p className="text-2xl font-bold tabular-nums">
                {premiumPrice
                  ? t("paywall.premium.price", { price: premiumPrice })
                  : t("paywall.priceLoading")}
              </p>
              <p className="text-sm text-primary-foreground/80">{t("paywall.premium.body")}</p>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {["calculations", "pdf", "result"].map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm text-primary-foreground/90">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{t(`paywall.premium.includes.${key}`)}</span>
              </li>
            ))}
          </ul>
          <Button
            size="lg"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={!available || busy}
            onClick={() => void handlePremium()}
          >
            {busy && choice === "premium" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {busyLabel()}
              </>
            ) : (
              t("paywall.premium.cta")
            )}
          </Button>
          <p className="text-[11px] text-primary-foreground/70">{t("paywall.premium.renewal")}</p>
        </section>

        {!available ? (
          <p className="rounded-2xl bg-card px-4 py-3 text-sm text-foreground shadow-sm">
            {t("paywall.appOnly")}
          </p>
        ) : null}

        {phase === "cancelled" ? (
          <p className="text-sm text-muted-foreground">{t("paywall.cancelled")}</p>
        ) : null}
        {phase === "failed" ? (
          <p className="text-sm text-destructive">{t("paywall.failed")}</p>
        ) : null}
        {phase === "retry" ? (
          <p className="text-sm text-foreground">{t("paywall.retry")}</p>
        ) : null}

        <p className="flex items-center justify-center gap-1.5 pb-1 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5" /> {t("paywall.appleNote")}
        </p>
      </main>
    </div>
  );
}
