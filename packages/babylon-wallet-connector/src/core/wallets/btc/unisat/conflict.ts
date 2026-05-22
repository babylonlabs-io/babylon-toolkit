// Marker flags that competing BTC wallet extensions set on their injected
// provider object. UniSat is resolved off the shared `window.unisat` handle
// (see ./index.ts) whenever its dedicated `window.unisat_wallet` namespace is
// absent. In that case another extension can win the `window.unisat` injection
// race and shadow the real UniSat provider. Detecting one of these markers on
// the resolved object lets us surface a typed WALLET_CONFLICT up front instead
// of failing opaquely partway through the connection handshake.
//
// Genuine UniSat never sets any of these flags, so a match is a reliable signal
// that the handle belongs to another wallet. The list is best-effort: an unknown
// impostor simply falls through to the existing connection-failure handling.
export const FOREIGN_BTC_PROVIDER_MARKERS = [
  "isOkxWallet",
  "isOneKey",
  "isBitKeep", // Bitget's legacy (BitKeep) flag
  "isBitget",
  "isTokenPocket",
  "isBybitWallet",
] as const;

/**
 * Returns true when `provider` looks like a non-UniSat BTC wallet extension that
 * has shadowed UniSat's `window.unisat` injection point. Only own properties set
 * strictly to `true` count, so an inherited or differently-typed field on a real
 * UniSat provider is not mistaken for a conflict.
 */
export function isForeignBtcProvider(provider: unknown): boolean {
  if (!provider || typeof provider !== "object") return false;

  return FOREIGN_BTC_PROVIDER_MARKERS.some(
    (marker) =>
      Object.prototype.hasOwnProperty.call(provider, marker) &&
      (provider as Record<string, unknown>)[marker] === true,
  );
}
