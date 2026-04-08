/**
 * Check whether an error from the vault provider indicates that the
 * submitted WOTS public key hash does not match the on-chain
 * commitment. This signals that the wrong mnemonic was used.
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
