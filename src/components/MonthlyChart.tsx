import { useTranslation } from "react-i18next";

interface MonthlyChartProps {
  values: number[];
  labels: string[];
  locale: string;
  /** Optional monthly consumption to compare against production. */
  comparison?: number[] | null;
  productionLabel?: string;
  comparisonLabel?: string;
}

/** Compact chart label — no thousands grouping, so values fit narrow columns. */
function compactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(Number.isFinite(value) ? value : 0);
}

export function MonthlyChart({
  values,
  labels,
  locale,
  comparison,
  productionLabel,
  comparisonLabel,
}: MonthlyChartProps) {
  const { t } = useTranslation();
  const ariaLabel = t("chart.productionAria");
  const hasComparison = !!comparison && comparison.length === values.length;
  const max = Math.max(...values, ...(hasComparison ? comparison! : []), 1);

  return (
    <div className="w-full">
      {hasComparison ? (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-accent" />
            {productionLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-muted-foreground/60" />
            {comparisonLabel}
          </span>
        </div>
      ) : null}

      <div
        className="flex w-full items-end justify-between gap-1 overflow-hidden"
        role="img"
        aria-label={productionLabel ?? ariaLabel}
      >
        {values.map((value, index) => (
          <div
            key={labels[index]}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <span className="w-full text-center text-[10px] tabular-nums text-muted-foreground">
              {compactNumber(value, locale)}
            </span>
            <div className="flex h-32 w-full items-end justify-center gap-0.5">
              <div
                className={`rounded-t-md bg-accent transition-all ${hasComparison ? "w-1/2" : "w-full"}`}
                style={{ height: `${Math.max((value / max) * 100, 2)}%` }}
              />
              {hasComparison ? (
                <div
                  className="w-1/2 rounded-t-md bg-muted-foreground/60 transition-all"
                  style={{
                    height: `${Math.max(((comparison![index] ?? 0) / max) * 100, 2)}%`,
                  }}
                />
              ) : null}
            </div>
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">
              {labels[index]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
