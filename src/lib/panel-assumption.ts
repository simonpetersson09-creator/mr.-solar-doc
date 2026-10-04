import type { TFunction } from "i18next";
import type { BusbarBasis } from "@/config/pv-connection-rules";
import { formatDecimal } from "@/lib/format";

/**
 * The panel assumption behind a US/CA busbar limit, as plain sentences. One
 * source for both the result page and the PDF so they never diverge.
 */
export function panelAssumptionLines(
  basis: BusbarBasis | null | undefined,
  t: TFunction,
  locale: string,
): string[] {
  if (!basis) return [];
  const a = (n: number) => formatDecimal(n, locale, 0);
  const lines = [
    t("result.panelAssumption.basis", {
      main: a(basis.panelMainBreakerA),
      busbar: a(basis.busbarRatingA),
      breaker: formatDecimal(basis.maxBackfeedBreakerA, locale, 0),
      kw: formatDecimal(basis.limitKw, locale, 2),
    }),
  ];
  if (basis.mainAssumed && basis.largeService) {
    lines.push(
      t("result.panelAssumption.large", {
        service: a(basis.serviceAmperageA),
        main: a(basis.panelMainBreakerA),
      }),
    );
  } else if (basis.mainAssumed) {
    lines.push(t("result.panelAssumption.mainAssumed"));
  }
  if (basis.busbarAssumed) lines.push(t("result.panelAssumption.busbarAssumed"));
  lines.push(t("result.panelAssumption.notMax"));
  return lines;
}
