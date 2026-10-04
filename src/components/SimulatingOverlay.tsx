/**
 * Full-screen "Simulerar" overlay shown while the calculation runs and the
 * result page is being prepared — the same feedback as Mr. Battery Doc.
 *
 * The ring animates on the compositor thread (transform only) so it keeps
 * moving even if the main thread stalls. It fills 0 → ~90 % while the work
 * runs, then snaps to 100 % the instant the result is ready.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface SimulatingOverlayProps {
  /** True while the calculation is running. */
  active: boolean;
  /** Set true when the work finished — snaps the ring to 100 %. */
  done: boolean;
}

export function SimulatingOverlay({ active, done }: SimulatingOverlayProps) {
  const { t } = useTranslation();
  // Keep the overlay mounted through the completion flash so the ring can
  // visibly reach 100 % before the navigation swaps the page.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) setVisible(true);
    if (done) {
      const id = window.setTimeout(() => setVisible(false), 520);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [active, done]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background motion-reduce:hidden"
      role="status"
      aria-live="polite"
      aria-label={t("common.simulating")}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="radial-ring" aria-hidden="true">
          <div className="radial-track" />
          <div className="radial-fill-wrap">
            <div className={`radial-fill ${done ? "is-done" : ""}`} />
          </div>
          <div className="radial-mask-wrap">
            <div className={`radial-mask ${done ? "is-done" : ""}`} />
          </div>
          <div className="radial-inset">
            <span className="text-[1.05rem] font-bold tracking-[-0.02em] text-foreground">
              {t("common.simulating")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
