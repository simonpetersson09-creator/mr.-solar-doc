import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, Download, Info, Loader2, Pencil, Sun, Zap } from "lucide-react";
import "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MonthlyChart } from "@/components/MonthlyChart";
import { useCalculation } from "@/hooks/use-calculation";
import { useAppLocale } from "@/hooks/use-app-locale";
import { useWizardStore } from "@/state/wizard-store";
import { formatCurrency, formatDate, formatDecimal, formatNumber } from "@/lib/format";
import { exportReport, type ReportLabels } from "@/services/solar-report-service";
import { haptic } from "@/services/native-service";
import { MAX_PAYBACK_YEARS, MIN_PAYBACK_YEARS } from "@/config/constants";

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
      { title: "Din solelberäkning – Mr. Solar Doc" },
      {
        name: "description",
        content:
          "Se beräknad kWp, växelriktarstorlek, DC/AC-ratio, månadsproduktion och ekonomiskt värde – och ladda ner rapporten som PDF.",
      },
      { property: "og:title", content: "Din solelberäkning – Mr. Solar Doc" },
      {
        property: "og:description",
        content: "Beräknad dimensionering av din solcellsanläggning med PDF-rapport.",
      },
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
  const setSelfConsumptionShare = useWizardStore((s) => s.setSelfConsumptionShare);
  const setSelfConsumedValue = useWizardStore((s) => s.setSelfConsumedValue);
  const setExportValue = useWizardStore((s) => s.setExportValue);
  const reset = useWizardStore((s) => s.reset);
  const setCurrentStep = useWizardStore((s) => s.setCurrentStep);
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [showPaybackInfo, setShowPaybackInfo] = useState(false);
  const paybackYears = useWizardStore((s) => s.acceptedPaybackYears);
  const setAcceptedPaybackYears = useWizardStore((s) => s.setAcceptedPaybackYears);
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
  const investmentAmount = formatCurrency(
    result.investment.maxInvestmentRounded,
    locale,
    currency,
  );
  const rationale = t(REASON_KEY[result.recommendationReason] ?? "result.reason.profileNormal");

  const editableBadge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
      <Pencil className="size-2.5" /> {t("result.editable")}
    </span>
  );

  return (
    <div className="min-h-screen surface-sun pb-28">
      <header className="mx-auto max-w-2xl px-5 pt-6">
        <h1 className="text-xl font-bold text-foreground">{t("result.title")}</h1>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {t("result.forAddress", { address: result.location.address })}
        </p>
      </header>

      <main className="mx-auto max-w-2xl space-y-2.5 px-5 pt-3">
        {/* 1. Recommendation */}
        <section className="hero-metric rounded-2xl p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Sun className="size-3.5" /> {t("result.recommendedArray")}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-3xl font-bold">
              {formatDecimal(result.installedKwp, locale)} <span className="text-base">kWp</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("result.panelCount", { count: result.panelCount })}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-card/70 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Zap className="size-3" /> {t("result.recommendedInverter")}
              </div>
              <p className="mt-0.5 text-lg font-bold">
                {t("result.inverterShort", { kw: formatNumber(result.inverterKw, locale) })}
              </p>
            </div>
            <div className="rounded-xl bg-card/70 p-3">
              <p className="text-[11px] text-muted-foreground">{t("result.annualProduction")}</p>
              <p className="mt-0.5 text-lg font-bold">
                {formatNumber(p.annualProductionKwh, locale)}{" "}
                <span className="text-xs font-semibold">kWh{t("common.perYear")}</span>
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm font-semibold">
            {t("result.coverage", { percent: formatNumber(p.productionCoveragePercent, locale) })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{rationale}</p>
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

        {/* 3. Your solar electricity */}
        <section className="card-elevated space-y-2.5 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("result.sectionYourSolar")}</h2>
            {editableBadge}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-secondary p-2.5">
              <dt className="text-[11px] text-muted-foreground">{t("result.selfConsumption")}</dt>
              <dd className="font-semibold">
                {formatNumber(p.selfConsumptionPercent, locale)} % ·{" "}
                {formatNumber(p.selfConsumptionKwh, locale)} kWh
              </dd>
            </div>
            <div className="rounded-xl bg-secondary p-2.5">
              <dt className="text-[11px] text-muted-foreground">{t("result.exported")}</dt>
              <dd className="font-semibold">
                {formatNumber(p.exportPercent, locale)} % ·{" "}
                {formatNumber(p.exportedKwh, locale)} kWh
              </dd>
            </div>
          </dl>
          <div className="rounded-xl border border-dashed border-accent/50 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t("result.adjustSplit")}</Label>
              <span className="text-sm font-semibold">
                {formatNumber(p.selfConsumptionPercent, locale)} %
              </span>
            </div>
            <Slider
              className="mt-2.5"
              min={0}
              max={100}
              step={5}
              value={[p.selfConsumptionPercent]}
              onValueChange={([value]) => setSelfConsumptionShare((value ?? 0) / 100)}
            />
          </div>
        </section>

        {/* 4. Economics */}
        <section className="card-elevated space-y-2.5 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("result.sectionEconomy")}</h2>
            {editableBadge}
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("result.annualSavings")}</p>
            <p className="text-2xl font-bold">
              {formatCurrency(p.annualSavings, locale, currency)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {t("result.perYear")}
              </span>
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-secondary p-2.5">
              <dt className="text-[11px] text-muted-foreground">
                {t("result.selfConsumptionValue")}
              </dt>
              <dd className="text-sm font-semibold">
                {formatCurrency(p.selfConsumptionValue, locale, currency)}
              </dd>
            </div>
            <div className="rounded-xl bg-secondary p-2.5">
              <dt className="text-[11px] text-muted-foreground">{t("result.exportValue")}</dt>
              <dd className="text-sm font-semibold">
                {formatCurrency(p.exportValue, locale, currency)}
              </dd>
            </div>
          </dl>

          {result.notes.includes("economic-values-missing") ? (
            <p className="rounded-xl border border-border bg-secondary p-2.5 text-[11px]">
              {t("result.missingMarketValues")}
            </p>
          ) : null}

          <div className="space-y-2 rounded-xl border border-dashed border-accent/50 p-3">
            <p className="text-xs font-medium">{t("result.assumedPrices")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="self-value" className="text-[11px] text-muted-foreground">
                  {t("result.selfConsumedValueLabel", { currency })}
                </Label>
                <Input
                  id="self-value"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="mt-1 h-9"
                  value={result.economics.selfConsumedValuePerKwh}
                  onChange={(event) => setSelfConsumedValue(Number(event.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="export-value" className="text-[11px] text-muted-foreground">
                  {t("result.exportValueLabel", { currency })}
                </Label>
                <Input
                  id="export-value"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="mt-1 h-9"
                  value={result.economics.exportValuePerKwh}
                  onChange={(event) => setExportValue(Number(event.target.value) || 0)}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("result.priceExplainer")}
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground">{t("result.economicsDisclaimer")}</p>
        </section>

        {/* 4b. Investment level for the chosen payback time */}
        <section className="card-elevated space-y-2.5 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{t("result.paybackTitle")}</h2>
              <p className="text-[11px] text-muted-foreground">
                {t("result.paybackSubtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editableBadge}
              <button
                type="button"
                aria-label={t("result.paybackInfo")}
                onClick={() => setShowPaybackInfo((open) => !open)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Info className="size-4" />
              </button>
            </div>
          </div>

          {showPaybackInfo ? (
            <p className="rounded-xl bg-secondary p-2.5 text-[11px] text-muted-foreground">
              {t("result.paybackInfo")}
            </p>
          ) : null}

          <div className="rounded-xl border border-dashed border-accent/50 p-3">
            <div className="flex items-baseline justify-between">
              <Label className="text-xs">{t("result.paybackTitle")}</Label>
              <span className="text-base font-bold">
                {t("result.paybackYears", { years: formatNumber(paybackYears, locale) })}
              </span>
            </div>
            <Slider
              className="mt-2.5"
              min={MIN_PAYBACK_YEARS}
              max={MAX_PAYBACK_YEARS}
              step={1}
              value={[paybackYears]}
              onValueChange={([value]) => setAcceptedPaybackYears(value ?? MIN_PAYBACK_YEARS)}
            />
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{t("result.paybackYears", { years: MIN_PAYBACK_YEARS })}</span>
              <span>{t("result.paybackYears", { years: MAX_PAYBACK_YEARS })}</span>
            </div>
          </div>

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
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              {t("result.investmentFormula", {
                value: formatCurrency(p.annualSavings, locale, currency),
                perYear: t("common.perYear"),
                years: formatNumber(paybackYears, locale),
                amount: investmentAmount,
              })}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("result.maxInvestmentNote")}
            </p>
          </div>
        </section>



        {/* 5. Technical details */}
        <div className="card-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium"
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
                <div key={label} className="flex justify-between gap-4 px-5 py-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
              <div className="flex items-start gap-2 px-5 py-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("result.fuseLimitInfo")}</span>
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
                setCurrentStep(4);
                void navigate({ to: "/" });
              }}
            >
              <ArrowLeft className="size-4" /> {t("common.back")}
            </Button>
            <Button variant="outline" size="lg" className="flex-1" asChild onClick={() => reset()}>
              <Link to="/">{t("common.startOver")}</Link>
            </Button>
          </div>
          <Button className="w-full" size="lg" disabled={exporting} onClick={() => void handleExport()}>
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
