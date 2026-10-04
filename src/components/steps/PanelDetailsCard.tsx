import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, PanelTop } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWizardStore } from "@/state/wizard-store";
import { useAppLocale } from "@/hooks/use-app-locale";
import { parseLocaleNumber, sanitizeNumericInput } from "@/lib/numeric-input";
import { cn } from "@/lib/utils";

const MIN_A = 30;
const MAX_A = 1000;

function chip(active: boolean) {
  return cn(
    "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
    active
      ? "border-accent bg-accent text-accent-foreground"
      : "border-white/25 bg-white/10 text-white/80",
  );
}

function AmpField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const { t } = useTranslation();
  const { locale } = useAppLocale();
  const [text, setText] = useState(value == null ? "" : String(value));
  const parsed = parseLocaleNumber(text, locale);
  const invalid = text !== "" && (parsed === null || parsed < MIN_A || parsed > MAX_A);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-white/80">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={t("fuse.panel.placeholder")}
          onChange={(event) => {
            const raw = sanitizeNumericInput(event.target.value);
            setText(raw);
            const n = parseLocaleNumber(raw, locale);
            onChange(n !== null && n >= MIN_A && n <= MAX_A ? n : null);
          }}
          className="h-8 w-20 rounded-full border-white/25 bg-white/15 text-xs text-white placeholder:text-white/50"
        />
        <span className="text-xs text-white/60">A</span>
        <button
          type="button"
          className={chip(value == null && text === "")}
          onClick={() => {
            setText("");
            onChange(null);
          }}
        >
          {t("fuse.panel.dontKnow")}
        </button>
      </div>
      {invalid ? (
        <p className="text-xs text-red-200">{t("fuse.panel.invalid", { min: MIN_A, max: MAX_A })}</p>
      ) : null}
    </div>
  );
}

/**
 * US/CA only: the panel the PV connects to, which may differ from the home's
 * total service. Standard mode shows only the assumption note; the fields are
 * optional and "Don't know" keeps the preliminary assumption.
 */
export function PanelDetailsCard() {
  const { t } = useTranslation();
  const panelMainBreakerA = useWizardStore((s) => s.panelMainBreakerA);
  const busbarRatingA = useWizardStore((s) => s.busbarRatingA);
  const setPanelDetails = useWizardStore((s) => s.setPanelDetails);
  const [open, setOpen] = useState(panelMainBreakerA != null || busbarRatingA != null);

  return (
    <div className="glass-primary space-y-2.5 rounded-[28px] px-4 py-3.5">
      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-white/75">
        <PanelTop className="mt-0.5 size-3.5 shrink-0 text-accent" />
        <span>{t("fuse.panel.standardNote")}</span>
      </p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-semibold text-white"
      >
        {t("fuse.panel.title")}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-3">
          <p className="text-[11px] leading-relaxed text-white/70">{t("fuse.panel.help")}</p>
          <AmpField
            id="panel-main-breaker"
            label={t("fuse.panel.mainBreaker")}
            value={panelMainBreakerA}
            onChange={(n) => setPanelDetails({ panelMainBreakerA: n })}
          />
          <AmpField
            id="panel-busbar"
            label={t("fuse.panel.busbar")}
            value={busbarRatingA}
            onChange={(n) => setPanelDetails({ busbarRatingA: n })}
          />
        </div>
      ) : null}
    </div>
  );
}
