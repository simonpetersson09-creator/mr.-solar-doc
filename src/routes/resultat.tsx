import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, Download, Info, Loader2, Sun, Zap } from "lucide-react";
import i18nInstance from "@/i18n";
import { Button } from "@/components/ui/button";
import { MonthlyChart } from "@/components/MonthlyChart";
import { useCalculation } from "@/hooks/use-calculation";
import { useAppLocale } from "@/hooks/use-app-locale";
import { useWizardStore } from "@/state/wizard-store";
import { formatCurrency, formatDate, formatDecimal, formatNumber } from "@/lib/format";
import { exportReport, type ReportLabels } from "@/services/solar-report-service";
import { haptic } from "@/services/native-service";


/** Maps the engine's recommendation reason to a consumer-friendly i18n key. */
const REASON_KEY: Record<string, string> = {
  "profile-unknown": "result.reason.profileUnknown",
  "profile-normal": "result.reason.profileNormal",
  "profile-low-solar-season": "result.reason.profileLowSolarSeason",
  "profile-high-solar-season": "result.reason.profileHighSolarSeason",
  "profile-very-high-solar-season": "result.reason.profileVeryHighSolarSeason",
  "grid-limit": "result.reason.gridLimit",
  "minimum-size": "result.reason.minimumSize",
  "maximum-size": "result.reason.maximumSize",
};

