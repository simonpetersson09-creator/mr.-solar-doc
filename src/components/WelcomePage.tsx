import { ArrowRight, BarChart3, FileText, Sun, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Fragment, type ReactNode } from "react";
import { haptic } from "@/services/native-service";
import brandIcon from "@/assets/mr-solar-doc-icon.png";

/**
 * Renders a translated string where a `[[...]]`-wrapped fragment should be
 * underlined. Used for the "efter önskad återbetalningstid" phrase on point 3.
 */
function renderWithUnderline(text: string): ReactNode {
  const parts = text.split(/\[\[|\]\]/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="underline decoration-2 underline-offset-2">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

interface WelcomePageProps {
  onStart: () => void;
}

interface PointDef {
  icon: LucideIcon;
  titleKey: string;
  bodyKey: string;
  /** Highlight as the core promise — distinct visual weight. */
  highlight?: boolean;
}

const POINTS: PointDef[] = [
  { icon: Sun, titleKey: "welcome.point1Title", bodyKey: "welcome.point1Body" },
  { icon: BarChart3, titleKey: "welcome.point2Title", bodyKey: "welcome.point2Body" },
  {
    icon: Timer,
    titleKey: "welcome.point3Title",
    bodyKey: "welcome.point3Body",
    highlight: true,
  },
  { icon: FileText, titleKey: "welcome.point4Title", bodyKey: "welcome.point4Body" },
];

/**
 * First-run onboarding screen. Full-bleed brand-yellow surface with dark ink
 * text. Point 3 (the payback-time promise) is elevated to a bordered card so
 * the app's differentiator reads within seconds. Layout is logical-direction
 * based (ps/pe, text-start) so it mirrors correctly in RTL.
 */
export function WelcomePage({ onStart }: WelcomePageProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-brand-yellow text-brand-black"
      style={{ backgroundImage: "var(--yellow-sheen)" }}
    >
      <main className="scrollbar-hidden mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex justify-center pt-4">
          <img
            src={brandIcon}
            alt=""
            aria-hidden="true"
            className="w-32 select-none drop-shadow-sm sm:w-36"
            draggable={false}
          />
        </div>

        <section className="mt-4 text-center">
          <h1 className="font-display text-lg font-bold leading-tight tracking-tight">
            {t("welcome.title")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-snug">
            {t("welcome.subtitle")}
          </p>
        </section>

        <ul className="mt-6 space-y-4">
          {POINTS.map(({ icon: Icon, titleKey, bodyKey, highlight }) => (
            <li
              key={titleKey}
              className={
                highlight
                  ? "rounded-2xl border-2 border-brand-black/80 bg-brand-black/5 p-4"
                  : "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-1 text-start"
              }
            >
              {highlight ? (
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 text-start">
                  <Icon className="mt-0.5 size-5 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">
                      {renderWithUnderline(t(titleKey))}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-snug opacity-80">
                      {t(bodyKey)}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Icon className="mt-0.5 size-5 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">
                      {t(titleKey)}
                    </p>
                    <p className="mt-0.5 text-xs font-medium leading-snug opacity-80">
                      {t(bodyKey)}
                    </p>
                  </div>
                </>
              )}
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
        <p className="mt-2 text-center text-[11px] leading-snug opacity-60">
          {t("welcome.disclaimer")}
        </p>
      </main>
    </div>
  );
}
