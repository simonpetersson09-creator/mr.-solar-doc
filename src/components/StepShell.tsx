import type { ReactNode } from "react";
import { ArrowLeft, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";

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

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden surface-sun">
      <header className="pt-safe mx-auto flex w-full max-w-2xl items-center gap-3 px-5">
        {onBack ? (
          <button
            type="button"
            onClick={() => {
              void haptic("light");
              onBack();
            }}
            aria-label={t("common.back")}
            className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
            <Sun className="size-5" />
          </span>
        )}
        <div className="flex-1">
          <p className="text-[10px] font-bold tracking-widest text-primary/60 uppercase">
            {t("steps.stepOf", { current: step, total: totalSteps })}
          </p>
          {/* Segmented progress: completed steps deep green, current step amber. */}
          <div className="mt-1.5 flex gap-1">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => (
              <span
                key={n}
                className={
                  n < step
                    ? "h-1.5 flex-1 rounded-full bg-primary transition-colors duration-500"
                    : n === step
                      ? "h-1.5 flex-1 rounded-full bg-accent transition-colors duration-500"
                      : "h-1.5 flex-1 rounded-full bg-secondary transition-colors duration-500"
                }
              />
            ))}
          </div>
        </div>
</header>

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-4">
        <h1 className="text-xl leading-tight font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-4 space-y-3">{children}</div>
      </main>

      {footer ? (
        <div className="sticky bottom-0 bg-gradient-to-t from-background via-background/85 to-transparent">
          <div className="pb-safe mx-auto w-full max-w-2xl px-5 pt-3">{footer}</div>
        </div>
      ) : null}
    </div>
  );
}
