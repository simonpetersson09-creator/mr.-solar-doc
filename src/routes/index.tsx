import { createFileRoute, useNavigate } from "@tanstack/react-router";
import i18n from "@/i18n";
import { AddressStep } from "@/components/steps/AddressStep";
import { RoofStep } from "@/components/steps/RoofStep";
import { ConsumptionStep } from "@/components/steps/ConsumptionStep";
import { FuseStep } from "@/components/steps/FuseStep";
import { AssumptionsStep } from "@/components/steps/AssumptionsStep";
import { useCreatePendingCalculation } from "@/hooks/use-create-pending-calculation";
import { useWizardStore } from "@/state/wizard-store";
import { useCountryLanguage } from "@/hooks/use-country-language";

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
  useCountryLanguage();
  const persistedStep = useWizardStore((s) => s.currentStep);
  const setStep = useWizardStore((s) => s.setCurrentStep);
  const location = useWizardStore((s) => s.location);
  const tiltDegrees = useWizardStore((s) => s.tiltDegrees);
  const annualConsumptionKwh = useWizardStore((s) => s.annualConsumptionKwh);
  const mainFuseAmp = useWizardStore((s) => s.mainFuseAmp);

  // Never resume past the first step that still lacks data — otherwise a
  // returning user lands on step 5 and gets an empty result page.
  const maxReachableStep = !location
    ? 1
    : tiltDegrees === null
      ? 2
      : !annualConsumptionKwh
        ? 3
        : !mainFuseAmp
          ? 4
          : 5;
  const step = Math.min(persistedStep, maxReachableStep);

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
          if (created) void navigate({ to: "/betalning" });
        })();
      }}
    />
  );
}
