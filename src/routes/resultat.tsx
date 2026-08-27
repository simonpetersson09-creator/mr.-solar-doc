import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, Loader2, Sun, Zap } from "lucide-react";
import "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MonthlyChart } from "@/components/MonthlyChart";
import { useCalculation } from "@/hooks/use-calculation";
import { useAppLocale } from "@/hooks/use-app-locale";
import { useWizardStore } from "@/state/wizard-store";
import { PANEL_WATTAGE_KWP } from "@/config/constants";
import { formatCurrency, formatDate, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { exportReport, type ReportLabels } from "@/services/solar-report-service";
import { haptic } from "@/services/native-service";

/** Estimated number of panels for a given installed DC power. */
function panelCount(installedKwp: number): number {
  return Math.max(1, Math.round(installedKwp / PANEL_WATTAGE_KWP));
}

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
  const setElectricityPrice = useWizardStore((s) => s.setElectricityPrice);
  const reset = useWizardStore((s) => s.reset);
  const [showDetails, setShowDetails] = useState(false);
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

  return (
    <div className="min-h-screen surface-sun pb-32">
      <header className="mx-auto max-w-2xl px-5 pt-8">
        <h1 className="text-3xl font-bold text-foreground">{t("result.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("result.forAddress", { address: result.location.address })}
        </p>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-5 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="hero-metric rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sun className="size-4" /> {t("result.recommendedArray")}
            </div>
            <p className="mt-2 text-4xl font-bold">
              {formatDecimal(result.installedKwp, locale)} <span className="text-xl">kWp</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("result.panelCount", { count: panelCount(result.installedKwp) })}
            </p>
          </div>
          <div className="card-elevated p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Zap className="size-4" /> {t("result.recommendedInverter")}
            </div>
            <p className="mt-2 text-4xl font-bold">
              {formatNumber(result.inverterKw, locale)} <span className="text-xl">kW</span>
            </p>
          </div>
        </div>

        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">{t("result.annualProduction")}</p>
          <p className="mt-1 text-3xl font-bold">
            {formatNumber(result.annualProductionKwh, locale)}{" "}
            <span className="text-lg">kWh {t("result.perYear")}</span>
          </p>
          <div className="mt-5">
            <p className="mb-3 text-sm font-medium">{t("result.monthlyProduction")}</p>
            <MonthlyChart
              values={result.monthlyProductionKwh}
              labels={shortMonths}
              locale={locale}
            />
          </div>
        </div>

        {result.notes.includes("limited-by-main-fuse") ? (
          <p className="rounded-xl border border-border bg-secondary p-4 text-sm">
            {t("result.limitedByFuse")}
          </p>
        ) : null}

        <div className="card-elevated space-y-5 p-5">
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t("result.adjustSplit")}</Label>
              <span className="text-sm font-semibold">
                {formatPercent(result.selfConsumption.share, locale)}
              </span>
            </div>
            <Slider
              className="mt-3"
              min={0}
              max={100}
              step={5}
              value={[Math.round(result.selfConsumption.share * 100)]}
              onValueChange={([value]) => setSelfConsumptionShare((value ?? 0) / 100)}
            />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-secondary p-3">
                <dt className="text-xs text-muted-foreground">{t("result.selfConsumption")}</dt>
                <dd className="font-semibold">
                  {formatNumber(result.selfConsumption.kwh, locale)} kWh
                </dd>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <dt className="text-xs text-muted-foreground">{t("result.exported")}</dt>
                <dd className="font-semibold">
                  {formatNumber(result.exported.kwh, locale)} kWh
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <Label htmlFor="price" className="text-sm">
              {t("result.priceLabel", { currency })}
            </Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              inputMode="decimal"
              className="mt-2 h-11 w-40"
              value={result.economics.electricityPricePerKwh}
              onChange={(event) => setElectricityPrice(Number(event.target.value) || 0)}
            />
            <p className="mt-3 text-xs text-muted-foreground">{t("result.economicValue")}</p>
            <p className="text-2xl font-bold">
              {formatCurrency(result.economics.totalValue, locale, currency)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {t("result.perYear")}
              </span>
            </p>
          </div>
        </div>

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
                [t("result.installedDc"), `${formatDecimal(result.installedKwp, locale)} kWp (${panelCount(result.installedKwp)} ${t("result.panelsUnit")})`],
                [t("result.inverterPower"), `${formatNumber(result.inverterKw, locale)} kW`],
                [t("result.dcAcRatio"), formatDecimal(result.dcAcRatio, locale, 2)],
                [t("result.oversizing"), `${formatDecimal(result.oversizingPercent, locale)} %`],
                [t("result.mainFuse"), `${result.mainFuseAmp} A`],
                [t("result.maxAc"), `${formatDecimal(result.maxAcPowerKw, locale, 2)} kW`],
                [
                  t("result.specificYield"),
                  `${formatNumber(result.resource.annualKwhPerKwp, locale)} kWh/kWp`,
                ],
                [
                  t("result.annualConsumption"),
                  `${formatNumber(result.consumption.annualKwh, locale)} kWh`,
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
