import { ArrowRight, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";
import brandIcon from "@/assets/mr-solar-doc-icon.png.asset.json";

interface WelcomePageProps {
  onStart: () => void;
}

/**
 * First-run welcome screen shown before the wizard. Full-bleed brand-yellow
 * surface with dark ink text, matching the glass-primary cards used in the
 * wizard steps. The CTA is the dark ink "knappfärg" used elsewhere in the app.
 */
export function WelcomePage({ onStart }: WelcomePageProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-brand-yellow text-brand-black"
      style={{ backgroundImage: "var(--yellow-sheen)" }}
    >
      <main className="scrollbar-hidden mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <header className="pt-safe flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-black text-brand-yellow shadow-sm">
            <Sun className="size-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </header>

        <section className="mt-6">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">
            {t("welcome.title")}
          </h1>
          <p className="mt-2 text-sm font-medium leading-relaxed opacity-80">
            {t("welcome.subtitle")}
          </p>
        </section>

        <div className="mt-5 space-y-3 text-sm leading-relaxed opacity-75">
          <p>{t("welcome.body1")}</p>
          <p>{t("welcome.body2")}</p>
        </div>

        <p className="mt-4 text-xs leading-relaxed opacity-60">
          {t("welcome.disclaimer")}
        </p>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => {
            void haptic("light");
            onStart();
          }}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-brand-black/50 bg-brand-black text-brand-yellow text-base font-semibold shadow-lg shadow-brand-black/40 transition-transform active:scale-[0.98]"
        >
          {t("welcome.cta")}
          <ArrowRight className="size-5" />
        </button>
      </main>
    </div>
  );
}
