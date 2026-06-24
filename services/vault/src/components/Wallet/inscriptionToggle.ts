/**
 * Whether to show the "Using Inscriptions" toggle in the wallet menu.
 *
 * Shown when the wallet holds inscription UTXOs, or when the user has opted into
 * including them (so the persisted preference stays changeable). Hidden in the
 * default no-inscriptions case — and while ordinals detection is loading or has
 * errored, since `inscriptionCount` is 0 then and toggling is a no-op anyway.
 */
export function shouldShowInscriptionsToggle(
  inscriptionCount: number,
  ordinalsExcluded: boolean,
): boolean {
  return inscriptionCount > 0 || !ordinalsExcluded;
}
