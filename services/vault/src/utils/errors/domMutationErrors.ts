/**
 * Classification of React DOM-mutation failures by likely cause.
 *
 * React throws these when a node it owns was moved or removed by something
 * else. Page-translation extensions cause them by swapping React-owned text
 * nodes, and that is the common case - but React throws the *same* errors when
 * our own tree has a reconciliation bug (portal misuse, a `createPortal`
 * container removed out from under it).
 *
 * Filtering them outright via Sentry's `ignoreErrors` hid both: `ignoreErrors`
 * runs ahead of `beforeSend`, so a crash reported by the global error boundary
 * was dropped before any tag could rescue it - and the rate of these errors is
 * also the only metric that shows whether the `translate="no"` opt-out in
 * `index.html` is working.
 *
 * Split into its own dependency-free module (like `userCancellation.ts`) so the
 * predicates are unit-testable without importing `sentry.client.config.ts`,
 * which runs `Sentry.init` on import.
 *
 * @module utils/errors/domMutationErrors
 */

/**
 * Error text React (or the browser) produces when a node it owns has already
 * been detached or reparented.
 */
const REACT_DOM_MUTATION_ERRORS: readonly (string | RegExp)[] = [
  "The node to be removed is not a child of this node",
  /Failed to execute '(removeChild|insertBefore)' on 'Node'/,
  // Safari's wording for the same DOM failure.
  "The object can not be found here.",
];

/** Whether `text` is one of the DOM-mutation failures described above. */
export function isReactDomMutationError(text: string): boolean {
  return REACT_DOM_MUTATION_ERRORS.some((pattern) =>
    typeof pattern === "string" ? text.includes(pattern) : pattern.test(text),
  );
}

/**
 * Whether a page-translation extension has visibly rewritten the document.
 *
 * Google Translate (the extension and Chrome's built-in translator) stamps
 * `translated-ltr` / `translated-rtl` on `<html>`; Edge/Bing Translate wraps
 * translated runs in `<font _msttexthash=…>`. Both are observable from the
 * page.
 *
 * A detection miss is safe by construction: callers keep the event rather than
 * dropping it, so an undetected translator costs a warning-level issue, never a
 * hidden crash. That is the intended bias - Firefox and Safari expose no
 * comparable marker, and `translate="no"` is what covers them at the source.
 */
export function hasTranslationExtensionMarkers(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const root = document.documentElement;
    return (
      root.classList.contains("translated-ltr") ||
      root.classList.contains("translated-rtl") ||
      document.querySelector("font[_msttexthash]") !== null
    );
  } catch {
    // A hostile or partially-torn-down document must not break the report path.
    return false;
  }
}
