import { createFileRoute, useNavigate } from "@tanstack/react-router";
import i18n from "@/i18n";
import { toast } from "sonner";
import { AddressStep } from "@/components/steps/AddressStep";
import { RoofStep } from "@/components/steps/RoofStep";
import { ConsumptionStep } from "@/components/steps/ConsumptionStep";
import { FuseStep } from "@/components/steps/FuseStep";
import { AssumptionsStep } from "@/components/steps/AssumptionsStep";
import { useCreatePendingCalculation } from "@/hooks/use-create-pending-calculation";
import { usePurchaseStore } from "@/state/purchase-store";
import { useWizardStore } from "@/state/wizard-store";
import { isValidConnectionCapacity } from "@/config/connection-capacity";
import { isDevUnlock } from "@/lib/dev-unlock";
import { WelcomePage } from "@/components/WelcomePage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: i18n.t("meta.home.title") },
      { name: "description", content: i18n.t("meta.home.description") },
      { property: "og:title", content: i18n.t("meta.home.title") },
      { property: "og:description", content: i18n.t("meta.home.ogDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WizardPage,
});

const TOTAL_STEPS = 5;

function WizardPage() {
  const navigate = useNavigate();
  const createPending = useCreatePendingCalculation();
  const hasStarted = useWizardStore((s) => s.hasStarted);
  const setStarted = useWizardStore((s) => s.setStarted);
  // Country never drives the UI language; only technical/economic profiles.
  const persistedStep = useWizardStore((s) => s.currentStep);
  const setStep = useWizardStore((s) => s.setCurrentStep);
  const location = useWizardStore((s) => s.location);
  const tiltDegrees = useWizardStore((s) => s.tiltDegrees);
  const resource = useWizardStore((s) => s.resource);
  const annualConsumptionKwh = useWizardStore((s) => s.annualConsumptionKwh);
  const connectionCapacity = useWizardStore((s) => s.connectionCapacity);

  // Never resume past the first step that still lacks data — otherwise a
  // returning user lands on step 5 and gets an empty result page.
  // The cached solar resource counts as step 2 data: a storage migration can
  // drop it, and without it the engine silently produces no result.
  const maxReachableStep = !location
    ? 1
    : tiltDegrees === null || !resource
      ? 2
      : !annualConsumptionKwh
        ? 3
        : !isValidConnectionCapacity(connectionCapacity)
          ? 4
          : 5;
  const step = Math.min(persistedStep, maxReachableStep);


  if (!hasStarted) {
    return <WelcomePage onStart={() => setStarted(true)} />;
  }

  if (step === 1) {
    return <AddressStep totalSteps={TOTAL_STEPS} onNext={() => setStep(2)} />;
  }
  if (step === 2) {
    return (
      <RoofStep totalSteps={TOTAL_STEPS} onBack={() => setStep(1)} onNext={() => setStep(3)} />
    );
  }
  if (step === 3) {
    return (
      <ConsumptionStep
        totalSteps={TOTAL_STEPS}
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
      />
    );
  }
  if (step === 4) {
    return (
      <FuseStep
        totalSteps={TOTAL_STEPS}
        onBack={() => setStep(3)}
        onSubmit={() => setStep(5)}
      />
    );
  }
  return (
    <AssumptionsStep
      totalSteps={TOTAL_STEPS}
      onBack={() => setStep(4)}
      onSubmit={() => {
        void (async () => {
          const created = await createPending();
          if (!created.ok) {
            // The engine had no usable result (e.g. the cached solar data was
            // dropped): say so instead of leaving a dead button.
            toast.error(i18n.t("result.calculationUnavailable"));
            return;
          }
          // A free recalculation on an already paid calculation opens directly.
          if (created.reused) {
            toast.success(
              i18n.t("result.revisionUsed", { left: created.revisionsLeft }),
            );
            void navigate({ to: "/resultat" });
            return;
          }
          // Premium (and dev bypass) skip the paywall: the calculation opens
          // directly. Uses the server-fresh entitlement from the call above.
          const pending = usePurchaseStore.getState().pending;
          if ((created.premiumActive || isDevUnlock()) && pending) {
            usePurchaseStore.getState().rememberToken(pending);
            void navigate({ to: "/resultat" });
            return;
          }
          void navigate({ to: "/betalning" });
        })();
      }}
    />
  );
}
