import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepShell } from "@/components/StepShell";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatDecimal, parseLocaleNumber } from "@/lib/format";
import { getMarketConfig } from "@/config/markets";
import { maxAcPowerFromFuse } from "@/lib/calc/inverter-sizing";
import { useWizardStore } from "@/state/wizard-store";
import { haptic } from "@/services/native-service";

interface FuseStepProps {
  totalSteps: number;
  onBack: () => void;
  onSubmit: () => void;
}

const MIN_AMP = 6;
const MAX_AMP = 400;

export function FuseStep({ totalSteps, onBack, onSubmit }: FuseStepProps) {
  const { t } = useTranslation();
  const [showGridInfo, setShowGridInfo] = useState(false);
  const { locale } = useAppLocale();
  const location = useWizardStore((s) => s.location);
  const storedFuse = useWizardStore((s) => s.mainFuseAmp);
  const setMainFuse = useWizardStore((s) => s.setMainFuse);

  const market = getMarketConfig(location?.countryCode);
  const [custom, setCustom] = useState(
    storedFuse !== null && !market.mainFuseOptionsAmp.includes(storedFuse),
  );
  const [customValue, setCustomValue] = useState(custom && storedFuse ? String(storedFuse) : "");

  const selected = custom ? (parseLocaleNumber(customValue) ?? 0) : (storedFuse ?? 0);
  const valid = selected >= MIN_AMP && selected <= MAX_AMP;
  const maxAc = maxAcPowerFromFuse(selected, market.kwPerAmp);

  return (
    <StepShell
      step={4}
      totalSteps={totalSteps}
      title={t("fuse.title")}
      subtitle={t("fuse.subtitle")}
      onBack={onBack}
      footer={
        <Button
          className="w-full"
          size="lg"
          disabled={!valid}
          onClick={() => {
            void haptic("success");
            setMainFuse(selected);
            onSubmit();
          }}
        >
          {t("fuse.calculate")}
        </Button>
      }
    >
      <div className="card-elevated space-y-2.5 p-3.5">
        <Label className="text-xs text-muted-foreground">{t("fuse.label")}</Label>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
          {market.mainFuseOptionsAmp.map((amp) => (
            <button
              key={amp}
              type="button"
              onClick={() => {
                void haptic("light");
                setCustom(false);
                setMainFuse(amp);
              }}
              className={
                !custom && storedFuse === amp
                  ? "rounded-lg bg-accent px-2 py-2 text-[13px] font-semibold text-accent-foreground"
                  : "rounded-lg border border-border bg-card px-2 py-2 text-[13px] font-medium transition-colors hover:bg-secondary"
              }
            >
              {amp} A
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              void haptic("light");
              setCustom(true);
            }}
            className={
              custom
                ? "rounded-lg bg-accent px-2 py-2 text-[13px] font-semibold text-accent-foreground"
                : "rounded-lg border border-border bg-card px-2 py-2 text-[13px] font-medium transition-colors hover:bg-secondary"
            }
          >
            {t("fuse.other")}
          </button>
        </div>

        {custom ? (
          <div className="flex items-center gap-2 border-t border-border pt-2.5">
            <Label htmlFor="custom-fuse" className="text-xs text-muted-foreground">
              {t("fuse.otherLabel")}
            </Label>
            <Input
              id="custom-fuse"
              type="text"
              inputMode="decimal"
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              className="h-9 w-24"
            />
            <span className="text-xs text-muted-foreground">A</span>
          </div>
        ) : null}

        {custom && customValue !== "" && !valid ? (
          <p className="text-xs text-destructive">{t("fuse.invalid")}</p>
        ) : null}

        {valid ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="size-3.5 text-accent" />
              {t("fuse.maxAc")}
            </span>
            <span className="text-base font-bold">
              {formatDecimal(maxAc, locale, 2)} <span className="text-[11px] font-normal">kW</span>
            </span>
          </div>
        ) : null}

        <div className="border-t border-border pt-2.5">
          <button
            type="button"
            onClick={() => setShowGridInfo((open) => !open)}
            className="flex items-start gap-2 text-left text-xs text-muted-foreground"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("fuse.gridAssumption")}</span>
          </button>
          {showGridInfo ? (
            <p className="mt-2 pl-5 text-xs leading-relaxed text-muted-foreground">
              {t("fuse.gridAssumptionInfo")}
            </p>
          ) : null}
        </div>
      </div>
    </StepShell>
  );
}
