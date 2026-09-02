import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { NATIVE_BACKEND_URL, isNativeAppOrigin } from "@/config/native-backend";
import { isNativePlatform } from "@/services/native-service";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * The native app runs on `capacitor://localhost` and therefore calls the
 * backend cross-origin. Only the known Capacitor origins are allowed — never
 * a wildcard — and only for server-function calls.
 */
function nativeCorsHeaders(origin: string, request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      request.headers.get("Access-Control-Request-Headers") ?? "content-type,authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });
  return headers;
}

const nativeCorsMiddleware = createMiddleware().server(async ({ request, next }) => {
  const origin = request.headers.get("Origin");
  if (!isNativeAppOrigin(origin)) return next();

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: nativeCorsHeaders(origin!, request) });
  }

  const result = await next();
  const headers = new Headers(result.response.headers);
  for (const [key, value] of nativeCorsHeaders(origin!, request)) headers.set(key, value);
  return {
    ...result,
    response: new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers,
    }),
  };
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests. The native app is a known, allowlisted origin.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  secFetchSite: (value, ctx) =>
    value === "same-origin" || isNativeAppOrigin(ctx.request.headers.get("Origin")),
  origin: (value, ctx) => value === new URL(ctx.request.url).origin || isNativeAppOrigin(value),
});

/**
 * Server functions use same-origin relative URLs. Inside the native shell that
 * origin is the local app bundle, which has no server, so the call is
 * redirected to the deployed https backend.
 */
const nativeServerFnFetch: typeof fetch = (input, init) => {
  if (!isNativePlatform()) return fetch(input, init);

  const rewrite = (url: string): string =>
    url.startsWith("/") ? `${NATIVE_BACKEND_URL}${url}` : url;

  if (typeof input === "string") return fetch(rewrite(input), init);
  if (input instanceof URL) return fetch(input, init);
  const absolute = rewrite(new URL(input.url, "http://localhost").pathname + new URL(input.url, "http://localhost").search);
  return fetch(new Request(absolute, input), init);
};

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, nativeCorsMiddleware, csrfMiddleware],
  serverFns: { fetch: nativeServerFnFetch },
}));
