import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, CircleAlert, Download, Info, Loader2, Sun, Zap } from "lucide-react";
import i18nInstance from "@/i18n";
import { Button } from "@/components/ui/button";
import { MonthlyChart } from "@/components/MonthlyChart";
import { useUnlockedCalculation } from "@/hooks/use-unlocked-calculation";
import { useAppLocale } from "@/hooks/use-app-locale";
import { connectionLabelKey, formatConnectionCapacity } from "@/lib/connection-display";
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
  // Paid content only: the server returns a snapshot exclusively for unlocked
  // calculations, so a direct visit or refresh can never reveal the result.
  const { result, snapshot, market, isLoading, unlocked } = useUnlockedCalculation();
  const reset = useWizardStore((s) => s.reset);
  const setCurrentStep = useWizardStore((s) => s.setCurrentStep);
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const wizardPaybackYears = useWizardStore((s) => s.acceptedPaybackYears);
  const paybackYears = snapshot?.assumptions.acceptedPaybackYears ?? wizardPaybackYears;
const [exporting, setExporting] = useState(false);
const [exportError, setExportError] = useState(false);
const [showInvestmentInfo, setShowInvestmentInfo] = useState(false);
  const [showSystemSizeInfo, setShowSystemSizeInfo] = useState(false);
  const [showProductionCostInfo, setShowProductionCostInfo] = useState(false);

  const shortMonths = i18n.t("months.short", { returnObjects: true }) as string[];

  if (isLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 surface-sun px-6 text-center">
        <Loader2 className="size-5 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!result || !unlocked) {
    // No result at all is a missing-data state, not a paywall. Showing the
    // locked copy here made users think they had to pay again.
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 surface-sun px-6 text-center">
        <p className="text-muted-foreground">
          {result ? t("result.locked") : t("result.noCalculation")}
        </p>
        <Button asChild>
          <Link to="/">{t("common.startOver")}</Link>
        </Button>
      </div>
    );
  }


  const rationale = t(REASON_KEY[result.recommendationReason] ?? "result.reason.profileNormal");

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
        economicsRequiresPrice: t("result.economicsRequiresPrice"),
        economicsRequiresPriceShort: t("result.economicsRequiresPriceShort"),
        gridUnverifiedTitle: t("result.gridUnverifiedTitle"),
        gridUnverifiedWarning: t("result.gridUnverifiedWarning"),
        faqTitle: t("report.faqTitle"),
        faqItems: i18n.t("report.faqItems", { returnObjects: true }) as ReportLabels["faqItems"],
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
  const selfConsumptionIsUserSet = result.selfConsumptionSource === "user-override";
  const investmentAmount = formatCurrency(result.investment.maxInvestmentRounded, locale, currency);
  // null !== 0: a missing price is never shown as a number.
  const availability = result.economics.availability;
  const selfConsumedMissing = availability.selfConsumedValue === "missing";
  const exportMissing = availability.exportValue === "missing";
  // S5: the engine decides; the UI never re-derives economic completeness.
  const economicValuesMissing = result.economicsStatus === "incomplete";
  // S6: grid knowledge level travels with the result, from step 4 to the PDF.
  // profileConfirmed is true once the user presses "I have checked the grid
  // details" in step 4, so the warning disappears after confirmation — not just
  // for intrinsically-verified countries.
  const gridUnverified = !result.grid.profileConfirmed;
  const gridStatusLabel = t(
    result.grid.profileStatus === "verified"
      ? "result.gridProfileStatusVerified"
      : result.grid.profileStatus === "generic"
        ? "result.gridProfileStatusGeneric"
        : "result.gridProfileStatusUnsupported",
  );
