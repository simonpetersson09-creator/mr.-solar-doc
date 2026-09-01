import { ArrowRight, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";

interface WelcomePageProps {
  onStart: () => void;
}

/**
 * First-run welcome screen shown before the wizard. Uses the app's existing
 * yellow/ink design system: a saturated #FFDC38 hero card, muted body copy and
 * a single brand-yellow CTA that enters the wizard at the user's saved step.
 */
export function WelcomePage({ onStart }: WelcomePageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden surface-sun">
      <main className="scrollbar-hidden mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <header className="pt-safe flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
            <Sun className="size-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {t("app.name")}
          </span>
        </header>

        <section className="glass-primary mt-6 rounded-3xl p-6">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">
            {t("welcome.title")}
          </h1>
          <p className="mt-2 text-sm font-medium leading-relaxed opacity-90">
            {t("welcome.subtitle")}
          </p>
        </section>

        <div className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>{t("welcome.body1")}</p>
          <p>{t("welcome.body2")}</p>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground/80">
          {t("welcome.disclaimer")}
        </p>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => {
            void haptic("light");
            onStart();
          }}
          className="cta-primary mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold"
        >
          {t("welcome.cta")}
          <ArrowRight className="size-5" />
        </button>
      </main>
    </div>
  );
}
