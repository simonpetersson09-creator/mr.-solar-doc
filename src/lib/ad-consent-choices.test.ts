import { expect, it } from "vitest";
import { readAdConsentChoices } from "./ad-consent-choices";

it("reads TCF purposes 1, 3 and 4 independently", () => {
  expect(readAdConsentChoices("OBTAINED", "1001")).toEqual({ storage: "allowed", adProfile: "denied", useAdProfile: "allowed" });
  expect(readAdConsentChoices("OBTAINED", "0110")).toEqual({ storage: "denied", adProfile: "allowed", useAdProfile: "denied" });
});
it("obtained means answered, not that all purposes were accepted", () => {
  expect(readAdConsentChoices("OBTAINED", "0000")).toEqual({ storage: "denied", adProfile: "denied", useAdProfile: "denied" });
});
it.each(["UNKNOWN", "REQUIRED", "NOT_REQUIRED"])("never exposes stale purposes when status is %s", (status) => {
  expect(readAdConsentChoices(status, "1111")).toEqual({ storage: "unknown", adProfile: "unknown", useAdProfile: "unknown" });
});
it.each([undefined, null, "", "101", "10x1", " 1111", 1111])("invalid native purposes remain unknown: %j", (bits) => {
  expect(readAdConsentChoices("OBTAINED", bits)).toEqual({ storage: "unknown", adProfile: "unknown", useAdProfile: "unknown" });
});