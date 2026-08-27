import { formatNumber } from "@/lib/format";

interface MonthlyChartProps {
  values: number[];
  labels: string[];
  locale: string;
}

/** Compact chart label — no thousands grouping, so values fit narrow columns. */
function compactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(Number.isFinite(value) ? value : 0);
}

export function MonthlyChart({ values, labels, locale }: MonthlyChartProps) {
  const max = Math.max(...values, 1);

  return (
    <div
      className="flex w-full items-end justify-between gap-1 overflow-hidden"
      role="img"
      aria-label="Månadsproduktion"
    >
      {values.map((value, index) => (
        <div
          key={labels[index]}
          className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
        >
          <span className="w-full text-center text-[10px] tabular-nums text-muted-foreground">
            {compactNumber(value, locale)}
          </span>
          <div className="flex h-32 w-full items-end">
            <div
              className="w-full rounded-t-md bg-accent transition-all"
              style={{ height: `${Math.max((value / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">
            {labels[index]}
          </span>
        </div>
      ))}
    </div>
  );
}
