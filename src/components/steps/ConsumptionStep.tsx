import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StepShell } from "@/components/StepShell";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatNumber } from "@/lib/format";
import { sumMonthly } from "@/lib/calc/energy-production";
import { useWizardStore } from "@/state/wizard-store";
import { haptic } from "@/services/native-service";

interface ConsumptionStepProps {
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
}

const MIN_ANNUAL_KWH = 100;
const MAX_ANNUAL_KWH = 200000;

export function ConsumptionStep({ totalSteps, onBack, onNext }: ConsumptionStepProps) {
  const { t, i18n } = useTranslation();
  const { locale } = useAppLocale();
  const storedAnnual = useWizardStore((s) => s.annualConsumptionKwh);
  const storedMonthly = useWizardStore((s) => s.monthlyConsumptionKwh);
  const setConsumption = useWizardStore((s) => s.setConsumption);

  const monthLabels = i18n.t("months.long", { returnObjects: true }) as string[];

  const [annual, setAnnual] = useState<string>(storedAnnual ? String(storedAnnual) : "");
  const [useMonthly, setUseMonthly] = useState(Boolean(storedMonthly));
  const [monthly, setMonthly] = useState<string[]>(
    storedMonthly ? storedMonthly.map(String) : Array.from({ length: 12 }, () => ""),
  );

  const monthlyNumbers = monthly.map((value) => Number(value) || 0);
  const monthlyTotal = sumMonthly(monthlyNumbers);
  const effectiveAnnual = useMonthly ? monthlyTotal : Number(annual) || 0;
  const valid = effectiveAnnual >= MIN_ANNUAL_KWH && effectiveAnnual <= MAX_ANNUAL_KWH;

  return (
    <StepShell
      step={3}
      totalSteps={totalSteps}
      title={t("consumption.title")}
      subtitle={t("consumption.subtitle")}
      onBack={onBack}
      footer={
        <Button
          className="w-full"
          size="lg"
          disabled={!valid}
          onClick={() => {
            void haptic("medium");
            setConsumption(effectiveAnnual, useMonthly ? monthlyNumbers : null);
            onNext();
          }}
        >
          {t("common.next")}
        </Button>
      }
    >
      {!useMonthly ? (
        <div className="card-elevated p-4">
          <Label htmlFor="annual" className="text-sm">
            {t("consumption.annual")}
          </Label>
          <div className="mt-2 flex items-center gap-2">
            <Input
              id="annual"
              type="number"
              inputMode="numeric"
              value={annual}
              placeholder={t("consumption.annualPlaceholder")}
              onChange={(event) => setAnnual(event.target.value)}
              className="h-12 text-lg"
            />
            <span className="text-sm text-muted-foreground">kWh/år</span>
          </div>
          {annual !== "" && !valid ? (
            <p className="mt-2 text-sm text-destructive">{t("consumption.invalid")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="card-elevated flex items-center justify-between gap-4 p-4">
        <Label htmlFor="monthly-toggle" className="text-sm leading-snug">
          {t("consumption.useMonthly")}
        </Label>
        <Switch
          id="monthly-toggle"
          checked={useMonthly}
          onCheckedChange={(checked) => {
            void haptic("light");
            setUseMonthly(checked);
          }}
        />
      </div>

      {useMonthly ? (
        <div className="card-elevated space-y-4 p-4">
          <p className="text-sm font-medium">{t("consumption.monthlyTitle")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {monthly.map((value, index) => (
              <div key={monthLabels[index]}>
                <Label className="text-xs text-muted-foreground">{monthLabels[index]}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => {
                    const next = [...monthly];
                    next[index] = event.target.value;
                    setMonthly(next);
                  }}
                  className="mt-1 h-10"
                />
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-secondary p-4">
            <p className="text-xs text-muted-foreground">{t("consumption.total")}</p>
            <p className="text-2xl font-bold">
              {formatNumber(monthlyTotal, locale)} <span className="text-base">kWh/år</span>
            </p>
          </div>
          {monthlyTotal > 0 && !valid ? (
            <p className="text-sm text-destructive">{t("consumption.invalid")}</p>
          ) : null}
        </div>
      ) : null}
    </StepShell>
  );
}
