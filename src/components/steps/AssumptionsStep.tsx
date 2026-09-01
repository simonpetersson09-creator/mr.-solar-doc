import { AlertTriangle, ArrowRight, CircleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { StepShell } from "@/components/StepShell";
import { useAppLocale } from "@/hooks/use-app-locale";
import { useCalculation } from "@/hooks/use-calculation";
import { useWizardStore } from "@/state/wizard-store";
import { formatNumber } from "@/lib/format";
import { NumericField } from "@/components/NumericField";
import { cn } from "@/lib/utils";
import {
  MAX_CUSTOM_PRICE_CHANGE_PERCENT,
  MIN_CUSTOM_PRICE_CHANGE_PERCENT,
  MAX_PAYBACK_YEARS,
  MIN_PAYBACK_YEARS,
  type PriceScenarioId,
} from "@/config/constants";
import { haptic } from "@/services/native-service";

interface AssumptionsStepProps {
  totalSteps: number;
  onBack: () => void;
  onSubmit: () => void;
}

export function AssumptionsStep({ totalSteps, onBack, onSubmit }: AssumptionsStepProps) {
  const { t } = useTranslation();
  const { locale } = useAppLocale();
  const { result, outcome, market } = useCalculation();
  const [showExportInfo, setShowExportInfo] = useState(false);
  const setSelfConsumptionShare = useWizardStore((s) => s.setSelfConsumptionShare);
  const setSelfConsumedValue = useWizardStore((s) => s.setSelfConsumedValue);
  const setExportValue = useWizardStore((s) => s.setExportValue);
  const paybackYears = useWizardStore((s) => s.acceptedPaybackYears);
  const setAcceptedPaybackYears = useWizardStore((s) => s.setAcceptedPaybackYears);
  const storedSelfConsumptionShare = useWizardStore((s) => s.selfConsumptionShare);
  const selfConsumptionShareIsUserSet = useWizardStore((s) => s.selfConsumptionShareIsUserSet);
  const storedSelfConsumedValue = useWizardStore((s) => s.selfConsumedValuePerKwh);
  const storedExportValue = useWizardStore((s) => s.exportValuePerKwh);
  const priceScenario = useWizardStore((s) => s.priceScenario);
  const setPriceScenario = useWizardStore((s) => s.setPriceScenario);
  const customPriceChangePercent = useWizardStore((s) => s.customPriceChangePercent);
  const setCustomPriceChangePercent = useWizardStore((s) => s.setCustomPriceChangePercent);

  const scenarios: { id: PriceScenarioId; label: string; rateLabel: string | null }[] = [
    { id: "flat", label: t("result.priceScenarioFlat"), rateLabel: "0 %/\u00e5r" },
    { id: "cautious", label: t("result.priceScenarioCautious"), rateLabel: "+1 %/\u00e5r" },
    { id: "normal", label: t("result.priceScenarioNormal"), rateLabel: "+2 %/\u00e5r" },
{ id: "high", label: t("result.priceScenarioHigh"), rateLabel: "+3 %/\u00e5r" },
    { id: "veryHigh", label: t("result.priceScenarioVeryHigh"), rateLabel: "+4 %/\u00e5r" },
    { id: "extreme", label: t("result.priceScenarioExtreme"), rateLabel: "+5 %/\u00e5r" },
    { id: "custom", label: t("result.priceScenarioCustom"), rateLabel: null },
  ];

  const currency = result?.economics.currency ?? market.currency;
  // Provenance drives the wording: an automatic estimate is shown with "≈",
  // a manual choice is presented as the user's own assumption.
  const isUserSetShare =
    result?.selfConsumptionSource === "user-override" || selfConsumptionShareIsUserSet;
  const sharePercent = result
    ? result.presentation.requestedSelfConsumptionPercent
    : Math.round(storedSelfConsumptionShare * 100);
  const selfConsumedValue =
    result?.economics.selfConsumedValuePerKwh ??
    storedSelfConsumedValue ??
    market.selfConsumedElectricityValue ??
    0;
  const exportValue =
    result?.economics.exportValuePerKwh ??
    storedExportValue ??
    market.exportElectricityValue ??
    0;
  const selfConsumedSource =
    result?.economics.selfConsumedValueSource ??
    (storedSelfConsumedValue === null ? "standard-value" : "user-override");
  const exportSource =
    result?.economics.exportValueSource ??
    (storedExportValue === null ? "standard-value" : "user-override");

  const priceSourceBadge = (source: "standard-value" | "user-override") => (
    <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/70">
      {source === "user-override" ? t("result.userValueBadge") : t("result.standardValueBadge")}
    </span>
  );

  // A connection smaller than the smallest supported inverter is a real-world
  // domain outcome, not a technical error: say so and block the calculation.
  const gridTooSmall = outcome?.status === "grid-too-small" ? outcome : null;

  return (
    <StepShell
      step={5}
      totalSteps={totalSteps}
title={t("result.adjustAssumptions")}
      onBack={onBack}
      footer={
        <Button
className="h-auto w-full rounded-[24px] py-4 text-base font-bold shadow-cta"
          variant="cta"
          size="lg"
          disabled={Boolean(gridTooSmall)}
          onClick={() => {
            if (gridTooSmall) return;
            void haptic("success");
            onSubmit();
          }}
        >
          {t("fuse.calculate")}
          <ArrowRight className="size-4 text-accent" />
        </Button>
      }
    >
      {gridTooSmall ? (
        <div className="flex gap-3 rounded-[28px] border border-destructive/30 bg-destructive/10 px-4 py-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-destructive">
              {t("result.gridTooSmallTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("result.gridTooSmallBody", {
                maxKw: formatNumber(gridTooSmall.maxAcPowerKw, locale, { maximumFractionDigits: 1 }),
                minKw: formatNumber(gridTooSmall.minimumSupportedInverterKw, locale, { maximumFractionDigits: 1 }),
              })}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Card 1: self-consumption split ── */}
      <div className="glass-primary space-y-2.5 rounded-[28px] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-semibold text-white">
            {isUserSetShare ? t("result.adjustSplit") : t("result.selfConsumptionEstimatedLabel")}
          </Label>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-white">
            {isUserSetShare ? "" : "\u2248 "}
            {formatNumber(sharePercent, locale)} %
          </span>
        </div>
        <Slider
          className="py-1.5"
          min={0}
          max={100}
          step={5}
          value={[sharePercent]}
          onValueChange={([value]) => setSelfConsumptionShare((value ?? 0) / 100)}
          trackClassName="bg-white/25"
          rangeClassName="bg-accent"
          thumbClassName="border-accent bg-white"
        />
        <p className="text-[11px] leading-snug text-white/60">
          {isUserSetShare
            ? t("result.selfConsumptionAssumption")
            : t("result.selfConsumptionEstimatedHelp")}
        </p>
        {result?.presentation.selfConsumptionCapped ? (
          <p className="text-[11px] font-medium leading-snug text-white/85">
            {t("result.selfConsumptionCappedNote", {
              effective: formatNumber(result.presentation.selfConsumptionPercent, locale),
            })}
          </p>
        ) : null}
      </div>

      {/* ── Card 2: assumed prices ── */}
      <div className="glass-primary space-y-3 rounded-[28px] px-4 py-4">
        <div className="relative">
          <p className="text-xs font-semibold text-white">{t("result.assumedPrices")}</p>
          <button
            type="button"
            onClick={() => setShowExportInfo((open) => !open)}
            aria-label={t("result.exportValueInfo")}
            aria-expanded={showExportInfo}
            className="absolute top-0 right-0 flex size-6 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
          >
            <CircleAlert className="size-3.5" />
          </button>
        </div>
        {showExportInfo ? (
          <p className="rounded-xl border border-white/15 bg-white/10 p-2.5 text-[11px] leading-relaxed text-white/70">
            {t("result.exportValueInfo")}
          </p>
        ) : null}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Label htmlFor="self-value" className="text-[11px] text-white/70">
                {t("result.selfConsumedValueLabel", { currency })}
              </Label>
              {priceSourceBadge(selfConsumedSource)}
            </div>
            <NumericField
              id="self-value"
              locale={locale}
              value={selfConsumedValue}
              onCommit={setSelfConsumedValue}
              min={0}
              decimals={4}
              className="mt-1 h-9 rounded-full border-white/25 bg-white/15 text-white placeholder:text-white/50"
            />
            {selfConsumedSource === "user-override" ? (
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-accent underline underline-offset-2"
                onClick={() => setSelfConsumedValue(null)}
              >
                {t("result.resetToStandard")}
              </button>
            ) : null}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Label htmlFor="export-value" className="text-[11px] text-white/70">
                {t("result.exportValueLabel", { currency })}
              </Label>
              {priceSourceBadge(exportSource)}
            </div>
            <NumericField
              id="export-value"
              locale={locale}
              value={exportValue}
              onCommit={setExportValue}
              min={0}
              decimals={4}
              className="mt-1 h-9 rounded-full border-white/25 bg-white/15 text-white placeholder:text-white/50"
            />
            {exportSource === "user-override" ? (
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-accent underline underline-offset-2"
                onClick={() => setExportValue(null)}
              >
                {t("result.resetToStandard")}
              </button>
            ) : null}
          </div>
        </div>
<p className="text-[11px] leading-snug text-white/60">{t("result.standardValueHint")}</p>
      </div>

      {/* ── Card 3: electricity price development scenario ── */}
      <div className="glass-primary space-y-2.5 rounded-[28px] px-4 py-4">
        <p className="text-xs font-semibold text-white">{t("result.priceScenarioTitle")}</p>
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white/10 p-2.5">
          {scenarios.map((scenario) => {
            const active = priceScenario === scenario.id;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setPriceScenario(scenario.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-[10px] px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  active
                    ? "chip-selected"
                    : "chip-unselected",
                )}
              >
                {scenario.label}
                {scenario.rateLabel ? (
                  <span className={cn("ml-1 font-normal", active ? "" : "text-brand-black/55")}>
                    {scenario.rateLabel}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {priceScenario === "custom" ? (
          <div>
            <Label htmlFor="custom-price-change" className="text-[11px] text-white/70">
              {t("result.priceScenarioCustomLabel")}
            </Label>
            <NumericField
              id="custom-price-change"
              locale={locale}
              className="mt-1 h-9 rounded-full border-white/25 bg-white/15 text-white placeholder:text-white/50"
              value={customPriceChangePercent}
              allowNegative
              min={MIN_CUSTOM_PRICE_CHANGE_PERCENT}
              max={MAX_CUSTOM_PRICE_CHANGE_PERCENT}
              decimals={2}
              onCommit={(next) => setCustomPriceChangePercent(next ?? 0)}
            />
          </div>
        ) : null}
        <p className="text-[11px] leading-snug text-white/60">{t("result.priceScenarioHint")}</p>
      </div>

      {/* ── Card 4: payback time ── */}
      <div className="glass-primary space-y-2.5 rounded-[28px] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label className="text-xs font-semibold text-white">{t("result.paybackTitle")}</Label>
            <p className="mt-0.5 text-[11px] leading-snug text-white/70">
              {t("result.paybackSubtitle")}
            </p>
          </div>
          <span className="whitespace-nowrap text-3xl font-extrabold leading-none tracking-tight text-white">
            {formatNumber(paybackYears, locale)}
            <span className="ml-1 text-sm font-semibold text-white/60">
              {t("result.paybackYearsUnit")}
            </span>
          </span>
        </div>
        <Slider
          className="py-1.5"
          min={MIN_PAYBACK_YEARS}
          max={MAX_PAYBACK_YEARS}
          step={1}
          value={[paybackYears]}
          onValueChange={([value]) => setAcceptedPaybackYears(value ?? MIN_PAYBACK_YEARS)}
          trackClassName="bg-white/25"
          rangeClassName="bg-accent"
          thumbClassName="border-accent bg-white"
        />
        <div className="flex justify-between text-[10px] text-white/60">
          <span>{t("result.paybackYears", { years: MIN_PAYBACK_YEARS })}</span>
          <span>{t("result.paybackYears", { years: MAX_PAYBACK_YEARS })}</span>
        </div>
      </div>

</StepShell>
  );
}