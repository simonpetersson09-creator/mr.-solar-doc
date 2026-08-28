import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, Info, Loader2, Sun, Zap } from "lucide-react";
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
      { title: "Din solcellsrekommendation – Solenergikollen" },
      {
        name: "description",
        content:
          "Se rekommenderad kWp, växelriktarstorlek, DC/AC-ratio, månadsproduktion och ekonomiskt värde – och ladda ner rapporten som PDF.",
      },
      { property: "og:title", content: "Din solcellsrekommendation – Solenergikollen" },
      {
        property: "og:description",
        content: "Detaljerad dimensionering av din solcellsanläggning med PDF-rapport.",
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
  const rationale = t(REASON_KEY[result.recommendationReason] ?? "result.reason.profileNormal");

  return (
    <div className="min-h-screen surface-sun pb-32">
      <header className="mx-auto max-w-2xl px-5 pt-8">
        <h1 className="text-3xl font-bold text-foreground">{t("result.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("result.forAddress", { address: result.location.address })}
        </p>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-5 pt-6">
        {/* 1. Recommendation */}
        <section className="hero-metric rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sun className="size-4" /> {t("result.recommendedArray")}
          </div>
          <p className="mt-2 text-4xl font-bold">
            {formatDecimal(result.installedKwp, locale)} <span className="text-xl">kWp</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("result.panelCount", { count: result.panelCount })}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-card/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="size-3.5" /> {t("result.recommendedInverter")}
              </div>
              <p className="mt-1 text-2xl font-bold">
                {t("result.inverterShort", { kw: formatNumber(result.inverterKw, locale) })}
              </p>
            </div>
            <div className="rounded-xl bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">{t("result.annualProduction")}</p>
              <p className="mt-1 text-2xl font-bold">
                {formatNumber(p.annualProductionKwh, locale)}{" "}
                <span className="text-base font-semibold">kWh{t("common.perYear")}</span>
              </p>
            </div>
          </div>

          <p className="mt-4 text-lg font-semibold">
            {t("result.coverage", { percent: formatNumber(p.productionCoveragePercent, locale) })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("result.coverageNote")}</p>
          <p className="mt-3 text-sm">{rationale}</p>
          {result.consumptionProfile.hasMonthlyData ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("result.monthlyDataNote")}</p>
          ) : null}
        </section>

        {/* 2. Production */}
        <section className="card-elevated p-5">
          <h2 className="text-lg font-semibold">{t("result.sectionProduction")}</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            {t("result.monthlyProduction")}
          </p>
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
        <section className="card-elevated space-y-4 p-5">
          <h2 className="text-lg font-semibold">{t("result.sectionYourSolar")}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-secondary p-3">
              <dt className="text-xs text-muted-foreground">{t("result.selfConsumption")}</dt>
              <dd className="font-semibold">
                {formatNumber(p.selfConsumptionPercent, locale)} % ·{" "}
                {formatNumber(p.selfConsumptionKwh, locale)} kWh
              </dd>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <dt className="text-xs text-muted-foreground">{t("result.exported")}</dt>
              <dd className="font-semibold">
                {formatNumber(p.exportPercent, locale)} % ·{" "}
                {formatNumber(p.exportedKwh, locale)} kWh
              </dd>
            </div>
          </dl>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t("result.adjustSplit")}</Label>
              <span className="text-sm font-semibold">
                {formatNumber(p.selfConsumptionPercent, locale)} %
              </span>
            </div>
            <Slider
              className="mt-3"
              min={0}
              max={100}
              step={5}
              value={[p.selfConsumptionPercent]}
              onValueChange={([value]) => setSelfConsumptionShare((value ?? 0) / 100)}
            />
          </div>
        </section>

        {/* 4. Economics */}
        <section className="card-elevated space-y-5 p-5">
          <h2 className="text-lg font-semibold">{t("result.sectionEconomy")}</h2>

          <div>
            <p className="text-sm text-muted-foreground">{t("result.annualSavings")}</p>
            <p className="text-3xl font-bold">
              {formatCurrency(p.annualSavings, locale, currency)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {t("result.perYear")}
              </span>
            </p>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-secondary p-3">
              <dt className="text-xs text-muted-foreground">
                {t("result.selfConsumptionValue")}
              </dt>
              <dd className="text-lg font-semibold">
                {formatCurrency(p.selfConsumptionValue, locale, currency)}
              </dd>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <dt className="text-xs text-muted-foreground">{t("result.exportValue")}</dt>
              <dd className="text-lg font-semibold">
                {formatCurrency(p.exportValue, locale, currency)}
              </dd>
            </div>
          </dl>

          {result.notes.includes("economic-values-missing") ? (
            <p className="rounded-xl border border-border bg-secondary p-3 text-xs">
              {t("result.missingMarketValues")}
            </p>
          ) : null}

          <div className="space-y-4">
            <p className="text-sm font-medium">{t("result.assumedPrices")}</p>
            <div>
              <Label htmlFor="self-value" className="text-sm">
                {t("result.selfConsumedValueLabel", { currency })}
              </Label>
              <Input
                id="self-value"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="mt-2 h-11 w-40"
                value={result.economics.selfConsumedValuePerKwh}
                onChange={(event) => setSelfConsumedValue(Number(event.target.value) || 0)}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("result.selfConsumedValueHelp")}
              </p>
            </div>

            <div>
              <Label htmlFor="export-value" className="text-sm">
                {t("result.exportValueLabel", { currency })}
              </Label>
              <Input
                id="export-value"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="mt-2 h-11 w-40"
                value={result.economics.exportValuePerKwh}
                onChange={(event) => setExportValue(Number(event.target.value) || 0)}
              />
              <p className="mt-2 text-xs text-muted-foreground">{t("result.exportValueHelp")}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t("result.economicsDisclaimer")}</p>
        </section>

        {/* 4b. Maximum motivated investment */}
        <section className="card-elevated space-y-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("result.paybackTitle")}</h2>
            <button
              type="button"
              aria-label={t("result.paybackInfo")}
              onClick={() => setShowPaybackInfo((open) => !open)}
              className="mt-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" />
            </button>
          </div>

          {showPaybackInfo ? (
            <p className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
              {t("result.paybackInfo")}
            </p>
          ) : null}

          <div>
            <p className="text-2xl font-bold">
              {t("result.paybackYears", { years: formatNumber(paybackYears, locale) })}
            </p>
            <Slider
              className="mt-3"
              min={MIN_PAYBACK_YEARS}
              max={MAX_PAYBACK_YEARS}
              step={1}
              value={[paybackYears]}
              onValueChange={([value]) =>
                setAcceptedPaybackYears(value ?? MIN_PAYBACK_YEARS)
              }
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{t("result.paybackYears", { years: MIN_PAYBACK_YEARS })}</span>
              <span>{t("result.paybackYears", { years: MAX_PAYBACK_YEARS })}</span>
            </div>
          </div>

          <div className="rounded-xl bg-secondary p-4">
            <p className="text-xs text-muted-foreground">{t("result.maxInvestment")}</p>
            <p className="mt-1 text-3xl font-bold">
              {t("result.maxInvestmentApprox", {
                amount: formatCurrency(result.investment.maxInvestmentRounded, locale, currency),
              })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("result.maxInvestmentExplainer", {
                years: formatNumber(paybackYears, locale),
                amount: formatCurrency(result.investment.maxInvestmentRounded, locale, currency),
              })}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">{t("result.maxInvestmentNote")}</p>
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
                  `${formatNumber(result.resource.annualKwhPerKwp, locale)} kWh/kWp`,
                ],
                [
                  t("result.annualConsumption"),
                  `${formatNumber(p.annualConsumptionKwh, locale)} kWh`,
                ],
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
          className="mx-auto flex max-w-2xl gap-3 px-5 py-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <Button variant="outline" asChild onClick={() => reset()}>
            <Link to="/">{t("common.startOver")}</Link>
          </Button>
          <Button className="flex-1" size="lg" disabled={exporting} onClick={() => void handleExport()}>
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
