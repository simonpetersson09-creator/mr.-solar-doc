import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptic } from "@/services/native-service";
import { usePurchaseStore } from "@/state/purchase-store";
import {
  PurchaseError,
  getStorePrice,
  isPurchaseAvailable,
  purchaseUnlock,
} from "@/services/iap-service";
import { markPurchaseOutcome, verifyApplePurchase } from "@/lib/purchase.functions";
import { UNLOCK_PRICE_AMOUNT, UNLOCK_PRICE_CURRENCY } from "@/config/purchase";

export const Route = createFileRoute("/betalning")({
  head: () => ({
    meta: [
      { title: "Lås upp din beräkning — Mr. Solar Doc" },
      {
        name: "description",
        content: "Lås upp din solcellsberäkning med ett engångsköp i appen.",
      },
      { property: "og:title", content: "Lås upp din beräkning — Mr. Solar Doc" },
      {
        property: "og:description",
        content: "Lås upp din solcellsberäkning med ett engångsköp i appen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaywallPage,
});

type Phase = "idle" | "purchasing" | "verifying" | "failed" | "cancelled" | "retry";

function PaywallPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pending = usePurchaseStore((s) => s.pending);
  const rememberToken = usePurchaseStore((s) => s.rememberToken);
  const [phase, setPhase] = useState<Phase>("idle");
  const available = useMemo(() => isPurchaseAvailable(), []);
  const [price, setPrice] = useState<string | null>(null);

  useEffect(() => {
    setPrice(getStorePrice());
  }, []);

  // No calculation to unlock — send the user back to the wizard.
  useEffect(() => {
    if (!pending) void navigate({ to: "/" });
  }, [pending, navigate]);

  const displayPrice = price ?? `${UNLOCK_PRICE_AMOUNT} ${UNLOCK_PRICE_CURRENCY}`;

  async function handlePurchase() {
    if (!pending || phase === "purchasing" || phase === "verifying") return;
    void haptic("medium");
    setPhase("purchasing");
    try {
      const { transactionId, finish } = await purchaseUnlock();
      setPhase("verifying");
      const verified = await verifyApplePurchase({
        data: { id: pending.id, accessToken: pending.accessToken, transactionId },
      });
      if (verified.status !== "paid") {
        // Pending means verification could not be completed — the transaction is
        // deliberately left unfinished so Apple redelivers it and the recovery
        // listener can unlock it later.
        setPhase(verified.status === "pending" ? "retry" : "failed");
        return;
      }
      await finish();
      rememberToken(pending);
      void haptic("success");
      void navigate({ to: "/resultat" });
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


  const busy = phase === "purchasing" || phase === "verifying";

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
            {t("paywall.title")}
          </h1>
        </header>

        <section className="cta-primary flex flex-col items-center gap-2 rounded-3xl px-5 py-6 text-center text-primary-foreground">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-md shadow-accent/40">
            <Lock className="size-5" />
          </span>
          <p className="text-[11px] font-semibold tracking-wide uppercase text-primary-foreground/70">
            {t("paywall.eyebrow")}
          </p>
          <p className="text-3xl font-bold tabular-nums">{displayPrice}</p>
          <p className="text-sm text-primary-foreground/80">{t("paywall.oneTime")}</p>
        </section>

        <section className="cta-primary flex flex-col gap-2 rounded-3xl p-4 text-primary-foreground">
          <h2 className="text-sm font-bold">{t("paywall.includesTitle")}</h2>
          <ul className="flex flex-col gap-2">
            {["result", "pdf", "history"].map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm text-primary-foreground/90">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{t(`paywall.includes.${key}`)}</span>
              </li>
            ))}
          </ul>
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


        <div className="flex flex-col gap-2 pt-1">
          <Button
            size="lg"
            className="cta-primary w-full"
            disabled={!available || busy}
            onClick={() => void handlePurchase()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {phase === "verifying" ? t("paywall.verifying") : t("paywall.purchasing")}
              </>
            ) : (
              <>
                <Lock className="size-4" /> {t("paywall.cta", { price: displayPrice })}
              </>
            )}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5" /> {t("paywall.appleNote")}
          </p>
        </div>
      </main>
    </div>
  );
}
