import { expect, it } from "vitest";
import { eventSchema } from "./stat-event-schema";
import { AD_LAUNCH_EVENTS } from "./ad-launch-events";
const base = { deviceId: "test-device", platform: "ios" };
it.each(AD_LAUNCH_EVENTS)("accepts native event %s on both platforms", (event) => {
  for (const platform of ["ios", "android"]) expect(eventSchema.safeParse({ ...base, platform, event }).success).toBe(true);
});
it("rejects web ad statistics", () => {
  expect(eventSchema.safeParse({ ...base, platform: "web", event: "ad_open_shown" }).success).toBe(false);
});
it("rejects arbitrary diagnostic values and step data on ad events", () => {
  expect(eventSchema.safeParse({ ...base, event: "ad_open_skipped_raw_error" }).success).toBe(false);
  expect(eventSchema.safeParse({ ...base, event: "ad_open_shown", step: 3 }).success).toBe(false);
});
it("strips consent data from incoming records while preserving old usage events", () => {
  const parsed = eventSchema.parse({ ...base, event: "step_view", step: 3, purposeConsents: "1001" });
  expect(parsed).toEqual({ ...base, event: "step_view", step: 3 });
});