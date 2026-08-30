import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { StepShell } from "@/components/StepShell";
import { useAppLocale } from "@/hooks/use-app-locale";
import { useCalculation } from "@/hooks/use-calculation";
import { useWizardStore } from "@/state/wizard-store";
import { formatCurrency, formatNumber, parseLocaleNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
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

/**
 * Free-text price field. The value is kept as a string while the user types so
 * that half-finished input ("0," / "0.") and an emptied field survive instead
 * of snapping back to 0. `null` is committed as "use the standard value".
 */
function PriceInput({
  id,
  value,
  onCommit,
  className,
}: {
  id: string;
  value: number;
  onCommit: (next: number | null) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      className={cn("mt-1 h-9", className)}
      value={draft ?? String(value)}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const parsed = parseLocaleNumber(raw);
        if (parsed !== null) onCommit(Math.max(0, parsed));
      }}
      onBlur={() => {
        const parsed = draft === null ? value : parseLocaleNumber(draft);
        setDraft(null);
        onCommit(parsed === null ? null : Math.max(0, parsed));
      }}
    />
  );
}

export function AssumptionsStep({ totalSteps, onBack, onSubmit }: AssumptionsStepProps) {
  const { t } = useTranslation();
  const { locale } = useAppLocale();
  const { result, market } = useCalculation();
  const setSelfConsumptionShare = useWizardStore((s) => s.setSelfConsumptionShare);
  const setSelfConsumedValue = useWizardStore((s) => s.setSelfConsumedValue);
  const setExportValue = useWizardStore((s) => s.setExportValue);
  const paybackYears = useWizardStore((s) => s.acceptedPaybackYears);
  const setAcceptedPaybackYears = useWizardStore((s) => s.setAcceptedPaybackYears);
  const storedSelfConsumptionShare = useWizardStore((s) => s.selfConsumptionShare);
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
    { id: "custom", label: t("result.priceScenarioCustom"), rateLabel: null },
  ];

  const currency = result?.economics.currency ?? market.currency;
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

  return (
    <StepShell
      step={5}
      totalSteps={totalSteps}
title={t("result.adjustAssumptions")}
      onBack={onBack}
      footer={
        <Button
          className="h-auto w-full rounded-[24px] py-4 text-base font-bold shadow-cta"
          size="lg"
          onClick={() => {
            void haptic("success");
            onSubmit();
          }}
        >
          {t("fuse.calculate")}
          <ArrowRight className="size-4 text-accent" />
        </Button>
      }
    >
      {/* ── Card 1: self-consumption split ── */}
      <div className="glass-primary space-y-2.5 rounded-[28px] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-semibold text-white">{t("result.adjustSplit")}</Label>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-white">
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
          {t("result.selfConsumptionAssumption")}
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
        <p className="text-xs font-semibold text-white">{t("result.assumedPrices")}</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Label htmlFor="self-value" className="text-[11px] text-white/70">
                {t("result.selfConsumedValueLabel", { currency })}
              </Label>
              {priceSourceBadge(selfConsumedSource)}
            </div>
            <PriceInput
              id="self-value"
              value={selfConsumedValue}
              onCommit={setSelfConsumedValue}
              className="rounded-full border-white/25 bg-white/15 text-white placeholder:text-white/50"
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
            <PriceInput
              id="export-value"
              value={exportValue}
              onCommit={setExportValue}
              className="rounded-full border-white/25 bg-white/15 text-white placeholder:text-white/50"
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
        <div className="flex flex-wrap gap-1.5">
          {scenarios.map((scenario) => {
            const active = priceScenario === scenario.id;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setPriceScenario(scenario.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  active
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-white/25 bg-white/10 text-white/80",
                )}
              >
                {scenario.label}
                {scenario.rateLabel ? (
                  <span className={cn("ml-1 font-normal", active ? "" : "text-white/60")}>
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
            <Input
              id="custom-price-change"
              type="text"
              inputMode="decimal"
              className="mt-1 h-9 rounded-full border-white/25 bg-white/15 text-white placeholder:text-white/50"
              value={String(customPriceChangePercent)}
              onChange={(event) => {
                const parsed = parseLocaleNumber(event.target.value);
                if (parsed !== null) setCustomPriceChangePercent(parsed);
              }}
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

      {/* ── Card 4: what the price corresponds to ── */}
      <div className="glass-primary rounded-[28px] px-4 py-4">
        <p className="text-[10px] font-bold tracking-widest text-white/70 uppercase">
          {t("result.paybackResultLabel")}
        </p>
        {result ? (
          <>
            <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-accent">
              {t("result.maxInvestmentApprox", {
                amount: formatCurrency(
                  result.investment.maxInvestmentRounded,
                  locale,
                  currency,
                ),
              })}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-white/70">
              {t("result.investmentFormula", {
                value: formatCurrency(result.presentation.annualSavings, locale, currency),
                perYear: t("common.perYear"),
                years: formatNumber(paybackYears, locale),
                amount: formatCurrency(result.investment.maxInvestmentRounded, locale, currency),
              })}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-white/60">
              {t("result.maxInvestmentNote")}
            </p>
          </>
        ) : null}
      </div>
    </StepShell>
  );
}