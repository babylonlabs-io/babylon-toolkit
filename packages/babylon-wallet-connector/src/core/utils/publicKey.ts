import { ERROR_CODES, WalletError } from "@/error";

export const COMPRESSED_PUBLIC_KEY_HEX_LENGTH = 66;
const X_ONLY_PUBLIC_KEY_HEX_LENGTH = 64;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Converts a public key hex string to x-only format (32 bytes, no prefix).
 * Validates the input format and rejects unexpected key types.
 *
 * @param publicKeyHex - Hex-encoded public key (compressed 66-char or x-only 64-char)
 * @returns 64-character hex string representing the x-only public key
 * @throws WalletError if the key format is invalid
 */
export function toXOnlyPublicKeyHex(publicKeyHex: string): string {
  if (publicKeyHex.length === 0) {
    throw new WalletError({
      code: ERROR_CODES.INVALID_PUBLIC_KEY,
      message: "Invalid public key: must not be empty",
    });
  }

  if (!HEX_PATTERN.test(publicKeyHex)) {
    throw new WalletError({
      code: ERROR_CODES.INVALID_PUBLIC_KEY,
      message: `Invalid public key: contains non-hex characters`,
    });
  }

  if (publicKeyHex.length === COMPRESSED_PUBLIC_KEY_HEX_LENGTH) {
    const prefix = publicKeyHex.slice(0, 2);
    if (prefix !== "02" && prefix !== "03") {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PUBLIC_KEY,
        message: `Invalid compressed public key prefix '${prefix}', expected '02' or '03'`,
      });
    }
    return publicKeyHex.slice(2);
  }

  if (publicKeyHex.length === X_ONLY_PUBLIC_KEY_HEX_LENGTH) {
    return publicKeyHex;
  }

  throw new WalletError({
    code: ERROR_CODES.INVALID_PUBLIC_KEY,
    message: `Unexpected public key length ${publicKeyHex.length} chars (expected ${COMPRESSED_PUBLIC_KEY_HEX_LENGTH} for compressed or ${X_ONLY_PUBLIC_KEY_HEX_LENGTH} for x-only)`,
  });
}
