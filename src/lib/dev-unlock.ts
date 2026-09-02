/**
 * Development-only paywall bypass.
 *
 * The bypass is gated exclusively on `import.meta.env.DEV`, which Vite
 * replaces with the literal `false` in every production build. It is therefore
 * tree-shaken away and can never be reached on a published site or on a public
 * preview build — no hostname can re-enable it.
 */
export function isDevUnlock(): boolean {
  return import.meta.env.DEV === true;
}
