import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { haptic } from "@/services/native-service";

export const Route = createFileRoute("/anvandarvillkor")({
  head: () => ({
    meta: [
      { title: "Användarvillkor — Mr. Solar Doc" },
      { name: "description", content: "Användarvillkor för Mr. Solar Doc." },
      { property: "og:title", content: "Användarvillkor — Mr. Solar Doc" },
      { property: "og:description", content: "Användarvillkor för Mr. Solar Doc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
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
              void navigate({ to: "/installningar" });
            }}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-[22px] leading-[1.1] font-bold text-foreground">
            {t("settings.terms")}
          </h1>
        </header>

        <div className="glass-primary rounded-[28px] p-5">
          <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 text-sm leading-relaxed text-foreground shadow-sm">
            <p>
              Mr. Solar Doc tillhandahåller beräkningar och uppskattningar av
              solcellsinstallationer. Resultaten är vägledande och utgör inte en
              offert, garanti eller teknisk dimensionering för ett specifikt
              objekt.
            </p>
            <p>
              Beräkningarna bygger på de uppgifter du anger samt externa
              datakällor (t.ex. PVGIS). Faktisk produktion och ekonomi påverkas
              av förhållanden som appen inte kan känna till, som skuggning,
              lokala nätregler och framtida elpriser.
            </p>
            <p>
              Rådfråga alltid en behörig installatör eller elektriker innan du
              fattar beslut om en installation.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
