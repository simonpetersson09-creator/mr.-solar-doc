import { useState } from "react";
import { ArrowDown } from "lucide-react";
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
import { MAX_PAYBACK_YEARS, MIN_PAYBACK_YEARS } from "@/config/constants";
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
}: {
  id: string;
  value: number;
  onCommit: (next: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      className="mt-1 h-9"
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
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {source === "user-override" ? t("result.userValueBadge") : t("result.standardValueBadge")}
    </span>
  );

  return (
    <StepShell
      step={5}
      totalSteps={totalSteps}
      title={t("result.adjustAssumptions")}
      subtitle={t("result.adjustAssumptionsHint")}
      onBack={onBack}
      footer={
        <Button
          className="w-full"
          size="lg"
          onClick={() => {
            void haptic("success");
            onSubmit();
          }}
        >
          {t("fuse.calculate")}
        </Button>
      }
    >
      {/* Self-consumption split */}
      <div className="card-elevated p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t("result.adjustSplit")}</Label>
          <span className="text-sm font-semibold">{formatNumber(sharePercent, locale)} %</span>
        </div>
        <Slider
          className="mt-2.5"
          min={0}
          max={100}
          step={5}
          value={[sharePercent]}
          onValueChange={([value]) => setSelfConsumptionShare((value ?? 0) / 100)}
        />
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {t("result.selfConsumptionAssumption")}
        </p>
        {result?.presentation.selfConsumptionCapped ? (
          <p className="mt-2 text-[11px] font-medium leading-snug text-foreground">
            {t("result.selfConsumptionCappedNote", {
              effective: formatNumber(result.presentation.selfConsumptionPercent, locale),
            })}
          </p>
        ) : null}
      </div>

      {/* Prices */}
      <div className="card-elevated space-y-2 p-3">
        <p className="text-xs font-medium">{t("result.assumedPrices")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Label htmlFor="self-value" className="text-[11px] text-muted-foreground">
                {t("result.selfConsumedValueLabel", { currency })}
              </Label>
              {priceSourceBadge(selfConsumedSource)}
            </div>
            <PriceInput id="self-value" value={selfConsumedValue} onCommit={setSelfConsumedValue} />
            {selfConsumedSource === "user-override" ? (
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-primary underline underline-offset-2"
                onClick={() => setSelfConsumedValue(null)}
              >
                {t("result.resetToStandard")}
              </button>
            ) : null}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Label htmlFor="export-value" className="text-[11px] text-muted-foreground">
                {t("result.exportValueLabel", { currency })}
              </Label>
              {priceSourceBadge(exportSource)}
            </div>
            <PriceInput id="export-value" value={exportValue} onCommit={setExportValue} />
            {exportSource === "user-override" ? (
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-primary underline underline-offset-2"
                onClick={() => setExportValue(null)}
              >
                {t("result.resetToStandard")}
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("result.standardValueHint")}</p>
      </div>

      {/* Payback time — you set, we calculate */}
      <div className="card-elevated overflow-hidden">
        {/* You control */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-xs">{t("result.paybackTitle")}</Label>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {t("result.paybackSubtitle")}
              </p>
            </div>
            <span className="whitespace-nowrap text-2xl font-bold leading-none">
              {formatNumber(paybackYears, locale)}
              <span className="ml-1 text-sm font-semibold text-muted-foreground">
                {t("result.paybackYearsUnit")}
              </span>
            </span>
          </div>
          <Slider
            className="mt-3"
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

        {/* connector: you set → we calculate */}
        <div className="flex items-center gap-1.5 border-y border-border bg-secondary/50 px-3 py-1.5">
          <ArrowDown className="size-3 text-primary" />
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("result.paybackResultLabel")}
          </span>
        </div>

        {/* result */}
        <div className="p-3">
          {result ? (
            <>
              <p className="text-2xl font-bold text-primary">
                {t("result.maxInvestmentApprox", {
                  amount: formatCurrency(
                    result.investment.maxInvestmentRounded,
                    locale,
                    currency,
                  ),
                })}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {t("result.investmentFormula", {
                  value: formatCurrency(result.presentation.annualSavings, locale, currency),
                  perYear: t("common.perYear"),
                  years: formatNumber(paybackYears, locale),
                  amount: formatCurrency(result.investment.maxInvestmentRounded, locale, currency),
                })}
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {t("result.maxInvestmentNote")}
              </p>
            </>
          ) : null}
        </div>
      </div>
    </StepShell>
  );
}
