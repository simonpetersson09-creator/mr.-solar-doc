import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { haptic } from "@/services/native-service";

interface TiltDialProps {
  /** Roof tilt in degrees, 0 (flat) – 90 (vertical). */
  value: number;
  onChange: (degrees: number) => void;
  disabled?: boolean;
}

const WIDTH = 176;
const HEIGHT = 128;
const PIVOT_X = 26;
const PIVOT_Y = 110;
const ARM = 90;
const GRIP_RADIUS = 11;
const MAX_TILT = 90;
const TICKS = [0, 15, 30, 45, 60, 75, 90];

function clamp(value: number): number {
  return Math.min(MAX_TILT, Math.max(0, value));
}

function pointOnArm(degrees: number, length: number) {
  const rad = (degrees * Math.PI) / 180;
  return {
    x: PIVOT_X + length * Math.cos(rad),
    y: PIVOT_Y - length * Math.sin(rad),
  };
}

export function TiltDial({ value, onChange, disabled = false }: TiltDialProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastHapticRef = useRef(0);

  const update = useCallback(
    (event: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || disabled) return;
      const rect = svg.getBoundingClientRect();
      // Map the pointer into the SVG's own coordinate space.
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH - PIVOT_X;
      const y = PIVOT_Y - ((event.clientY - rect.top) / rect.height) * HEIGHT;
      const degrees = clamp(Math.round((Math.atan2(y, Math.max(x, 1)) * 180) / Math.PI));
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

  const safeValue = clamp(value || 0);
  const grip = pointOnArm(safeValue, ARM + 4);
  const armEnd = pointOnArm(safeValue, ARM - 4);
  const arcRadius = 40;
  const arcStart = pointOnArm(0, arcRadius);
  const arcEnd = pointOnArm(safeValue, arcRadius);
  const labelPoint = pointOnArm(safeValue / 2, arcRadius + 14);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={[
          "w-full max-w-[200px]",
          disabled
            ? "select-none opacity-40"
            : "cursor-grab touch-none select-none active:cursor-grabbing",
        ].join(" ")}
        role="slider"
        aria-label={t("roof.tilt")}
        aria-valuemin={0}
        aria-valuemax={MAX_TILT}
        aria-valuenow={safeValue}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        {/* Tick guides along the swing path */}
        {TICKS.map((tick) => {
          const inner = pointOnArm(tick, ARM - 16);
          const outer = pointOnArm(tick, ARM - 4);
          return (
            <line
              key={tick}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="stroke-white/35"
              strokeWidth={tick % 45 === 0 ? 2 : 1}
            />
          );
        })}

        {/* Ground / horizontal reference */}
        <line
          x1={PIVOT_X - 10}
          y1={PIVOT_Y}
          x2={PIVOT_X + ARM + 6}
          y2={PIVOT_Y}
          className="stroke-white/40"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Roof surface fill between ground and the tilted line */}
        <path
          d={`M ${PIVOT_X} ${PIVOT_Y} L ${armEnd.x} ${armEnd.y} L ${armEnd.x} ${PIVOT_Y} Z`}
          className="fill-white/10"
        />

        {/* Angle arc */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${arcRadius} ${arcRadius} 0 0 0 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          className="stroke-accent/70"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <text
          x={labelPoint.x}
          y={labelPoint.y}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white/80 text-[11px] font-semibold"
        >
          {safeValue}°
        </text>

        {/* Roof line */}
        <line
          x1={PIVOT_X}
          y1={PIVOT_Y}
          x2={armEnd.x}
          y2={armEnd.y}
          className="stroke-accent"
          strokeWidth={5}
          strokeLinecap="round"
        />

        {/* Pulsing halo behind the grip — signals it can be dragged */}
        <circle cx={grip.x} cy={grip.y} r={GRIP_RADIUS + 5} className="animate-pulse fill-accent/25" />
        <circle
          cx={grip.x}
          cy={grip.y}
          r={GRIP_RADIUS}
          className="fill-white stroke-accent drop-shadow-md"
          strokeWidth={3}
        />
        {/* Chevrons hinting the up/down swing */}
        <g transform={`rotate(${-safeValue} ${grip.x} ${grip.y})`}>
          <path
            d={`M ${grip.x - 4} ${grip.y - 3} L ${grip.x} ${grip.y - 7} L ${grip.x + 4} ${grip.y - 3} M ${grip.x - 4} ${grip.y + 3} L ${grip.x} ${grip.y + 7} L ${grip.x + 4} ${grip.y + 3}`}
            className="stroke-accent"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* Pivot hub */}
        <circle cx={PIVOT_X} cy={PIVOT_Y} r={9} className="fill-accent" />
        <circle cx={PIVOT_X} cy={PIVOT_Y} r={4} className="fill-accent-foreground" />
      </svg>
      <p className="text-lg font-semibold tabular-nums text-white">{safeValue}°</p>
    </div>
  );
}
