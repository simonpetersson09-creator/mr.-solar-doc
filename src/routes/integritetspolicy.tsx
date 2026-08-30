import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { haptic } from "@/services/native-service";

export const Route = createFileRoute("/integritetspolicy")({
  head: () => ({
    meta: [
      { title: "Integritetspolicy — Mr. Solar Doc" },
      { name: "description", content: "Integritetspolicy för Mr. Solar Doc." },
      { property: "og:title", content: "Integritetspolicy — Mr. Solar Doc" },
      { property: "og:description", content: "Integritetspolicy för Mr. Solar Doc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
            {t("settings.privacy")}
          </h1>
        </header>

        <div className="glass-primary rounded-[28px] p-5">
          <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 text-sm leading-relaxed text-foreground shadow-sm">
            <p>
              Dina inmatade uppgifter (adress, tak, förbrukning och
              beräkningsinställningar) sparas lokalt på din enhet så att du kan
              fortsätta där du slutade.
            </p>
            <p>
              För att hämta solproduktionsdata och adressförslag skickas
              koordinater och adresssökningar till externa tjänster (PVGIS och
              geokodningstjänster). Ingen annan personlig information delas.
            </p>
            <p>
              Dokument du laddar upp för avläsning av förbrukning behandlas
              endast för att läsa av värdena och lagras inte permanent.
            </p>
            <p>
              Har du frågor om hur dina uppgifter hanteras är du välkommen att
              kontakta oss.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
