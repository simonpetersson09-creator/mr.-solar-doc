import { useTranslation } from "react-i18next";
import type { ConsumptionShape } from "@/lib/calc/consumption-shape";
import { getShapeWeights } from "@/lib/calc/consumption-shape";
import { cn } from "@/lib/utils";

const SHAPES: ConsumptionShape[] = ["even", "winter-heavy", "summer-heavy", "default"];

/** Tiny 12-bar sparkline that makes the difference between shapes obvious. */
function MiniShape({
  shape,
  active,
  marketDefaultWeights,
  onDark,
}: {
  shape: ConsumptionShape;
  active: boolean;
  marketDefaultWeights?: number[] | null | undefined;
  onDark?: boolean;
}) {
  const weights = getShapeWeights(shape, marketDefaultWeights);
  const max = Math.max(...weights, 0.0001);
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-hidden="true">
      {weights.map((w, index) => (
        <span
          key={index}
          className={cn(
            "w-1 rounded-t-[2px] transition-colors",
            active ? "bg-accent" : onDark ? "bg-white/35" : "bg-muted-foreground/40",
          )}
          style={{ height: `${Math.max((w / max) * 100, 12)}%` }}
        />
      ))}
    </div>
  );
}

interface ConsumptionShapePickerProps {
  value: ConsumptionShape;
  onChange: (shape: ConsumptionShape) => void;
  marketDefaultWeights?: number[] | null | undefined;
  /** Renders the frosted-white variant for the forest-green glass cards. */
  onDark?: boolean;
}

export function ConsumptionShapePicker({
  value,
  onChange,
  marketDefaultWeights,
  onDark = false,
}: ConsumptionShapePickerProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {SHAPES.map((shape) => {
        const active = value === shape;
        return (
          <button
            key={shape}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(shape)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-2.5 text-left transition-all",
              active
                ? onDark
                  ? "border-accent/60 bg-white/15 shadow-md shadow-black/20"
                  : "border-primary/50 bg-primary/5 shadow-sm"
                : onDark
                  ? "border-white/20 bg-white/5 hover:border-white/40"
                  : "border-border bg-card hover:border-primary/30",
            )}
          >
            <MiniShape
              shape={shape}
              active={active}
              marketDefaultWeights={marketDefaultWeights}
              onDark={onDark}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-xs font-medium",
                  onDark && (active ? "text-white" : "text-white/85"),
                )}
              >
                {t(`consumption.shape.${shape}.title`)}
              </span>
              <span
                className={cn(
                  "block text-[11px] leading-snug",
                  onDark ? "text-white/60" : "text-muted-foreground",
                )}
              >
                {t(`consumption.shape.${shape}.description`)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}