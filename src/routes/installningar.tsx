import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Crown, RefreshCw, Settings2 } from "lucide-react";
import { haptic } from "@/services/native-service";

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

function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="surface-sun flex min-h-dvh flex-col">
      <main
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 pb-10"
        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <header className="flex items-center gap-3">
          <button
            type="button"
            aria-label={t("common.back")}
            onClick={() => {
              void haptic("light");
              void navigate({ to: "/" });
            }}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-[22px] leading-[1.1] font-bold text-foreground">
            {t("premium.title")}
          </h1>
        </header>

        <div className="glass-primary flex flex-col gap-3 rounded-[28px] p-4">
          <button
            type="button"
            onClick={() => void haptic("medium")}
            className="flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-md shadow-accent/40">
              <Crown className="size-5" />
            </span>
            <span className="text-base font-bold text-foreground">{t("premium.start")}</span>
          </button>
        </div>

        <div className="glass-primary flex flex-col gap-3 rounded-[28px] p-4">
          <button
            type="button"
            onClick={() => void haptic("light")}
            className="flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <RefreshCw className="size-5" />
            </span>
            <span className="text-base font-bold text-foreground">{t("premium.restore")}</span>
          </button>
          <button
            type="button"
            onClick={() => void haptic("light")}
            className="flex items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/40">
              <Settings2 className="size-5" />
            </span>
            <span className="text-base font-bold text-foreground">{t("premium.manage")}</span>
          </button>
        </div>
      </main>
    </div>
  );
}
