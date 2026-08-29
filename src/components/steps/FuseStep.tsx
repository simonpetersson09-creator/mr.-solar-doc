import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Info, Zap } from "lucide-react";
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

  const chipClass = (active: boolean) =>
    active
      ? "rounded-xl bg-accent px-2 py-2 text-xs font-bold text-accent-foreground shadow-md shadow-accent/30"
      : "rounded-xl border border-white/25 bg-white/15 px-2 py-2 text-xs font-medium text-white transition-colors hover:bg-white/25";

  return (
    <StepShell
      step={4}
      totalSteps={totalSteps}
title={t("fuse.title")}
      onBack={onBack}
      footer={
        <Button
          className="h-auto w-full rounded-[24px] py-4 text-base font-bold shadow-cta"
          size="lg"
          disabled={!valid}
          onClick={() => {
            void haptic("success");
            setMainFuse(selected);
            onSubmit();
          }}
        >
          {t("fuse.calculate")}
          <ArrowRight className="size-4 text-accent" />
        </Button>
      }
    >
      <div className="glass-primary space-y-3 rounded-[28px] px-4 py-4">
        <div>
          <Label className="text-xs text-white">{t("fuse.label")}</Label>
          <p className="text-[11px] text-white/70">{t("fuse.subtitle")}</p>
        </div>

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
              className={chipClass(!custom && storedFuse === amp)}
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
            className={chipClass(custom)}
          >
            {t("fuse.other")}
          </button>
        </div>

        {custom ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-fuse" className="text-xs text-white/70">
              {t("fuse.otherLabel")}
            </Label>
            <Input
              id="custom-fuse"
              type="text"
              inputMode="decimal"
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              className="h-8 w-20 rounded-full border-white/25 bg-white/15 text-xs text-white placeholder:text-white/50"
            />
            <span className="text-xs text-white/60">A</span>
          </div>
        ) : null}

        {custom && customValue !== "" && !valid ? (
          <p className="text-xs text-red-200">{t("fuse.invalid")}</p>
        ) : null}

        {valid ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-xs text-white/60">
              <Zap className="size-3.5 text-accent" />
              {t("fuse.maxAc")}
            </span>
            <span className="text-base font-bold text-white">
              {formatDecimal(maxAc, locale, 2)}{" "}
              <span className="text-[11px] font-normal text-white/60">kW</span>
            </span>
          </div>
        ) : null}

        <div className="border-t border-white/15 pt-3">
          <button
            type="button"
            onClick={() => setShowGridInfo((open) => !open)}
            className="flex items-start gap-2 text-left text-xs text-white/60"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("fuse.gridAssumption")}</span>
          </button>
          {showGridInfo ? (
            <p className="mt-2 pl-5 text-[11px] leading-relaxed text-white/60">
              {t("fuse.gridAssumptionInfo")}
            </p>
          ) : null}
        </div>
      </div>
    </StepShell>
  );
}