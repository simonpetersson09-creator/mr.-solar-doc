import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adsSupported, canOpenPrivacyForm, getAdPrivacyState, openPrivacyOptions, privacyDiagnosticsAvailable, type AdPrivacyState } from "@/services/app-open-ad";
import { getPrivacyDiagnostics, subscribePrivacyDiagnostics, PRIVACY_DIAGNOSTICS_VERSION } from "@/services/ad-privacy-diagnostics";

/** Read-only native snapshots; failed reads retain the last successful timestamp. */
export function AdPrivacyButton() {
  const { t } = useTranslation();
  const [state, setState] = useState<AdPrivacyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const [formFailed, setFormFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [diagnostics, setDiagnostics] = useState(getPrivacyDiagnostics);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => undefined;
    void privacyDiagnosticsAvailable().then((available) => {
      if (!active || !available) return;
      setShowDiagnostics(true);
      setDiagnostics(getPrivacyDiagnostics());
      unsubscribe = subscribePrivacyDiagnostics(() => setDiagnostics(getPrivacyDiagnostics()));
    }).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, []);

  const refresh = useCallback(async (update = false) => {
    try {
      const next = await getAdPrivacyState(update);
      if (next) setState(next);
      if (update) setUpdateFailed(next?.updateFailed === true);
      setFailed(!next && adsSupported());
    } catch { setFailed(true); }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("adprivacyrefresh", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("adprivacyrefresh", onVisible);
    };
  }, [refresh]);

  if (!adsSupported()) return null;

  async function action(change: boolean) {
    if (busy) return;
    setBusy(true);
    setFormFailed(false);
    try {
      if (change) await openPrivacyOptions();
      await refresh(!change);
    } catch {
      // A presentation error is not a consent-read failure. Read current native
      // choices independently and retain them whenever that read succeeds.
      await refresh();
      setFormFailed(true);
    }
    finally { setBusy(false); }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-brand-black/10 bg-brand-black/5">
      <Button variant="ghost" aria-expanded={expanded} aria-controls="saved-ad-choices" className="h-auto min-h-11 w-full justify-start rounded-none px-3.5 py-3 text-left" onClick={() => { setExpanded((open) => !open); void refresh(); }}>
        <ShieldCheck className="size-4 shrink-0" />
        <span className="flex-1 whitespace-normal text-xs font-semibold">{t("settings.adsPrivacyTitle")}</span>
        <ChevronRight className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`} />
      </Button>
      {expanded && <div id="saved-ad-choices" className="border-t border-brand-black/10">
      <div className="space-y-3 px-3.5 py-3" aria-live="polite">
      <h3 className="text-xs font-semibold text-brand-black">{t("settings.adsSavedChoices")}</h3>
      <dl className="space-y-3">
        {([
          ["adsStorage", state?.choices.storage],
          ["adsProfile", state?.choices.adProfile],
          ["adsUseProfile", state?.choices.useAdProfile],
        ] as const).map(([label, choice]) => (
          <div key={label} className="flex items-start gap-3 text-xs">
            <dt className="min-w-0 flex-1 text-brand-black">{t(`settings.${label}`)}</dt>
            <dd className="max-w-[40%] break-words text-right font-semibold text-brand-black/70">{t(`settings.${failed || !choice || choice === "unknown" ? "adsChoiceUnknown" : choice === "allowed" ? "adsChoiceAllowed" : "adsChoiceDenied"}`)}</dd>
          </div>
        ))}
      </dl>
      {failed && <p role="alert" className="text-xs text-destructive">{t("settings.adsReadFailed")}</p>}
      {updateFailed && <p role="alert" className="text-xs text-destructive">{t("settings.adsUpdateFailed")}</p>}
      {formFailed && <p role="alert" className="text-xs text-destructive">{t("settings.adsFormFailed")}</p>}
      {showDiagnostics && (failed || updateFailed || formFailed) && diagnostics.length > 0 && <details className="text-xs text-brand-black/70">
        <summary className="cursor-pointer">{t("settings.adsDiagnostics", { defaultValue: "Diagnostik / Diagnostics" })}</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs">{PRIVACY_DIAGNOSTICS_VERSION}{"\n"}{diagnostics.map((entry) => `${entry.step}: ${entry.outcome}${entry.code === undefined ? "" : ` | code=${entry.code}`}${entry.reason ? ` | ${entry.reason}` : ""}`).join("\n")}</pre>
      </details>}
      {!canOpenPrivacyForm(state) && <p className="text-xs text-brand-black/60">{t("settings.adsOptionsUnavailable")}</p>}
      </div>
      <div className="flex flex-col">
        <Button variant="ghost" disabled={busy || !canOpenPrivacyForm(state)} className="h-auto min-h-11 justify-start rounded-none border-t border-brand-black/10 px-3.5 py-2.5 text-left" onClick={() => void action(true)}>
          <ShieldCheck className="size-4 shrink-0" /> <span className="flex-1 whitespace-normal text-xs">{t("settings.adsViewOrChange")}</span><ChevronRight className="size-4 shrink-0" />
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} className="h-auto min-h-9 justify-start whitespace-normal rounded-none px-3.5 text-left" onClick={() => void action(false)}>
          {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3 shrink-0" />} {t("settings.adsRefreshStatus")}
        </Button>
      </div>
      </div>}
    </section>
  );
}

