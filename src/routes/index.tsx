import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import "@/i18n";
import { AddressStep } from "@/components/steps/AddressStep";
import { RoofStep } from "@/components/steps/RoofStep";
import { ConsumptionStep } from "@/components/steps/ConsumptionStep";
import { FuseStep } from "@/components/steps/FuseStep";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mr. Solar Doc – dimensionera din solcellsanläggning" },
      {
        name: "description",
        content:
          "Räkna ut rekommenderad solcellseffekt, växelriktare och årsproduktion utifrån din adress, elförbrukning och huvudsäkring.",
      },
      { property: "og:title", content: "Mr. Solar Doc – dimensionera din solcellsanläggning" },
      {
        property: "og:description",
        content:
          "Steg-för-steg-kalkyl med platsdata från PVGIS: kWp, växelriktare, månadsproduktion och ekonomi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WizardPage,
});

const TOTAL_STEPS = 4;

function WizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

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
