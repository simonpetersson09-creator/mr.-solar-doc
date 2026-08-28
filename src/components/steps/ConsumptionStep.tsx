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
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <FileUp className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("consumption.upload.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("consumption.upload.description")}
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv,.txt,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <Button
          variant="outline"
          className="w-full"
          disabled={parsing}
          onClick={() => fileInputRef.current?.click()}
        >
          {parsing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("consumption.upload.loading")}
            </>
          ) : (
            t("consumption.upload.button")
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {fileName ?? t("consumption.upload.fileTypes")}
        </p>
        {parseStatus === "monthly" || parseStatus === "annual" ? (
          <p className="text-sm text-primary">
            {t(
              parseStatus === "monthly"
                ? "consumption.upload.successMonthly"
                : "consumption.upload.successAnnual",
            )}
          </p>
        ) : null}
        {parseStatus === "error" ? (
          <p className="text-sm text-destructive">{t("consumption.upload.error")}</p>
        ) : null}
      </div>

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
