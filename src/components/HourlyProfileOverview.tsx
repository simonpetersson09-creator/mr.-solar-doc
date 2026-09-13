import { useTranslation } from "react-i18next";
import { DAILY_WEIGHTS, dailyPercentages, type HourlyProfile } from "@/lib/calc/hourly-comparison";

const PROFILES: HourlyProfile[] = ["evening", "mixed", "daytime", "even"];

function profileLabel(profile: HourlyProfile, t: (key: string) => string): string {
  return profile === "even" ? t("hourly.uniform") : t(`result.loadProfile.${profile}`);
}

function curvePoints(profile: HourlyProfile): string {
  const values = DAILY_WEIGHTS[profile];
  const max = Math.max(...values, 1);
  return values
    .map((value, hour) => `${(hour / 23) * 100},${36 - (value / max) * 30}`)
    .join(" ");
}

export function HourlyProfileOverview({ selected }: { selected: HourlyProfile }) {
  const { t, i18n } = useTranslation();
  const percentages = Object.fromEntries(
    PROFILES.map((profile) => [profile, dailyPercentages(profile)]),
  ) as Record<HourlyProfile, number[]>;
  const percent = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4" aria-label={t("hourly.profileOverview")}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("hourly.profileOverview")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("hourly.profileAssumption")}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3" role="img" aria-label={t("hourly.profileChartAria")}>
        {PROFILES.map((profile) => (
          <div key={profile} className={profile === selected ? "text-primary" : "text-muted-foreground"}>
            <p className="mb-1 truncate text-xs font-semibold">{profileLabel(profile, t)}</p>
            <svg viewBox="0 0 100 40" className="h-14 w-full overflow-visible" aria-hidden="true">
              <path d="M0 36H100" className="stroke-border" strokeWidth="1" />
              <polyline
                points={curvePoints(profile)}
                fill="none"
                stroke="currentColor"
                strokeWidth={profile === selected ? 2.5 : 1.75}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="flex justify-between text-[9px] tabular-nums text-muted-foreground">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
            </div>
          </div>
        ))}
      </div>

      <dl className="divide-y divide-border border-y border-border text-xs">
        {PROFILES.map((profile) => (
          <div key={profile} className="py-2">
            <dt className="font-semibold text-foreground">{profileLabel(profile, t)}</dt>
            <dd className="mt-0.5 leading-relaxed text-muted-foreground">{t(`hourly.profileDescription.${profile}`)}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto">
        <table className="min-w-[34rem] w-full text-xs tabular-nums">
          <caption className="mb-2 text-start font-semibold text-foreground">{t("hourly.profileTable")}</caption>
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 text-start font-medium">{t("hourly.hour")}</th>
              {PROFILES.map((profile) => <th key={profile} className="px-2 py-2 text-end font-medium">{profileLabel(profile, t)}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 24 }, (_, hour) => (
              <tr key={hour} className="border-b border-border/60">
                <th className="py-1.5 text-start font-normal">{String(hour).padStart(2, "0")}</th>
                {PROFILES.map((profile) => <td key={profile} className="px-2 py-1.5 text-end">{percent(percentages[profile][hour] ?? 0)} %</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-foreground">
              <th className="pt-2 text-start">{t("hourly.total")}</th>
              {PROFILES.map((profile) => <td key={profile} className="px-2 pt-2 text-end">{percent(percentages[profile].reduce((sum, value) => sum + value, 0))} %</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}