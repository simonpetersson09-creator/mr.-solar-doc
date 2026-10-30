import { z } from "zod";
import { AD_LAUNCH_EVENTS } from "./ad-launch-events";

const usageEvents = ["app_open", "wizard_start", "step_view", "calculate", "paywall_view", "purchase_tap_unlock", "purchase_tap_premium"] as const;
export const eventSchema = z.object({
  deviceId: z.string().min(1).max(100),
  event: z.string().refine((event) => [...usageEvents, ...AD_LAUNCH_EVENTS].some((allowed) => allowed === event)),
  step: z.number().int().min(1).max(5).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  platform: z.enum(["ios", "android", "web"]),
  language: z.string().max(20).optional(),
}).superRefine((value, ctx) => {
  if (value.event.startsWith("ad_open_") && (value.platform === "web" || value.step !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ad events must be native and contain no wizard step" });
  }
});