/**
 * Whether to show the "Using Inscriptions" toggle in the wallet menu.
 *
 * Shown when the wallet holds inscription UTXOs (`inscriptionCount > 0`), or when
 * the user has opted into including them (`!ordinalsExcluded`) so the persisted
 * preference stays changeable. Hidden otherwise. The loading/error case maps to
 * `inscriptionCount === 0` upstream in `useUTXOs`; see the Connect call site.
 */
export function shouldShowInscriptionsToggle(
  inscriptionCount: number,
  ordinalsExcluded: boolean,
): boolean {
  return inscriptionCount > 0 || !ordinalsExcluded;
}
