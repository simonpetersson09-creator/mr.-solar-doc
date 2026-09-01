import { ArrowRight, BarChart3, FileText, Sun, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";
import brandIcon from "@/assets/mr-solar-doc-icon.png.asset.json";

interface WelcomePageProps {
  onStart: () => void;
}

const POINTS: { icon: LucideIcon; titleKey: string; bodyKey: string }[] = [
  { icon: Sun, titleKey: "welcome.point1Title", bodyKey: "welcome.point1Body" },
  { icon: BarChart3, titleKey: "welcome.point2Title", bodyKey: "welcome.point2Body" },
  { icon: Timer, titleKey: "welcome.point3Title", bodyKey: "welcome.point3Body" },
  { icon: FileText, titleKey: "welcome.point4Title", bodyKey: "welcome.point4Body" },
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
        <div className="flex justify-center">
          <img
            src={brandIcon.url}
            alt=""
            aria-hidden="true"
            className="w-44 select-none drop-shadow-sm sm:w-52"
            draggable={false}
          />
        </div>

        <section className="text-center">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">
            {t("welcome.title")}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-relaxed opacity-80">
            {t("welcome.subtitle")}
          </p>
        </section>

        <ul className="mt-7 space-y-5">
          {POINTS.map(({ icon: Icon, titleKey, bodyKey }) => (
            <li key={titleKey} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 text-start">
              <Icon className="mt-0.5 size-5 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-bold leading-snug">{t(titleKey)}</p>
                <p className="mt-1 text-sm leading-relaxed opacity-70">{t(bodyKey)}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="min-h-6 flex-1" />

        <p className="text-center text-xs leading-relaxed opacity-55">
          {t("welcome.disclaimer")}
        </p>

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
      </main>
    </div>
  );
}