export const Route = createFileRoute("/resultat")({
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.result.title") },
      { name: "description", content: i18nInstance.t("meta.result.description") },
      { property: "og:title", content: i18nInstance.t("meta.result.title") },
      { property: "og:description", content: i18nInstance.t("meta.result.ogDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const { t, i18n } = useTranslation();
  const { locale } = useAppLocale();
  const { result, market } = useCalculation();
  const reset = useWizardStore((s) => s.reset);
  const setCurrentStep = useWizardStore((s) => s.setCurrentStep);
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const paybackYears = useWizardStore((s) => s.acceptedPaybackYears);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  const shortMonths = i18n.t("months.short", { returnObjects: true }) as string[];

  if (!result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 surface-sun px-6 text-center">
        <p className="text-muted-foreground">{t("result.noCalculation")}</p>
        <Button asChild>
          <Link to="/">{t("common.startOver")}</Link>
        </Button>
      </div>
    );
  }

  const handleExport = async () => {
    setExporting(true);
    setExportError(false);
    try {
      const labels: ReportLabels = {
        title: t("report.title"),
        appName: t("app.name"),
        summary: t("report.summary"),
        technical: t("report.technical"),
        economicSummary: t("report.economicSummary"),
        sizing: t("report.sizing"),
        production: t("report.production"),
        consumption: t("report.consumption"),
        economics: t("report.economics"),
        assumptions: t("report.assumptions"),
        disclaimer: t("report.disclaimer"),
        generated: t("report.generated"),
        months: shortMonths,
        rationale,
        coverageNote: t("result.coverageNote"),
        paybackNote: `${t("result.paybackInfo")} ${t("result.maxInvestmentNote")}`,
        quoteNote: t("result.quoteNote"),
        consumptionSource: t(
          `result.consumptionSource.${result.consumption.inputType ?? "annual-only"}`,
        ),
        consumptionShape: result.consumption.shape
          ? t(`result.consumptionShape.${result.consumption.shape}`)
          : null,
        chartProduction: t("report.chartProduction"),
        chartConsumption: t("report.chartConsumption"),
        origin: i18n.t("report.origin", { returnObjects: true }) as ReportLabels["origin"],
        fields: i18n.t("report.fields", { returnObjects: true }) as ReportLabels["fields"],
      };
      await exportReport({ result, labels, locale });
      void haptic("success");
    } catch {
      setExportError(true);
      void haptic("error");
    } finally {
      setExporting(false);
    }
  };

  const currency = result.economics.currency;
  const p = result.presentation;
  const investmentAmount = formatCurrency(result.investment.maxInvestmentRounded, locale, currency);
  const rationale = t(REASON_KEY[result.recommendationReason] ?? "result.reason.profileNormal");

  return (
    <div className="min-h-screen surface-sun pb-28">
      <header className="mx-auto max-w-2xl px-5 pt-6">
        <h1 className="text-xl font-bold text-foreground">{t("result.title")}</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-2.5 px-5 pt-3">
        {/* 1. Recommendation */}
        <section className="hero-metric rounded-3xl p-5">
          <div className="glow-amber -top-16 -right-16 size-48" aria-hidden="true" />
          <div className="relative">
            <div className="glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              <Sun className="size-3.5" /> {t("result.recommendedArray")}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-5xl font-extrabold tracking-tight">
                {formatDecimal(result.installedKwp, locale)}{" "}
                <span className="text-xl font-semibold text-white/80">kWp</span>
              </p>
              <p className="text-xs text-white/70">
                {t("result.panelCount", { count: result.panelCount })}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="glass-panel rounded-2xl p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/60 uppercase">
                  <Zap className="size-3" /> {t("result.recommendedInverter")}
                </div>
                <p className="mt-1 text-xl font-bold">
                  {t("result.inverterShort", { kw: formatNumber(result.inverterKw, locale) })}
                </p>
              </div>
              <div className="glass-panel rounded-2xl p-3">
                <p className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">
                  {t("result.annualProduction")}
                </p>
                <p className="mt-1 text-xl font-bold text-accent">
                  {formatNumber(p.annualProductionKwh, locale)}{" "}
                  <span className="text-xs font-semibold text-white/70">
                    kWh{t("common.perYear")}
                  </span>
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm font-bold">
              {t("result.coverage", { percent: formatNumber(p.productionCoveragePercent, locale) })}
            </p>
            <p className="mt-1 text-xs text-white/70">{rationale}</p>
            {result.notes.includes("minimum-system-size") ? (
              <p className="mt-1.5 text-xs text-white/70">{t("result.minimumSizeNote")}</p>
            ) : null}
            {result.notes.includes("consumption-below-minimum") ? (
              <p className="mt-1.5 text-xs text-white/70">
                {t("result.consumptionTooLowNote")}
              </p>
            ) : null}
          </div>
        </section>

        {/* 2. Production */}
        <section className="card-elevated p-3.5">
          <h2 className="text-sm font-semibold">{t("result.sectionProduction")}</h2>
          <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
            {t("result.monthlyProduction")}
          </p>
          {result.consumption.isEstimated ? (
            <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {t("result.estimatedBadge")}
              </span>
              {t("result.estimatedConsumptionNote")}
            </p>
          ) : null}
          <MonthlyChart
            values={result.monthlyProductionKwh}
            labels={shortMonths}
            locale={locale}
            comparison={result.consumption.monthlyKwh}
            productionLabel={t("result.chartProduction")}
            comparisonLabel={t("result.chartConsumption")}
          />
        </section>

        {/* 3. What you get out of it — plain numbers, no controls */}
        <section className="card-elevated space-y-2.5 p-3.5">
          <h2 className="text-sm font-semibold">{t("result.sectionEconomy")}</h2>

          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("result.annualSavings")}</p>
            <p className="text-2xl font-bold">
              {formatCurrency(p.annualSavings, locale, currency)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {t("result.perYear")}
              </span>
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-secondary p-2.5">
              <dt className="text-[11px] text-muted-foreground">{t("result.selfConsumption")}</dt>
              <dd className="font-semibold">
                {formatCurrency(p.selfConsumptionValue, locale, currency)}
              </dd>
              <dd className="text-[11px] text-muted-foreground">
                {formatNumber(p.selfConsumptionPercent, locale)} % ·{" "}
                {formatNumber(p.selfConsumptionKwh, locale)} kWh
              </dd>
            </div>
            <div className="rounded-xl bg-secondary p-2.5">
              <dt className="text-[11px] text-muted-foreground">{t("result.exported")}</dt>
              <dd className="font-semibold">
                {formatCurrency(p.exportValue, locale, currency)}
              </dd>
              <dd className="text-[11px] text-muted-foreground">
                {formatNumber(p.exportPercent, locale)} % · {formatNumber(p.exportedKwh, locale)} kWh
              </dd>
            </div>
          </dl>

          <div className="rounded-xl bg-secondary p-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                {t("result.investmentLevelTitle", {
                  years: formatNumber(paybackYears, locale),
                })}
              </p>
              <p className="text-xl font-bold">
                {t("result.maxInvestmentApprox", { amount: investmentAmount })}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("result.maxInvestmentNote")}</p>
          </div>

          {result.notes.includes("economic-values-missing") ? (
            <p className="rounded-xl border border-border bg-secondary p-2.5 text-[11px]">
              {t("result.missingMarketValues")}
            </p>
          ) : null}

          <p className="text-[11px] text-muted-foreground">{t("result.economicsDisclaimer")}</p>
        </section>



        {/* 5. Technical details */}
        <div className="card-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            className="flex w-full items-center justify-between px-3.5 py-3 text-sm font-medium"
          >
            {showDetails ? t("result.hideCalculation") : t("result.showCalculation")}
            <ChevronDown
              className={`size-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
            />
          </button>
          {showDetails ? (
            <dl className="divide-y divide-border border-t border-border text-sm">
              {[
                [t("result.installedDc"), `${formatDecimal(result.installedKwp, locale)} kWp`],
                [t("result.panelsUnit"), formatNumber(result.panelCount, locale)],
                [t("result.inverterPower"), `${formatNumber(result.inverterKw, locale)} kW`],
                [t("result.dcAcRatio"), formatDecimal(result.dcAcRatio, locale, 2)],
                [t("result.oversizing"), `${formatDecimal(result.oversizingPercent, locale)} %`],
                [
                  t("result.targetDcAcRange"),
                  `${formatDecimal(result.targetDcAcRange.min, locale, 2)} – ${formatDecimal(result.targetDcAcRange.max, locale, 2)}`,
                ],
                [
                  t("result.profileLabel"),
                  t(`result.profileCategory.${result.consumptionProfile.category}`),
                ],
                ...(result.consumptionProfile.hasMonthlyData
                  ? [
                      [
                        t("result.summerShare"),
                        `${formatNumber(result.consumptionProfile.summerConsumptionShare * 100, locale)} %`,
                      ] as [string, string],
                    ]
                  : []),
                [t("result.mainFuse"), `${result.mainFuseAmp} A`],
                [
                  t("result.gridConnection"),
                  t("result.gridConnectionValue", {
                    voltage: result.grid.voltageV,
                    phases: result.grid.phases,
                  }),
                ],
                [t("result.fuseLimit"), `${formatDecimal(p.maxAcPowerKw, locale)} kW`],
                [
                  t("result.specificYield"),
                  `${formatNumber(result.resource.annualKwhPerKwp, locale)} ${t("units.kwhPerKwp")}`,
                ],
                [
                  t("result.annualConsumption"),
                  `${formatNumber(p.annualConsumptionKwh, locale)} kWh`,
                ],
                [
                  t("result.consumptionSourceLabel"),
                  t(`result.consumptionSource.${result.consumption.inputType ?? "annual-only"}`),
                ],
                ...(result.consumption.shape
                  ? [
                      [
                        t("result.consumptionShapeLabel"),
                        t(`result.consumptionShape.${result.consumption.shape}`),
                      ] as [string, string],
                    ]
                  : []),
                [t("result.dataSource"), result.resource.dataSource],
                [t("result.calculatedAt"), formatDate(result.calculatedAt, locale)],
                [t("result.currency"), `${currency} · ${market.countryCode}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 px-3.5 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
              <div className="flex items-start gap-2 px-3.5 py-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("result.fuseLimitInfo")}</span>
              </div>
              <div className="px-3.5 py-2.5 text-[11px] text-muted-foreground">
                {t("result.selfConsumptionInfo")}
              </div>
              <div className="px-3.5 py-2.5 text-[11px] text-muted-foreground">
                {t("result.priceExplainer")}
              </div>
              <div className="px-3.5 py-2.5 text-[11px] text-muted-foreground">
                {t("result.paybackInfo")}
              </div>
            </dl>
          ) : null}
        </div>


        {exportError ? <p className="text-sm text-destructive">{t("result.pdfError")}</p> : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/90 backdrop-blur">
        <div
          className="mx-auto flex max-w-2xl flex-col gap-2 px-5 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => {
                void haptic("light");
                setCurrentStep(5);
                void navigate({ to: "/" });
              }}
            >
              <ArrowLeft className="size-4" /> {t("common.back")}
            </Button>
            <Button variant="outline" size="lg" className="flex-1" asChild onClick={() => reset()}>
              <Link to="/">{t("common.startOver")}</Link>
            </Button>
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t("result.generatingPdf")}
              </>
            ) : (
              <>
                <Download className="size-4" /> {t("result.downloadPdf")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