const cost = result.productionCost;


  return (
<div className="flex h-dvh max-h-dvh flex-col overflow-hidden surface-sun">
      <main className="scrollbar-hidden mx-auto w-full max-w-2xl flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pt-safe pb-2">
        <header className="flex items-center gap-3 pt-3">
          <button
            type="button"
            onClick={() => {
              void haptic("light");
              setCurrentStep(5);
              void navigate({ to: "/" });
            }}
            aria-label={t("common.back")}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="size-4" />
          </button>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{t("result.title")}</h1>
        </header>
        {gridUnverified ? (
          <div className="flex items-start gap-2 rounded-2xl border border-accent/40 bg-accent/10 p-3 text-[11px] leading-relaxed text-foreground/80">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span>
              <span className="font-semibold">{t("result.gridUnverifiedTitle")}. </span>
              {t("result.gridUnverifiedWarning")}
            </span>
          </div>
        ) : null}
        {/* Group: the system */}
        <p className="px-1 text-center text-[11px] font-bold tracking-widest text-foreground/60 uppercase">
          {t("result.groupSystem")}
        </p>
        {/* 1. Recommendation */}
<section className="glass-primary surface-strong rounded-3xl p-5">
          <div className="glow-amber -top-16 -right-16 size-48" aria-hidden="true" />
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSystemSizeInfo((open) => !open)}
              aria-label={t("result.systemSizeInfoLabel")}
              aria-expanded={showSystemSizeInfo}
              className="absolute top-0 right-0 flex size-6 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
            >
              <CircleAlert className="size-3.5" />
            </button>
            <h2 className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-white">
              <Sun className="size-4" /> {t("result.recommendedArray")}
            </h2>
            {showSystemSizeInfo ? (
              <p className="mt-2 rounded-xl border border-white/15 bg-white/10 p-2.5 text-[11px] leading-relaxed text-white/70">
                {t("result.systemSizeInfo")}
              </p>
            ) : null}
            <div className="glass-panel mt-2.5 rounded-2xl p-3 text-center">
              <p className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">
                {t("result.panelPowerLabel")}
              </p>
              <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
                {formatDecimal(result.installedKwp, locale)}{" "}
                <span className="text-base font-semibold text-white/80">kWp</span>
              </p>
              <p className="text-[11px] text-white/60">
                {t("result.panelCount", { count: result.panelCount })}
              </p>

            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <div className="glass-panel rounded-2xl p-2.5 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/60 uppercase">
                  <Zap className="size-3" /> {t("result.recommendedInverter")}
                </p>
                <p className="mt-0.5 text-lg font-bold text-white tabular-nums">
                  {formatNumber(result.inverterKw, locale)}{" "}
                  <span className="text-[11px] font-semibold text-white/60">kW</span>
                </p>
              </div>
              <div className="glass-panel rounded-2xl p-2.5 text-center">
                <p className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">
                  {t("result.annualProduction")}
                </p>
                <p className="mt-0.5 text-lg font-bold text-white tabular-nums">
                  {formatNumber(p.annualProductionKwh, locale)}{" "}
                  <span className="text-[11px] font-semibold text-white/60">
                    kWh{t("common.perYear")}
                  </span>
                </p>
              </div>
            </div>

            <p className="mt-3 text-center text-sm font-bold text-white">
              {t("result.coverage", { percent: formatNumber(p.productionCoveragePercent, locale) })}
            </p>

            {result.notes.includes("minimum-system-size") ? (
              <p className="mt-1.5 text-center text-[11px] text-white/60">{t("result.minimumSizeNote")}</p>
            ) : null}
            {result.notes.includes("consumption-below-minimum") ? (
              <p className="mt-1.5 text-center text-[11px] text-white/60">
                {t("result.consumptionTooLowNote")}
              </p>
            ) : null}

          </div>
        </section>

