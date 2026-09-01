import { ArrowRight, BarChart3, FileText, Sun, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";
import brandIcon from "@/assets/mr-solar-doc-icon.png";

interface WelcomePageProps {
  onStart: () => void;
}

const POINTS: { icon: LucideIcon; titleKey: string }[] = [
  { icon: Sun, titleKey: "welcome.point1Title" },
  { icon: BarChart3, titleKey: "welcome.point2Title" },
  { icon: Timer, titleKey: "welcome.point3Title" },
  { icon: FileText, titleKey: "welcome.point4Title" },
];

/**
 * First-run onboarding screen. Full-bleed brand-yellow surface with dark ink
 * text, no cards — a clean native-style list of four value points. Layout is
 * logical-direction based (ps/pe, text-start) so it mirrors correctly in RTL.
 */
export function WelcomePage({ onStart }: WelcomePageProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-brand-yellow text-brand-black"
      style={{ backgroundImage: "var(--yellow-sheen)" }}
    >
      <main className="scrollbar-hidden mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex justify-center pt-6">
          <img
            src={brandIcon}
            alt=""
            aria-hidden="true"
            className="w-40 select-none drop-shadow-sm sm:w-44"
            draggable={false}
          />
        </div>

        <section className="text-center">
          <h1 className="font-display text-xl font-bold leading-tight tracking-tight">
            {t("welcome.title")}
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-xs font-medium leading-snug opacity-80">
            {t("welcome.subtitle")}
          </p>
        </section>

        <ul className="mt-4 space-y-2.5">
          {POINTS.map(({ icon: Icon, titleKey }) => (
            <li key={titleKey} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 text-start">
              <Icon className="size-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden="true" />
              <p className="min-w-0 text-xs font-bold leading-tight">{t(titleKey)}</p>
            </li>
          ))}
        </ul>

        <div className="min-h-6 flex-1" />

        <button
          type="button"
          onClick={() => {
            void haptic("light");
            onStart();
          }}
          className="cta-primary mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[24px] text-base font-bold shadow-cta transition-transform active:translate-y-px"
        >
          {t("welcome.cta")}
          <ArrowRight className="size-4 rtl:-scale-x-100" />
        </button>
        <p className="mt-6 text-center text-[11px] leading-snug opacity-60">
          {t("welcome.disclaimer")}
        </p>
      </main>
    </div>
  );
}
