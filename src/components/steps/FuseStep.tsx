import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepShell } from "@/components/StepShell";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatDecimal } from "@/lib/format";
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
  const { locale } = useAppLocale();
  const location = useWizardStore((s) => s.location);
  const storedFuse = useWizardStore((s) => s.mainFuseAmp);
  const setMainFuse = useWizardStore((s) => s.setMainFuse);

  const market = getMarketConfig(location?.countryCode);
  const [custom, setCustom] = useState(
    storedFuse !== null && !market.mainFuseOptionsAmp.includes(storedFuse),
  );
  const [customValue, setCustomValue] = useState(custom && storedFuse ? String(storedFuse) : "");

  const selected = custom ? Number(customValue) || 0 : (storedFuse ?? 0);
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
      <div className="card-elevated p-4">
        <Label className="text-sm">{t("fuse.label")}</Label>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
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
                  ? "rounded-xl bg-accent px-3 py-3 font-semibold text-accent-foreground"
                  : "rounded-xl border border-border bg-card px-3 py-3 font-medium transition-colors hover:bg-secondary"
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
                ? "rounded-xl bg-accent px-3 py-3 font-semibold text-accent-foreground"
                : "rounded-xl border border-border bg-card px-3 py-3 font-medium transition-colors hover:bg-secondary"
            }
          >
            {t("fuse.other")}
          </button>
        </div>

        {custom ? (
          <div className="mt-4">
            <Label htmlFor="custom-fuse" className="text-xs text-muted-foreground">
              {t("fuse.otherLabel")}
            </Label>
            <Input
              id="custom-fuse"
              type="number"
              inputMode="numeric"
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              className="mt-1 h-11 w-32"
            />
            {customValue !== "" && !valid ? (
              <p className="mt-2 text-sm text-destructive">{t("fuse.invalid")}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {valid ? (
        <div className="card-elevated flex items-center gap-4 p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
            <Zap className="size-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">{t("fuse.maxAc")}</p>
            <p className="text-2xl font-bold">
              {formatDecimal(maxAc, locale, 2)} <span className="text-base">kW</span>
            </p>
          </div>
        </div>
      ) : null}
    </StepShell>
  );
}
