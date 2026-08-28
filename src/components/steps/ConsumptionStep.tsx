import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Loader2 } from "lucide-react";
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<"monthly" | "annual" | "error" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setParseStatus(null);
    setFileName(file.name);
    try {
      const { readConsumptionFile } = await import("@/lib/read-consumption-file");
      const parsed = await readConsumptionFile(file);
      if (parsed.monthly) {
        setMonthly(parsed.monthly.map((value) => String(Math.round(value))));
        setUseMonthly(true);
        setAnnual(String(parsed.annual ?? Math.round(sumMonthly(parsed.monthly))));
        setParseStatus("monthly");
        void haptic("medium");
      } else if (parsed.annual) {
        setUseMonthly(false);
        setAnnual(String(Math.round(parsed.annual)));
        setParseStatus("annual");
        void haptic("light");
      } else {
        setParseStatus("error");
      }
    } catch {
      setParseStatus("error");
    } finally {
      setParsing(false);
    }
  };

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
      <div className="card-elevated space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <FileUp className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("consumption.upload.title")}</p>
            <p className="truncate text-xs text-muted-foreground">
              {fileName ?? t("consumption.upload.fileTypes")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={parsing}
            onClick={() => fileInputRef.current?.click()}
          >
            {parsing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("consumption.upload.button")
            )}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv,.txt,application/pdf,image/*,.png,.jpg,.jpeg,.webp,.heic"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        {parseStatus === "monthly" || parseStatus === "annual" ? (
          <p className="text-xs text-primary">
            {t(
              parseStatus === "monthly"
                ? "consumption.upload.successMonthly"
                : "consumption.upload.successAnnual",
            )}
          </p>
        ) : null}
        {parseStatus === "error" ? (
          <p className="text-xs text-destructive">{t("consumption.upload.error")}</p>
        ) : null}
      </div>

      <div className="card-elevated space-y-3 p-4">
        {!useMonthly ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="annual" className="text-xs text-muted-foreground">
                {t("consumption.annual")}
              </Label>
              <Input
                id="annual"
                type="number"
                inputMode="numeric"
                value={annual}
                placeholder={t("consumption.annualPlaceholder")}
                onChange={(event) => setAnnual(event.target.value)}
                className="mt-1 h-11 text-base"
              />
            </div>
            <span className="pb-3 text-xs text-muted-foreground">kWh/år</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-border pt-3 first:border-0 first:pt-0">
          <Label htmlFor="monthly-toggle" className="text-xs leading-snug">
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
          <div className="space-y-3 border-t border-border pt-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {monthly.map((value, index) => (
                <div key={monthLabels[index]}>
                  <Label className="text-[10px] text-muted-foreground">
                    {monthLabels[index]}
                  </Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={value}
                    onChange={(event) => {
                      const next = [...monthly];
                      next[index] = event.target.value;
                      setMonthly(next);
                    }}
                    className="mt-0.5 h-9 px-2 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-baseline justify-between rounded-xl bg-secondary px-3 py-2">
              <p className="text-xs text-muted-foreground">{t("consumption.total")}</p>
              <p className="text-lg font-bold">
                {formatNumber(monthlyTotal, locale)}{" "}
                <span className="text-xs font-normal">kWh/år</span>
              </p>
            </div>
          </div>
        ) : null}

        {((useMonthly && monthlyTotal > 0) || (!useMonthly && annual !== "")) && !valid ? (
          <p className="text-xs text-destructive">{t("consumption.invalid")}</p>
        ) : null}
      </div>
    </StepShell>
  );
}
