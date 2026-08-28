import type { ReactNode } from "react";
import { ArrowLeft, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface StepShellProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function StepShell({
  step,
  totalSteps,
  title,
  subtitle,
  onBack,
  children,
  footer,
}: StepShellProps) {
  const { t } = useTranslation();
  const progress = (step / totalSteps) * 100;

  return (
    <div className="min-h-screen surface-sun">
      <header className="mx-auto flex max-w-2xl items-center gap-3 px-5 pt-3">
        {onBack ? (
          <button
            type="button"
            onClick={() => {
              void haptic("light");
              onBack();
            }}
            aria-label={t("common.back")}
            className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Sun className="size-5" />
          </span>
        )}
        <div className="flex-1">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("steps.stepOf", { current: step, total: totalSteps })}
          </p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-2xl px-5 pt-4 pb-24">
        <h1 className="text-lg leading-tight font-bold text-foreground">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-4 space-y-2.5">{children}</div>
      </main>

      {footer ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/90 backdrop-blur">
        <div
            className="mx-auto max-w-2xl px-5 py-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}
