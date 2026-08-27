import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepShell } from "@/components/StepShell";
import { useSolarResource } from "@/hooks/use-solar-resource";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatNumber } from "@/lib/format";
import { useWizardStore } from "@/state/wizard-store";
import { haptic } from "@/services/native-service";
import type { Orientation } from "@/lib/calc/types";
import { useEffect } from "react";

const ORIENTATIONS: Orientation[] = ["unknown", "south", "southeast", "southwest", "east", "west"];

interface RoofStepProps {
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
}

export function RoofStep({ totalSteps, onBack, onNext }: RoofStepProps) {
  const { t } = useTranslation();
  const { locale } = useAppLocale();
  const location = useWizardStore((s) => s.location);
  const orientation = useWizardStore((s) => s.orientation);
  const tiltDegrees = useWizardStore((s) => s.tiltDegrees);
  const setRoof = useWizardStore((s) => s.setRoof);
  const setResource = useWizardStore((s) => s.setResource);

  const query = useSolarResource({
    latitude: location?.latitude,
    longitude: location?.longitude,
    orientation,
    tiltDegrees,
  });

  useEffect(() => {
    setResource(query.data ?? null);
  }, [query.data, setResource]);

  const assumed = orientation === "unknown" || tiltDegrees === null;

  return (
    <StepShell
      step={2}
      totalSteps={totalSteps}
      title={t("roof.title")}
      subtitle={t("roof.subtitle")}
      onBack={onBack}
      footer={
        <Button
          className="w-full"
          size="lg"
          disabled={!query.data}
          onClick={() => {
            void haptic("medium");
            onNext();
          }}
        >
          {t("common.next")}
        </Button>
      }
    >
      <div className="card-elevated space-y-4 p-4">
        <div>
          <Label className="text-sm">{t("roof.orientation")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ORIENTATIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  void haptic("light");
                  setRoof(option, tiltDegrees);
                }}
                className={
                  option === orientation
                    ? "rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                    : "rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-secondary"
                }
              >
                {t(`roof.orientations.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm">{t("roof.tilt")}</Label>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void haptic("light");
                setRoof(orientation, null);
              }}
              className={
                tiltDegrees === null
                  ? "rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                  : "rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-secondary"
              }
            >
              {t("common.dontKnow")}
            </button>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={90}
                value={tiltDegrees ?? ""}
                placeholder={t("roof.tiltDegrees")}
                onChange={(event) => {
                  const value = event.target.value;
                  setRoof(orientation, value === "" ? null : Number(value));
                }}
                className="h-10 w-28"
              />
              <span className="text-sm text-muted-foreground">°</span>
            </div>
          </div>
        </div>
      </div>

      {assumed ? (
        <div className="flex gap-3 rounded-xl border border-border bg-secondary p-4 text-sm text-secondary-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />
          <p>{t("roof.assumptionNotice")}</p>
        </div>
      ) : null}

      {query.isPending ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("roof.fetching")}
        </div>
      ) : null}

      {query.isError ? (
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{t("roof.error")}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : null}

      {query.data ? (
        <div className="hero-metric rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sun className="size-4" />
            {t("roof.result")}
          </div>
          <p className="mt-2 text-4xl font-bold">
            {formatNumber(query.data.annualKwhPerKwp, locale)}
          </p>
          <p className="text-sm">{t("roof.unit")}</p>
          <p className="mt-3 text-xs opacity-80">{query.data.dataSource}</p>
        </div>
      ) : null}
    </StepShell>
  );
}
