import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";

interface CompassDialProps {
  /** Compass azimuth in degrees (0=N, 90=E, 180=S, 270=W). */
  value: number;
  onChange: (degrees: number) => void;
  /** Second line under the degrees, e.g. nearest orientation name. */
  caption?: string | undefined;
  disabled?: boolean;
  /** Rendered footprint. "sm" is used in compact layouts. */
  size?: "sm" | "md";
}

const SIZE = 220;
const CENTER = SIZE / 2;
const DIAL_RADIUS = 88;
const ARROW_LENGTH = 72;
const GRIP_RADIUS = 14;
const TICKS = Array.from({ length: 36 }, (_, i) => i * 10);

function angleFromEvent(event: React.PointerEvent, element: SVGSVGElement): number {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  // Compass degrees: 0 = up (north), clockwise.
  return Math.round((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
}

export function CompassDial({
  value,
  onChange,
  caption,
  disabled = false,
  size = "md",
}: CompassDialProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastHapticRef = useRef(0);

  const update = useCallback(
    (event: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || disabled) return;
      const degrees = angleFromEvent(event, svg);
      onChange(degrees);
      const now = Date.now();
      if (now - lastHapticRef.current > 120) {
        lastHapticRef.current = now;
        void haptic("light");
      }
    },
    [onChange, disabled],
  );

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    update(event);
  };

// SVG rotation: 0deg points up; CSS rotate is clockwise — same as compass.
const rad = (value * Math.PI) / 180;
  const arrowBaseX = CENTER - 24 * Math.sin(rad);
  const arrowBaseY = CENTER + 24 * Math.cos(rad);
  // Grip ball sits just beyond the arrow tip; stem ends right before it.
  const gripX = CENTER + (ARROW_LENGTH + 6) * Math.sin(rad);
  const gripY = CENTER - (ARROW_LENGTH + 6) * Math.cos(rad);
  const stemEndX = CENTER + (ARROW_LENGTH - 2) * Math.sin(rad);
  const stemEndY = CENTER - (ARROW_LENGTH - 2) * Math.cos(rad);

  const directions = [
    { label: t("roof.compass.n"), deg: 0 },
    { label: t("roof.compass.e"), deg: 90 },
    { label: t("roof.compass.s"), deg: 180 },
    { label: t("roof.compass.w"), deg: 270 },
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={[
          size === "sm" ? "size-40" : "size-52",
          disabled
            ? "select-none opacity-40"
            : "cursor-grab touch-none select-none active:cursor-grabbing",
        ].join(" ")}
        role="slider"
        aria-label={t("roof.manual")}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={value}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
{/* Outer ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={DIAL_RADIUS}
          className="fill-secondary/60 stroke-border"
          strokeWidth={1.5}
        />
        {/* Faint dashed rotation path — hints the arrow can be dragged around */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={70}
          fill="none"
          className="stroke-muted-foreground/25"
          strokeWidth={1}
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
        {/* Ticks */}
        {TICKS.map((deg) => {
          const major = deg % 90 === 0;
          const rad = (deg * Math.PI) / 180;
          const outer = DIAL_RADIUS - 4;
          const inner = DIAL_RADIUS - (major ? 16 : 10);
          return (
            <line
              key={deg}
              x1={CENTER + inner * Math.sin(rad)}
              y1={CENTER - inner * Math.cos(rad)}
              x2={CENTER + outer * Math.sin(rad)}
              y2={CENTER - outer * Math.cos(rad)}
              className="stroke-muted-foreground/60"
              strokeWidth={major ? 2 : 1}
            />
          );
        })}
        {/* Cardinal labels */}
        {directions.map(({ label, deg }) => {
          const rad = (deg * Math.PI) / 180;
          const r = DIAL_RADIUS - 28;
          return (
            <text
              key={deg}
              x={CENTER + r * Math.sin(rad)}
              y={CENTER - r * Math.cos(rad)}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground text-[11px] font-semibold"
            >
              {label}
            </text>
          );
        })}
{/* Arrow */}
        <line
          x1={arrowBaseX}
          y1={arrowBaseY}
          x2={stemEndX}
          y2={stemEndY}
          className="stroke-accent"
          strokeWidth={4}
          strokeLinecap="round"
        />
        {/* Pulsing halo behind the grip ball — signals it can be dragged */}
        <circle
          cx={gripX}
          cy={gripY}
          r={GRIP_RADIUS + 7}
          className="animate-pulse fill-accent/25"
        />
        {/* Grip ball — the draggable handle at the arrow tip */}
        <circle
          cx={gripX}
          cy={gripY}
          r={GRIP_RADIUS}
          className="fill-card stroke-accent drop-shadow-md"
          strokeWidth={3}
        />
        {/* Drag chevrons inside the grip ball, aligned with the arrow */}
        <g transform={`rotate(${value} ${gripX} ${gripY})`}>
          <path
            d={`M ${gripX - 4} ${gripY - 3} L ${gripX} ${gripY - 7} L ${gripX + 4} ${gripY - 3} M ${gripX - 4} ${gripY + 3} L ${gripX} ${gripY + 7} L ${gripX + 4} ${gripY + 3}`}
            className="stroke-accent"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
        {/* Center hub */}
        <circle cx={CENTER} cy={CENTER} r={14} className="fill-accent" />
        <circle cx={CENTER} cy={CENTER} r={6} className="fill-accent-foreground" />
      </svg>
      <div className="text-center">
        <p className="text-lg font-semibold tabular-nums">{value}°</p>
        {caption ? <p className="text-sm text-muted-foreground">{caption}</p> : null}
      </div>
    </div>
  );
}