{/* 2. Production */}
        <section className="rounded-[28px] border border-primary-foreground/20 glass-primary surface-strong p-3.5 text-primary-foreground shadow-hero">
          <h2 className="mb-3 text-center text-sm font-semibold text-white">
            {t("result.sectionProduction")}
          </h2>
          {result.consumption.isEstimated ? (
            <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
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
            onDark
          />
        </section>

{/* Group: economics */}
        <p className="px-1 text-center text-[11px] font-bold tracking-widest text-foreground/60 uppercase">
          {t("result.groupEconomy")}
        </p>
{/* 3. What you get out of it — plain numbers, no controls */}
        <section className="space-y-2.5 rounded-[28px] border border-primary-foreground/20 glass-primary surface-strong p-3.5 text-primary-foreground shadow-hero">
          <h2 className="text-center text-sm font-semibold text-white">
            {t("result.sectionEconomy")}
          </h2>

          <div className="rounded-2xl bg-white/10 p-3 text-center">
            <p className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">
              {t("result.annualSavings")}
            </p>
            <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
              {economicValuesMissing ? "–" : formatCurrency(p.annualSavings, locale, currency)}{" "}
              <span className="text-[11px] font-semibold text-white/60">{t("result.perYear")}</span>
            </p>
          </div>


          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/10 p-2.5 text-center">
              <dt className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">
                {t("result.selfConsumption")}
              </dt>
              <dd className="mt-0.5 text-lg font-bold text-white tabular-nums">
                {selfConsumedMissing
                  ? "–"
                  : formatCurrency(p.selfConsumptionValue, locale, currency)}
              </dd>
              <dd className="text-[11px] text-white/60">
                {selfConsumptionIsUserSet ? "" : "\u2248 "}
                {formatNumber(p.selfConsumptionPercent, locale)} % ·{" "}
                {formatNumber(p.selfConsumptionKwh, locale)} kWh
              </dd>
              <dd className="text-[10px] text-white/45">
                {selfConsumptionIsUserSet
                  ? t("result.selfConsumptionUserAssumption")
                  : t("result.selfConsumptionEstimatedLabel")}
              </dd>
            </div>
            <div className="rounded-2xl bg-white/10 p-2.5 text-center">
              <dt className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">
                {t("result.exported")}
              </dt>
              <dd className="mt-0.5 text-lg font-bold text-white tabular-nums">
                {exportMissing ? "–" : formatCurrency(p.exportValue, locale, currency)}
              </dd>
              <dd className="text-[11px] text-white/60">
                {formatNumber(p.exportPercent, locale)} % · {formatNumber(p.exportedKwh, locale)} kWh
              </dd>
            </div>
          </dl>


          {economicValuesMissing ? (
            <p className="rounded-xl border border-white/15 bg-white/10 p-2.5 text-[11px] leading-relaxed text-white/70">
              {t("result.economicsRequiresPrice")}
            </p>
          ) : null}
          {selfConsumedMissing || exportMissing ? (
            <div className="space-y-1.5 rounded-xl border border-white/15 bg-white/10 p-2.5 text-[11px] text-white/70">
              {selfConsumedMissing ? <p>{t("result.missingSelfConsumedValue")}</p> : null}
              {exportMissing ? <p>{t("result.missingExportValue")}</p> : null}
            </div>
          ) : null}

          
        </section>

{/* 4. Max justifiable investment — its own hero card */}
<section className="relative rounded-[28px] border border-primary-foreground/20 glass-primary surface-strong p-3.5 text-primary-foreground shadow-hero">
          <button
            type="button"
            onClick={() => setShowInvestmentInfo((open) => !open)}
            aria-label={t("result.investmentLevelInfoLabel")}
            aria-expanded={showInvestmentInfo}
            className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
          >
            <CircleAlert className="size-3.5" />
          </button>
<h2 className="text-center text-sm font-semibold text-white">
            {t("result.investmentLevelTitle")}
          </h2>
          {showInvestmentInfo ? (
            <p className="mt-2 rounded-xl border border-white/15 bg-white/10 p-2.5 text-[11px] leading-relaxed text-white/70">
              {t("result.investmentLevelInfo")}
            </p>
          ) : null}
          <p className="mt-0.5 text-center text-[11px] text-white/60">
            {t("result.investmentLevelBasis", {
              years: formatNumber(paybackYears, locale),
            })}
          </p>

          {economicValuesMissing ? (
            <p className="mt-1.5 text-center text-[11px] leading-relaxed text-white/70">
              {t("result.missingMarketValues")}
            </p>
          ) : (
            <p className="mt-1.5 text-center text-3xl font-extrabold tracking-tight text-white">
              {t("result.maxInvestmentApprox", { amount: investmentAmount })}
            </p>
          )}

        </section>




{/* 5. Cost per produced kWh — own green card */}
<section className="relative rounded-[28px] border border-primary-foreground/20 glass-primary surface-strong p-3.5 text-primary-foreground shadow-hero">
          <button
            type="button"
            onClick={() => setShowProductionCostInfo((open) => !open)}
            aria-label={t("result.productionCostInfoLabel")}
            aria-expanded={showProductionCostInfo}
            className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
          >
            <CircleAlert className="size-3.5" />
          </button>
          <h2 className="text-center text-sm font-semibold text-white">
            {t("result.productionCostTitle")}
          </h2>
          {showProductionCostInfo ? (
            <p className="mt-2 rounded-xl border border-white/15 bg-white/10 p-2.5 text-[11px] leading-relaxed text-white/70">
              {t("result.productionCostInfo")}
            </p>
          ) : null}
          {cost.costPerKwh === null || economicValuesMissing ? (
            <p className="mt-3 text-center text-[11px] text-white/60">
              {t("result.productionCostUnavailable")}
            </p>

          ) : (
            <>
<div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-white/10 px-1.5 py-2.5">
                  <p className="flex min-h-[28px] items-center justify-center text-[11px] leading-tight text-white/60">
                    {t("result.productionCostLabel")}
                  </p>
                  <p className="mt-0.5 text-lg leading-tight font-bold text-white">
                    <span className="block whitespace-nowrap tabular-nums">
                      {formatDecimal(cost.costPerKwh, locale, 2)}
                    </span>
                    <span className="block text-[11px] font-semibold text-white/60">
                      {currency}/kWh
                    </span>
                  </p>
                </div>
                <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-white/10 px-1.5 py-2.5">
                  <p className="flex min-h-[28px] items-center justify-center text-[11px] leading-tight text-white/60">
                    {t("result.productionCostValueLabel")}
                  </p>
                  <p className="mt-0.5 text-lg leading-tight font-bold text-white">
                    <span className="block whitespace-nowrap tabular-nums">
                      {formatDecimal(cost.valuePerKwh, locale, 2)}
                    </span>
                    <span className="block text-[11px] font-semibold text-white/60">
                      {currency}/kWh
                    </span>
                  </p>
                </div>
                <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-white/10 px-1.5 py-2.5">
                  <p className="flex min-h-[28px] items-center justify-center text-[11px] leading-tight text-white/60">
                    {t("result.productionCostDifference")}
                  </p>
                  <p className="mt-0.5 text-lg leading-tight font-bold text-white">
                    <span className="block whitespace-nowrap tabular-nums">
                      {(cost.differencePerKwh ?? 0) >= 0 ? "+" : "−"}
                      {formatDecimal(Math.abs(cost.differencePerKwh ?? 0), locale, 2)}
                    </span>
                    <span className="block text-[11px] font-semibold text-white/60">
                      {currency}/kWh
                    </span>
                  </p>
                </div>
              </div>

            </>
          )}
        </section>



        {/* Group: details */}
        <p className="px-1 text-center text-[11px] font-bold tracking-widest text-foreground/60 uppercase">
          {t("result.groupDetails")}
        </p>
        {/* 6. Technical details */}
        <div className="overflow-hidden rounded-[28px] border border-primary-foreground/20 glass-primary surface-strong text-primary-foreground shadow-hero">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            className="flex w-full items-center justify-between px-3.5 py-3 text-sm font-medium text-white"
          >
            {showDetails ? t("result.hideCalculation") : t("result.showCalculation")}
            <ChevronDown
              className={`size-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
            />
          </button>
          {showDetails ? (
            <dl className="divide-y divide-white/10 border-t border-white/10 text-sm">
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
                [
                  t(connectionLabelKey(result.connection)),
                  formatConnectionCapacity(result.connection, locale) ??
                    `${result.mainFuseAmp ?? "-"} A`,
                ],
                [
                  t("result.gridConnection"),
                  t("result.gridConnectionValue", {
                    voltage: result.grid.voltageV,
                    phases: result.grid.phases,
                  }),
                ],
                [t("result.gridProfileStatusLabel"), gridStatusLabel],
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
                [
                  t("result.priceScenarioAssumption"),
                  `${result.lifetime.annualPriceChangeRate >= 0 ? "+" : ""}${formatDecimal(result.lifetime.annualPriceChangeRate * 100, locale, 1)} %${t("common.perYear")}`,
                ],
                [
                  t("result.degradationAssumption"),
                  `−${formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1)} %${t("common.perYear")} · ${t("units.years", { count: result.lifetime.periodYears })}`,
                ],
                [t("result.dataSource"), result.resource.dataSource],
                [t("result.calculatedAt"), formatDate(result.calculatedAt, locale)],
                [t("result.currency"), `${currency} · ${market.countryCode}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 px-3.5 py-2.5">
                  <dt className="text-white/60">{label}</dt>
                  <dd className="text-right font-medium text-white">{value}</dd>
                </div>
              ))}
              <div className="flex items-start gap-2 px-3.5 py-2.5 text-xs text-white/60">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("result.fuseLimitInfo")}</span>
              </div>
              <div className="px-3.5 py-2.5 text-[11px] text-white/60">
                {t("result.selfConsumptionInfo")}
              </div>
              <div className="px-3.5 py-2.5 text-[11px] text-white/60">
                {t("result.priceExplainer")}
              </div>
              <div className="px-3.5 py-2.5 text-[11px] text-white/60">
                {t("result.paybackInfo")}
              </div>
            </dl>
          ) : null}
        </div>




        {exportError ? <p className="text-sm text-destructive">{t("result.pdfError")}</p> : null}

{/* Actions — in the scroll flow at the very bottom */}
        <div className="pb-safe flex flex-col gap-2 pt-2">
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            asChild
            onClick={() => reset()}
          >
            <Link to="/">{t("common.startOver")}</Link>
          </Button>

          <Button
            className="w-full"
            size="lg"
            variant="cta"
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
      </main>
    </div>
  );
}
