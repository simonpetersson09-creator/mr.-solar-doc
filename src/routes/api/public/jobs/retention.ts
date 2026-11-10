import { createFileRoute } from "@tanstack/react-router";

import { REMOVABLE_CALCULATION_STATUSES, retentionCutoffs } from "@/lib/retention";

/**
 * Scheduled retention sweep: removes anonymous statistics older than 24 months
 * and started-but-never-paid calculations older than 12 months. Paid reports and
 * purchase receipts are never touched.
 *
 * Called only by the platform's scheduled job, which authenticates with the
 * managed cron credential. Nothing is returned beyond a success flag.
 */
export const Route = createFileRoute("/api/public/jobs/retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import(
          "@/integrations/supabase/cron-auth"
        );
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { appEventsBefore, unpaidCalculationsBefore } = retentionCutoffs();
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const [events, calculations] = await Promise.all([
          supabaseAdmin
            .from("app_events")
            .delete()
            .lt("created_at", appEventsBefore),
          supabaseAdmin
            .from("calculations")
            .delete()
            .in("status", [...REMOVABLE_CALCULATION_STATUSES])
            .lt("created_at", unpaidCalculationsBefore),
        ]);

        if (events.error) console.error("retention app_events failed", events.error);
        if (calculations.error)
          console.error("retention calculations failed", calculations.error);

        return Response.json({
          ok: !events.error && !calculations.error,
        });
      },
    },
  },
});
