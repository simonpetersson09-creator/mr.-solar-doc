import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";
import brandIcon from "@/assets/mr-solar-doc-icon.png.asset.json";

interface WelcomePageProps {
  onStart: () => void;
}

/**
 * First-run welcome screen shown before the wizard. Full-bleed brand-yellow
 * surface with dark ink text, matching the glass-primary cards used in the
 * wizard steps. The CTA uses the same `cta-primary` surface as the wizard
 * "Beräkna" button. The brand icon's yellow is recolored to match the page
 * background so only the ink outline reads against the surface.
 */
export function WelcomePage({ onStart }: WelcomePageProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-brand-yellow text-brand-black"
      style={{ backgroundImage: "var(--yellow-sheen)" }}
    >
      <main className="scrollbar-hidden mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {/* Brand icon — centered, sits a bit above the title. The yellow body
            is the same #FFDC38 as the page, so it melts into the surface and
            only the ink outline shows. */}
        <div className="mt-3 flex justify-center">
          <img
            src={brandIcon.url}
            alt="Mr. Solar Doc"
            className="w-44 select-none drop-shadow-sm"
            draggable={false}
          />
        </div>

        <section className="mt-4 text-center">
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

        <p className="mt-4 text-sm leading-relaxed opacity-60">
          {t("welcome.disclaimer")}
        </p>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => {
            void haptic("light");
            onStart();
          }}
          className="cta-primary mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[24px] text-base font-bold shadow-cta transition-transform active:translate-y-px"
        >
          {t("welcome.cta")}
          <ArrowRight className="size-4" />
        </button>
      </main>
    </div>
  );
}
