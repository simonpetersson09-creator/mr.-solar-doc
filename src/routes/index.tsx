import { createFileRoute, useNavigate } from "@tanstack/react-router";
import i18n from "@/i18n";
import { AddressStep } from "@/components/steps/AddressStep";
import { RoofStep } from "@/components/steps/RoofStep";
import { ConsumptionStep } from "@/components/steps/ConsumptionStep";
import { FuseStep } from "@/components/steps/FuseStep";
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

const TOTAL_STEPS = 4;

function WizardPage() {
  const navigate = useNavigate();
  useCountryLanguage();
  const step = useWizardStore((s) => s.currentStep);
  const setStep = useWizardStore((s) => s.setCurrentStep);

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
  return (
    <FuseStep
      totalSteps={TOTAL_STEPS}
      onBack={() => setStep(3)}
      onSubmit={() => void navigate({ to: "/resultat" })}
    />
  );
}
