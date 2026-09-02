import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, History, Loader2 } from "lucide-react";
import { haptic } from "@/services/native-service";
import { usePurchaseStore } from "@/state/purchase-store";
import { useCalculationStore } from "@/state/calculation-store";
import { fetchPurchasedCalculations } from "@/services/purchase-service";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatDate, formatDecimal, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/historik")({
  head: () => ({
    meta: [
      { title: "Historik — Mr. Solar Doc" },
      { name: "description", content: "Dina tidigare upplåsta solcellsberäkningar." },
      { property: "og:title", content: "Historik — Mr. Solar Doc" },
      { property: "og:description", content: "Dina tidigare upplåsta solcellsberäkningar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { locale } = useAppLocale();
  const ensureDeviceId = usePurchaseStore((s) => s.ensureDeviceId);
  const setActive = usePurchaseStore((s) => s.setActive);

  const stored = useCalculationStore((s) => s.items);

  // The server only knows which purchases are verified. Everything shown here
  // (address, size, production) is read from the local snapshot on this device.
  const query = useQuery({
    queryKey: ["purchased-calculations"],
    queryFn: async () => fetchPurchasedCalculations({ data: { deviceId: ensureDeviceId() } }),
  });

  const items = (query.data?.items ?? []).flatMap((receipt) => {
    const local = stored[receipt.id];
    if (!local) return [];
    return [
      {
        id: receipt.id,
        accessToken: receipt.accessToken,
        createdAt: receipt.createdAt,
        purchasedAt: receipt.purchasedAt,
        address: local.snapshot.result.location.address,
        installedKwp: local.snapshot.result.installedKwp,
        annualProductionKwh: local.snapshot.result.annualProductionKwh,
      },
    ];
  });

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
              void navigate({ to: "/installningar" });
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90"
          >
            <ArrowLeft className="size-4" />
          </button>
          <h1 className="text-xl leading-tight font-bold text-foreground">
            {t("settings.history")}
          </h1>
        </header>

        {query.isLoading ? (
          <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : query.isError ? (
          <div className="cta-primary flex flex-col items-center gap-3 rounded-3xl px-5 py-8 text-center text-primary-foreground">
            <p className="text-sm text-primary-foreground/85">{t("history.error")}</p>
            <button
              type="button"
              onClick={() => {
                void haptic("light");
                void query.refetch();
              }}
              className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-foreground"
            >
              {t("common.retry", { defaultValue: "Försök igen" })}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="cta-primary flex flex-col items-center gap-2 rounded-3xl px-5 py-8 text-center text-primary-foreground">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <History className="size-5" />
            </span>
            <p className="text-sm text-primary-foreground/85">{t("history.empty")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  void haptic("light");
                  setActive({ id: item.id, accessToken: item.accessToken });
                  void navigate({ to: "/resultat" });
                }}
                className="cta-primary flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-primary-foreground transition-transform active:scale-[0.98]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-bold">
                    {item.address || t("history.unknownAddress")}
                  </span>
                  <span className="text-[11px] text-primary-foreground/75 tabular-nums">
                    {formatDate(item.purchasedAt ?? item.createdAt, locale)} ·{" "}
                    {formatDecimal(item.installedKwp, locale)} kWp ·{" "}
                    {formatNumber(item.annualProductionKwh, locale)} kWh
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-primary-foreground/70" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
