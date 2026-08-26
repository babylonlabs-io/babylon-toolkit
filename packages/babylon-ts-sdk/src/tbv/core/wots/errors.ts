/**
 * Check whether an error from the vault provider indicates that the
 * submitted WOTS public key hash does not match the on-chain
 * commitment. This signals that the wrong wallet is connected (its
 * `deriveContextHash` produces a different vault root and therefore
 * different WOTS keys).
 */
export function isWotsMismatchError(error: unknown): boolean {
  const msg = (
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  ).toLowerCase();

  return (
    msg.includes("wots") &&
    msg.includes("hash") &&
    msg.includes("does not match")
  );
}
