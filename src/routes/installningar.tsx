import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Crown, FileText, History, Loader2, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import { haptic } from "@/services/native-service";
import { isPurchaseAvailable, restorePurchases } from "@/services/iap-service";
import { usePurchaseStore } from "@/state/purchase-store";

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
  const pending = usePurchaseStore((s) => s.pending);
  const [restoring, setRestoring] = useState(false);

  // The unlock is bought per calculation, so "start premium" continues an
  // unfinished purchase or sends the user into a new calculation.
  function handleStartPremium() {
    void haptic("medium");
    if (pending) {
      void navigate({ to: "/betalning" });
      return;
    }
    toast.info(t("premium.noPending"));
    void navigate({ to: "/" });
  }

  async function handleRestore() {
    if (restoring) return;
    void haptic("light");
    if (!isPurchaseAvailable()) {
      toast.info(t("premium.unavailable"));
      return;
    }
    setRestoring(true);
    try {
      await restorePurchases();
      await queryClient.invalidateQueries({ queryKey: ["purchased-calculations"] });
      toast.success(t("premium.restored"));
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
            {t("premium.title")}
          </h1>
        </header>

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
          <button
            type="button"
            onClick={handleStartPremium}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-md shadow-accent/40">
              <Crown className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">{t("premium.start")}</span>
          </button>
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